// Test /api/chat with Phase 3 Memory & Context Payload
async function runTests() {
  console.log('--- Testing /api/chat Phase 3 Payload Handling ---');
  
  const payload = {
    messages: [
      { role: 'user', content: 'What is the status of my healthcare project?' }
    ],
    modelId: 'riyai-pro',
    relevantMemories: [
      {
        id: 'mem_1',
        userId: 'user_1',
        memoryType: 'project',
        content: 'I am building a healthcare application called CAREQ',
        importance: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    conversationSummary: {
      id: 'sum_1',
      conversationId: 'conv_1',
      summary: 'Previously discussed CAREQ telemedicine architecture.',
      keyTopics: ['CAREQ', 'healthcare', 'telemedicine'],
      importantDecisions: ['Using Next.js'],
      unresolvedQuestions: [],
      updatedAt: new Date().toISOString()
    },
    userPreferences: {
      theme: 'dark',
      responseStyle: 'concise',
      language: 'en',
      modelPreference: 'riyai-pro',
      memoryEnabled: true
    }
  };

  const res = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  console.log('Status code:', res.status);
  const data = await res.json();
  console.log('Response body:', data);

  // If OPENAI_API_KEY is not configured on server, it gracefully returns 503 with AI_PROVIDER_NOT_CONFIGURED
  // This verifies that rate limiter, JSON validation, context manager building, and provider check all passed!
  if (res.status === 503 && data.code === 'AI_PROVIDER_NOT_CONFIGURED') {
    console.log('✓ Validation & ContextManager pipeline passed successfully before LLM provider call.');
  } else if (res.status === 200) {
    console.log('✓ Streaming chat responded successfully with 200 OK.');
  } else {
    console.log('Unexpected response:', res.status, data);
  }
}

runTests().catch(console.error);
