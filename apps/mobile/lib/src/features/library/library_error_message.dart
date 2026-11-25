import 'package:dio/dio.dart';

/// The api's own sentence for a failed request, when it sent one.
///
/// Every refusal in this app is copy the owner approved, carried in
/// `{ error: { code, message } }`. A screen shows that sentence rather than
/// writing its own: a second wording for "Pick a time, like 19:00." would be a
/// second set of words the client reads and the owner never saw.
///
/// Null means there was no sentence to show (no network, a 5xx without a body),
/// and the caller decides what to do — it must not put invented copy in its
/// place.
String? serverErrorMessage(Object error) {
  if (error is! DioException) return null;
  final body = error.response?.data;
  final errorBody = body is Map ? body['error'] : null;
  final message = errorBody is Map ? errorBody['message'] : null;
  return message is String && message.trim().isNotEmpty
      ? message.trim()
      : null;
}
