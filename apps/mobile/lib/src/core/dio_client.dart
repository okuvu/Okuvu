import 'package:dio/dio.dart';
import '../config/app_config.dart';

Dio createDioClient() {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));
  return dio;
}
