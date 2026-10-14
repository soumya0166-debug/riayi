import { NextRequest, NextResponse } from 'next/server';
import { ContextManager } from '@/services/ai/contextManager';
import { geminiProvider } from '@/services/ai/providers/geminiProvider';
import { AI_CONFIG } from '@/config/ai';
import { checkRateLimit } from '@/lib/rateLimiter';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. IP Rate Limiting Check (DDoS and abuse prevention)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const rateStatus = checkRateLimit(ip);
    if (!rateStatus.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Please wait ${rateStatus.resetInSeconds} seconds before sending another message.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateStatus.resetInSeconds) },
        }
      );
    }

    // 2. Parse and Validate Request Body
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON payload.' },
        { status: 400 }
      );
    }

    const {
      messages,
      relevantMemories,
      conversationSummary,
      userPreferences,
      relevantChunks,
      attachedFiles,
      systemPrompt,
    } = body;

    // 3. Centralized AI Provider: Strictly Google Gemini
    const provider = geminiProvider;

    // 4. Validate message sequence with provider diagnostics
    const validatedMessages = ContextManager.validateIncomingMessages(
      messages,
      'gemini'
    );

    // 5. Check if Gemini is configured on the server
    if (!provider.isConfigured()) {
      return NextResponse.json(
        {
          error: 'Gemini API is not configured. Please define GEMINI_API_KEY in .env.local on the server.',
          code: 'AI_PROVIDER_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    // 6. Build Windowed Context (Memory, Documents/RAG, and Multi-turn turns)
    const contextMessages = ContextManager.buildAIContext({
      messages: validatedMessages,
      relevantMemories,
      conversationSummary,
      userPreferences,
      relevantChunks,
      attachedFiles,
      systemInstructions: systemPrompt,
      maxContextTokens: 8192,
    });

    // 7. Native Server-Sent Events (SSE) Streaming Response
    // Single centralized model pipeline: no fallback, no provider switching, no fake answers
    const encoder = new TextEncoder();
    const abortSignal = req.signal;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const tokenGenerator = provider.streamChat({
            messages: contextMessages,
            model: AI_CONFIG.defaultModel,
            temperature: AI_CONFIG.temperature,
            maxTokens: AI_CONFIG.maxOutputTokens,
            signal: abortSignal,
          });

          for await (const token of tokenGenerator) {
            if (abortSignal.aborted) {
              break;
            }
            const payload = JSON.stringify({ delta: token });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }

          if (!abortSignal.aborted) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          }
          controller.close();
        } catch (streamError: unknown) {
          if (abortSignal.aborted) {
            controller.close();
            return;
          }

          // Emit clean error chunk to client SSE listener without switching to local model or faking answers
          const safeError = formatErrorMessage(streamError);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: safeError })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    const safeMessage = formatErrorMessage(error);
    return NextResponse.json(
      { error: safeMessage, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
