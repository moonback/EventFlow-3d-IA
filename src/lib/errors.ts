/** Erreurs applicatives typées, converties en réponses HTTP par le wrapper d'API. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentification requise") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Action non autorisée") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Ressource") {
    super("NOT_FOUND", `${entity} introuvable`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super("VALIDATION_ERROR", message, 422, fieldErrors ? { fieldErrors } : undefined);
  }
}

/** Violation d'une règle métier (ex. stock insuffisant, conflit d'affectation). */
export class BusinessRuleError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Trop de tentatives, réessayez plus tard") {
    super("RATE_LIMITED", message, 429);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
