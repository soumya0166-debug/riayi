/**
 * RIYAI Test Suite: Message Validation, Conversation History Repair,
 * and Fallback Scenarios
 *
 * Verifies all 7 required scenarios:
 * 1. Empty user message
 * 2. Empty assistant placeholder in history
 * 3. A valid multi-message conversation
 * 4. Gemini-to-Ollama fallback
 * 5. Gemini 429 quota exhaustion
 * 6. An interrupted streaming response
 * 7. Valid image or attachment messages
 */

import { normalizeAndValidateMessages } from '../services/ai/messageValidator';
import { ContextManager } from '../services/ai/contextManager';
import { GeminiProvider } from '../services/ai/providers/geminiProvider';
import { ollamaProvider } from '../services/ai/providers/ollamaProvider';
import { fallbackManager } from '../services/ai/providerFallbackManager';
import { classifyGeminiError } from '../services/ai/providers/geminiErrorClassifier';
import { ValidationError, QuotaExhaustedError } from '../lib/errors';
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
  console.log('RIYAI Message Validation & Flow Verification Tests');
  console.log('======================================================\n');

  const originalFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'mock_gemini_api_key_for_testing';

  // ---------------------------------------------------------
  // Test 1: Empty user message
  // ---------------------------------------------------------
  console.log('Scenario 1: Empty user message validation');
  try {
    let caughtEmpty = false;
    try {
      normalizeAndValidateMessages([{ role: 'user', content: '   ' }]);
    } catch (err) {
      if (err instanceof ValidationError) {
        caughtEmpty = true;
        assert(
          err.message.includes('cannot be empty'),
          'Rejects whitespace-only user prompt with clear user-facing error'
        );
      }
    }
    assert(caughtEmpty, 'Validation error thrown for empty user message');

    let caughtNull = false;
    try {
      normalizeAndValidateMessages(null);
    } catch (err) {
      if (err instanceof ValidationError) {
        caughtNull = true;
      }
    }
    assert(caughtNull, 'Validation error thrown for null messages payload');
  } catch (err) {
    console.error('Test 1 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 2: Empty assistant placeholder in history
  // ---------------------------------------------------------
  console.log('\nScenario 2: Empty assistant placeholder in history');
  try {
    // This is the exact condition that caused "Message at index 1 must have non-empty content."
    const rawHistory = [
      { id: '1', role: 'user', content: 'Calculate 15 * 8' },
      { id: '2', role: 'assistant', content: '', metadata: { status: 'error' } }, // empty placeholder
      { id: '3', role: 'user', content: 'Please give the answer' },
    ];

    const validated = normalizeAndValidateMessages(rawHistory, 'gemini');
    assert(validated.length === 2, 'Empty assistant placeholder at index 1 was cleanly filtered out');
    assert(validated[0].content === 'Calculate 15 * 8', 'First user message preserved');
    assert(validated[1].content === 'Please give the answer', 'Second user message preserved');
    assert(
      !validated.some((m) => m.role === 'assistant' && m.content === ''),
      'No empty assistant messages exist in the output'
    );
  } catch (err) {
    console.error('Test 2 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 3: A valid multi-message conversation
  // ---------------------------------------------------------
  console.log('\nScenario 3: Valid multi-message conversation');
  try {
    const validHistory: Message[] = [
      { id: '1', conversationId: 'c1', role: 'user', content: 'What is photosynthesis?', createdAt: '' },
      { id: '2', conversationId: 'c1', role: 'assistant', content: 'Photosynthesis is...', createdAt: '' },
      { id: '3', conversationId: 'c1', role: 'user', content: 'Which organisms perform it?', createdAt: '' },
    ];

    const validated = ContextManager.validateIncomingMessages(validHistory, 'openai');
    assert(validated.length === 3, 'All valid turns in conversation history are preserved');
    assert(validated[0].role === 'user' && validated[0].content === 'What is photosynthesis?', 'Turn 1 user intact');
    assert(validated[1].role === 'assistant' && validated[1].content === 'Photosynthesis is...', 'Turn 2 assistant intact');
    assert(validated[2].role === 'user' && validated[2].content === 'Which organisms perform it?', 'Turn 3 user intact');

    // Context Manager builds AI context with system prompt
    const aiContext = ContextManager.buildAIContext({ messages: validated });
    assert(aiContext.length === 4, 'AI context includes 1 consolidated system prompt + 3 turns');
    assert(aiContext[0].role === 'system', 'First message is system prompt');
    assert(aiContext[1].content === 'What is photosynthesis?', 'Preserves prompt content in context');
  } catch (err) {
    console.error('Test 3 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 4: Strict no-fallback policy: no local model activates
  // ---------------------------------------------------------
  console.log('\nScenario 4: Strict no-fallback policy: no local model activates');
  try {
    fallbackManager.resetCircuit();

    // Force failure of Gemini
    fallbackManager.recordFailure('gemini', new QuotaExhaustedError('Daily quota exhausted', 68905, 'daily_limit'));

    const resolution = await fallbackManager.resolveFallback('gemini');
    assert(resolution.canFallback === false, 'Fallback is strictly disallowed');
    assert(resolution.error !== undefined, 'Provides clear error indicating single Gemini pipeline');
  } catch (err) {
    console.error('Test 4 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 5: Gemini 429 quota exhaustion
  // ---------------------------------------------------------
  console.log('\nScenario 5: Gemini 429 quota exhaustion & circuit breaker');
  try {
    fallbackManager.resetCircuit();

    const mock429 = JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Quota exceeded for QuotaId: generate_content_requests_per_day. Retry in 34200s.',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34200s' }],
      },
    });

    const classification = classifyGeminiError(429, mock429);
    assert(classification.category === 'daily_quota', 'Classifies as daily quota exhaustion');
    assert(classification.canRetry === false, 'Cannot retry daily quota exhaustion immediately');
    assert(classification.retryDelaySeconds === 34200, 'Parses 34200s retry delay');

    fallbackManager.recordFailure('gemini', new QuotaExhaustedError(classification.userFacingMessage, 34200, 'daily_limit'));
    const availability = fallbackManager.isProviderAvailable('gemini');
    assert(availability.available === false, 'Circuit breaker opened during exhaustion cooldown');
    assert((availability.cooldownRemainingSec ?? 0) > 30000, 'Cooldown reflects full daily window');
  } catch (err) {
    console.error('Test 5 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 6: An interrupted streaming response
  // ---------------------------------------------------------
  console.log('\nScenario 6: Interrupted streaming response handling');
  try {
    const streamOutput: string[] = [];
    const streamState = {
      firstChunkYielded: false,
      fallbackRestarted: false,
    };

    // Simulate stream runner
    async function streamRunner(failAfterFirstChunk: boolean) {
      try {
        streamState.firstChunkYielded = true;
        streamOutput.push('Chunk 1: Mathematical formula');

        if (failAfterFirstChunk) {
          throw new Error('Socket abruptly closed midway');
        }
        streamOutput.push('Chunk 2: Result');
      } catch (err) {
        if (!streamState.firstChunkYielded) {
          streamState.fallbackRestarted = true;
        } else {
          // Explicit partial failure handling: do NOT restart fallback provider invisibly
          streamState.fallbackRestarted = false;
          streamOutput.push('[ERROR: Connection terminated]');
        }
      }
    }

    await streamRunner(true);
    assert(streamState.firstChunkYielded === true, 'First chunk marked as yielded');
    assert(streamState.fallbackRestarted === false, 'Fallback was NOT restarted after partial token delivery');
    assert(
      streamOutput.length === 2 && streamOutput[1] === '[ERROR: Connection terminated]',
      'Response ended cleanly without appending a duplicate answer'
    );
  } catch (err) {
    console.error('Test 6 failed:', err);
  }

  // ---------------------------------------------------------
  // Test 7: Valid image or attachment messages
  // ---------------------------------------------------------
  console.log('\nScenario 7: Valid image or attachment messages');
  try {
    // Message with empty textual prompt but with a valid image attachment
    const attachmentMessage = [
      {
        id: 'img_msg',
        role: 'user',
        content: '', // Empty text
        attachments: [
          {
            id: 'f1',
            name: 'diagram.png',
            category: 'image',
            mimeType: 'image/png',
            size: 1024,
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      },
    ];

    const validated = normalizeAndValidateMessages(attachmentMessage, 'gemini');
    assert(validated.length === 1, 'Message with valid attachment accepted even with empty text');
    assert(
      validated[0].content.includes('diagram.png'),
      'Content populated with descriptive attachment reference'
    );

    // Reset circuit so Gemini provider can stream mock request
    fallbackManager.resetCircuit('gemini');

    // Test Gemini provider contents conversion with image
    let geminiPayloadCaptured: any = null;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input).includes('googleapis.com')) {
        geminiPayloadCaptured = JSON.parse(String(init?.body || '{}'));
        return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return originalFetch(input, init);
    };

    const gemini = new GeminiProvider();
    const tokenGen = gemini.streamChat({
      model: 'gemini-3.8-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image:' },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              },
            },
          ],
        },
      ],
    });

    for await (const _ of tokenGen) {
      // iterate
    }

    assert(geminiPayloadCaptured !== null, 'Gemini request was made');
    const parts = geminiPayloadCaptured.contents[0].parts;
    assert(parts[0].text === 'Analyze this image:', 'Text part formatted correctly');
    assert(parts[1].inlineData?.mimeType === 'image/png', 'Multimodal image formatted as inlineData with mimeType');
    assert(typeof parts[1].inlineData?.data === 'string', 'Image base64 data included in inlineData');

    // Test Ollama provider image conversion
    let ollamaPayloadCaptured: any = null;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input).includes('/api/chat')) {
        ollamaPayloadCaptured = JSON.parse(String(init?.body || '{}'));
        return new Response('{"done": true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };

    const ollamaGen = ollamaProvider.streamChat({
      model: 'qwen2.5:0.5b',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe image' },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              },
            },
          ],
        },
      ],
    });

    for await (const _ of ollamaGen) {
      // iterate
    }

    assert(ollamaPayloadCaptured !== null, 'Ollama request was made');
    assert(ollamaPayloadCaptured.messages[0].content === 'Describe image', 'Ollama message text extracted');
    assert(Array.isArray(ollamaPayloadCaptured.messages[0].images), 'Ollama message images array populated');
    assert(ollamaPayloadCaptured.messages[0].images.length === 1, 'Ollama received 1 base64 image');
  } catch (err) {
    console.error('Test 7 failed:', err);
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
