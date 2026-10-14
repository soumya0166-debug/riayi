import {
  LearningExperience,
  ExperienceCategory,
  ExperienceSource,
  ExperienceOutcome,
  QualityStatus,
} from '@/types/learning';
import { dbService } from '@/services/database/clientDb';
import { generateId } from '@/lib/utils';
import { checkPrivacy } from '@/services/memory/privacyScreening';

export interface CollectExperienceParams {
  userId: string;
  category: ExperienceCategory;
  source: ExperienceSource;
  inputQuery: string;
  contextSnippet?: string;
  targetOutput?: string;
  candidateOutputs?: string[];
  userFeedbackText?: string;
  rating?: number;
  toolName?: string;
  chunkId?: string;
  fileId?: string;
  executionSuccess?: boolean;
  outcome?: ExperienceOutcome;
  features?: {
    vectorSimilarity?: number;
    keywordCoverage?: number;
    proximityBonus?: number;
    queryLengthNorm?: number;
    chunkLengthNorm?: number;
    exactTitleMatch?: number;
    label?: number;
  };
}

export class ExperienceCollector {
  /**
   * Record a learning experience if user has consented to learning data collection.
   */
  public async collectExperience(params: CollectExperienceParams): Promise<LearningExperience | null> {
    const { userId, inputQuery, category, source } = params;

    if (!inputQuery || !inputQuery.trim()) {
      return null;
    }

    // 1. Consent Check: Inspect user preference for opt-out
    const preferences = await dbService.getUserPreferences(userId);
    if (preferences.learningEnabled === false) {
      // User opted out of experience learning
      return null;
    }

    // 2. Initial Privacy Screening: Never collect raw credentials or API keys
    const privacyCheck = checkPrivacy(inputQuery + (params.userFeedbackText || ''));
    if (privacyCheck.isSensitive) {
      // Reject collection of credential leaks immediately
      return null;
    }

    // 3. Determine Outcome and Quality
    let outcome: ExperienceOutcome = params.outcome || 'positive';
    if (params.rating !== undefined) {
      outcome = params.rating > 0 ? 'positive' : 'negative';
    } else if (params.executionSuccess !== undefined) {
      outcome = params.executionSuccess ? 'positive' : 'negative';
    } else if (params.targetOutput && params.candidateOutputs) {
      outcome = 'corrected';
    }

    // Calculate default binary training label
    const label = outcome === 'positive' ? 1 : 0;

    const experienceId = `exp_${Date.now()}_${generateId('sig')}`;

    const experience: LearningExperience = {
      id: experienceId,
      userId,
      category,
      source,
      timestamp: new Date().toISOString(),
      outcome,
      qualityStatus: 'raw',
      consentStatus: 'consented',
      retentionStatus: 'active',
      inputQuery: inputQuery.trim(),
      contextSnippet: params.contextSnippet?.trim(),
      targetOutput: params.targetOutput?.trim(),
      candidateOutputs: params.candidateOutputs,
      userFeedbackText: params.userFeedbackText?.trim(),
      rating: params.rating,
      toolName: params.toolName,
      chunkId: params.chunkId,
      fileId: params.fileId,
      executionSuccess: params.executionSuccess,
      features: params.features ? { ...params.features, label } : { label },
    };

    return await dbService.saveExperience(experience);
  }

  /**
   * Retrieve experiences for a user with optional filtering.
   */
  public async getExperiences(
    userId: string,
    filter?: { category?: ExperienceCategory; status?: QualityStatus }
  ): Promise<LearningExperience[]> {
    return await dbService.getExperiences(userId, filter);
  }

  /**
   * Inspect a specific experience record.
   */
  public async getExperienceById(id: string, userId: string): Promise<LearningExperience | null> {
    return await dbService.getExperienceById(id, userId);
  }

  /**
   * Delete an eligible experience record respecting user deletion request.
   */
  public async deleteExperience(id: string, userId: string): Promise<boolean> {
    const existing = await dbService.getExperienceById(id, userId);
    if (!existing) {
      return false;
    }

    await dbService.deleteExperience(id, userId);
    return true;
  }

  /**
   * Clear all experience records for a user.
   */
  public async clearExperiences(userId: string): Promise<void> {
    await dbService.clearExperiences(userId);
  }

  public async clearAllUserExperiences(userId: string): Promise<void> {
    await this.clearExperiences(userId);
  }

  /**
   * Convenience helper to collect explicit user feedback.
   */
  public async collectFeedback(params: {
    userId: string;
    inputQuery: string;
    responseSnippet: string;
    rating: number;
    feedbackText?: string;
    taskCategory?: ExperienceCategory;
  }): Promise<LearningExperience | null> {
    return this.collectExperience({
      userId: params.userId,
      inputQuery: params.inputQuery,
      contextSnippet: params.responseSnippet,
      rating: params.rating,
      userFeedbackText: params.feedbackText,
      category: params.taskCategory || 'response_quality',
      source: 'user_feedback',
    });
  }

  /**
   * Convenience helper to collect user corrections.
   */
  public async collectCorrection(params: {
    userId: string;
    inputQuery: string;
    originalOutput: string;
    correctedOutput: string;
    taskCategory?: ExperienceCategory;
  }): Promise<LearningExperience | null> {
    return this.collectExperience({
      userId: params.userId,
      inputQuery: params.inputQuery,
      targetOutput: params.correctedOutput,
      candidateOutputs: [params.originalOutput],
      outcome: 'corrected',
      category: params.taskCategory || 'response_quality',
      source: 'user_correction',
    });
  }

  /**
   * Convenience helper to collect retrieval feedback (clicks / relevance).
   */
  public async collectRetrievalFeedback(params: {
    userId: string;
    inputQuery: string;
    chunkId: string;
    fileId: string;
    chunkSnippet: string;
    isRelevant: boolean;
    rankPosition?: number;
    features?: {
      vectorSimilarity?: number;
      keywordCoverage?: number;
      proximityBonus?: number;
      queryLengthNorm?: number;
      chunkLengthNorm?: number;
      exactTitleMatch?: number;
    };
  }): Promise<LearningExperience | null> {
    return this.collectExperience({
      userId: params.userId,
      inputQuery: params.inputQuery,
      chunkId: params.chunkId,
      fileId: params.fileId,
      contextSnippet: params.chunkSnippet,
      outcome: params.isRelevant ? 'positive' : 'negative',
      category: 'retrieval_ranking',
      source: 'retrieval_feedback',
      features: params.features
        ? { ...params.features, label: params.isRelevant ? 1 : 0 }
        : undefined,
    });
  }

  /**
   * Convenience helper to collect task or tool execution outcomes.
   */
  public async collectTaskOutcome(params: {
    userId: string;
    toolName: string;
    taskCategory?: ExperienceCategory;
    inputQuery: string;
    success: boolean;
    durationMs: number;
    outputSnippet?: string;
  }): Promise<LearningExperience | null> {
    return this.collectExperience({
      userId: params.userId,
      toolName: params.toolName,
      inputQuery: params.inputQuery,
      executionSuccess: params.success,
      contextSnippet: params.outputSnippet,
      category: params.taskCategory || 'tool_selection',
      source: 'task_outcome',
      outcome: params.success ? 'positive' : 'negative',
    });
  }

  /**
   * Toggle user opt-out status for experience learning.
   */
  public async setLearningConsent(userId: string, enabled: boolean): Promise<boolean> {
    await dbService.updateUserPreferences(userId, { learningEnabled: enabled });
    return enabled;
  }
}

export const experienceCollector = new ExperienceCollector();
