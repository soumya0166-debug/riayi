export type ThemeMode = 'dark' | 'light' | 'system';
export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';
export type ResponseStyle = 'concise' | 'balanced' | 'detailed';
export type ExplanationLevel = 'beginner' | 'intermediate' | 'expert';
export type TonePreference = 'friendly' | 'professional' | 'academic' | 'casual';

export interface UserPreference {
  id: string;
  userId: string;
  theme: ThemeMode;
  language: SupportedLanguage;
  responseStyle: ResponseStyle;
  explanationLevel?: ExplanationLevel;
  tone?: TonePreference;
  customInstructions?: string;
  memoryEnabled: boolean;
  learningEnabled?: boolean;
  modelPreference: string;
  preferredProvider?: 'gemini' | 'openai' | 'ollama';
  localFallbackModel?: string;
  ollamaBaseUrl?: string;
  providerTimeoutMs?: number;
  maxTransientRetries?: number;
  streamResponse: boolean;
  sendOnEnter: boolean;
  codeTheme?: string;
  createdAt: string;
  updatedAt: string;
}

