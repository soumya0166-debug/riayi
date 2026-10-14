export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContentPart[];
}

export interface StreamChatParams {
  messages: ChatCompletionMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface IAIProvider {
  readonly id: string;
  readonly name: string;
  isConfigured(): boolean;
  streamChat(params: StreamChatParams): AsyncIterable<string>;
  generateText?(params: {
    prompt?: string;
    messages?: ChatCompletionMessage[];
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<string>;
}
