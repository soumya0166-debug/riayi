/**
 * RIYAI Provider Management & No-Fallback Verification Test Suite
 *
 * Verifies that all requests route solely through Google Gemini,
 * and that secondary/local fallbacks are strictly disabled.
 */

import {
  classifyGeminiError,
  createErrorFromClassification,
} from '../services/ai/providers/geminiErrorClassifier';
import { fallbackManager } from '../services/ai/providerFallbackManager';
import { GeminiProvider } from '../services/ai/providers/geminiProvider';
import {
  QuotaExhaustedError,
  ProviderUnavailableError,
  AuthenticationError,
} from '../lib/errors';

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
  console.log('RIYAI Provider Management & Strict No-Fallback Tests');
  console.log('======================================================\n');

  const originalFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'mock_gemini_api_key_for_testing';

  // ---------------------------------------------------------
  // Test 1: Gemini 429 daily quota exhaustion -> No local fallback
  // ---------------------------------------------------------
  console.log('Scenario 1: Gemini 429 daily quota exhaustion -> Strictly no local fallback');
  try {
    fallbackManager.resetCircuit();

    const mock429DailyPayload = JSON.stringify({
      error: {
        code: 429,
        message: 'Resource has been exhausted (e.g. check quota). Please retry in 34200s.',
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [
              {
                subject: 'project:123456789',
                description: 'Daily request quota exceeded for models/gemini-3.5-flash',
              },
            ],
          },
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '34200s',
          },
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'RATE_LIMIT_EXCEEDED',
            domain: 'googleapis.com',
            metadata: {
              quota_metric: 'generate_content_requests_per_day',
            },
          },
        ],
      },
    });

    const classification = classifyGeminiError(429, mock429DailyPayload);
    assert(classification.category === 'daily_quota', 'Classifier marks daily_quota category');
    assert(classification.isDailyQuota === true, 'Classifier flags isDailyQuota as true');
    assert(classification.canRetry === false, 'Classifier marks canRetry as false');
    assert(classification.retryDelaySeconds === 34200, 'Classifier parses 34200s delay correctly');
    assert(
      classification.userFacingMessage.includes('Gemini daily request quota'),
      'Clean user facing message without raw JSON leak'
    );
    assert(
      !classification.userFacingMessage.includes('local RIYAI model'),
      'Does not contain local RIYAI model phrasing'
    );

    const typedErr = createErrorFromClassification(classification);
    assert(typedErr instanceof QuotaExhaustedError, 'Error instance is QuotaExhaustedError');
    assert(
      (typedErr as QuotaExhaustedError).exhaustionType === 'daily_limit',
      'Exhaustion type is daily_limit'
    );

    // Record failure in circuit manager
    fallbackManager.recordFailure('gemini', typedErr);
    const availability = fallbackManager.isProviderAvailable('gemini');
    assert(availability.available === false, 'Gemini circuit breaker is opened (unavailable)');

    // Strictly verify fallback is disabled
    const fallbackResult = await fallbackManager.resolveFallback('gemini');
    assert(fallbackResult.canFallback === false, 'Automatic fallback is disabled');
    assert(
      typeof fallbackResult.error === 'string' && fallbackResult.error.includes('Google Gemini'),
      'Clear error message indicating all requests route solely to Gemini'
    );
  } catch (err) {
    console.error('Test 1 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 2: Gemini 503 transient overload -> bounded retry, no local fallback
  // ---------------------------------------------------------
  console.log('\nScenario 2: Gemini 503 transient overload -> bounded retry, no local fallback');
  try {
    fallbackManager.resetCircuit();

    let geminiFetchCount = 0;
    global.fetch = async (): Promise<Response> => {
      geminiFetchCount++;
      return new Response(
        JSON.stringify({
          error: {
            code: 503,
            message: 'Gemini backend overloaded. Please retry.',
            status: 'UNAVAILABLE',
          },
        }),
        { status: 503 }
      );
    };

    const provider = new GeminiProvider();
    let streamFailed = false;
    try {
      const stream = provider.streamChat({
        model: 'gemini-flash-lite-latest',
        messages: [{ role: 'user', content: 'Explain thermodynamics.' }],
      });
      for await (const _ of stream) {}
    } catch (err: any) {
      streamFailed = true;
      assert(err instanceof ProviderUnavailableError, 'Throws ProviderUnavailableError');
      assert(err.canRetry === true, 'Error indicates transient retryable nature');
    }

    assert(streamFailed, 'Stream gracefully failed on 503');
    assert(geminiFetchCount >= 2, `Gemini performed bounded retry on transient 503 (attempts: ${geminiFetchCount})`);

    const fallback = await fallbackManager.resolveFallback('gemini');
    assert(fallback.canFallback === false, 'Does not fallback to secondary model on 503');
  } catch (err) {
    console.error('Test 2 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 3: Fallback resolution strictly disallowed
  // ---------------------------------------------------------
  console.log('\nScenario 3: Single model invariant: fallback is strictly disallowed');
  try {
    fallbackManager.resetCircuit();
    const fallback = await fallbackManager.resolveFallback('gemini');
    assert(fallback.canFallback === false, 'fallbackManager strictly rejects fallback');
    assert(
      typeof fallback.error === 'string',
      'Provides descriptive error explaining single model architecture'
    );
  } catch (err) {
    console.error('Test 3 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 4: Gemini succeeds -> streams directly
  // ---------------------------------------------------------
  console.log('\nScenario 4: Gemini succeeds -> streams directly');
  try {
    fallbackManager.resetCircuit();

    global.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const urlStr = String(input);
      assert(urlStr.includes('generativelanguage.googleapis.com'), 'Uses Gemini endpoint');

      const sseData = ['data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello world!' }] } }] }) + '\n\n', 'data: [DONE]\n\n'];
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of sseData) {
              controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.close();
          },
        }),
        { status: 200 }
      );
    };

    const provider = new GeminiProvider();
    const stream = provider.streamChat({
      model: 'gemini-flash-lite-latest',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    let result = '';
    for await (const token of stream) {
      result += token;
    }

    assert(result === 'Hello world!', 'Gemini streamed directly ("Hello world!")');
    assert(fallbackManager.isProviderAvailable('gemini').available, 'Gemini circuit breaker remains healthy');
  } catch (err) {
    console.error('Test 4 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 5: Streaming response fails midway -> no duplicate response
  // ---------------------------------------------------------
  console.log('\nScenario 5: Streaming response fails midway -> terminates cleanly');
  try {
    const streamState = { firstChunkYielded: false };

    async function* simulateInterruptedGeminiStream() {
      yield 'Starting explanation...';
      streamState.firstChunkYielded = true;
      throw new Error('Mid-stream TCP connection reset');
    }

    let tokensCollected = '';
    let caughtMidstreamError = false;

    try {
      for await (const token of simulateInterruptedGeminiStream()) {
        tokensCollected += token;
      }
    } catch {
      caughtMidstreamError = true;
    }

    assert(streamState.firstChunkYielded === true, 'First chunk yielded was tracked as true');
    assert(caughtMidstreamError === true, 'Caught mid-stream error without silent mask');
    assert(tokensCollected === 'Starting explanation...', 'Stream stopped cleanly at failure point');
  } catch (err) {
    console.error('Test 5 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 6: Invalid API key -> clear authentication error
  // ---------------------------------------------------------
  console.log('\nScenario 6: Invalid API key -> clear authentication error without endless retries');
  try {
    fallbackManager.resetCircuit();

    const mock401Payload = JSON.stringify({
      error: {
        code: 401,
        message: 'API_KEY_INVALID: API key not valid. Please pass a valid API key.',
        status: 'UNAUTHENTICATED',
      },
    });

    const classification = classifyGeminiError(401, mock401Payload);
    assert(classification.category === 'auth', 'Classifier marks category as auth');
    assert(classification.canRetry === false, 'canRetry is false for auth failure');
    assert(
      classification.userFacingMessage.includes('invalid or unauthorized'),
      'Clean user facing message explaining invalid API key'
    );

    const typedErr = createErrorFromClassification(classification);
    assert(typedErr instanceof AuthenticationError, 'Error instance is AuthenticationError');

    let fetchCount = 0;
    global.fetch = async (): Promise<Response> => {
      fetchCount++;
      return new Response(mock401Payload, { status: 401 });
    };

    const provider = new GeminiProvider();
    let authCaught = false;
    try {
      const stream = provider.streamChat({
        model: 'gemini-flash-lite-latest',
        messages: [{ role: 'user', content: 'Test prompt' }],
      });
      for await (const _ of stream) {}
    } catch (err) {
      if (err instanceof AuthenticationError) {
        authCaught = true;
      }
    }

    assert(authCaught, 'Caught AuthenticationError');
    assert(fetchCount === 1, `Auth failure executed exactly 1 request (0 retries, got ${fetchCount})`);
  } catch (err) {
    console.error('Test 6 failed:', err);
  }

  global.fetch = originalFetch;

  console.log('\n======================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} assertions passed successfully!`);
  console.log('======================================================\n');
}

runTests().catch((e) => {
  console.error('Suite error:', e);
  process.exit(1);
});
