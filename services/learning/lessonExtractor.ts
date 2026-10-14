import {
  LearnedLesson,
  LessonStatus,
  LearningExperience,
  ExperienceCategory,
} from '@/types/learning';
import { dbService } from '@/services/database/clientDb';
import { generateId } from '@/lib/utils';

export interface ExtractionResult {
  newLessons: LearnedLesson[];
  updatedLessons: LearnedLesson[];
  recurringErrors: Array<{ error: string; count: number; affectedTools: string[] }>;
}

export class LessonExtractor {
  /**
   * Extract reusable procedural lessons from eligible experience records.
   * Enforces evidence thresholds to avoid learning from a single unverified output.
   */
  public async extractLessonsFromExperiences(userId: string): Promise<ExtractionResult> {
    const experiences = await dbService.getExperiences(userId);
    const eligible = experiences.filter(
      (e) => e.retentionStatus !== 'deleted' && e.consentStatus !== 'opted_out'
    );

    const existingLessons = await dbService.getLearnedLessons(userId);
    const newLessons: LearnedLesson[] = [];
    const updatedLessons: LearnedLesson[] = [];

    // 1. Identify Recurring Errors
    const errorMap = new Map<string, { count: number; tools: Set<string>; expIds: string[] }>();

    for (const exp of eligible) {
      if (exp.outcome === 'negative') {
        const errorText = exp.contextSnippet || exp.userFeedbackText || 'Unknown execution failure';
        const normError = this.normalizeErrorString(errorText);

        const current = errorMap.get(normError) || { count: 0, tools: new Set<string>(), expIds: [] };
        current.count += 1;
        if (exp.toolName) current.tools.add(exp.toolName);
        current.expIds.push(exp.id);
        errorMap.set(normError, current);
      }
    }

    const recurringErrors = Array.from(errorMap.entries())
      .filter(([, data]) => data.count >= 2)
      .map(([err, data]) => ({
        error: err,
        count: data.count,
        affectedTools: Array.from(data.tools),
      }))
      .sort((a, b) => b.count - a.count);

    // 2. Extract Negative/Failure Avoidance Lessons from Recurring Errors
    for (const rec of recurringErrors) {
      const errorEntry = errorMap.get(rec.error)!;
      const lessonTitle = `Guardrail: Mitigate "${rec.error.slice(0, 45)}" on [${rec.affectedTools.join(', ') || 'general'}]`;

      const existing = existingLessons.find(
        (l) => l.title === lessonTitle && l.status !== 'rolled_back'
      );

      if (existing) {
        // Update evidence
        existing.evidenceCount = errorEntry.count;
        existing.supportingExperienceIds = Array.from(
          new Set([...existing.supportingExperienceIds, ...errorEntry.expIds])
        );
        existing.confidence = Number(Math.min(0.95, 0.5 + errorEntry.count * 0.1).toFixed(2));
        existing.isVerified = errorEntry.count >= 2;
        await dbService.saveLearnedLesson(existing);
        updatedLessons.push(existing);
      } else {
        const newLesson: LearnedLesson = {
          id: `lesson_${Date.now()}_${generateId('lsn')}`,
          userId,
          title: lessonTitle,
          taskType: 'tool_selection',
          triggerCondition: `When executing tasks using [${rec.affectedTools.join(', ')}] with similar inputs`,
          actionRecommendation: `Implement preemptive input validation and switch to secondary fallback tool if error persists.`,
          confidence: Number(Math.min(0.95, 0.5 + errorEntry.count * 0.1).toFixed(2)),
          evidenceCount: errorEntry.count,
          supportingExperienceIds: errorEntry.expIds,
          source: 'task_failure',
          status: errorEntry.count >= 2 ? 'approved' : 'candidate',
          isVerified: errorEntry.count >= 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await dbService.saveLearnedLesson(newLesson);
        newLessons.push(newLesson);
      }
    }

    // 3. Extract High-Signal Lessons from Explicit User Corrections
    const corrections = eligible.filter((e) => e.source === 'user_correction');
    for (const corr of corrections) {
      const lessonTitle = `User Correction: Preference for "${corr.inputQuery.slice(0, 40)}"`;
      const existing = existingLessons.find(
        (l) => l.title === lessonTitle && l.status !== 'rolled_back'
      );

      if (!existing && corr.targetOutput) {
        const correctionLesson: LearnedLesson = {
          id: `lesson_${Date.now()}_${generateId('lsn')}`,
          userId,
          title: lessonTitle,
          taskType: corr.category,
          triggerCondition: `When user query matches "${corr.inputQuery.slice(0, 50)}"`,
          actionRecommendation: `Favor corrected output: "${corr.targetOutput.slice(0, 80)}" instead of previous model response.`,
          confidence: 0.90, // High initial confidence because directly provided by human
          evidenceCount: 1,
          supportingExperienceIds: [corr.id],
          source: 'user_correction',
          status: 'approved',
          isVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await dbService.saveLearnedLesson(correctionLesson);
        newLessons.push(correctionLesson);
      }
    }

    // 4. Extract Procedural Success Patterns
    const successes = eligible.filter((e) => e.outcome === 'positive' && e.toolName);
    const toolSuccessMap = new Map<string, string[]>();

    for (const succ of successes) {
      const tool = succ.toolName!;
      const list = toolSuccessMap.get(tool) || [];
      list.push(succ.id);
      toolSuccessMap.set(tool, list);
    }

    for (const [toolName, ids] of toolSuccessMap.entries()) {
      if (ids.length >= 3) {
        const lessonTitle = `Proven Workflow: Tool "${toolName}" has verified reliability`;
        const existing = existingLessons.find((l) => l.title === lessonTitle);

        if (!existing) {
          const successLesson: LearnedLesson = {
            id: `lesson_${Date.now()}_${generateId('lsn')}`,
            userId,
            title: lessonTitle,
            taskType: 'tool_selection',
            triggerCondition: `When user task requests capabilities served by "${toolName}"`,
            actionRecommendation: `Prioritize "${toolName}" as primary execution step.`,
            confidence: Number(Math.min(0.95, 0.6 + ids.length * 0.05).toFixed(2)),
            evidenceCount: ids.length,
            supportingExperienceIds: ids,
            source: 'task_success',
            status: 'approved',
            isVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await dbService.saveLearnedLesson(successLesson);
          newLessons.push(successLesson);
        }
      }
    }

    return {
      newLessons,
      updatedLessons,
      recurringErrors,
    };
  }

  /**
   * Explicitly approve a candidate lesson.
   */
  public async approveLesson(lessonId: string, userId: string, approverId: string): Promise<LearnedLesson> {
    const lesson = await dbService.getLearnedLessonById(lessonId, userId);
    if (!lesson) {
      throw new Error(`Learned lesson ${lessonId} not found.`);
    }

    lesson.status = 'approved';
    lesson.approvedAt = new Date().toISOString();
    lesson.approvedBy = approverId;
    lesson.isVerified = true;

    return await dbService.saveLearnedLesson(lesson);
  }

  /**
   * Reject a candidate lesson.
   */
  public async rejectLesson(lessonId: string, userId: string): Promise<LearnedLesson> {
    const lesson = await dbService.getLearnedLessonById(lessonId, userId);
    if (!lesson) {
      throw new Error(`Learned lesson ${lessonId} not found.`);
    }

    lesson.status = 'rejected';
    lesson.updatedAt = new Date().toISOString();

    return await dbService.saveLearnedLesson(lesson);
  }

  /**
   * Rollback an approved lesson if it causes regressions.
   */
  public async rollbackLesson(lessonId: string, userId: string, notes?: string): Promise<LearnedLesson> {
    const lesson = await dbService.getLearnedLessonById(lessonId, userId);
    if (!lesson) {
      throw new Error(`Learned lesson ${lessonId} not found.`);
    }

    lesson.status = 'rolled_back';
    lesson.rollbackNotes = notes || 'Manually rolled back by user/admin.';
    lesson.updatedAt = new Date().toISOString();

    return await dbService.saveLearnedLesson(lesson);
  }

  private normalizeErrorString(err: string): string {
    return err
      .toLowerCase()
      .replace(/[\d_]{4,}/g, '#') // Replace dynamic IDs
      .replace(/https?:\/\/[^\s]+/g, '[URL]')
      .slice(0, 100)
      .trim();
  }
}

export const lessonExtractor = new LessonExtractor();
