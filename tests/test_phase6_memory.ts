/**
 * RIYAI Phase 6: Advanced Memory & Personalization Test Suite
 *
 * Verifies:
 * 1. Memory Creation (Explicit and Inferred)
 * 2. Privacy & Security Screening (Rejection of credentials, passwords, API keys)
 * 3. Memory Updating & Contradiction Resolution (Updating outdated memories in-place)
 * 4. Memory Retrieval & Semantic Relevance Scoring (Only relevant memories returned)
 * 5. Memory Editing, Deletion, and Clearing
 * 6. User Isolation & Cross-Session Persistence (Zero cross-user data leakage)
 * 7. Long Conversation Summarization & Model Token Budgeting
 * 8. Personalized Prompt Generation (Style, Explanation Level, Tone, Custom Instructions)
 * 9. Database & Storage Failure Resilience (Graceful degradation)
 * 10. Preservation of Phase 5 Message Validation Invariants
 */

import assert from 'assert';
import { memoryService } from '../services/memory/memoryService';
import { checkPrivacy } from '../services/memory/privacyScreening';
import { ContextManager } from '../services/ai/contextManager';
import { dbService } from '../services/database/clientDb';
import { Message } from '../types/message';
import { UserPreference } from '../types/preference';

let passedAssertions = 0;

function assertTest(condition: boolean, description: string) {
  assert(condition, `Assertion Failed: ${description}`);
  passedAssertions++;
  console.log(`  [PASS] ${description}`);
}

async function runPhase6Tests() {
  console.log('======================================================');
  console.log('RIYAI Phase 6: Advanced Memory & Personalization Tests');
  console.log('======================================================\n');

  const testUserA = 'user_alice_test_' + Date.now();
  const testUserB = 'user_bob_test_' + Date.now();

  try {
    // ------------------------------------------------------------------------
    // Scenario 1: Memory Creation (Explicit and Inferred)
    // ------------------------------------------------------------------------
    console.log('Scenario 1: Memory Creation (Explicit & Inferred)');

    // 1.1 Explicit memory command
    const explicitCmd = await memoryService.parseExplicitCommand(
      'Remember that my project is called RIYAI Advanced Memory',
      testUserA
    );
    assertTest(explicitCmd.isCommand === true, 'Explicit "Remember that..." detected as command');
    assertTest(explicitCmd.action === 'remember', 'Action is "remember"');
    assertTest(Boolean(explicitCmd.memory), 'Memory object was created');
    assertTest(explicitCmd.memory?.memoryType === 'project', 'Correctly inferred "project" memory type');

    // 1.2 Inferred memory from natural statements
    const candidate1 = memoryService.shouldRemember('I prefer TypeScript and concise code');
    assertTest(candidate1.shouldRemember === true, 'Inferred preference from "I prefer..."');
    assertTest(candidate1.memoryType === 'preference', 'Classified as "preference" type');

    // 1.3 Ephemeral queries filtered out (not stored)
    const ephemeral1 = memoryService.shouldRemember('What is the weather like in Seattle today?');
    assertTest(ephemeral1.shouldRemember === false, 'Ephemeral query "What is the weather..." rejected');

    const ephemeral2 = memoryService.shouldRemember('Explain how binary search trees work in detail');
    assertTest(ephemeral2.shouldRemember === false, 'Ephemeral query "Explain how..." rejected');

    // ------------------------------------------------------------------------
    // Scenario 2: Privacy and Security Screening
    // ------------------------------------------------------------------------
    console.log('\nScenario 2: Privacy & Security Screening (Credential Rejection)');

    // 2.1 Passwords rejected
    const pwdCheck = checkPrivacy('Remember my password is MySecretPassword123!');
    assertTest(pwdCheck.isSensitive === true, 'Screens out password declarations');

    const pwdCmd = await memoryService.parseExplicitCommand(
      'Remember my password is MySecretPassword123!',
      testUserA
    );
    assertTest(pwdCmd.isCommand === true, 'Detected explicit command for password');
    assertTest(
      pwdCmd.feedbackMessage?.includes('does not store passwords') ?? false,
      'Feedback message informs user that credentials are not stored'
    );
    assertTest(!pwdCmd.memory, 'No memory record was saved for password');

    // 2.2 API keys rejected (OpenAI, Gemini, AWS)
    const apiKeyCheck = checkPrivacy('My key is sk-proj-1234567890abcdef1234567890abcdef');
    assertTest(apiKeyCheck.isSensitive === true, 'Screens out OpenAI API keys');

    const geminiKeyCheck = checkPrivacy('AIzaSyD1234567890123456789012345678901');
    assertTest(geminiKeyCheck.isSensitive === true, 'Screens out Google API keys');

    // 2.3 JWT / Bearer tokens rejected
    const tokenCheck = checkPrivacy('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID');
    assertTest(tokenCheck.isSensitive === true, 'Screens out JWT and Bearer tokens');

    // ------------------------------------------------------------------------
    // Scenario 3: Memory Updating & Contradiction Resolution
    // ------------------------------------------------------------------------
    console.log('\nScenario 3: Memory Updating & Contradiction Resolution');

    // Step 1: Create initial language preference
    const initialLang = await memoryService.createMemory({
      userId: testUserA,
      content: 'My primary language is Python',
      memoryType: 'preference',
      importance: 3,
    });
    assertTest(initialLang.isNew === true, 'First language preference created as new memory');

    // Step 2: User states updated/contradictory preference
    const updatedLang = await memoryService.createMemory({
      userId: testUserA,
      content: 'My primary language is TypeScript',
      memoryType: 'preference',
      importance: 4,
    });
    assertTest(updatedLang.isNew === false, 'Updated preference recognized existing topic and updated in-place');
    assertTest(updatedLang.memory.id === initialLang.memory.id, 'Memory ID was preserved upon update');
    assertTest(updatedLang.memory.content === 'My primary language is TypeScript', 'Content updated to latest preference');

    // Verify user memories list only contains 1 language record, not 2 contradictory ones
    const userAMemories = await memoryService.getMemories(testUserA);
    const langMemories = userAMemories.filter((m) => m.content.includes('primary language'));
    assertTest(langMemories.length === 1, 'Only 1 consolidated language memory exists (no conflicting duplicates)');

    // ------------------------------------------------------------------------
    // Scenario 4: Memory Retrieval & Semantic Relevance Scoring
    // ------------------------------------------------------------------------
    console.log('\nScenario 4: Memory Retrieval & Semantic Relevance Scoring');

    // Add a project memory for testUserA
    await memoryService.createMemory({
      userId: testUserA,
      content: 'Building a Next.js fullstack application called RIYAI',
      memoryType: 'project',
      importance: 4,
    });

    // Query 4.1: Relevant query about the project
    const projectResults = await memoryService.getRelevantMemories(
      testUserA,
      'What architecture should I use for my Next.js project?',
      3
    );
    assertTest(projectResults.length > 0, 'Relevant memories retrieved for project architecture query');
    assertTest(
      projectResults.some((m) => m.content.includes('Next.js')),
      'Retrieved memory matches Next.js project context'
    );

    // Query 4.2: Irrelevant query about cooking
    const cookingResults = await memoryService.getRelevantMemories(
      testUserA,
      'How long should I bake chocolate chip cookies in the oven?',
      3
    );
    assertTest(cookingResults.length === 0, 'Irrelevant memories filtered out (zero unrelated context leaked)');

    // ------------------------------------------------------------------------
    // Scenario 5: Memory Editing, Deletion, and Clearing
    // ------------------------------------------------------------------------
    console.log('\nScenario 5: Memory Editing, Deletion, and Clearing');

    // 5.1 Inline edit
    const memToEdit = userAMemories[0];
    const edited = await memoryService.updateMemory(memToEdit.id, testUserA, {
      content: 'Updated memory content for testing edit',
    });
    assertTest(edited.content === 'Updated memory content for testing edit', 'Memory content updated successfully');

    // 5.2 Delete specific memory
    await memoryService.deleteMemory(memToEdit.id, testUserA);
    const afterDelete = await memoryService.getMemories(testUserA);
    assertTest(!afterDelete.some((m) => m.id === memToEdit.id), 'Deleted memory is no longer in user storage');

    // 5.3 Clear all memories
    await memoryService.clearMemories(testUserA);
    const afterClear = await memoryService.getMemories(testUserA);
    assertTest(afterClear.length === 0, 'All memories cleared successfully for user');

    // ------------------------------------------------------------------------
    // Scenario 6: User Isolation & Cross-Session Persistence
    // ------------------------------------------------------------------------
    console.log('\nScenario 6: User Isolation & Cross-Session Persistence');

    // Create memory for User A
    await memoryService.createMemory({
      userId: testUserA,
      content: 'Secret project details belonging solely to User Alice',
      memoryType: 'project',
      importance: 5,
    });

    // Create memory for User B
    await memoryService.createMemory({
      userId: testUserB,
      content: 'Personal preferences belonging solely to User Bob',
      memoryType: 'preference',
      importance: 4,
    });

    // Verify User A can only see User A's memories
    const aliceMems = await memoryService.getMemories(testUserA);
    assertTest(aliceMems.every((m) => m.userId === testUserA), 'Alice only sees memories with userId === testUserA');
    assertTest(!aliceMems.some((m) => m.content.includes('Bob')), 'Alice cannot see Bob memories');

    // Verify User B can only see User B's memories
    const bobMems = await memoryService.getMemories(testUserB);
    assertTest(bobMems.every((m) => m.userId === testUserB), 'Bob only sees memories with userId === testUserB');
    assertTest(!bobMems.some((m) => m.content.includes('Alice')), 'Bob cannot see Alice memories');

    // Verify Bob cannot delete Alice's memory
    await memoryService.deleteMemory(aliceMems[0].id, testUserB); // Attempt delete by Bob
    const aliceMemsAfterBobAttempt = await memoryService.getMemories(testUserA);
    assertTest(aliceMemsAfterBobAttempt.length === aliceMems.length, 'Bob cannot delete Alice memory (isolated)');

    // ------------------------------------------------------------------------
    // Scenario 7: Conversation Summarization & Token Budgeting
    // ------------------------------------------------------------------------
    console.log('\nScenario 7: Conversation Summarization & Token Budgeting');

    const convId = 'conv_long_' + Date.now();
    const mockMessages: Message[] = [
      { id: '1', conversationId: convId, role: 'user', content: 'We need to design a scalable Next.js backend architecture.', createdAt: new Date().toISOString() },
      { id: '2', conversationId: convId, role: 'assistant', content: 'I recommend using server routes with strict schema validation.', createdAt: new Date().toISOString() },
      { id: '3', conversationId: convId, role: 'user', content: 'What about caching and database connection pooling?', createdAt: new Date().toISOString() },
      { id: '4', conversationId: convId, role: 'assistant', content: 'We implemented singleton connection management with circuit breakers.', createdAt: new Date().toISOString() },
      { id: '5', conversationId: convId, role: 'user', content: 'Let us also add memory isolation per authenticated user.', createdAt: new Date().toISOString() },
      { id: '6', conversationId: convId, role: 'assistant', content: 'We can enforce partition keys using userId on every storage lookup.', createdAt: new Date().toISOString() },
    ];

    const summary = await memoryService.summarizeConversation(convId, mockMessages, testUserA);
    assertTest(Boolean(summary.summary), 'Generated conversation summary');
    assertTest(summary.keyTopics.length > 0, 'Extracted key topics from conversation');
    assertTest(summary.conversationId === convId, 'Summary associated with conversation ID');

    // Test token budgeting sliding window
    const builtContext = ContextManager.buildAIContext({
      messages: mockMessages,
      conversationSummary: summary,
      maxContextTokens: 1000, // Constrained token budget
    });

    assertTest(builtContext.length > 0, 'Context built within constrained token budget');
    assertTest(builtContext[0].role === 'system', 'First message is consolidated system prompt');
    assertTest(
      (builtContext[0].content as string).includes('Earlier Conversation Summary'),
      'System prompt includes conversation summary'
    );

    // ------------------------------------------------------------------------
    // Scenario 8: Personalized Responses Prompt Generation
    // ------------------------------------------------------------------------
    console.log('\nScenario 8: Personalized Responses Prompt Generation');

    const personalizedPrefs: UserPreference = {
      id: 'pref_1',
      userId: testUserA,
      theme: 'dark',
      language: 'en',
      responseStyle: 'concise',
      explanationLevel: 'expert',
      tone: 'professional',
      customInstructions: 'Always omit explanations for standard imports.',
      memoryEnabled: true,
      modelPreference: 'riyai-core-1.0',
      streamResponse: true,
      sendOnEnter: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const personalizedContext = ContextManager.buildAIContext({
      messages: [{ id: '1', conversationId: 'c1', role: 'user', content: 'How do I optimize DB pooling?', createdAt: new Date().toISOString() }],
      userPreferences: personalizedPrefs,
      relevantMemories: [
        {
          id: 'm1',
          userId: testUserA,
          memoryType: 'project',
          content: 'Building high-throughput API service',
          importance: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const systemPromptText = personalizedContext[0].content as string;
    assertTest(systemPromptText.includes('CONCISE'), 'System prompt specifies CONCISE response style');
    assertTest(systemPromptText.includes('EXPERT'), 'System prompt specifies EXPERT explanation level');
    assertTest(systemPromptText.includes('professional'), 'System prompt specifies PROFESSIONAL tone');
    assertTest(systemPromptText.includes('Always omit explanations'), 'System prompt includes custom directive');
    assertTest(systemPromptText.includes('Building high-throughput API service'), 'System prompt includes relevant memory');
    assertTest(systemPromptText.includes('OVERRIDE SAFEGUARD'), 'System prompt includes user instruction override safeguard');

    // ------------------------------------------------------------------------
    // Scenario 9: Database Failure Resilience
    // ------------------------------------------------------------------------
    console.log('\nScenario 9: Database & Storage Failure Resilience');

    // Pass invalid or non-existent IDs to search and memory functions
    const emptySearch = await memoryService.searchMemories('', '');
    assertTest(Array.isArray(emptySearch) && emptySearch.length === 0, 'Empty search returns empty array gracefully');

    const emptyUserMemories = await memoryService.getMemories('');
    assertTest(Array.isArray(emptyUserMemories) && emptyUserMemories.length === 0, 'Invalid userId returns empty array safely');

    // ------------------------------------------------------------------------
    // Scenario 10: Preservation of Phase 5 Invariants
    // ------------------------------------------------------------------------
    console.log('\nScenario 10: Preservation of Phase 5 Invariants');

    // Rejects empty user message
    let emptyUserRejected = false;
    try {
      ContextManager.validateIncomingMessages([{ role: 'user', content: '   ' }]);
    } catch {
      emptyUserRejected = true;
    }
    assertTest(emptyUserRejected, 'Phase 5 Invariant: Empty whitespace prompt is rejected');

    // Cleans empty assistant placeholder
    const cleaned = ContextManager.validateIncomingMessages([
      { role: 'user', content: 'First valid question' },
      { role: 'assistant', content: '' }, // empty assistant turn
      { role: 'user', content: 'Second valid question' },
    ]);
    assertTest(cleaned.length === 2, 'Phase 5 Invariant: Empty assistant placeholder is removed from history');
    assertTest(cleaned[0].content === 'First valid question', 'First question preserved');
    assertTest(cleaned[1].content === 'Second valid question', 'Second question preserved');

    // Cleanup test users
    await memoryService.clearMemories(testUserA);
    await memoryService.clearMemories(testUserB);

    console.log('\n======================================================');
    console.log(`PHASE 6 RESULTS: ${passedAssertions}/49 assertions passed successfully!`);
    console.log('======================================================\n');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

runPhase6Tests();
