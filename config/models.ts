import { AIModel } from '@/types/ai';

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: 'riyai-gemini',
    name: 'RIYAI (Gemini)',
    provider: 'gemini',
    description: 'High-speed cognitive reasoning, mathematics, and multimodal intelligence powered by Google Gemini.',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    isDefault: true,
    badge: 'Gemini',
  },
];

export const DEFAULT_MODEL_ID = 'riyai-gemini';
