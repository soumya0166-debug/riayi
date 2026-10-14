export const STORAGE_KEYS = {
  THEME: 'riyai_theme',
  USER_PREFERENCES: 'riyai_user_preferences',
  ACTIVE_CONVERSATION_ID: 'riyai_active_conv_id',
  CONVERSATIONS: 'riyai_conversations',
  MESSAGES_PREFIX: 'riyai_messages_',
  MEMORIES_PREFIX: 'riyai_memories_',
  SUMMARIES_PREFIX: 'riyai_summaries_',
  FILES_PREFIX: 'riyai_files_',
  CHUNKS_PREFIX: 'riyai_chunks_',
  AUTH_SESSION: 'riyai_auth_session',
  SIDEBAR_COLLAPSED: 'riyai_sidebar_collapsed',
  TASKS_PREFIX: 'riyai_tasks_',
  APPROVALS_PREFIX: 'riyai_approvals_',
  WORKFLOWS: 'riyai_workflows',
  WORKFLOW_RUNS_PREFIX: 'riyai_workflow_runs_',
  LEARNING_EXPERIENCES_PREFIX: 'riyai_learning_experiences_',
  LEARNING_DATASETS: 'riyai_learning_datasets',
  LEARNING_MODELS: 'riyai_learning_models',
  LEARNING_EVALUATIONS: 'riyai_learning_evaluations',
  AGENT_STRATEGY_STATS: 'riyai_agent_strategy_stats',
  LEARNED_LESSONS_PREFIX: 'riyai_learned_lessons_',
  ADAPTIVE_STRATEGIES: 'riyai_adaptive_strategies',
  LEARNING_REPORTS: 'riyai_learning_reports',
  CONTINUOUS_EVALUATION_METRICS: 'riyai_continuous_evaluation_metrics',
} as const;

export const FILE_LIMITS = {
  MAX_FILE_SIZE_BYTES: 20 * 1024 * 1024, // 20 MB
  MAX_ATTACHMENTS_PER_MESSAGE: 5,
  MAX_TOTAL_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB
  CHUNK_TARGET_CHARS: 1800, // ~450 tokens
  CHUNK_OVERLAP_CHARS: 150,
  SUPPORTED_EXTENSIONS: [
    '.pdf',
    '.docx',
    '.doc',
    '.txt',
    '.md',
    '.csv',
    '.xlsx',
    '.xls',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
  ],
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'image/png',
    'image/jpeg',
    'image/webp',
  ],
} as const;


export const ROUTES = {
  HOME: '/',
  CHAT: '/chat',
  CHAT_CONVERSATION: (id: string) => `/chat/${id}`,
  SIGN_IN: '/auth/signin',
  SIGN_UP: '/auth/signup',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password',
  SETTINGS: '/settings',
} as const;

export const DEFAULT_PREFERENCES = {
  theme: 'dark' as const,
  language: 'en' as const,
  responseStyle: 'balanced' as const,
  explanationLevel: 'intermediate' as const,
  tone: 'friendly' as const,
  customInstructions: '',
  memoryEnabled: true,
  learningEnabled: true,
  modelPreference: 'riyai-core-1.0',
  preferredProvider: 'gemini' as const,
  localFallbackModel: 'qwen2.5:0.5b',
  ollamaBaseUrl: 'http://localhost:11434',
  providerTimeoutMs: 30000,
  maxTransientRetries: 1,
  streamResponse: true,
  sendOnEnter: true,
};


