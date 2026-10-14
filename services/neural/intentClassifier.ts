import { embeddingService } from '@/services/knowledge/embeddingService';
import { IntentClassificationResult } from '@/types/automation';

export interface IntentArchetype {
  intent: IntentClassificationResult['intent'];
  anchorTexts: string[];
  suggestedWorkflowId?: string;
  keywords: string[];
}

const INTENT_ARCHETYPES: IntentArchetype[] = [
  {
    intent: 'workflow_automation',
    anchorTexts: [
      'execute multi-step workflow automation',
      'run workflow pipeline across my documents',
      'orchestrate automated agent steps',
      'trigger data extraction and analysis workflow',
    ],
    suggestedWorkflowId: 'workflow_multi_step_analysis',
    keywords: ['workflow', 'automation', 'pipeline', 'orchestrate', 'multi-step', 'automate', 'agent task'],
  },
  {
    intent: 'doc_summary',
    anchorTexts: [
      'summarize this uploaded pdf document',
      'generate an executive summary of the file',
      'provide a concise summary of the attached document',
      'give me the main highlights of the text',
    ],
    suggestedWorkflowId: 'workflow_summarize_doc',
    keywords: ['summarize', 'summary', 'abstract', 'highlights', 'overview', 'digest', 'tldr'],
  },
  {
    intent: 'rag_query',
    anchorTexts: [
      'find what the uploaded documents say about this topic',
      'search knowledge base for specific answers',
      'answer question according to my files',
      'look up information in attached pdf',
    ],
    suggestedWorkflowId: 'workflow_rag_qa',
    keywords: ['search files', 'knowledge base', 'uploaded doc', 'in my files', 'look up', 'according to document'],
  },
  {
    intent: 'report_generation',
    anchorTexts: [
      'compile a structured report with analysis and insights',
      'generate an analytical report from available data',
      'draft a comprehensive evaluation report',
      'prepare formal documentation and report',
    ],
    suggestedWorkflowId: 'workflow_generate_report',
    keywords: ['generate report', 'analytical report', 'compile report', 'formal report', 'draft report'],
  },
  {
    intent: 'memory_store',
    anchorTexts: [
      'remember that my preferred stack is typescript',
      'please save this information to my memory',
      'remember this user preference for future chats',
      'keep note that I prefer concise answers',
    ],
    keywords: ['remember', 'save to memory', 'keep note', 'my preference is', 'don\'t forget'],
  },
  {
    intent: 'general_chat',
    anchorTexts: [
      'hello how are you doing today',
      'explain the concept of neural networks in simple terms',
      'write a typescript function to sort an array',
      'what is quantum computing',
    ],
    keywords: ['hello', 'hi', 'explain', 'what is', 'how to', 'code', 'help me with'],
  },
];

export class IntentClassifier {
  private anchorVectors: Map<string, number[][]> = new Map();
  private isInitialized = false;

  private async initializeAnchors(): Promise<void> {
    if (this.isInitialized) return;

    for (const archetype of INTENT_ARCHETYPES) {
      const vectors: number[][] = [];
      for (const anchor of archetype.anchorTexts) {
        const vec = await embeddingService.generateEmbedding(anchor);
        vectors.push(vec);
      }
      this.anchorVectors.set(archetype.intent, vectors);
    }
    this.isInitialized = true;
  }

  /**
   * Classify user input into an automation intent using neural semantic similarity
   * and lexical matching against calibrated intent archetypes.
   */
  public async classifyIntent(text: string): Promise<IntentClassificationResult> {
    if (!text || !text.trim()) {
      return {
        intent: 'general_chat',
        confidence: 0.5,
        matchedKeywords: [],
      };
    }

    const cleanText = text.trim();
    const lowerText = cleanText.toLowerCase();

    // Fast lexical match check
    let topLexicalIntent: IntentArchetype | null = null;
    let maxMatchedKeywords: string[] = [];

    for (const archetype of INTENT_ARCHETYPES) {
      const matched = archetype.keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
      if (matched.length > maxMatchedKeywords.length) {
        maxMatchedKeywords = matched;
        topLexicalIntent = archetype;
      }
    }

    // High confidence lexical boost if multiple strong intent keywords match
    if (topLexicalIntent && maxMatchedKeywords.length >= 2) {
      return {
        intent: topLexicalIntent.intent,
        confidence: 0.92,
        matchedKeywords: maxMatchedKeywords,
        suggestedWorkflowId: topLexicalIntent.suggestedWorkflowId,
      };
    }

    // Neural semantic classification via dense vectors
    try {
      await this.initializeAnchors();
      const queryVec = await embeddingService.generateEmbedding(cleanText);

      let bestIntent: IntentClassificationResult['intent'] = 'general_chat';
      let bestSimilarity = -1;
      let matchedSuggestedWorkflow: string | undefined;

      for (const archetype of INTENT_ARCHETYPES) {
        const vectors = this.anchorVectors.get(archetype.intent) || [];
        if (!vectors.length) continue;

        let maxSimForArchetype = -1;
        for (const vec of vectors) {
          const sim = embeddingService.calculateCosineSimilarity(queryVec, vec);
          if (sim > maxSimForArchetype) {
            maxSimForArchetype = sim;
          }
        }

        // Apply slight lexical bonus if keywords match
        const matched = archetype.keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
        const bonus = matched.length > 0 ? 0.08 : 0;
        const totalScore = maxSimForArchetype + bonus;

        if (totalScore > bestSimilarity) {
          bestSimilarity = totalScore;
          bestIntent = archetype.intent;
          matchedSuggestedWorkflow = archetype.suggestedWorkflowId;
        }
      }

      const clampedConfidence = Math.min(0.99, Math.max(0.4, Number(bestSimilarity.toFixed(2))));

      return {
        intent: bestIntent,
        confidence: clampedConfidence,
        matchedKeywords: maxMatchedKeywords,
        suggestedWorkflowId: matchedSuggestedWorkflow,
      };
    } catch {
      // Graceful fallback to lexical classification
      return {
        intent: topLexicalIntent ? topLexicalIntent.intent : 'general_chat',
        confidence: topLexicalIntent ? 0.75 : 0.5,
        matchedKeywords: maxMatchedKeywords,
        suggestedWorkflowId: topLexicalIntent?.suggestedWorkflowId,
      };
    }
  }
}

export const intentClassifier = new IntentClassifier();
