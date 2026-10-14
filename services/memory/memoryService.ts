import {
  UserMemory,
  MemoryType,
  MemorySearchResult,
  MemoryCandidate,
  ConversationSummary,
  ExplicitMemoryCommandResult,
} from '@/types/memory';
import { dbService } from '@/services/database/clientDb';
import { Message } from '@/types/message';
import { generateId } from '@/lib/utils';
import { checkPrivacy } from './privacyScreening';

const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'com', 'for',
  'from', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or',
  'that', 'the', 'this', 'to', 'was', 'what', 'when', 'where', 'who',
  'will', 'with', 'you', 'your', 'can', 'do', 'does', 'did', 'have',
]);

export class MemoryService {
  /**
   * Evaluate whether a user message contains useful long-term working context.
   * Filters out transient queries, chit-chat, and sensitive credentials.
   */
  public shouldRemember(userMessage: string): MemoryCandidate {
    const text = userMessage.trim();
    if (text.length < 5 || text.length > 500) {
      return { shouldRemember: false };
    }

    // 1. Strict Privacy Screening: Never store credentials, passwords, or API keys
    const privacyCheck = checkPrivacy(text);
    if (privacyCheck.isSensitive) {
      return {
        shouldRemember: false,
        reason: privacyCheck.reason || 'Contains potentially sensitive credentials',
      };
    }

    // 2. Filter out ephemeral/transient queries
    const transientRegex =
      /^(what (is|are|was|were|time|weather)|how (to|do|does|can)|why (is|do|are)|explain |solve |calculate |translate |write (a|me) |summarize |test )/i;
    if (transientRegex.test(text) && !/\bremember\b/i.test(text)) {
      return { shouldRemember: false, reason: 'Ephemeral or exploratory query' };
    }

    // 3. Detect explicit "Remember that..." or "Remember..."
    const rememberMatch = text.match(/^(?:please\s+)?remember(?:\s+that)?\s+(.+)/i);
    if (rememberMatch) {
      const cleanContent = rememberMatch[1].trim().replace(/[.!?]+$/, '');
      const type = this.inferMemoryType(cleanContent);
      return {
        shouldRemember: true,
        memoryType: type,
        content: cleanContent,
        importance: 4,
        reason: 'Explicit user instruction',
      };
    }

    // 4. Detect persistent personal preferences, identities, and project details
    const preferenceMatch = text.match(
      /\b(I prefer|I always use|My main language is|My project is called|I am building|I work with|I live in|Call me|My name is|I am a|I work as a|Always format|Never use)\s+([^.!?\n]+)/i
    );
    if (preferenceMatch) {
      const statement = preferenceMatch[0].trim();
      const type = this.inferMemoryType(statement);
      return {
        shouldRemember: true,
        memoryType: type,
        content: statement,
        importance: 3,
        reason: 'Inferred persistent preference or project context',
      };
    }

    return { shouldRemember: false };
  }

  /**
   * Infer appropriate classification for a memory content string.
   */
  public inferMemoryType(content: string): MemoryType {
    const lower = content.toLowerCase();
    if (lower.includes('project') || lower.includes('building') || lower.includes('app called') || lower.includes('stack')) {
      return 'project';
    }
    if (lower.includes('prefer') || lower.includes('like') || lower.includes('style') || lower.includes('tone')) {
      return 'preference';
    }
    if (lower.includes('always') || lower.includes('never') || lower.includes('rule') || lower.includes('must')) {
      return 'instruction';
    }
    if (lower.includes('goal') || lower.includes('aim to') || lower.includes('target') || lower.includes('plan to')) {
      return 'goal';
    }
    return 'fact';
  }

  /**
   * Check if a candidate memory duplicates or contradicts/updates an existing memory.
   * Returns matching existing memory ID if deduplication or update applies.
   */
  public async findDuplicateOrContradictoryMemory(
    userId: string,
    newContent: string,
    type?: MemoryType
  ): Promise<{ memory: UserMemory; isContradictionOrUpdate: boolean } | null> {
    try {
      const existing = await dbService.getMemories(userId);
      if (!existing || existing.length === 0) return null;

      const normalizedNew = this.tokenize(newContent, true);
      const newSubject = this.extractSubjectSignature(newContent);

      for (const mem of existing) {
        // 1. Exact or Substring match
        const normContent = mem.content.toLowerCase().trim();
        const normInput = newContent.toLowerCase().trim();
        if (normContent === normInput || normContent.includes(normInput) || normInput.includes(normContent)) {
          return { memory: mem, isContradictionOrUpdate: false };
        }

        // 2. Subject/Topic Overlap: Detect contradictory or updated facts
        // e.g. "I prefer Python for backend" vs "I prefer Go for backend"
        // or "My project is called Alpha" vs "My project is called Beta"
        const existingSubject = this.extractSubjectSignature(mem.content);
        if (
          newSubject &&
          existingSubject &&
          newSubject === existingSubject &&
          mem.memoryType === (type || mem.memoryType)
        ) {
          return { memory: mem, isContradictionOrUpdate: true };
        }

        // 3. Jaccard token overlap for same memory type
        if (type && mem.memoryType === type) {
          const normalizedMem = this.tokenize(mem.content, true);
          const jaccard = this.calculateJaccardSimilarity(normalizedNew, normalizedMem);
          if (jaccard > 0.55) {
            return { memory: mem, isContradictionOrUpdate: false };
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract a canonical subject signature to detect topic overlap / contradictions.
   * E.g. "My project is called X" -> "project_name"
   * "I prefer Y for backend" -> "backend_preference"
   */
  private extractSubjectSignature(content: string): string | null {
    const lower = content.toLowerCase();
    if (lower.includes('project is called') || lower.includes('project name')) return 'project_name';
    if (lower.includes('primary language') || lower.includes('main language')) return 'primary_language';
    if (lower.includes('prefer') && lower.includes('backend')) return 'backend_preference';
    if (lower.includes('prefer') && lower.includes('frontend')) return 'frontend_preference';
    if (lower.includes('response style') || lower.includes('prefer concise') || lower.includes('prefer detailed')) return 'response_style';
    if (lower.includes('my name is') || lower.includes('call me')) return 'user_name';
    if (lower.includes('i am a') || lower.includes('i work as')) return 'user_profession';
    return null;
  }

  /**
   * Create or update a memory with deduplication and contradiction resolution.
   */
  public async createMemory(params: {
    userId: string;
    content: string;
    memoryType?: MemoryType;
    importance?: number;
    sourceConversationId?: string;
  }): Promise<{ memory: UserMemory; isNew: boolean }> {
    const { userId, content, sourceConversationId } = params;
    const cleanContent = content.trim();

    // Enforce privacy check before creating
    const privacy = checkPrivacy(cleanContent);
    if (privacy.isSensitive) {
      throw new Error(`Cannot store memory: ${privacy.reason}`);
    }

    const type = params.memoryType || this.inferMemoryType(cleanContent);
    const importance = params.importance || 3;

    try {
      // Check deduplication or update
      const existingMatch = await this.findDuplicateOrContradictoryMemory(userId, cleanContent, type);
      if (existingMatch) {
        const { memory: existing } = existingMatch;
        // Merge / update existing memory with latest information
        const updated = await dbService.updateMemory(existing.id, userId, {
          content: cleanContent,
          memoryType: type,
          importance: Math.max(existing.importance, importance),
          lastUsedAt: new Date().toISOString(),
        });
        return { memory: updated, isNew: false };
      }

      const created = await dbService.createMemory({
        userId,
        content: cleanContent,
        memoryType: type,
        importance,
        sourceConversationId,
      });

      return { memory: created, isNew: true };
    } catch (err: unknown) {
      // If db fails, gracefully return a non-persisted fallback structure
      const fallbackMemory: UserMemory = {
        id: generateId('mem_temp'),
        userId,
        content: cleanContent,
        memoryType: type,
        importance,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return { memory: fallbackMemory, isNew: true };
    }
  }

  /**
   * Get all memories for a user with safe error recovery.
   */
  public async getMemories(userId: string): Promise<UserMemory[]> {
    try {
      if (!userId) return [];
      return await dbService.getMemories(userId);
    } catch {
      return [];
    }
  }

  /**
   * Update a specific memory.
   */
  public async updateMemory(
    id: string,
    userId: string,
    data: Partial<UserMemory>
  ): Promise<UserMemory> {
    if (data.content) {
      const privacy = checkPrivacy(data.content);
      if (privacy.isSensitive) {
        throw new Error(`Cannot update memory: ${privacy.reason}`);
      }
    }
    return dbService.updateMemory(id, userId, data);
  }

  /**
   * Delete a specific memory.
   */
  public async deleteMemory(id: string, userId: string): Promise<void> {
    return dbService.deleteMemory(id, userId);
  }

  /**
   * Clear all memories for a user.
   */
  public async clearMemories(userId: string): Promise<void> {
    return dbService.clearMemories(userId);
  }

  /**
   * Search memories by query string with relevance scoring and stop-word filtering.
   */
  public async searchMemories(
    userId: string,
    query: string
  ): Promise<MemorySearchResult[]> {
    try {
      const memories = await dbService.getMemories(userId);
      if (!memories || !memories.length || !query.trim()) return [];

      const queryTokens = this.tokenize(query, true);
      const queryLower = query.toLowerCase();
      const results: MemorySearchResult[] = [];

      for (const mem of memories) {
        const contentTokens = this.tokenize(mem.content, true);
        const memLower = mem.content.toLowerCase();

        // Jaccard similarity of meaningful tokens
        const similarity = this.calculateJaccardSimilarity(queryTokens, contentTokens);

        // Substring match bonus
        let substringBoost = 0;
        if (memLower.includes(queryLower) || queryLower.includes(memLower)) {
          substringBoost = 0.4;
        }

        // Domain/Category contextual boost
        let categoryBoost = 0;
        if (
          mem.memoryType === 'project' &&
          (queryLower.includes('project') || queryLower.includes('app') || queryLower.includes('code') || queryLower.includes('build'))
        ) {
          categoryBoost = 0.25;
        } else if (
          mem.memoryType === 'preference' &&
          (queryLower.includes('prefer') || queryLower.includes('style') || queryLower.includes('format'))
        ) {
          categoryBoost = 0.25;
        }

        // Importance and recency weighting
        const importanceBoost = (mem.importance || 3) * 0.05;
        const recencyDays =
          (Date.now() - new Date(mem.updatedAt || mem.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const recencyBoost = Math.max(0, 0.08 - recencyDays * 0.004);

        // Only consider memories with actual topical, keyword, or category overlap
        const hasRelevance = similarity > 0 || substringBoost > 0 || categoryBoost > 0;
        if (!hasRelevance) {
          continue;
        }

        const totalScore = similarity + substringBoost + categoryBoost + importanceBoost + recencyBoost;

        // Minimum threshold to prevent injecting unrelated personal info into prompt
        if (totalScore > 0.15) {
          results.push({
            memory: mem,
            relevanceScore: Number(totalScore.toFixed(3)),
          });
        }

      }

      return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch {
      return [];
    }
  }

  /**
   * Retrieve only relevant memories for injecting into the context.
   * Never injects unrelated personal info.
   */
  public async getRelevantMemories(
    userId: string,
    query: string,
    limit = 4
  ): Promise<UserMemory[]> {
    try {
      const preferences = await dbService.getUserPreferences(userId);
      if (!preferences || preferences.memoryEnabled === false) {
        return [];
      }

      const searchResults = await this.searchMemories(userId, query);
      const selected = searchResults.slice(0, limit).map((r) => r.memory);

      // Update lastUsedAt in the background for selected memories
      const now = new Date().toISOString();
      for (const mem of selected) {
        dbService.updateMemory(mem.id, userId, { lastUsedAt: now }).catch(() => {});
      }

      return selected;
    } catch {
      return [];
    }
  }

  /**
   * Parse explicit natural language memory commands:
   * "Remember that...", "Forget that...", "What do you remember?", "Clear all memories"
   */
  public async parseExplicitCommand(
    userMessage: string,
    userId: string
  ): Promise<ExplicitMemoryCommandResult> {
    const text = userMessage.trim();

    // 1. "What do you remember about me?" / "Show my memories"
    if (
      /^(what do you remember(?: about me)?|show (?:my )?memories|list (?:my )?memories|what do you know about me)\b/i.test(
        text
      )
    ) {
      const memories = await this.getMemories(userId);
      if (memories.length === 0) {
        return {
          isCommand: true,
          action: 'list',
          feedbackMessage:
            "I don't have any long-term memories saved about you yet. You can ask me to remember preferences or project context at any time (e.g., 'Remember that my project is called RIYAI').",
        };
      }

      const preferences = memories.filter((m) => m.memoryType === 'preference');
      const projects = memories.filter((m) => m.memoryType === 'project');
      const instructions = memories.filter((m) => m.memoryType === 'instruction');
      const others = memories.filter(
        (m) => !['preference', 'project', 'instruction'].includes(m.memoryType)
      );

      let response = "Here is what I currently remember about you:\n\n";
      if (preferences.length) {
        response += "**Preferences**\n" + preferences.map((p) => `• ${p.content}`).join('\n') + '\n\n';
      }
      if (projects.length) {
        response += "**Projects**\n" + projects.map((p) => `• ${p.content}`).join('\n') + '\n\n';
      }
      if (instructions.length) {
        response += "**Custom Rules**\n" + instructions.map((i) => `• ${i.content}`).join('\n') + '\n\n';
      }
      if (others.length) {
        response += "**Other Context**\n" + others.map((o) => `• ${o.content}`).join('\n') + '\n\n';
      }
      response += "*You can view, edit, or delete any of these anytime in Settings → Memory & AI.*";

      return {
        isCommand: true,
        action: 'list',
        feedbackMessage: response.trim(),
      };
    }

    // 2. "Delete everything you remember" / "Clear my memories"
    if (/^(delete everything you remember|clear (?:all )?(?:my )?memories|forget everything)\b/i.test(text)) {
      await this.clearMemories(userId);
      return {
        isCommand: true,
        action: 'clear',
        feedbackMessage: 'I have cleared all your saved long-term memories.',
      };
    }

    // 3. "Forget that [something]" / "Forget [something]"
    const forgetMatch = text.match(/^(?:please\s+)?forget(?:\s+that)?\s+(.+)/i);
    if (forgetMatch) {
      const target = forgetMatch[1].trim().replace(/[.!?]+$/, '');
      const matches = await this.searchMemories(userId, target);
      if (matches.length > 0) {
        const topMatch = matches[0].memory;
        await this.deleteMemory(topMatch.id, userId);
        return {
          isCommand: true,
          action: 'forget',
          targetContent: topMatch.content,
          feedbackMessage: `I've forgotten: "${topMatch.content}".`,
        };
      }
      return {
        isCommand: true,
        action: 'forget',
        targetContent: target,
        feedbackMessage: `I couldn't find a stored memory matching "${target}".`,
      };
    }

    // 4. "Remember that [something]" / "Remember [something]"
    const rememberMatch = text.match(/^(?:please\s+)?remember(?:\s+that)?\s+(.+)/i);
    if (rememberMatch) {
      const content = rememberMatch[1].trim().replace(/[.!?]+$/, '');

      // Privacy check for explicit remember command
      const privacy = checkPrivacy(content);
      if (privacy.isSensitive) {
        return {
          isCommand: true,
          action: 'remember',
          feedbackMessage:
            'For your security and privacy, RIYAI does not store passwords, API keys, or sensitive credentials in memory.',
        };
      }

      const { memory, isNew } = await this.createMemory({
        userId,
        content,
        importance: 4,
      });

      return {
        isCommand: true,
        action: 'remember',
        targetContent: memory.content,
        memory,
        feedbackMessage: isNew
          ? `I'll remember that: "${memory.content}".`
          : `I've updated your existing memory: "${memory.content}".`,
      };
    }

    return { isCommand: false };
  }

  /**
   * Intelligently summarize long conversation history into a structured ConversationSummary.
   */
  public async summarizeConversation(
    conversationId: string,
    messages: Message[],
    userId?: string
  ): Promise<ConversationSummary> {
    try {
      const validMessages = messages.filter(
        (m) =>
          (typeof m.content === 'string' && m.content.trim().length > 0) ||
          (Array.isArray(m.attachments) && m.attachments.length > 0)
      );

      const userMessages = validMessages.filter((m) => m.role === 'user').map((m) => m.content);
      const assistantMessages = validMessages.filter((m) => m.role === 'assistant').map((m) => m.content);

      const topics: Set<string> = new Set();
      const decisions: string[] = [];
      const questions: string[] = [];
      const referencedFiles: Set<string> = new Set();

      // Extract referenced attachment file names
      for (const msg of validMessages) {
        if (Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            if (att.name) referencedFiles.add(att.name);
          }
        }
      }

      // Extract key topic words
      for (const msg of userMessages) {
        const tokens = this.tokenize(msg, true);
        for (const token of tokens) {
          if (token.length > 3) {
            topics.add(token);
            if (topics.size >= 10) break;
          }
        }
      }

      // Identify decisions or established agreements from assistant messages
      for (const astMsg of assistantMessages) {
        const lower = astMsg.toLowerCase();
        if (
          lower.includes('decision') ||
          lower.includes('recommend') ||
          lower.includes('implemented') ||
          lower.includes('conclusion') ||
          lower.includes('approach') ||
          lower.includes('solution')
        ) {
          const sentences = astMsg.split(/[.\n]/).map((s) => s.trim()).filter((s) => s.length > 15 && s.length < 130);
          if (sentences.length > 0 && decisions.length < 4) {
            decisions.push(sentences[0]);
          }
        }
      }

      // Identify questions or unresolved points from user messages
      for (const uMsg of userMessages.slice(-3)) {
        if (uMsg.includes('?')) {
          const qParts = uMsg.split('?').map((q) => q.trim()).filter((q) => q.length > 10 && q.length < 120);
          if (qParts.length > 0 && questions.length < 3) {
            questions.push(`${qParts[0]}?`);
          }
        }
      }

      const firstMsg = userMessages[0] ? userMessages[0].slice(0, 80).replace(/\n/g, ' ') : 'Initial discussion';
      const lastMsg = userMessages[userMessages.length - 1] ? userMessages[userMessages.length - 1].slice(0, 80).replace(/\n/g, ' ') : 'Recent focus';

      let summaryText = `Discussion originated around: "${firstMsg}...". Current focus: "${lastMsg}...".`;
      if (topics.size > 0) {
        summaryText += ` Key topics: ${Array.from(topics).slice(0, 6).join(', ')}.`;
      }
      if (referencedFiles.size > 0) {
        summaryText += ` Documents referenced: ${Array.from(referencedFiles).join(', ')}.`;
      }
      if (decisions.length > 0) {
        summaryText += ` Key findings/decisions: ${decisions.slice(0, 2).join('; ')}.`;
      }

      const summaryObj: ConversationSummary = {
        id: generateId('summary'),
        conversationId,
        userId,
        summary: summaryText,
        keyTopics: Array.from(topics).slice(0, 6),
        importantDecisions: decisions.slice(0, 3),
        unresolvedQuestions: questions.slice(0, 2),
        messageCount: validMessages.length,
        lastMessageId: validMessages[validMessages.length - 1]?.id,
        updatedAt: new Date().toISOString(),
      };

      return await dbService.saveConversationSummary(summaryObj);
    } catch {
      // Graceful fallback
      const fallbackSummary: ConversationSummary = {
        id: generateId('summary'),
        conversationId,
        userId,
        summary: 'Ongoing technical conversation with active context.',
        keyTopics: [],
        importantDecisions: [],
        unresolvedQuestions: [],
        messageCount: messages.length,
        updatedAt: new Date().toISOString(),
      };
      return fallbackSummary;
    }
  }

  /**
   * Determine whether a conversation summary should be refreshed.
   * Refreshes when no summary exists and conversation reaches 6 turns,
   * or when the conversation has grown by 6 or more turns since the last summary.
   */
  public shouldRefreshSummary(
    existingSummary: ConversationSummary | null,
    currentMessageCount: number
  ): boolean {
    if (currentMessageCount < 6) return false;
    if (!existingSummary) return true;
    const previousCount = existingSummary.messageCount || 0;
    return currentMessageCount - previousCount >= 6;
  }

  /**
   * Context-aware query expansion for follow-up questions containing pronouns
   * or demonstrative references ("it", "that file", "explain the previous answer", "why", "elaborate").
   * Enriches retrieval queries with key entities from previous turns without mutating user prompt.
   */
  public resolveContextualQuery(userMessage: string, history: Message[]): string {
    const trimmed = userMessage.trim();
    if (!trimmed || history.length === 0) return trimmed;

    // Detect pronouns, demonstratives, or follow-up indicators
    const followUpPatterns = [
      /\b(it|that|this|them|these|those)\b/i,
      /\b(previous|earlier|above|last|prior)\s+(answer|response|explanation|code|solution|step|message)\b/i,
      /\b(that|the|this)\s+(file|pdf|doc|document|attachment|sheet|image)\b/i,
      /\b(explain (further|more|it|again)|elaborate|clarify|why|how come|what about)\b/i,
      /\b(what did I ask|what was (it|that)|summarize (what we|our))\b/i,
    ];

    const isFollowUp = followUpPatterns.some((pattern) => pattern.test(trimmed));
    if (!isFollowUp) {
      return trimmed;
    }

    // Inspect previous turns (last assistant message and last user prompt)
    const recentMessages = history.slice(-4);
    const contextKeywords: string[] = [];

    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      // Gather attached file names if any
      if (Array.isArray(msg.attachments)) {
        for (const att of msg.attachments) {
          if (att.name && !contextKeywords.includes(att.name)) {
            contextKeywords.push(att.name);
          }
        }
      }
      // Gather informative tokens (skip stop words)
      const tokens = Array.from(this.tokenize(msg.content, true)).slice(0, 4);
      for (const tok of tokens) {
        if (!contextKeywords.includes(tok) && contextKeywords.length < 8) {
          contextKeywords.push(tok);
        }
      }
    }

    if (contextKeywords.length === 0) {
      return trimmed;
    }

    return `${trimmed} ${contextKeywords.join(' ')}`;
  }

  private tokenize(text: string, filterStopWords = false): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && (!filterStopWords || !STOP_WORDS.has(w)));
    return new Set(words);
  }

  private calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}

export const memoryService = new MemoryService();
