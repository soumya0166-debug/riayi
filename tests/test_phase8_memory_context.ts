/**
 * RIYAI Step 8: Smart Memory & Context-Aware Conversations Test Suite
 *
 * Verifies:
 * 1. Multi-turn conversation persistence & continuity
 * 2. Follow-up query understanding ("it", "that", "explain the previous answer") with contextual query resolution
 * 3. Chat isolation across separate conversations (no bleed between chats)
 * 4. Conversation restoration across page refresh / reload
 * 5. Chat management: create, rename, pin, delete
 * 6. User ownership enforcement & cross-user privacy isolation
 * 7. Long conversation summarization & token-budgeted sliding window
 * 8. RAG + Memory integration (document citations preserved alongside conversation context)
 * 9. Separation of uploaded document knowledge from conversational memory
 * 10. Stability & error resilience (empty messages, invalid users, db recovery)
 */

import assert from 'assert';
import { dbService } from '../services/database/clientDb';
import { memoryService } from '../services/memory/memoryService';
import { ContextManager } from '../services/ai/contextManager';
import { knowledgeService } from '../services/knowledge/knowledgeService';
import { Message } from '../types/message';
import { StoredFile, FileChunk } from '../types/attachment';
import { generateId } from '../lib/utils';
import { normalizeAndValidateMessages } from '../services/ai/messageValidator';

let totalAssertions = 0;
let passedAssertions = 0;

function assertTest(condition: boolean, description: string) {
  totalAssertions++;
  assert(condition, `Assertion Failed: ${description}`);
  passedAssertions++;
  console.log(`  [PASS] ${description}`);
}

async function runStep8Tests() {
  console.log('================================================================');
  console.log('RIYAI Step 8: Smart Memory & Context-Aware Conversations Tests');
  console.log('================================================================\n');

  const userAlice = `user_alice_step8_${Date.now()}`;
  const userBob = `user_bob_step8_${Date.now()}`;

  try {
    // ------------------------------------------------------------------------
    // Scenario 1: Multi-turn conversation persistence and sequential continuity
    // ------------------------------------------------------------------------
    console.log('Scenario 1: Multi-turn Conversation Persistence & Sequential Continuity');

    const conv1 = await dbService.createConversation({
      title: 'Distributed Systems Discussion',
      modelId: 'riyai-core-1.0',
      userId: userAlice,
    });
    assertTest(Boolean(conv1.id), 'Conversation 1 created with valid ID');
    assertTest(conv1.userId === userAlice, 'Conversation is owned by user Alice');

    // Turn 1
    const msg1User: Message = {
      id: generateId('msg_user'),
      conversationId: conv1.id,
      role: 'user',
      content: 'What is the Raft consensus algorithm and why is it used?',
      createdAt: new Date(Date.now() - 30000).toISOString(),
      metadata: { status: 'delivered' },
    };
    await dbService.saveMessage(msg1User);

    const msg1Ast: Message = {
      id: generateId('msg_ast'),
      conversationId: conv1.id,
      role: 'assistant',
      content: 'Raft is a consensus algorithm designed for understandability, dividing consensus into leader election, log replication, and safety.',
      createdAt: new Date(Date.now() - 25000).toISOString(),
      metadata: { status: 'delivered', model: 'riyai-core-1.0' },
    };
    await dbService.saveMessage(msg1Ast);

    // Turn 2
    const msg2User: Message = {
      id: generateId('msg_user'),
      conversationId: conv1.id,
      role: 'user',
      content: 'How does it compare to Paxos?',
      createdAt: new Date(Date.now() - 20000).toISOString(),
      metadata: { status: 'delivered' },
    };
    await dbService.saveMessage(msg2User);

    const msg2Ast: Message = {
      id: generateId('msg_ast'),
      conversationId: conv1.id,
      role: 'assistant',
      content: 'Compared to Paxos, Raft is structured with an explicit leader and decomposed states, making it significantly easier to implement and reason about.',
      createdAt: new Date(Date.now() - 15000).toISOString(),
      metadata: { status: 'delivered', model: 'riyai-core-1.0' },
    };
    await dbService.saveMessage(msg2Ast);

    const conv1Messages = await dbService.getMessages(conv1.id);
    assertTest(conv1Messages.length === 4, 'All 4 messages stored sequentially in Conversation 1');
    assertTest(conv1Messages[0].content.includes('Raft consensus'), 'Message 1 preserves user question');
    assertTest(conv1Messages[1].content.includes('consensus algorithm'), 'Message 2 preserves assistant answer');
    assertTest(conv1Messages[2].content.includes('compare to Paxos'), 'Message 3 preserves follow-up question');

    // ------------------------------------------------------------------------
    // Scenario 2: Contextual Coreference & Follow-up Query Resolution ("it", "that", "the previous answer")
    // ------------------------------------------------------------------------
    console.log('\nScenario 2: Contextual Coreference Resolution for Follow-up Questions');

    // 2.1 Follow-up with pronoun "it"
    const followUp1 = 'Can you explain it in more detail?';
    const contextual1 = memoryService.resolveContextualQuery(followUp1, conv1Messages);
    assertTest(
      contextual1.toLowerCase().includes('raft') || contextual1.toLowerCase().includes('consensus'),
      'Resolved "it" to include preceding Raft/consensus topic'
    );
    assertTest(contextual1.startsWith(followUp1), 'Contextual query preserves original user prompt as base');

    // 2.2 Follow-up referring to "the previous answer"
    const followUp2 = 'Why did you mention that in the previous answer?';
    const contextual2 = memoryService.resolveContextualQuery(followUp2, conv1Messages);
    assertTest(
      contextual2.toLowerCase().includes('paxos') || contextual2.toLowerCase().includes('raft'),
      'Resolved "the previous answer" with recent keywords'
    );

    // 2.3 Regular non-follow-up query is not mutated
    const independentQuery = 'What is the capital of France?';
    const resolvedIndependent = memoryService.resolveContextualQuery(independentQuery, conv1Messages);
    assertTest(resolvedIndependent === independentQuery, 'Independent query remains unmutated without false keywords');

    // ------------------------------------------------------------------------
    // Scenario 3: Separate Conversation Contexts (Zero bleed between chats)
    // ------------------------------------------------------------------------
    console.log('\nScenario 3: Separate Conversation Contexts & Chat Isolation');

    const conv2 = await dbService.createConversation({
      title: 'React Performance Tuning',
      modelId: 'riyai-core-1.0',
      userId: userAlice,
    });
    assertTest(Boolean(conv2.id) && conv2.id !== conv1.id, 'Conversation 2 created with distinct ID');

    const msgConv2: Message = {
      id: generateId('msg_user'),
      conversationId: conv2.id,
      role: 'user',
      content: 'How does React Compiler eliminate manual useMemo and useCallback hooks?',
      createdAt: new Date().toISOString(),
      metadata: { status: 'delivered' },
    };
    await dbService.saveMessage(msgConv2);

    const c1MessagesAfter = await dbService.getMessages(conv1.id);
    const c2Messages = await dbService.getMessages(conv2.id);

    assertTest(c1MessagesAfter.length === 4, 'Conversation 1 messages unchanged (no leakage from Conversation 2)');
    assertTest(c2Messages.length === 1, 'Conversation 2 contains only its own message');
    assertTest(!c1MessagesAfter.some((m) => m.content.includes('React Compiler')), 'Conversation 1 has zero React Compiler messages');
    assertTest(!c2Messages.some((m) => m.content.includes('Raft consensus')), 'Conversation 2 has zero Raft consensus messages');

    // ------------------------------------------------------------------------
    // Scenario 4: Conversation Restoration (Simulating page refresh / reload)
    // ------------------------------------------------------------------------
    console.log('\nScenario 4: Conversation Restoration Across Refresh / Reload');

    // Fetch user conversations as done on page reload
    const restoredList = await dbService.getConversations(userAlice);
    assertTest(restoredList.length >= 2, 'Restored conversation list on reload');
    assertTest(restoredList.some((c) => c.id === conv1.id), 'Conversation 1 present in restored list');
    assertTest(restoredList.some((c) => c.id === conv2.id), 'Conversation 2 present in restored list');

    // Restore specific conversation details & messages
    const restoredConv1 = await dbService.getConversationById(conv1.id, userAlice);
    assertTest(Boolean(restoredConv1), 'Conversation 1 restored successfully');
    assertTest(restoredConv1?.messages.length === 4, 'All 4 messages restored with conversation detail');
    assertTest(restoredConv1?.title === 'Distributed Systems Discussion', 'Preserves original conversation title');

    // ------------------------------------------------------------------------
    // Scenario 5: Chat Management (Create, Rename, Pin, Delete)
    // ------------------------------------------------------------------------
    console.log('\nScenario 5: Chat Management (Rename, Pin, Delete)');

    // 5.1 Rename conversation
    const renamed = await dbService.renameConversation(conv1.id, 'Raft vs Paxos Consensus Deep Dive', userAlice);
    assertTest(renamed.title === 'Raft vs Paxos Consensus Deep Dive', 'Conversation renamed successfully');

    const verifyRenamed = await dbService.getConversationById(conv1.id, userAlice);
    assertTest(verifyRenamed?.title === 'Raft vs Paxos Consensus Deep Dive', 'Renamed title persisted in storage');

    // 5.2 Toggle Pin
    const isPinned = await dbService.togglePinConversation(conv1.id, userAlice);
    assertTest(isPinned === true, 'Conversation pinned successfully');

    const unpinned = await dbService.togglePinConversation(conv1.id, userAlice);
    assertTest(unpinned === false, 'Conversation unpinned successfully');

    // 5.3 Empty rename validation
    let emptyRenameFailed = false;
    try {
      await dbService.renameConversation(conv1.id, '   ', userAlice);
    } catch {
      emptyRenameFailed = true;
    }
    assertTest(emptyRenameFailed, 'Rejects empty whitespace title when renaming');

    // ------------------------------------------------------------------------
    // Scenario 6: User Ownership & Cross-User Privacy Isolation
    // ------------------------------------------------------------------------
    console.log('\nScenario 6: User Ownership & Privacy Isolation');

    const bobConvs = await dbService.getConversations(userBob);
    assertTest(!bobConvs.some((c) => c.id === conv1.id), 'Bob cannot see Alice Conversation 1 in conversation list');
    assertTest(!bobConvs.some((c) => c.id === conv2.id), 'Bob cannot see Alice Conversation 2 in conversation list');

    // Bob attempts to fetch Alice's conversation by ID
    const bobAccessAliceConv = await dbService.getConversationById(conv1.id, userBob);
    assertTest(bobAccessAliceConv === null, 'Bob receives null when querying Alice conversation ID (unauthorized)');

    // Bob attempts to delete Alice's conversation
    let bobDeleteFailed = false;
    try {
      await dbService.deleteConversation(conv1.id, userBob);
    } catch {
      bobDeleteFailed = true;
    }
    assertTest(bobDeleteFailed, 'Bob cannot delete Alice conversation (unauthorized rejection)');

    // Verify Alice conversation still intact
    const aliceConvStillExists = await dbService.getConversationById(conv1.id, userAlice);
    assertTest(Boolean(aliceConvStillExists), 'Alice conversation preserved after unauthorized delete attempt');

    // ------------------------------------------------------------------------
    // Scenario 7: Long Conversation Summarization & Sliding Window Token Budget
    // ------------------------------------------------------------------------
    console.log('\nScenario 7: Long Conversation Summarization & Token Budget');

    // Construct a long multi-turn conversation
    const longConv = await dbService.createConversation({
      title: 'Microservices Architecture Review',
      modelId: 'riyai-core-1.0',
      userId: userAlice,
    });

    const longMessages: Message[] = [];
    const topicsList = [
      'Database sharding patterns for high-throughput ordering service',
      'Event sourcing vs change data capture using Debezium and Kafka',
      'Saga pattern implementation for distributed order fulfillment transactions',
      'Circuit breakers and bulkhead isolation with Resilience4j',
      'Distributed tracing using OpenTelemetry and Jaeger exporter',
    ];

    for (let i = 0; i < topicsList.length; i++) {
      const uMsg: Message = {
        id: generateId(`msg_u_${i}`),
        conversationId: longConv.id,
        role: 'user',
        content: `Explain ${topicsList[i]} with architectural trade-offs.`,
        createdAt: new Date(Date.now() - (10 - i * 2) * 60000).toISOString(),
      };
      const aMsg: Message = {
        id: generateId(`msg_a_${i}`),
        conversationId: longConv.id,
        role: 'assistant',
        content: `For ${topicsList[i]}, the recommended decision is to implement asynchronous event delivery with compensatory actions. This approach ensures high availability.`,
        createdAt: new Date(Date.now() - (9 - i * 2) * 60000).toISOString(),
      };
      await dbService.saveMessage(uMsg);
      await dbService.saveMessage(aMsg);
      longMessages.push(uMsg, aMsg);
    }

    assertTest(longMessages.length === 10, 'Created 10-message long conversation');

    // 7.1 Summarize conversation
    const summary = await memoryService.summarizeConversation(longConv.id, longMessages, userAlice);
    assertTest(Boolean(summary.summary), 'Generated conversation summary');
    assertTest(summary.summary.includes('Discussion originated around'), 'Summary describes initial discussion origin');
    assertTest(summary.keyTopics.length > 0, 'Extracted key topics from long conversation');
    assertTest(summary.messageCount === 10, 'Tracks message count in summary record');

    // 7.2 Verify shouldRefreshSummary logic
    const needsRefreshBefore = memoryService.shouldRefreshSummary(summary, 12);
    assertTest(needsRefreshBefore === false, 'Does not refresh summary when only 2 new messages added (12 vs 10)');

    const needsRefreshAfter = memoryService.shouldRefreshSummary(summary, 17);
    assertTest(needsRefreshAfter === true, 'Refreshes summary when 7 new messages added (>= 6 threshold)');

    // 7.3 Build AI context with summary and constrained token budget
    const aiContext = ContextManager.buildAIContext({
      messages: longMessages,
      conversationSummary: summary,
      maxContextTokens: 2048,
    });

    assertTest(aiContext.length > 0, 'AI context built successfully');
    assertTest(aiContext[0].role === 'system', 'First entry is consolidated system prompt');
    const systemPromptContent = aiContext[0].content as string;
    assertTest(systemPromptContent.includes('### Earlier Conversation Summary'), 'Includes earlier conversation summary in system prompt');
    assertTest(systemPromptContent.includes('Conversational Continuity'), 'Includes conversational continuity directives');
    assertTest(systemPromptContent.includes('Truthfulness Invariant'), 'Includes anti-hallucination truthfulness invariant');

    // ------------------------------------------------------------------------
    // Scenario 8: RAG + Memory Integration (Citations Preserved alongside Memory)
    // ------------------------------------------------------------------------
    console.log('\nScenario 8: RAG + Memory Integration');

    // Create a mock document chunk
    const testChunk: FileChunk = {
      id: generateId('chk'),
      fileId: 'file_spec_doc_1',
      userId: userAlice,
      chunkIndex: 0,
      content: 'RIYAI Step 8 implements smart conversation memory with configurable token budget and coreference resolution.',
      fileName: 'Architecture_Spec_v8.pdf',
      pageNumber: 3,
      sectionTitle: 'Section 4: Context Awareness',
      tokenEstimate: 25,
      embedding: new Array(128).fill(0.1),
      createdAt: new Date().toISOString(),
    };

    // Build context containing both memory, conversation summary, and document chunks
    const contextWithRagAndMemory = ContextManager.buildAIContext({
      messages: [
        {
          id: '1',
          conversationId: conv1.id,
          role: 'user',
          content: 'What does Section 4 say about context awareness?',
          createdAt: '',
        },
      ],
      relevantMemories: [
        {
          id: 'mem_1',
          userId: userAlice,
          memoryType: 'preference',
          content: 'User prefers concise answers with architectural bullet points',
          importance: 5,
          createdAt: '',
          updatedAt: '',
        },
      ],
      relevantChunks: [testChunk],
      conversationSummary: summary,
    });

    const ragSystemPrompt = contextWithRagAndMemory[0].content as string;
    assertTest(ragSystemPrompt.includes('### Document Intelligence & Evidence (RAG)'), 'Includes Document Intelligence section');
    assertTest(ragSystemPrompt.includes('<document_source file="Architecture_Spec_v8.pdf" location="Page 3">'), 'Document chunk formatted with isolated XML tags and page citation');
    assertTest(ragSystemPrompt.includes('### Known Context About User (Long-term Memory)'), 'Keeps long-term user memory distinctly separated from document evidence');
    assertTest(ragSystemPrompt.includes('### Earlier Conversation Summary'), 'Keeps earlier conversation summary distinctly separated');
    assertTest(ragSystemPrompt.includes('Distinguish document evidence from general knowledge'), 'Directs model to distinguish document facts from general conversation');

    // ------------------------------------------------------------------------
    // Scenario 9: Deletion & Cleanup Behavior
    // ------------------------------------------------------------------------
    console.log('\nScenario 9: Deletion & Cleanup Behavior');

    // Delete conversation 2
    await dbService.deleteConversation(conv2.id, userAlice);

    const c2Check = await dbService.getConversationById(conv2.id, userAlice);
    assertTest(c2Check === null, 'Deleted conversation 2 is no longer retrievable');

    const c2MsgsCheck = await dbService.getMessages(conv2.id);
    assertTest(c2MsgsCheck.length === 0, 'Associated messages cleanly purged for deleted conversation');

    // ------------------------------------------------------------------------
    // Scenario 10: Stability & Error Handling
    // ------------------------------------------------------------------------
    console.log('\nScenario 10: Stability & Error Handling');

    // 10.1 Empty message rejection
    let emptyRejected = false;
    try {
      normalizeAndValidateMessages([{ id: 'bad', conversationId: 'c', role: 'user', content: '   ', createdAt: '' }]);
    } catch {
      emptyRejected = true;
    }
    assertTest(emptyRejected, 'Empty user prompt rejected with clean validation error');

    // 10.2 Invalid conversation ID returns null gracefully
    const nonExistent = await dbService.getConversationById('non_existent_conv_99999', userAlice);
    assertTest(nonExistent === null, 'Non-existent conversation ID returns null without crash');

    // 10.3 Token budgeting with zero messages handles gracefully
    const emptyContext = ContextManager.buildAIContext({ messages: [] });
    assertTest(emptyContext.length === 1 && emptyContext[0].role === 'system', 'Empty messages array produces valid baseline system prompt');

    // Clean up test conversations
    await dbService.deleteConversation(conv1.id, userAlice);
    await dbService.deleteConversation(longConv.id, userAlice);

    console.log('\n================================================================');
    console.log(`STEP 8 RESULTS: ${passedAssertions}/${totalAssertions} assertions passed successfully!`);
    console.log('================================================================\n');
  } catch (error) {
    console.error('\nStep 8 Test execution failed:', error);
    process.exit(1);
  }
}

runStep8Tests();
