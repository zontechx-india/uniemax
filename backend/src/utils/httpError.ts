/**
 * Lightweight application error carrying an HTTP status code. Throw these from
 * services/controllers and the global error handler turns them into a clean
 * JSON response.
 */
const REASON_PHRASES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  428: "Precondition Required",
  429: "Too Many Requests",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = REASON_PHRASES[statusCode] ?? "Error";
    this.statusCode = statusCode;
  }

  static badRequest(message = "Bad Request") {
    return new HttpError(400, message);
  }

  static unauthorized(message = "Unauthorized") {
    return new HttpError(401, message);
  }

  static forbidden(message = "Forbidden") {
    return new HttpError(403, message);
  }

  static notFound(message = "Not Found") {
    return new HttpError(404, message);
  }

  static conflict(message = "Conflict") {
    return new HttpError(409, message);
  }

  static tooManyRequests(message = "Too many requests") {
    return new HttpError(429, message);
  }

  /** An upstream provider (email/SMS/OAuth service) failed. */
  static badGateway(message = "Upstream service failed") {
    return new HttpError(502, message);
  }
}
