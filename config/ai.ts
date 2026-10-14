/**
 * Centralized AI Engine Configuration for RIYAI
 * Single Primary AI Model: Google Gemini
 */

export const RIYAI_SYSTEM_PROMPT = `You are RIYAI (pronounced "Rye-eye"), an advanced, intelligent personal companion and thinking partner.

Your core identity and ethos:
- Intelligent, friendly, fast, minimal, premium, futuristic, human-centered, and trustworthy.
- Helpful, clear, articulate, and honest about limitations.
- Adapt your depth dynamically: concise and punchy for quick queries; thorough, nuanced, and structured for complex architectural, coding, or analytical problems.
- Never claim to have taken physical or external actions you did not take.
- Never invent imaginary tool executions or false sources. Always distinguish clearly between verified knowledge and uncertainty.
- When generating code, write production-grade, clean, modern, and idiomatic implementations with brief, high-value explanations.
- Maintain a warm, dignified, and encouraging tone without being sycophantic.`;

export const AI_CONFIG = {
  defaultProvider: 'gemini' as const,
  defaultModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  maxOutputTokens: 8192,
  temperature: 0.7,
  maxContextMessages: 12, // Sliding window for conversation history
  maxMessageContentLength: 32000, // Character limit per message to prevent payload abuse
  rateLimitWindowMs: 60 * 1000, // 1 minute
  rateLimitMaxRequests: 30, // 30 requests per minute per IP
} as const;

export interface ModelMapping {
  provider: 'gemini';
  remoteModel: string;
}

/**
 * Single centralized model configuration.
 * All incoming requests route strictly to Google Gemini.
 */
export const SERVER_MODEL_MAP: Record<string, ModelMapping> = {
  'riyai-gemini': {
    provider: 'gemini',
    remoteModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  },
  // Legacy identifiers cleanly map to the centralized Gemini engine
  'riyai-core-1.0': {
    provider: 'gemini',
    remoteModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  },
  'riyai-reasoning-pro': {
    provider: 'gemini',
    remoteModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  },
  'riyai-flash-fast': {
    provider: 'gemini',
    remoteModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  },
  'riyai-gemini-3.8-flash': {
    provider: 'gemini',
    remoteModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  },
};
