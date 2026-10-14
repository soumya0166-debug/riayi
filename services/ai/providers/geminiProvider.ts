import { IAIProvider, StreamChatParams } from './provider.interface';
import { AppError, AuthenticationError } from '@/lib/errors';
import {
  classifyGeminiError,
  createErrorFromClassification,
} from './geminiErrorClassifier';

export class GeminiProvider implements IAIProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini';

  public isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  public async *streamChat(params: StreamChatParams): AsyncIterable<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AuthenticationError(
        'Gemini API key is not configured. Please define GEMINI_API_KEY in .env.local on the server.'
      );
    }

    const configuredModel = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    const model = params.model && params.model !== 'riyai-gemini' ? params.model : configuredModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Convert messages to Gemini contents structure with alternating turns
    let systemInstructionText = '';
    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

    for (const msg of params.messages) {
      if (msg.role === 'system') {
        const text =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
        systemInstructionText += (systemInstructionText ? '\n\n' : '') + text;
        continue;
      }

      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
      const parts: Array<Record<string, unknown>> = [];

      if (typeof msg.content === 'string') {
        const trimmed = msg.content.trim();
        if (trimmed) {
          parts.push({ text: trimmed });
        }
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text?.trim()) {
            parts.push({ text: part.text.trim() });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            const match = part.image_url.url.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              });
            }
          }
        }
      }

      if (parts.length === 0) continue; // Skip empty turns

      const lastTurn = contents[contents.length - 1];
      if (lastTurn && lastTurn.role === role) {
        // Merge into existing turn to guarantee strictly alternating user/model turns
        lastTurn.parts.push(...parts);
      } else {
        contents.push({ role, parts });
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    } else if (contents[0].role !== 'user') {
      contents.unshift({ role: 'user', parts: [{ text: 'Please continue the conversation.' }] });
    }

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 8192,
      },
    };

    if (systemInstructionText) {
      payload.systemInstruction = {
        parts: [{ text: systemInstructionText }],
      };
    }

    // Strict bounded retries: ONLY for transient rate limits (RPM) or transient 503 overloads
    // NEVER retry daily quota exhaustion, auth failures, or invalid parameters
    const maxRetries = 2;
    let attempt = 0;
    let response: Response | null = null;

    while (attempt <= maxRetries) {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: params.signal,
        });

        if (response.ok) {
          // Success confirmed by API: Break and stream tokens
          break;
        }

        const errText = await response.text().catch(() => '');
        const classified = classifyGeminiError(response.status, errText, response.headers);
        const typedError = createErrorFromClassification(classified);

        // Exponential backoff check:
        // Do NOT retry daily quota limits, auth errors, model not found, or context length errors
        const isTransientRetryable =
          classified.canRetry &&
          !classified.isDailyQuota &&
          classified.category !== 'daily_quota' &&
          classified.category !== 'auth' &&
          classified.category !== 'model_not_found';

        if (isTransientRetryable && attempt < maxRetries && !params.signal?.aborted) {
          attempt++;
          // Exponential backoff with jitter: 1.5s, 3s
          const baseBackoff = Math.min(1500 * Math.pow(2, attempt - 1), 5000);
          const delayMs =
            classified.retryDelaySeconds && classified.retryDelaySeconds <= 3
              ? classified.retryDelaySeconds * 1000
              : baseBackoff;

          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        // Daily quota exhausted or non-retryable error: fail immediately with informative typed error
        throw typedError;
      } catch (fetchErr: unknown) {
        if (fetchErr instanceof AppError) {
          throw fetchErr;
        }
        if (params.signal?.aborted) {
          return;
        }
        const errObj = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
        throw errObj;
      }
    }

    if (!response || !response.ok) {
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') return;
            try {
              const data = JSON.parse(jsonStr);
              const part = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (part) {
                yield part;
              }
            } catch {
              // Incomplete chunk line
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async generateText(params: {
    prompt?: string;
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<string> {
    const messages = params.messages ? [...params.messages] : [];
    if (params.prompt) {
      messages.push({ role: 'user', content: params.prompt });
    }
    if (params.systemPrompt) {
      messages.unshift({ role: 'system', content: params.systemPrompt });
    }

    const stream = this.streamChat({
      messages,
      model: params.model || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
      temperature: params.temperature ?? 0.3,
      maxTokens: params.maxTokens ?? 2048,
      signal: params.signal,
    });

    let fullText = '';
    for await (const chunk of stream) {
      fullText += chunk;
    }
    return fullText;
  }
}

export const geminiProvider = new GeminiProvider();
