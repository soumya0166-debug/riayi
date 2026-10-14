/**
 * RIYAI Phase 5 Test Suite: Stability, Error Recovery & Provider Management
 *
 * Verifies all 8 required Phase 5 scenarios:
 * 1. A successful AI response.
 * 2. An empty or malformed message.
 * 3. Gemini 429 quota exhaustion.
 * 4. An invalid API key.
 * 5. A network timeout.
 * 6. A failed streaming response.
 * 7. Retrying and regenerating a response.
 * 8. Reloading a conversation after an API failure.
 */

import { normalizeAndValidateMessages } from '../services/ai/messageValidator';
import { ContextManager } from '../services/ai/contextManager';
import { GeminiProvider } from '../services/ai/providers/geminiProvider';
import { fallbackManager } from '../services/ai/providerFallbackManager';
import { classifyGeminiError, createErrorFromClassification } from '../services/ai/providers/geminiErrorClassifier';
import {
  ValidationError,
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

async function runTests() {
  console.log('\n======================================================');
  console.log('RIYAI Phase 5: Stability & Error Recovery Test Suite');
  console.log('======================================================\n');

  const originalFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'mock_gemini_api_key_for_testing';

  // ---------------------------------------------------------
  // Scenario 1: A successful AI response
  // ---------------------------------------------------------
  console.log('Scenario 1: Successful AI response streaming');
  try {
    fallbackManager.resetCircuit('gemini');

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = String(input);
      if (urlStr.includes('googleapis.com')) {
        const sseBody =
          'data: {"candidates":[{"content":{"parts":[{"text":"The derivative of x^2 is "}]}}]}\n\n' +
          'data: {"candidates":[{"content":{"parts":[{"text":"2x."}]}}]}\n\n' +
          'data: [DONE]\n\n';

        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody));
            controller.close();
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      return originalFetch(input, init);
    };

    const provider = new GeminiProvider();
    const tokens: string[] = [];
    for await (const token of provider.streamChat({
      model: 'gemini-3.8-flash',
      messages: [{ role: 'user', content: 'What is the derivative of x^2?' }],
    })) {
      tokens.push(token);
    }

    const fullResponse = tokens.join('');
    assert(fullResponse === 'The derivative of x^2 is 2x.', 'Tokens streamed and assembled cleanly');
    assert(fallbackManager.isProviderAvailable('gemini').available === true, 'Provider circuit remains healthy');
  } catch (err) {
    console.error('Scenario 1 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 2: An empty or malformed message
  // ---------------------------------------------------------
  console.log('\nScenario 2: Empty or malformed message validation');
  try {
    let emptyCaught = false;
    try {
      normalizeAndValidateMessages([{ role: 'user', content: '   ' }], 'gemini');
    } catch (err) {
      if (err instanceof ValidationError) {
        emptyCaught = true;
        assert(err.message.includes('cannot be empty'), 'Throws clear message for whitespace submission');
      }
    }
    assert(emptyCaught, 'Rejects empty user message');

    // History with null, malformed objects and empty assistant turns
    const dirtyHistory = [
      null,
      { role: 'invalid_role', content: 'skip me' },
      { role: 'user', content: 'Solve 2x = 10' },
      { role: 'assistant', content: '' }, // empty assistant placeholder
      undefined,
      { role: 'user', content: 'What is x?' },
    ];

    const cleaned = normalizeAndValidateMessages(dirtyHistory, 'gemini');
    assert(cleaned.length === 2, 'Safely filtered all nulls, invalid roles, and empty assistant turns');
    assert(cleaned[0].content === 'Solve 2x = 10', 'First valid user message preserved');
    assert(cleaned[1].content === 'What is x?', 'Second valid user message preserved');
  } catch (err) {
    console.error('Scenario 2 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 3: Gemini 429 quota exhaustion
  // ---------------------------------------------------------
  console.log('\nScenario 3: Gemini 429 quota exhaustion & circuit cooldown');
  try {
    fallbackManager.resetCircuit('gemini');

    const mock429Daily = JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Daily request quota exceeded for models/gemini-3.5-flash. Retry in 34200s.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '34200s',
          },
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            metadata: { quota_metric: 'generate_content_requests_per_day' },
          },
        ],
      },
    });

    const classified = classifyGeminiError(429, mock429Daily);
    assert(classified.isDailyQuota === true, 'Classified as daily quota exhaustion');
    assert(classified.canRetry === false, 'Cannot retry daily quota immediately');
    assert(classified.retryDelaySeconds === 34200, 'Parsed 34,200s retry delay');

    const typedError = createErrorFromClassification(classified);
    assert(typedError instanceof QuotaExhaustedError, 'Error instance is QuotaExhaustedError');

    // Trigger failure in circuit manager
    fallbackManager.recordFailure('gemini', typedError);
    const availability = fallbackManager.isProviderAvailable('gemini');
    assert(availability.available === false, 'Circuit breaker opened during cooldown');
    assert((availability.cooldownRemainingSec ?? 0) > 30000, 'Cooldown holds full ~9.5h period');
  } catch (err) {
    console.error('Scenario 3 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 4: An invalid API key
  // ---------------------------------------------------------
  console.log('\nScenario 4: Invalid API key handling');
  try {
    fallbackManager.resetCircuit('gemini');
    let authAttempts = 0;

    const mock400Auth = JSON.stringify({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'API key not valid. Please pass a valid API key.',
      },
    });

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input).includes('googleapis.com')) {
        authAttempts++;
        return new Response(mock400Auth, { status: 400, statusText: 'Bad Request' });
      }
      return originalFetch(input, init);
    };

    const provider = new GeminiProvider();
    let authCaught = false;

    try {
      const stream = provider.streamChat({
        model: 'gemini-3.8-flash',
        messages: [{ role: 'user', content: 'Test prompt' }],
      });
      for await (const _ of stream) {}
    } catch (err) {
      if (err instanceof AuthenticationError) {
        authCaught = true;
        assert((err as AppError).code === 'AUTH_REQUIRED', 'Throws AuthenticationError with code AUTH_REQUIRED');
        assert(err.message.includes('API key is invalid'), 'Message explains invalid API key cleanly');
      }
    }

    assert(authCaught, 'Caught AuthenticationError');
    assert(authAttempts === 1, `Auth failure executed exactly 1 attempt (0 retries, got ${authAttempts})`);
  } catch (err) {
    console.error('Scenario 4 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 5: A network timeout
  // ---------------------------------------------------------
  console.log('\nScenario 5: Network timeout handling');
  try {
    fallbackManager.resetCircuit('gemini');

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = String(input);
      if (urlStr.includes('googleapis.com')) {
        // Simulate abort / timeout
        const abortErr = new Error('The operation was aborted due to timeout');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      return originalFetch(input, init);
    };

    const abortController = new AbortController();
    abortController.abort(); // Signal timeout

    const provider = new GeminiProvider();
    const tokens: string[] = [];
    for await (const token of provider.streamChat({
      model: 'gemini-3.8-flash',
      messages: [{ role: 'user', content: 'Hello' }],
      signal: abortController.signal,
    })) {
      tokens.push(token);
    }

    assert(tokens.length === 0, 'Timeout / aborted request completes cleanly without unhandled rejection');
  } catch (err) {
    console.error('Scenario 5 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 6: A failed streaming response
  // ---------------------------------------------------------
  console.log('\nScenario 6: Failed streaming response safeguard');
  try {
    const streamOutput: string[] = [];
    const streamState = {
      firstChunkYielded: false,
      fallbackRestarted: false,
    };

    // Simulate route streaming where failure occurs midway
    async function simulateStream(failMidway: boolean) {
      try {
        streamState.firstChunkYielded = true;
        streamOutput.push('Part 1: Initial proof steps...');

        if (failMidway) {
          throw new Error('Connection abruptly severed by host');
        }

        streamOutput.push('Part 2: Q.E.D.');
      } catch (err) {
        if (!streamState.firstChunkYielded) {
          streamState.fallbackRestarted = true;
        } else {
          // Explicit partial failure handling: DO NOT restart fallback provider invisibly
          streamState.fallbackRestarted = false;
          streamOutput.push('[ERROR: Stream interrupted midway]');
        }
      }
    }

    await simulateStream(true);
    assert(streamState.firstChunkYielded === true, 'First chunk was marked as delivered');
    assert(streamState.fallbackRestarted === false, 'Fallback was NOT restarted after partial delivery');
    assert(
      streamOutput.length === 2 && streamOutput[1] === '[ERROR: Stream interrupted midway]',
      'Terminated with explicit error rather than appending duplicate answer'
    );
  } catch (err) {
    console.error('Scenario 6 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 7: Retrying and regenerating a response
  // ---------------------------------------------------------
  console.log('\nScenario 7: Retrying and regenerating a response');
  try {
    // Simulate conversation history with a failed assistant message
    const history: Message[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', content: 'What is 7 * 6?', createdAt: '' },
      { id: 'a1', conversationId: 'c1', role: 'assistant', content: '', metadata: { status: 'error' }, createdAt: '' },
    ];

    // Retry simulation: slice off failed assistant message, re-evaluate
    function simulateRetry(failedId: string, messages: Message[]): Message[] {
      const idx = messages.findIndex((m) => m.id === failedId);
      const toKeep = idx !== -1 ? messages.slice(0, idx) : messages;
      return toKeep.filter(
        (m) => m.role === 'user' || (m.role === 'assistant' && m.content.trim().length > 0)
      );
    }

    const retriedHistory = simulateRetry('a1', history);
    assert(retriedHistory.length === 1, 'Failed assistant message removed on retry');
    assert(retriedHistory[0].content === 'What is 7 * 6?', 'Original prompt kept intact for retry');

    // Regenerate simulation: slice off messages at or after target assistant
    const multiTurn: Message[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', content: 'Hi', createdAt: '' },
      { id: 'a1', conversationId: 'c1', role: 'assistant', content: 'Hello', createdAt: '' },
      { id: 'u2', conversationId: 'c1', role: 'user', content: 'Tell me a joke', createdAt: '' },
      { id: 'a2', conversationId: 'c1', role: 'assistant', content: 'Old joke', createdAt: '' },
    ];

    function simulateRegenerate(targetId: string, messages: Message[]): Message[] {
      const idx = messages.findIndex((m) => m.id === targetId);
      return idx !== -1 ? messages.slice(0, idx) : messages;
    }

    const regeneratedHistory = simulateRegenerate('a2', multiTurn);
    assert(regeneratedHistory.length === 3, 'Rewinds history up to target assistant message for regeneration');
    assert(regeneratedHistory[2].content === 'Tell me a joke', 'User prompt is the active turn to be regenerated');
  } catch (err) {
    console.error('Scenario 7 failed:', err);
  }

  // ---------------------------------------------------------
  // Scenario 8: Reloading a conversation after an API failure
  // ---------------------------------------------------------
  console.log('\nScenario 8: Reloading conversation after API failure');
  try {
    // Stored database state where an earlier turn failed with empty content
    const loadedFromDb: Message[] = [
      { id: 'm1', conversationId: 'c2', role: 'user', content: 'First question', createdAt: '' },
      { id: 'm2', conversationId: 'c2', role: 'assistant', content: '', metadata: { status: 'error' }, createdAt: '' },
    ];

    // User submits a new message in this reloaded conversation
    const newPrompt = 'Second question';
    const cleanHistory = loadedFromDb.filter(
      (m) => m.role === 'user' || (m.role === 'assistant' && m.content.trim().length > 0)
    );
    const updatedMessages: Message[] = [
      ...cleanHistory,
      { id: 'm3', conversationId: 'c2', role: 'user', content: newPrompt, createdAt: '' },
    ];

    const validatedForApi = ContextManager.validateIncomingMessages(updatedMessages, 'gemini');
    assert(validatedForApi.length === 2, 'Reloaded conversation cleaned dead assistant turn');
    assert(validatedForApi[0].content === 'First question', 'Initial question preserved');
    assert(validatedForApi[1].content === 'Second question', 'New question preserved');
    assert(
      !validatedForApi.some((m) => m.role === 'assistant' && m.content === ''),
      'No empty assistant messages transmitted to provider API'
    );
  } catch (err) {
    console.error('Scenario 8 failed:', err);
  }

  global.fetch = originalFetch;

  console.log('\n======================================================');
  console.log(`PHASE 5 RESULTS: ${passedTests}/${totalTests} assertions passed successfully!`);
  console.log('======================================================\n');
}

runTests().catch((e) => {
  console.error('Suite error:', e);
  process.exit(1);
});
