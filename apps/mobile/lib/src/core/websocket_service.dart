import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'websocket_constants.dart';
import '../features/chat/models/agent_turn_frame.dart';

enum WsConnectionState {
  disconnected,
  connecting,
  connected,
  sessionActive,
  error,
}

class WebSocketService {
  WebSocketChannel? _channel;
  WsConnectionState _state = WsConnectionState.disconnected;
  String? _errorType;
  bool _hadError = false;

  final StreamController<WsConnectionState> _stateController =
      StreamController<WsConnectionState>.broadcast();
  final StreamController<String?> _errorTypeController =
      StreamController<String?>.broadcast();
  final StreamController<AgentTurnFrame> _agentTurnController =
      StreamController<AgentTurnFrame>.broadcast();

  WsConnectionState get currentState => _state;
  String? get errorType => _errorType;
  Stream<WsConnectionState> get stateStream => _stateController.stream;
  Stream<String?> get errorTypeStream => _errorTypeController.stream;
  Stream<AgentTurnFrame> get agentTurnStream => _agentTurnController.stream;

  void _setState(WsConnectionState newState, {String? errorType}) {
    _state = newState;
    _errorType = errorType;
    _stateController.add(newState);
    if (errorType != null) {
      _errorTypeController.add(errorType);
    }
    if (kDebugMode) {
      debugPrint(
        '[WebSocketService] State: $newState${errorType != null ? ' ($errorType)' : ''}',
      );
    }
  }

  void connect({required String wsBaseUrl, required String token}) {
    if (_state == WsConnectionState.connecting ||
        _state == WsConnectionState.sessionActive) {
      if (kDebugMode) debugPrint('[WebSocketService] Already connected or connecting');
      return;
    }

    _hadError = false;
    _setState(WsConnectionState.connecting);

    final uri = Uri.parse('$wsBaseUrl${WsConstants.sessionPath}?token=$token');

    try {
      _channel = WebSocketChannel.connect(uri);

      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: false,
      );

      _setState(WsConnectionState.connected);
      _sendFrame({'type': 'session_open'});
    } catch (e) {
      if (kDebugMode) debugPrint('[WebSocketService] Connection failed: $e');
      _setState(WsConnectionState.error, errorType: 'connection_failure');
    }
  }

  void _onMessage(dynamic message) {
    if (kDebugMode) debugPrint('[WebSocketService] Received: $message');

    try {
      final data = jsonDecode(message as String) as Map<String, dynamic>;
      final type = data['type'] as String?;

      switch (type) {
        case 'session_open_confirmed':
          _setState(WsConnectionState.sessionActive);
          break;
        case 'session_rejected':
          final reason = data['reason'] as String?;
          _setState(WsConnectionState.error, errorType: reason ?? 'rate_limited');
          break;
        case 'agent_turn':
          _handleAgentTurn(data);
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
  }

  void _onDone() {
    if (kDebugMode) debugPrint('[WebSocketService] Connection closed');
    _channel = null;
    if (_hadError) {
      _hadError = false;
      return;
    }
    _setState(WsConnectionState.disconnected);
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
    if (kDebugMode) debugPrint('[WebSocketService] Injecting mock agent_turn: $content');
    final frame = AgentTurnFrame(
      content: content,
      turnId: 'mock_${DateTime.now().millisecondsSinceEpoch}',
      timestamp: DateTime.now().toUtc().toIso8601String(),
    );
    _agentTurnController.add(frame);
  }

  void _handleAgentTurn(Map<String, dynamic> data) {
    try {
      final frame = AgentTurnFrame.fromJson(data);
      _agentTurnController.add(frame);
    } catch (e) {
      if (kDebugMode) debugPrint('[WebSocketService] Failed to parse agent_turn frame: $e');
    }
  }

  void disconnect() {
    if (_channel == null) return;

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
  }
}
