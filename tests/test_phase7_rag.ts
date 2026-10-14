import { ContentExtractor } from '../services/knowledge/extractor';
import { knowledgeService } from '../services/knowledge/knowledgeService';
import { embeddingService } from '../services/knowledge/embeddingService';
import { dbService } from '../services/database/clientDb';
import { ContextManager } from '../services/ai/contextManager';
import { memoryService } from '../services/memory/memoryService';
import { normalizeAndValidateMessages } from '../services/ai/messageValidator';
import { fallbackManager } from '../services/ai/providerFallbackManager';

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Minimal valid PDF generator for test purposes with real %PDF- header
function createTestPdfBuffer(textContent: string): Buffer {
  const stream = `BT /F1 12 Tf 72 712 Td (${textContent.replace(/[()]/g, '')}) Tj ET`;
  const streamLength = stream.length;
  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${stream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000261 00000 n 
0000000350 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
440
%%EOF`;

  return Buffer.from(pdfString, 'utf-8');
}

// Scanned PDF generator with raster image placeholder and empty text stream
function createScannedPdfBuffer(): Buffer {
  const stream = ``;
  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000210 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
280
%%EOF`;

  return Buffer.from(pdfString, 'utf-8');
}

async function runPhase7Tests() {
  console.log('\n======================================================');
  console.log('RIYAI Phase 7: Knowledge Intelligence & Document RAG');
  console.log('======================================================\n');

  const userAlice = 'user_alice_rag_test';
  const userBob = 'user_bob_rag_test';

  // Cleanup test users
  await dbService.clearFiles(userAlice);
  await dbService.clearFiles(userBob);

  // --------------------------------------------------------------------------
  console.log('Scenario 1: Uploading and reading a valid PDF');
  // --------------------------------------------------------------------------
  const validPdfText = 'RIYAI Phase 7 introduces comprehensive Document Retrieval-Augmented Generation for PDFs and Markdown.';
  const pdfBuffer = createTestPdfBuffer(validPdfText);

  const pdfIngest = await knowledgeService.ingestFile({
    userId: userAlice,
    originalName: 'system_architecture.pdf',
    size: pdfBuffer.length,
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });

  assert(pdfIngest.file.status === 'ready', 'PDF ingestion marks file status as ready');
  assert(pdfIngest.file.chunkCount! > 0, 'PDF chunkCount is greater than 0');
  assert(pdfIngest.chunks.length > 0, 'Generated non-empty chunks array');
  assert(Boolean(pdfIngest.chunks[0].embedding), 'Chunk contains a valid dense embedding vector');
  assert(pdfIngest.chunks[0].embedding!.length > 0, 'Chunk embedding has non-zero dimension');
  assert(pdfIngest.file.name === 'system_architecture.pdf', 'Stores correct document name');

  // --------------------------------------------------------------------------
  console.log('\nScenario 2: Uploading TXT and Markdown files');
  // --------------------------------------------------------------------------
  const markdownContent = `# RIYAI Neural Specs
## Model Pipeline
The core pipeline uses Qwen2.5 with local fallback when cloud providers are constrained.

## Retrieval Engine
Semantic search combines dense vectors with keyword overlap for grounded citations.
`;
  const mdBuffer = Buffer.from(markdownContent, 'utf-8');

  const mdIngest = await knowledgeService.ingestFile({
    userId: userAlice,
    originalName: 'specs.md',
    size: mdBuffer.length,
    mimeType: 'text/markdown',
    buffer: mdBuffer,
  });

  assert(mdIngest.file.status === 'ready', 'Markdown ingestion succeeds with ready status');
  assert(mdIngest.chunks.length > 0, 'Markdown split into chunks');
  assert(mdIngest.chunks.some((c) => c.sectionTitle === 'Model Pipeline' || c.sectionTitle === 'RIYAI Neural Specs'), 'Preserves markdown heading in chunk sectionTitle');

  const txtContent = 'Plaintext notes: Project RIYAI is configured for multi-tier RAG search with isolated user storage.';
  const txtBuffer = Buffer.from(txtContent, 'utf-8');
  const txtIngest = await knowledgeService.ingestFile({
    userId: userAlice,
    originalName: 'notes.txt',
    size: txtBuffer.length,
    mimeType: 'text/plain',
    buffer: txtBuffer,
  });

  assert(txtIngest.file.status === 'ready', 'Plaintext document ingested successfully');
  assert(txtIngest.file.category === 'text', 'Categorized as text document');

  // --------------------------------------------------------------------------
  console.log('\nScenario 3: Handling scanned, corrupted, empty, and unsupported documents');
  // --------------------------------------------------------------------------
  // Scanned PDF
  const scannedPdf = createScannedPdfBuffer();
  const scannedIngest = await knowledgeService.ingestFile({
    userId: userAlice,
    originalName: 'scanned_contract.pdf',
    size: scannedPdf.length,
    mimeType: 'application/pdf',
    buffer: scannedPdf,
  });

  assert(scannedIngest.file.status === 'ocr_required', 'Scanned PDF flagged with ocr_required status');
  assert(scannedIngest.file.isScanned === true, 'isScanned flag is true');
  assert(scannedIngest.file.ocrRequired === true, 'ocrRequired flag is true');
  assert(scannedIngest.chunks.length === 0, 'Does not emit empty chunks for scanned PDF without text');
  assert(scannedIngest.file.errorMessage!.includes('OCR'), 'Error message clearly explains OCR is required');

  // Empty Document (0 bytes)
  let emptyRejected = false;
  try {
    await ContentExtractor.extractFromBuffer(Buffer.alloc(0), 'text/plain', 'empty.txt');
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('empty')) {
      emptyRejected = true;
    }
  }
  assert(emptyRejected, 'Empty file (0 bytes) is rejected with clear error');

  // Corrupted PDF (missing %PDF- magic bytes)
  let corruptRejected = false;
  try {
    await ContentExtractor.extractFromBuffer(Buffer.from('not a real pdf content', 'utf-8'), 'application/pdf', 'corrupt.pdf');
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('corrupted')) {
      corruptRejected = true;
    }
  }
  assert(corruptRejected, 'Corrupted PDF is safely rejected without crash');

  // --------------------------------------------------------------------------
  console.log('\nScenario 4: Searching for information contained in a document');
  // --------------------------------------------------------------------------
  const searchResults = await knowledgeService.searchKnowledge(
    userAlice,
    'What does the retrieval engine combine?'
  );

  assert(searchResults.length > 0, 'Retrieves relevant chunk for search query');
  const topMatch = searchResults[0];
  assert(topMatch.chunk.content.includes('dense vectors with keyword overlap'), 'Top match contains exact matching evidence');
  assert(topMatch.relevanceScore > 0.12, 'Relevance score exceeds minimum threshold');
  assert(Boolean(topMatch.sourceReference), 'Result contains formatted sourceReference');
  assert(topMatch.sourceReference.includes('specs.md'), 'sourceReference contains document filename');

  // --------------------------------------------------------------------------
  console.log('\nScenario 5: Answering questions with source citations');
  // --------------------------------------------------------------------------
  const formatted = knowledgeService.formatChunksForContext(searchResults);
  assert(formatted.sources.length > 0, 'Generates source citations array');
  assert(formatted.sources[0].fileName === 'specs.md', 'Citation lists correct fileName');
  assert(Boolean(formatted.sources[0].excerpt), 'Citation includes excerpt snippet');
  assert(formatted.promptContext.includes('<document_source'), 'Wraps chunks in isolated <document_source> tags');
  assert(formatted.promptContext.includes('DOCUMENT GROUNDING RULES:'), 'Includes document grounding instructions');
  assert(formatted.promptContext.includes('UNTRUSTED DATA INVARIANT:'), 'Includes prompt-injection security directive');

  // --------------------------------------------------------------------------
  console.log('\nScenario 6: Admitting when uploaded documents do not contain the answer');
  // --------------------------------------------------------------------------
  const unrelatedSearch = await knowledgeService.searchKnowledge(
    userAlice,
    'How do I bake chocolate chip cookies with vanilla extract?'
  );

  assert(unrelatedSearch.length === 0, 'Zero chunks retrieved for unrelated query');

  const emptyFormatted = knowledgeService.formatChunksForContext(unrelatedSearch);
  assert(emptyFormatted.sources.length === 0, 'No sources generated when no evidence found');
  assert(emptyFormatted.promptContext === '', 'Prompt context is empty string when no evidence exists');

  // ContextManager grounding instructions
  const aiContext = ContextManager.buildAIContext({
    messages: [{ id: 'm1', conversationId: 'c1', role: 'user', content: 'What is the recipe for cookies?', createdAt: new Date().toISOString() }],
    relevantChunks: [],
  });
  assert(aiContext[0].role === 'system', 'First message is system prompt');
  assert(typeof aiContext[0].content === 'string', 'System prompt is text');

  // --------------------------------------------------------------------------
  console.log('\nScenario 7: Deleting a document and verifying content is no longer retrievable');
  // --------------------------------------------------------------------------
  // Rename test
  const renamedFile = await knowledgeService.renameDocument(
    mdIngest.file.id,
    userAlice,
    'renamed_specs.md'
  );
  assert(renamedFile.name === 'renamed_specs.md', 'Document name updated to renamed_specs.md');

  const renamedChunks = await dbService.getChunksByFileId(mdIngest.file.id, userAlice);
  assert(renamedChunks.every((c) => c.fileName === 'renamed_specs.md'), 'All associated chunks updated with new fileName');

  // Deletion test
  await knowledgeService.deleteKnowledge(mdIngest.file.id, userAlice);

  const fileAfterDelete = await dbService.getFile(mdIngest.file.id, userAlice);
  assert(fileAfterDelete === null, 'Document record purged from storage');

  const chunksAfterDelete = await dbService.getChunksByFileId(mdIngest.file.id, userAlice);
  assert(chunksAfterDelete.length === 0, 'Associated chunks completely purged');

  const searchAfterDelete = await knowledgeService.searchKnowledge(userAlice, 'dense vectors with keyword overlap');
  assert(searchAfterDelete.every((r) => r.chunk.fileId !== mdIngest.file.id), 'Deleted document is no longer retrievable in search');

  // --------------------------------------------------------------------------
  console.log('\nScenario 8: User isolation & authorization');
  // --------------------------------------------------------------------------
  // Bob uploads confidential file
  const bobBuffer = Buffer.from('Bob secret financial statement 2026: net profit 50 million.', 'utf-8');
  const bobIngest = await knowledgeService.ingestFile({
    userId: userBob,
    originalName: 'bob_financials.txt',
    size: bobBuffer.length,
    mimeType: 'text/plain',
    buffer: bobBuffer,
  });

  // Alice searches for Bob's secret
  const aliceSearchesBob = await knowledgeService.searchKnowledge(userAlice, 'Bob secret financial statement net profit');
  assert(aliceSearchesBob.length === 0, 'Alice cannot retrieve Bob document chunks');

  // Alice attempts direct database access on Bob file
  const aliceGetsBobFile = await dbService.getFile(bobIngest.file.id, userAlice);
  assert(aliceGetsBobFile === null, 'Alice cannot get Bob file record directly');

  // Bob can retrieve his own document
  const bobSearchesOwn = await knowledgeService.searchKnowledge(userBob, 'financial statement net profit');
  assert(bobSearchesOwn.length > 0, 'Bob can retrieve his own document chunks');
  assert(bobSearchesOwn[0].chunk.userId === userBob, 'Chunk belongs strictly to Bob');

  // --------------------------------------------------------------------------
  console.log('\nScenario 9: Embedding failure resilience & fallback');
  // --------------------------------------------------------------------------
  // Local dense vector generation
  const localVec1 = embeddingService.generateLocalSemanticVector('Machine learning and artificial intelligence');
  const localVec2 = embeddingService.generateLocalSemanticVector('Deep learning and neural networks');
  const localVec3 = embeddingService.generateLocalSemanticVector('Gardening soil preparation and tomato plants');

  assert(localVec1.length === 128, 'Generates 128-dimensional dense vector');
  const simRelated = embeddingService.calculateCosineSimilarity(localVec1, localVec2);
  const simUnrelated = embeddingService.calculateCosineSimilarity(localVec1, localVec3);

  assert(simRelated > simUnrelated, `Semantic cosine similarity ranks related text higher (${simRelated.toFixed(3)} vs ${simUnrelated.toFixed(3)})`);
  assert(simRelated > 0.3, 'Related technical concepts score above 0.3');

  // --------------------------------------------------------------------------
  console.log('\nScenario 10: Preserving existing chat, memory, and authentication features');
  // --------------------------------------------------------------------------
  // Phase 5 Message Validation
  let emptyRejectedChat = false;
  try {
    normalizeAndValidateMessages([{ id: '1', conversationId: 'c1', role: 'user', content: '   ', createdAt: '' }]);
  } catch {
    emptyRejectedChat = true;
  }
  assert(emptyRejectedChat, 'Phase 5: Empty whitespace chat message rejected');

  // Phase 5 Provider Invariant: Single centralized Gemini service (no local fallback)
  const fallbackCheck = await fallbackManager.resolveFallback('gemini');
  assert(!fallbackCheck.canFallback, 'Phase 5: Fallback manager strictly enforces single Gemini model without local fallback');

  // Phase 6 Memory System
  await memoryService.clearMemories(userAlice);
  const mem = await dbService.createMemory({
    userId: userAlice,
    content: 'User prefers concise responses with code examples',
    memoryType: 'preference',
    importance: 5,
  });
  assert(mem.id.startsWith('mem_'), 'Phase 6: Memory ID created with proper prefix');

  const retrievedMem = await memoryService.getRelevantMemories(userAlice, 'Please provide concise responses');
  assert(retrievedMem.length > 0, 'Phase 6: Relevant memory retrieved successfully');
  assert(retrievedMem[0].content.includes('concise responses'), 'Phase 6: Retrieved memory content matches preference');

  // Clean up
  await dbService.clearFiles(userAlice);
  await dbService.clearFiles(userBob);
  await memoryService.clearMemories(userAlice);

  console.log('\n======================================================');
  console.log(`PHASE 7 RESULTS: ${passedAssertions}/${totalAssertions} assertions passed successfully!`);
  console.log('======================================================\n');
}

runPhase7Tests().catch((err) => {
  console.error('Phase 7 Test execution failed:', err);
  process.exit(1);
});
