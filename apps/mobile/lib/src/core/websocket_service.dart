import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'websocket_constants.dart';
import '../features/chat/models/agent_turn_frame.dart';

enum WsConnectionState {
  disconnected,
  connecting,
  connected,
  sessionActive,
  reconnecting,
  error,
}

class WebSocketService {
  WebSocketChannel? _channel;
  WsConnectionState _state = WsConnectionState.disconnected;
  String? _errorType;
  bool _hadError = false;
  int _mockTurnCount = 0;
  String? _sessionId;
  String? _wsBaseUrl;
  String? _token;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 3;
  Timer? _reconnectTimer;
  bool _intentionalDisconnect = false;
  bool _showBanner = false;
  Timer? _bannerDebounceTimer;

  final StreamController<WsConnectionState> _stateController =
      StreamController<WsConnectionState>.broadcast();
  final StreamController<String?> _errorTypeController =
      StreamController<String?>.broadcast();
  final StreamController<AgentTurnFrame> _agentTurnController =
      StreamController<AgentTurnFrame>.broadcast();
  final StreamController<void> _sessionClosedController =
      StreamController<void>.broadcast();
  final StreamController<bool> _showBannerController =
      StreamController<bool>.broadcast();

  WsConnectionState get currentState => _state;
  String? get errorType => _errorType;
  String? get sessionId => _sessionId;
  bool get showBanner => _showBanner;
  Stream<WsConnectionState> get stateStream => _stateController.stream;
  Stream<String?> get errorTypeStream => _errorTypeController.stream;
  Stream<AgentTurnFrame> get agentTurnStream => _agentTurnController.stream;
  Stream<void> get sessionClosedStream => _sessionClosedController.stream;
  Stream<bool> get showBannerStream => _showBannerController.stream;

  void _setState(WsConnectionState newState, {String? errorType}) {
    _state = newState;
    _errorType = errorType;
    _stateController.add(newState);
    if (newState == WsConnectionState.sessionActive) {
      _hideBanner();
    }
    if (errorType != null) {
      _errorTypeController.add(errorType);
    }
    if (kDebugMode) {
      debugPrint(
        '[WebSocketService] State: $newState${errorType != null ? ' ($errorType)' : ''}',
      );
    }
  }

  Future<void> connect({required String wsBaseUrl, required String token}) async {
    if (_state == WsConnectionState.connecting ||
        _state == WsConnectionState.sessionActive) {
      if (kDebugMode) debugPrint('[WebSocketService] Already connected or connecting');
      return;
    }

    _wsBaseUrl = wsBaseUrl;
    _token = token;
    _hadError = false;
    _intentionalDisconnect = false;
    _setState(WsConnectionState.connecting);

    final uri = Uri.parse('$wsBaseUrl${WsConstants.sessionPath}');

    try {
      _channel = IOWebSocketChannel.connect(
        uri,
        headers: {'Authorization': 'Bearer $token'},
      );

      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: false,
      );

      _setState(WsConnectionState.connected);
      _mockTurnCount = 0;
      _sendFrame({'type': 'SESSION_OPEN'});
    } catch (e) {
      if (kDebugMode) debugPrint('[WebSocketService] Connection failed: $e');
      _setState(WsConnectionState.error, errorType: 'connection_failure');
      _startReconnect();
    }
  }

  void _onMessage(dynamic message) {
    if (kDebugMode) debugPrint('[WebSocketService] Received: $message');

    try {
      final data = jsonDecode(message as String) as Map<String, dynamic>;
      final type = data['type'] as String?;

      switch (type) {
        case 'session_open_confirmed':
          _reconnectAttempts = 0;
          _setState(WsConnectionState.sessionActive);
          final payload = data['payload'] as Map<String, dynamic>?;
          _sessionId = payload?['session_id'] as String?;
          break;
        case 'session_rejected':
          final reason = data['reason'] as String?;
          _setState(WsConnectionState.error, errorType: reason ?? 'rate_limited');
          break;
        case 'agent_turn':
          _handleAgentTurn(data);
          break;
        case 'session_closed':
          _intentionalDisconnect = true;
          _cancelReconnect();
          _hideBanner();
          _setState(WsConnectionState.disconnected);
          _mockTurnCount = 0;
          _sessionClosedController.add(null);
          break;
        default:
          if (kDebugMode) debugPrint('[WebSocketService] Unknown message type: $type');
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[WebSocketService] Failed to parse message: $e');
    }
  }

  void _onError(dynamic error) {
    if (kDebugMode) debugPrint('[WebSocketService] Stream error: $error');
    _hadError = true;
    _setState(WsConnectionState.error, errorType: 'connection_failure');
    _startReconnect();
  }

  void _onDone() {
    if (kDebugMode) debugPrint('[WebSocketService] Connection closed');
    _channel = null;
    if (_hadError) {
      _hadError = false;
      return;
    }
    _setState(WsConnectionState.disconnected);
    if (!_intentionalDisconnect) {
      _startReconnect();
    }
  }

  void sendUserTurn(String content) {
    if (_state != WsConnectionState.sessionActive) {
      if (kDebugMode) debugPrint('[WebSocketService] Cannot send — not in sessionActive state');
      return;
    }

    if (kDebugMode) debugPrint('[WebSocketService] Sending user_turn: $content');
    _sendFrame({
      'type': 'user_turn',
      'content': content,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
    });
  }

  void injectMockAgentTurn(String content) {
    _mockTurnCount = (_mockTurnCount + 1).clamp(0, 10);
    final frame = AgentTurnFrame(
      content: content,
      turnId: 'mock_${DateTime.now().millisecondsSinceEpoch}',
      timestamp: DateTime.now().toUtc().toIso8601String(),
      turnCount: _mockTurnCount,
    );
    _agentTurnController.add(frame);

    if (_mockTurnCount >= 10) {
      _mockTurnCount = 0;
      _sessionClosedController.add(null);
    }
  }

  void _handleAgentTurn(Map<String, dynamic> data) {
    try {
      final frame = AgentTurnFrame.fromJson(data);
      _agentTurnController.add(frame);
    } catch (e) {
      if (kDebugMode) debugPrint('[WebSocketService] Failed to parse agent_turn frame: $e');
    }
  }

  void _startBannerDebounce() {
    _bannerDebounceTimer?.cancel();
    _bannerDebounceTimer = Timer(const Duration(milliseconds: 500), () {
      _showBanner = true;
      _showBannerController.add(true);
    });
  }

  void _hideBanner() {
    _bannerDebounceTimer?.cancel();
    if (_showBanner) {
      _showBanner = false;
      _showBannerController.add(false);
    }
  }

  void _cancelReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _bannerDebounceTimer?.cancel();
    _bannerDebounceTimer = null;
  }

  void _startReconnect() {
    if (_intentionalDisconnect) return;

    _cancelReconnect();
    _startBannerDebounce();

    if (_reconnectAttempts >= _maxReconnectAttempts) {
      _setState(WsConnectionState.error, errorType: 'max_retries_exceeded');
      return;
    }

    _reconnectAttempts++;
    final delay = Duration(seconds: 1 << (_reconnectAttempts - 1));

    if (kDebugMode) {
      debugPrint(
        '[WebSocketService] Reconnecting in ${delay.inSeconds}s (attempt $_reconnectAttempts/$_maxReconnectAttempts)',
      );
    }

    _reconnectTimer = Timer(delay, () {
      _setState(WsConnectionState.reconnecting);
      if (_wsBaseUrl != null && _token != null) {
        connect(wsBaseUrl: _wsBaseUrl!, token: _token!);
      }
    });
  }

  void retry() {
    if (kDebugMode) debugPrint('[WebSocketService] Manual retry requested');
    _cancelReconnect();
    _reconnectAttempts = 0;
    _intentionalDisconnect = false;
    _startReconnect();
  }

  void disconnect() {
    if (_channel == null) return;

    _intentionalDisconnect = true;
    _cancelReconnect();
    _hideBanner();

    _sendFrame({'type': 'session_close'});
    _channel!.sink.close();
    _channel = null;
    _setState(WsConnectionState.disconnected);
  }

  void _sendFrame(Map<String, dynamic> frame) {
    if (_channel == null) return;
    if (kDebugMode) debugPrint('[WebSocketService] Sending: $frame');
    _channel!.sink.add(jsonEncode(frame));
  }

  void dispose() {
    disconnect();
    _stateController.close();
    _errorTypeController.close();
    _agentTurnController.close();
    _sessionClosedController.close();
    _showBannerController.close();
  }
}
