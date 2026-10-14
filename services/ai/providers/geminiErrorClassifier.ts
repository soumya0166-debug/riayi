import {
  AppError,
  QuotaExhaustedError,
  ProviderUnavailableError,
  AuthenticationError,
  QuotaExhaustionType,
} from '@/lib/errors';

export type GeminiErrorCategory =
  | 'daily_quota'
  | 'rpm_limit'
  | 'transient'
  | 'auth'
  | 'model_not_found'
  | 'context_length'
  | 'unknown';

export interface ClassifiedGeminiError {
  category: GeminiErrorCategory;
  statusCode: number;
  message: string;
  userFacingMessage: string;
  retryDelaySeconds?: number;
  canRetry: boolean;
  isDailyQuota: boolean;
  quotaMetric?: string;
  rawError?: Record<string, unknown>;
}

function parseSeconds(val: unknown): number | undefined {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // Matches e.g. "34200s", "34200.5s", "34200", "68905s"
    const match = val.match(/^([\d.]+)\s*s?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      if (!isNaN(num)) return Math.round(num);
    }
  }
  return undefined;
}

export function formatSecondsToHumanReadable(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins} minute${mins === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return remMin > 0
    ? `${hours} hour${hours === 1 ? '' : 's'} and ${remMin} minute${remMin === 1 ? '' : 's'}`
    : `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function classifyGeminiError(
  statusCode: number,
  rawBody: string,
  headers?: Headers
): ClassifiedGeminiError {
  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    // Non-JSON or HTML response
  }

  const errObj = parsedJson?.error || parsedJson || {};
  const statusStr = String(errObj.status || '').toUpperCase();
  const rawMsg = String(errObj.message || rawBody || '');

  // 1. Extract retryDelay from details if available
  let retryDelaySeconds: number | undefined;
  let quotaMetric: string | undefined;

  // Check Retry-After header first
  if (headers && headers.get('retry-after')) {
    retryDelaySeconds = parseSeconds(headers.get('retry-after'));
  }

  if (Array.isArray(errObj.details)) {
    for (const d of errObj.details) {
      if (d['@type']?.includes('RetryInfo') && d.retryDelay) {
        const parsed = parseSeconds(d.retryDelay);
        if (parsed !== undefined) {
          retryDelaySeconds = parsed;
        }
      }
      if (d['@type']?.includes('QuotaFailure') && Array.isArray(d.violations)) {
        for (const v of d.violations) {
          if (v.quotaMetric) quotaMetric = String(v.quotaMetric);
          if (v.quotaId && !quotaMetric) quotaMetric = String(v.quotaId);
        }
      }
      if (d['@type']?.includes('ErrorInfo')) {
        if (d.metadata?.quota_metric) {
          quotaMetric = String(d.metadata.quota_metric);
        } else if (d.metadata?.quota_limit) {
          quotaMetric = String(d.metadata.quota_limit);
        }
      }
    }
  }

  // Also check if retryDelay is embedded in message (e.g. "Please retry in 19h8m25s" or "Please retry in 34200s")
  if (retryDelaySeconds === undefined) {
    const delayMatchSeconds = rawMsg.match(/retry\s+in\s+([\d.]+)\s*s/i) || rawMsg.match(/retryDelay[:\s]+"([\d.]+)s"/i);
    if (delayMatchSeconds) {
      retryDelaySeconds = parseSeconds(delayMatchSeconds[1]);
    } else {
      // Check e.g. "retry in 19h8m25s"
      const hmMatch = rawMsg.match(/retry\s+in\s+(\d+)h(?:(\d+)m)?/i);
      if (hmMatch) {
        const hours = parseInt(hmMatch[1], 10);
        const mins = hmMatch[2] ? parseInt(hmMatch[2], 10) : 0;
        retryDelaySeconds = hours * 3600 + mins * 60;
      }
    }
  }

  // --- Category 1: Authentication / Permission Errors ---
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    (statusCode === 400 &&
      (rawMsg.includes('API_KEY_INVALID') ||
        rawMsg.includes('API key not valid') ||
        rawMsg.includes('PERMISSION_DENIED')))
  ) {
    return {
      category: 'auth',
      statusCode,
      message: rawMsg || 'Invalid Gemini API key or permission denied.',
      userFacingMessage:
        'Your Gemini API key is invalid or unauthorized. Please verify GEMINI_API_KEY in .env.local on the server.',
      canRetry: false,
      isDailyQuota: false,
      rawError: errObj,
    };
  }

  // --- Category 2: Model Not Found (404) ---
  if (statusCode === 404 || statusStr === 'NOT_FOUND' || rawMsg.includes('not found') || rawMsg.includes('no longer available')) {
    return {
      category: 'model_not_found',
      statusCode: 404,
      message: rawMsg || 'Requested Gemini model not found or deprecated.',
      userFacingMessage:
        'The configured Gemini model is not found or is no longer available. Please verify GEMINI_MODEL in server configuration.',
      canRetry: false,
      isDailyQuota: false,
      rawError: errObj,
    };
  }

  // --- Category 3: Resource Exhaustion / Quota / Rate Limits (429) ---
  if (statusCode === 429 || statusStr === 'RESOURCE_EXHAUSTED' || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    const isDaily =
      (quotaMetric && (quotaMetric.toLowerCase().includes('day') || quotaMetric.toLowerCase().includes('free_tier'))) ||
      rawMsg.toLowerCase().includes('per day') ||
      rawMsg.toLowerCase().includes('perday') ||
      rawMsg.toLowerCase().includes('daily') ||
      rawMsg.toLowerCase().includes('free_tier_requests') ||
      (retryDelaySeconds !== undefined && retryDelaySeconds > 120); // Longer than 2 minutes = daily/billing quota window

    if (isDaily) {
      const waitText = retryDelaySeconds ? formatSecondsToHumanReadable(retryDelaySeconds) : 'approximately 19 hours';
      return {
        category: 'daily_quota',
        statusCode: 429,
        message: rawMsg || 'Gemini daily request quota exhausted.',
        userFacingMessage: `Gemini daily request quota has been exhausted (resets in ${waitText}). Please try again once the quota resets, or check your Gemini plan at https://ai.google.dev.`,
        retryDelaySeconds: retryDelaySeconds || 68905,
        canRetry: false,
        isDailyQuota: true,
        quotaMetric,
        rawError: errObj,
      };
    }

    // Short-lived transient rate limit (RPM / TPM)
    const waitSec = retryDelaySeconds || 30;
    return {
      category: 'rpm_limit',
      statusCode: 429,
      message: rawMsg || 'Gemini per-minute request rate limit reached.',
      userFacingMessage: `Gemini request rate limit reached. Please wait ${waitSec}s before retrying.`,
      retryDelaySeconds: waitSec,
      canRetry: true,
      isDailyQuota: false,
      quotaMetric,
      rawError: errObj,
    };
  }

  // --- Category 4: Transient Server Overload / Downtime (503 / 502 / 504) ---
  if (
    statusCode === 503 ||
    statusCode === 502 ||
    statusCode === 504 ||
    statusStr === 'UNAVAILABLE' ||
    rawMsg.includes('overloaded')
  ) {
    return {
      category: 'transient',
      statusCode,
      message: rawMsg || 'Gemini service temporarily overloaded or unavailable.',
      userFacingMessage: 'Gemini service is temporarily unavailable. Please try again shortly.',
      retryDelaySeconds: 2,
      canRetry: true,
      isDailyQuota: false,
      rawError: errObj,
    };
  }

  // --- Category 5: Context Length Exceeded (400) ---
  if (
    statusCode === 400 &&
    (rawMsg.includes('token count') ||
      rawMsg.includes('maximum context') ||
      rawMsg.includes('too large'))
  ) {
    return {
      category: 'context_length',
      statusCode,
      message: rawMsg,
      userFacingMessage: 'The prompt exceeds the maximum context length supported by Gemini.',
      canRetry: false,
      isDailyQuota: false,
      rawError: errObj,
    };
  }

  // --- Category 6: Generic Error ---
  return {
    category: 'unknown',
    statusCode,
    message: rawMsg || `Gemini API returned HTTP ${statusCode}`,
    userFacingMessage: `An error occurred communicating with Gemini (HTTP ${statusCode}). Please try again.`,
    canRetry: false,
    isDailyQuota: false,
    rawError: errObj,
  };
}

export function createErrorFromClassification(classified: ClassifiedGeminiError): AppError {
  switch (classified.category) {
    case 'daily_quota':
      return new QuotaExhaustedError(
        classified.userFacingMessage,
        classified.retryDelaySeconds,
        'daily_limit',
        { quotaMetric: classified.quotaMetric, originalMessage: classified.message }
      );
    case 'rpm_limit':
      return new QuotaExhaustedError(
        classified.userFacingMessage,
        classified.retryDelaySeconds,
        'rpm_limit',
        { quotaMetric: classified.quotaMetric, originalMessage: classified.message }
      );
    case 'transient':
      return new ProviderUnavailableError(
        classified.userFacingMessage,
        classified.canRetry,
        classified.statusCode,
        { originalMessage: classified.message }
      );
    case 'auth':
      return new AuthenticationError(classified.userFacingMessage);
    default:
      return new AppError(classified.userFacingMessage, 'INTERNAL_ERROR', classified.statusCode);
  }
}
