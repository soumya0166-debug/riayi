export type ErrorCode =
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AUTH_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'CONVERSATION_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

export type QuotaExhaustionType = 'daily_limit' | 'rpm_limit' | 'token_limit' | 'unknown';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = 'INTERNAL_ERROR',
    statusCode = 500,
    isOperational = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QuotaExhaustedError extends AppError {
  public readonly retryAfterSeconds?: number;
  public readonly exhaustionType: QuotaExhaustionType;

  constructor(
    message: string,
    retryAfterSeconds?: number,
    exhaustionType: QuotaExhaustionType = 'daily_limit',
    details?: Record<string, unknown>
  ) {
    super(message, 'QUOTA_EXHAUSTED', 429, true, details);
    this.name = 'QuotaExhaustedError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.exhaustionType = exhaustionType;
  }
}

export class ProviderUnavailableError extends AppError {
  public readonly canRetry: boolean;

  constructor(
    message: string,
    canRetry = true,
    statusCode = 503,
    details?: Record<string, unknown>
  ) {
    super(message, 'PROVIDER_UNAVAILABLE', statusCode, true, details);
    this.name = 'ProviderUnavailableError';
    this.canRetry = canRetry;
  }
}

export class AIProviderNotConfiguredError extends AppError {
  constructor(providerName = 'LLM Provider') {
    super(
      `The ${providerName} is not yet configured for Phase 1. Backend LLM streaming will be initialized in Phase 2.`,
      'AI_PROVIDER_NOT_CONFIGURED',
      503
    );
    this.name = 'AIProviderNotConfiguredError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required to perform this action.') {
    super(message, 'AUTH_REQUIRED', 401);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends AppError {
  constructor(message = 'Unable to reach the RIYAI network services. Please check your connection.') {
    super(message, 'NETWORK_ERROR', 503);
    this.name = 'NetworkError';
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    // Sanitize any potential secret leakage or low level stack traces
    if (
      error.message.includes('API_KEY') ||
      error.message.includes('password') ||
      error.message.includes('secret')
    ) {
      return 'A secure configuration error occurred. Please verify server API keys.';
    }
    // Clean raw Google or OpenAI JSON dumps if present
    if (error.message.includes('{"error"') || error.message.includes('"RESOURCE_EXHAUSTED"')) {
      if (error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('429')) {
        return 'Gemini API request quota has been exhausted. Please wait for the quota to reset or verify your API quota at https://ai.google.dev.';
      }
      return 'The AI service returned an error. Please try again.';
    }
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
