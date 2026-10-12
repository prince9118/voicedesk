// An expected, client-facing failure. Throw it from a route; the error handler turns it into
// { error: { code, message, details? } } with the given HTTP status.
// Anything that is NOT an AppError is treated as unexpected and answered with a generic 500.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
