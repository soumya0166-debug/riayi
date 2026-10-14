/**
 * Privacy and Security Screening for RIYAI Memory
 * Prevents passwords, API keys, credentials, and sensitive PII from being stored in memory.
 */

export interface PrivacyCheckResult {
  isSensitive: boolean;
  reason?: string;
}

const SENSITIVE_KEYWORD_PATTERNS = [
  /\b(?:password|passwd|pwd)\b\s*[:=]?\s*\S+/i,
  /\b(?:api[_-]?key|apikey)\b\s*[:=]?\s*\S+/i,
  /\b(?:secret[_-]?key|client[_-]?secret)\b\s*[:=]?\s*\S+/i,
  /\b(?:auth[_-]?token|access[_-]?token|bearer[_-]?token)\b\s*[:=]?\s*\S+/i,
  /\b(?:private[_-]?key)\b/i,
  /\b(?:credit[_-]?card|cvv|cvc)\b/i,
  /\b(?:social\s*security\s*number|ssn)\b/i,
  /\b(?:pin\s*code|atm\s*pin)\b/i,
];

const CREDENTIAL_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9-_]{20,}/, // OpenAI-style keys
  /AIza[0-9A-Za-z-_]{25,}/, // Google API keys
  /sk-ant-[A-Za-z0-9-_]{20,}/, // Anthropic keys
  /gh[pousr]_[A-Za-z0-9_]{20,}/, // GitHub tokens
  /AKIA[0-9A-Z]{16}/, // AWS Access Keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // RSA/EC Private Keys
  /\bBearer\s+[A-Za-z0-9\-_.~+/]{8,}/i, // Bearer auth tokens
  /eyJ[A-Za-z0-9-_]{8,}\.[A-Za-z0-9-_]{2,}\.[A-Za-z0-9-_.+/=]*/, // JWT tokens
  /\b(?:\d{4}[ -]?){3}\d{4}\b/, // Credit Card Numbers
  /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
];



const REMEMBER_CREDENTIAL_PHRASES = [
  /\bremember\s+(?:that\s+)?(?:my\s+)?(?:password|passwd|api[_-]?key|secret|token|credentials?|pin)\b/i,
  /\bmy\s+(?:password|passwd|api[_-]?key|secret|token|pin)\s+is\b/i,
  /\b(?:store|save)\s+(?:my\s+)?(?:password|passwd|api[_-]?key|secret|token)\b/i,
];

export function checkPrivacy(text: string): PrivacyCheckResult {
  if (!text || typeof text !== 'string') {
    return { isSensitive: false };
  }

  const trimmed = text.trim();

  // 1. Check for specific credential string signatures
  for (const pattern of CREDENTIAL_VALUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isSensitive: true,
        reason: 'Contains an API key, access token, cryptographic key, or sensitive credential',
      };
    }
  }

  // 2. Check for explicit phrases attempting to remember credentials
  for (const pattern of REMEMBER_CREDENTIAL_PHRASES) {
    if (pattern.test(trimmed)) {
      return {
        isSensitive: true,
        reason: 'Contains sensitive authentication or security credential information',
      };
    }
  }

  // 3. Check for keyword-value patterns
  for (const pattern of SENSITIVE_KEYWORD_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isSensitive: true,
        reason: 'Contains potential passwords, secrets, or financial credentials',
      };
    }
  }

  return { isSensitive: false };
}

/**
 * Redact sensitive credential strings from logs or user feedback messages.
 */
export function redactSensitiveText(text: string): string {
  let redacted = text;
  for (const pattern of CREDENTIAL_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_CREDENTIAL]');
  }
  return redacted;
}
