/**
 * RIYAI Test Suite: Single Working Gemini Model & Quota Management
 *
 * Verifies all 7 required scenarios:
 * 1. Gemini responds successfully.
 * 2. Gemini returns HTTP 429 due to daily quota exhaustion (no switch to local model).
 * 3. Gemini returns a temporary rate-limit error (transient rate limit with bounded backoff).
 * 4. Gemini API key is missing or invalid (clean auth error, key never leaked).
 * 5. Gemini returns a server error or times out (clean 503 error).
 * 6. A conversation includes previous messages or uploaded-document context.
 * 7. No local or secondary model activates when Gemini fails.
 */

import { GeminiProvider } from '../services/ai/providers/geminiProvider';
import {
  classifyGeminiError,
  createErrorFromClassification,
  formatSecondsToHumanReadable,
} from '../services/ai/providers/geminiErrorClassifier';
import { fallbackManager } from '../services/ai/providerFallbackManager';
import { ContextManager } from '../services/ai/contextManager';
import {
  QuotaExhaustedError,
  AuthenticationError,
  ProviderUnavailableError,
  AppError,
} from '../lib/errors';
import { Message } from '../types/message';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
    throw new Error(`Test failed: ${testName} ${detail ? `- ${detail}` : ''}`);
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('RIYAI Gemini Single Model & Quota Verification Suite');
  console.log('======================================================\n');

  const originalFetch = global.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  process.env.GEMINI_API_KEY = 'mock_valid_gemini_key_for_testing';
  process.env.GEMINI_MODEL = 'gemini-flash-lite-latest';

  // ---------------------------------------------------------
  // Scenario 1: Gemini responds successfully
  // ---------------------------------------------------------
  console.log('Scenario 1: Gemini responds successfully with streaming tokens');
  try {
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = String(input);
      assert(urlStr.includes('generativelanguage.googleapis.com'), 'Requests real Google Gemini API endpoint');
      assert(!urlStr.includes('localhost'), 'Does not request any local model runner');

      const sseChunks = [
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello, ' }] } }] }) + '\n\n',
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'I am RIYAI powered by Gemini.' }] } }] }) + '\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of sseChunks) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };

    const provider = new GeminiProvider();
    assert(provider.isConfigured() === true, 'Gemini provider isConfigured returns true');
    assert(provider.id === 'gemini', 'Provider ID is gemini');

    const stream = provider.streamChat({
      model: 'gemini-flash-lite-latest',
      messages: [{ role: 'user', content: 'Hello Gemini' }],
    });

    let fullAnswer = '';
    for await (const token of stream) {
      fullAnswer += token;
    }

    assert(fullAnswer === 'Hello, I am RIYAI powered by Gemini.', 'Assembled streamed tokens cleanly');
  } catch (err) {
    console.error('Scenario 1 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 2: Gemini returns HTTP 429 due to daily quota exhaustion
  // ---------------------------------------------------------
  console.log('\nScenario 2: Gemini returns HTTP 429 due to daily quota exhaustion');
  try {
    // Exact realistic Gemini 429 response structure
    const mockDailyQuotaResponse = JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message:
          'You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash\nPlease retry in 19h8m25s.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [
              {
                quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
                quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
              },
            ],
          },
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '68905s',
          },
        ],
      },
    });

    const classified = classifyGeminiError(429, mockDailyQuotaResponse);
    assert(classified.category === 'daily_quota', 'Classified accurately as daily_quota');
    assert(classified.isDailyQuota === true, 'Flags isDailyQuota as true');
    assert(classified.canRetry === false, 'canRetry is false (must not repeatedly retry in a loop)');
    assert(classified.retryDelaySeconds === 68905, 'Extracted retry delay in seconds (68,905s ~19h 8m)');
    assert(
      classified.userFacingMessage.includes('Gemini daily request quota has been exhausted'),
      'Clear user-facing message explaining daily quota exhaustion'
    );
    assert(
      classified.userFacingMessage.includes('19 hours and 8 minutes'),
      'Indicates human-readable reset window (19 hours and 8 minutes)'
    );
    assert(
      !classified.userFacingMessage.includes('local RIYAI model'),
      'Does NOT contain "local RIYAI model" phrasing'
    );

    const typedError = createErrorFromClassification(classified);
    assert(typedError instanceof QuotaExhaustedError, 'Instance of QuotaExhaustedError');
    assert((typedError as QuotaExhaustedError).exhaustionType === 'daily_limit', 'Exhaustion type is daily_limit');

    // Verify GeminiProvider does NOT retry daily quota
    let dailyAttempts = 0;
    global.fetch = async (): Promise<Response> => {
      dailyAttempts++;
      return new Response(mockDailyQuotaResponse, {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new GeminiProvider();
    let caughtQuota = false;
    try {
      const stream = provider.streamChat({
        model: 'gemini-3.6-flash',
        messages: [{ role: 'user', content: 'Test' }],
      });
      for await (const _ of stream) {}
    } catch (err: unknown) {
      if (err instanceof QuotaExhaustedError) {
        caughtQuota = true;
      }
    }

    assert(caughtQuota === true, 'Caught QuotaExhaustedError directly');
    assert(dailyAttempts === 1, `Daily quota executed exactly 1 attempt without redundant retries (got ${dailyAttempts})`);
  } catch (err) {
    console.error('Scenario 2 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 3: Gemini returns a temporary rate-limit error (RPM)
  // ---------------------------------------------------------
  console.log('\nScenario 3: Gemini returns a temporary rate-limit error (transient with backoff)');
  try {
    const mockRpmResponse = JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Resource has been exhausted (e.g. check quota). Please retry in 1s.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '1s',
          },
        ],
      },
    });

    const rpmClassified = classifyGeminiError(429, mockRpmResponse);
    assert(rpmClassified.category === 'rpm_limit', 'Classified as rpm_limit');
    assert(rpmClassified.isDailyQuota === false, 'isDailyQuota is false for RPM');
    assert(rpmClassified.canRetry === true, 'canRetry is true for RPM');
    assert(rpmClassified.retryDelaySeconds === 1, 'Extracted short 1s retry delay');

    // Simulate transient failure on attempt 1, success on attempt 2
    let rpmAttempts = 0;
    global.fetch = async (): Promise<Response> => {
      rpmAttempts++;
      if (rpmAttempts === 1) {
        return new Response(mockRpmResponse, {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const sseChunks = ['data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Recovered!' }] } }] }) + '\n\n', 'data: [DONE]\n\n'];
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const c of sseChunks) controller.enqueue(new TextEncoder().encode(c));
            controller.close();
          },
        }),
        { status: 200 }
      );
    };

    const provider = new GeminiProvider();
    const stream = provider.streamChat({
      model: 'gemini-flash-lite-latest',
      messages: [{ role: 'user', content: 'Ping' }],
    });

    let recoveredText = '';
    for await (const token of stream) {
      recoveredText += token;
    }

    assert(recoveredText === 'Recovered!', 'Transient RPM error recovered cleanly on retry');
    assert(rpmAttempts === 2, `Executed exactly 2 attempts with bounded backoff (got ${rpmAttempts})`);
  } catch (err) {
    console.error('Scenario 3 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 4: Gemini API key is missing or invalid
  // ---------------------------------------------------------
  console.log('\nScenario 4: Gemini API key is missing or invalid');
  try {
    // 4a. Missing API key
    delete process.env.GEMINI_API_KEY;
    const providerMissing = new GeminiProvider();
    assert(providerMissing.isConfigured() === false, 'isConfigured is false when key is missing');

    let missingKeyCaught = false;
    try {
      const stream = providerMissing.streamChat({
        model: 'gemini-flash-lite-latest',
        messages: [{ role: 'user', content: 'Hi' }],
      });
      for await (const _ of stream) {}
    } catch (err) {
      if (err instanceof AuthenticationError) {
        missingKeyCaught = true;
        assert(err.message.includes('GEMINI_API_KEY'), 'Explains missing GEMINI_API_KEY in .env.local');
      }
    }
    assert(missingKeyCaught === true, 'Throws AuthenticationError when key is missing');

    // 4b. Invalid API key response from Google
    process.env.GEMINI_API_KEY = 'invalid_mock_key';
    const mockAuthErr = JSON.stringify({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'API_KEY_INVALID: API key not valid. Please pass a valid API key.',
      },
    });

    const authClassified = classifyGeminiError(400, mockAuthErr);
    assert(authClassified.category === 'auth', 'Classified as auth category');
    assert(authClassified.canRetry === false, 'Cannot retry authentication errors');
    assert(
      authClassified.userFacingMessage.includes('invalid or unauthorized'),
      'Clear user message explaining invalid key'
    );
    assert(
      !authClassified.userFacingMessage.includes('invalid_mock_key'),
      'Never prints or leaks the raw API key in user-facing message'
    );

    let authAttempts = 0;
    global.fetch = async (): Promise<Response> => {
      authAttempts++;
      return new Response(mockAuthErr, { status: 400 });
    };

    const providerAuth = new GeminiProvider();
    let authCaught = false;
    try {
      const stream = providerAuth.streamChat({
        model: 'gemini-flash-lite-latest',
        messages: [{ role: 'user', content: 'Hi' }],
      });
      for await (const _ of stream) {}
    } catch (err) {
      if (err instanceof AuthenticationError) {
        authCaught = true;
      }
    }
    assert(authCaught === true, 'Throws typed AuthenticationError');
    assert(authAttempts === 1, `Auth failure executed exactly 1 attempt (0 retries, got ${authAttempts})`);
  } catch (err) {
    console.error('Scenario 4 failed:', err);
  } finally {
    process.env.GEMINI_API_KEY = 'mock_valid_gemini_key_for_testing';
  }

  // ---------------------------------------------------------
  // Scenario 5: Gemini returns a server error or times out
  // ---------------------------------------------------------
  console.log('\nScenario 5: Gemini returns a server error (503) or times out');
  try {
    const mock503 = JSON.stringify({
      error: {
        code: 503,
        status: 'UNAVAILABLE',
        message: 'The model is overloaded. Please try again later.',
      },
    });

    const s503Classified = classifyGeminiError(503, mock503);
    assert(s503Classified.category === 'transient', 'Classified 503 as transient');
    assert(s503Classified.canRetry === true, 'canRetry is true for transient overload');
    assert(
      s503Classified.userFacingMessage.includes('temporarily unavailable'),
      'Informs user that service is temporarily unavailable'
    );
    assert(
      !s503Classified.userFacingMessage.includes('local RIYAI model'),
      'Does not claim local model fallback on 503'
    );

    // Test AbortSignal / timeout
    const controller = new AbortController();
    controller.abort();

    global.fetch = async (): Promise<Response> => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    const provider = new GeminiProvider();
    const tokens: string[] = [];
    for await (const t of provider.streamChat({
      model: 'gemini-flash-lite-latest',
      messages: [{ role: 'user', content: 'Timeout test' }],
      signal: controller.signal,
    })) {
      tokens.push(t);
    }
    assert(tokens.length === 0, 'Timeout / aborted request safely terminates without throwing unhandled error');
  } catch (err) {
    console.error('Scenario 5 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 6: Conversation includes previous messages & uploaded document context
  // ---------------------------------------------------------
  console.log('\nScenario 6: Multi-turn conversation history & uploaded document context routed to Gemini');
  try {
    const multiTurnMessages: Message[] = [
      { id: '1', conversationId: 'c1', role: 'user', content: 'What is Next.js?', createdAt: '' },
      { id: '2', conversationId: 'c1', role: 'assistant', content: 'Next.js is a React framework.', createdAt: '' },
      { id: '3', conversationId: 'c1', role: 'user', content: 'Can it render on the server?', createdAt: '' },
    ];

    const documentChunks = [
      {
        id: 'chunk_1',
        fileId: 'f1',
        userId: 'u1',
        fileName: 'NextJS_Architecture.pdf',
        chunkIndex: 0,
        content: 'Next.js supports SSR, SSG, and Server Components for robust server-side rendering.',
        tokenEstimate: 20,
        pageNumber: 3,
        sectionTitle: 'Server Rendering',
        createdAt: new Date().toISOString(),
      },
    ];

    const contextMessages = ContextManager.buildAIContext({
      messages: multiTurnMessages,
      relevantChunks: documentChunks,
      maxContextTokens: 8192,
    });

    assert(contextMessages.length === 4, 'Context contains system instruction + 3 turns');
    assert(contextMessages[0].role === 'system', 'First entry is system prompt');
    assert(
      typeof contextMessages[0].content === 'string' &&
        contextMessages[0].content.includes('Document Intelligence & Evidence (RAG)'),
      'System prompt includes Document Intelligence ground truth'
    );
    assert(
      typeof contextMessages[0].content === 'string' &&
        contextMessages[0].content.includes('NextJS_Architecture.pdf'),
      'Includes uploaded document filename reference'
    );
    assert(contextMessages[1].content === 'What is Next.js?', 'Preserves Turn 1 user message');
    assert(contextMessages[2].content === 'Next.js is a React framework.', 'Preserves Turn 2 assistant message');
    assert(contextMessages[3].content === 'Can it render on the server?', 'Preserves Turn 3 user follow-up');

    // Verify Gemini receives strictly alternating turn structure
    let capturedBody: any = null;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(String(init?.body));
      const sse = ['data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Yes, Next.js supports SSR.' }] } }] }) + '\n\n', 'data: [DONE]\n\n'];
      return new Response(
        new ReadableStream({
          start(c) {
            for (const chunk of sse) c.enqueue(new TextEncoder().encode(chunk));
            c.close();
          },
        }),
        { status: 200 }
      );
    };

    const provider = new GeminiProvider();
    const stream = provider.streamChat({
      model: 'gemini-flash-lite-latest',
      messages: contextMessages,
    });

    let result = '';
    for await (const t of stream) result += t;

    assert(result === 'Yes, Next.js supports SSR.', 'Gemini generated answer using document and chat context');
    assert(Boolean(capturedBody?.systemInstruction), 'Gemini payload received systemInstruction');
    assert(Array.isArray(capturedBody?.contents), 'Gemini payload received contents array');
    assert(capturedBody.contents.length === 3, 'Transmitted all 3 conversational turns to Gemini');
    assert(capturedBody.contents[0].role === 'user', 'Turn 1 role is user');
    assert(capturedBody.contents[1].role === 'model', 'Turn 2 role is model');
    assert(capturedBody.contents[2].role === 'user', 'Turn 3 role is user');
  } catch (err) {
    console.error('Scenario 6 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 7: No local or secondary model activates when Gemini fails
  // ---------------------------------------------------------
  console.log('\nScenario 7: No local or secondary model activates when Gemini fails');
  try {
    fallbackManager.resetCircuit();

    // Verify fallback resolution strictly refuses to activate any secondary model
    const resolution = await fallbackManager.resolveFallback('gemini');
    assert(resolution.canFallback === false, 'fallbackManager strictly disallows fallback (canFallback = false)');
    assert(
      Boolean(resolution.error?.includes('All requests route solely to Google Gemini')),
      'Indicates all requests route solely to Google Gemini'
    );

    // Verify that when Gemini fails, error is thrown without switching providers
    let fetchCalledUrls: string[] = [];
    global.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      fetchCalledUrls.push(String(input));
      return new Response(
        JSON.stringify({
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'Daily quota exceeded. Please retry in 68905s.',
          },
        }),
        { status: 429 }
      );
    };

    const provider = new GeminiProvider();
    let streamFailedCleanly = false;
    try {
      const stream = provider.streamChat({
        model: 'gemini-3.6-flash',
        messages: [{ role: 'user', content: 'Test prompt' }],
      });
      for await (const _ of stream) {}
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        streamFailedCleanly = true;
      }
    }

    assert(streamFailedCleanly === true, 'Failed request throws QuotaExhaustedError directly');
    assert(
      fetchCalledUrls.every((u) => u.includes('generativelanguage.googleapis.com')),
      'All fetch calls were strictly made to Gemini API'
    );
    assert(
      !fetchCalledUrls.some((u) => u.includes('localhost:11434') || u.includes('api.openai.com')),
      'Zero requests made to local model or secondary providers'
    );
  } catch (err) {
    console.error('Scenario 7 failed:', err);
  }

  // Cleanup
  global.fetch = originalFetch;
  if (originalApiKey) process.env.GEMINI_API_KEY = originalApiKey;
  if (originalModel) process.env.GEMINI_MODEL = originalModel;

  console.log('\n======================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} assertions passed successfully!`);
  console.log('======================================================\n');
}

runTestSuite().catch((e) => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
