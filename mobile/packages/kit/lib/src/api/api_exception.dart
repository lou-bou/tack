/// Why a request failed. The app reacts differently to each kind.
enum ApiFailure {
  /// No server URL saved yet.
  notConfigured,

  /// The phone could not reach the server at all (offline, DNS, timeout, TLS).
  network,

  /// Cloudflare Access refused the service token (redirect to login, 401/403, login page).
  accessDenied,

  /// Cloudflare answered but the origin server is down (502/503/504/52x).
  serverDown,

  /// The server answered with something that is not the API (HTML, broken JSON).
  badResponse,

  /// The API itself answered with an error (validation, not found, 500).
  http,
}

class ApiException implements Exception {
  const ApiException(
    this.kind,
    this.message, {
    this.status = 0,
    this.fields = const {},
    this.maybeDelivered = true,
  });

  final ApiFailure kind;
  final String message;
  final int status;

  /// False only when the request provably never reached the app server (no connection could be
  /// made, or Cloudflare Access turned it away). True when it may have been processed even
  /// though no usable answer came back, e.g. a timeout while waiting for the response.
  final bool maybeDelivered;

  /// Per-field validation messages from the API, keyed by field name.
  final Map<String, String> fields;

  /// True when trying again later could work without the user changing the request.
  bool get isTransient =>
      kind == ApiFailure.network ||
      kind == ApiFailure.serverDown ||
      kind == ApiFailure.accessDenied ||
      kind == ApiFailure.notConfigured ||
      (kind == ApiFailure.http && status >= 500) ||
      kind == ApiFailure.badResponse;

  @override
  String toString() => message;
}
