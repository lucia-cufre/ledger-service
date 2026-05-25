export class ApplicationError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export class NotFoundError extends ApplicationError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class IdempotencyError extends ApplicationError {
  constructor(message: string) {
    super(message, 409, 'IDEMPOTENCY_ERROR');
  }
}

export class InsufficientFundsError extends ApplicationError {
  constructor(accountId: string) {
    super(
      `Account '${accountId}' has insufficient funds`,
      422,
      'INSUFFICIENT_FUNDS',
    );
  }
}