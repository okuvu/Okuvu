import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'auth_service.dart';
import 'dio_client.dart';
import 'auth_interceptor.dart';
import 'websocket_service.dart';

final authServiceProvider = Provider<AuthService>((ref) => AuthService());
final crisisOverlayProvider = StateProvider<bool>((ref) => false);

final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

enum SessionState { initial, authenticated, unauthenticated }

final sessionProvider = Provider<SessionState>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (user) => user != null ? SessionState.authenticated : SessionState.unauthenticated,
    loading: () => SessionState.initial,
    error: (_, __) => SessionState.unauthenticated,
  );
});

final dioClientProvider = Provider<Dio>((ref) {
  final dio = createDioClient();
  dio.interceptors.add(AuthInterceptor(ref.read(authServiceProvider), dio.options));
  return dio;
});

final connectivityProvider = StreamProvider<bool>((ref) {
  return Connectivity().onConnectivityChanged.map(
    (results) => results.any((r) => r != ConnectivityResult.none),
  );
});

final isOnlineProvider = Provider<bool>((ref) {
  return ref.watch(connectivityProvider).valueOrNull ?? true;
});

final webSocketServiceProvider = Provider<WebSocketService>((ref) {
  return WebSocketService();
});
