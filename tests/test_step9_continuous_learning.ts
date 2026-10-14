/**
 * RIYAAI Step 9: Continuous Self-Learning Intelligence Engine Test Suite
 *
 * Validates:
 * 1. End-to-end Learning Pipeline (Capture -> Sanitize -> Lessons -> Strategies -> Evaluation -> Report)
 * 2. Recurring Error Detection & Prevention of Looping Failures
 * 3. Evidence-Based Procedural Lesson Extraction (Verified Facts vs Assumptions)
 * 4. Lesson Approval, Rejection, and Instant Rollback
 * 5. Adaptive Strategy Selection with Bounded Retries, Timeouts & Fallback Routing
 * 6. Hard Safety Guard: Disallowing Auto-Retries on Destructive Operations
 * 7. Continuous Evaluation Benchmark Suite (Task Completion, MRR, 100% Safety Compliance)
 * 8. Autonomy & Approval Boundaries (ApprovalRequest created for uncertain/sensitive changes)
 * 9. Scheduler Controls (Pause, Resume, and Concurrency Protection)
 * 10. Gemini as the Sole LLM Provider (No secondary conversational LLM)
 */

import { experienceCollector } from '../services/learning/experienceCollector';
import { lessonExtractor } from '../services/learning/lessonExtractor';
import { strategyManager } from '../services/learning/strategyManager';
import { continuousEvaluator } from '../services/learning/continuousEvaluator';
import { learningScheduler } from '../services/learning/learningScheduler';
import { dbService } from '../services/database/clientDb';
import { AVAILABLE_MODELS } from '../config/models';

import fs from 'fs';
import path from 'path';

// Load .env.local
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch {}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    testsFailed++;
  }
}

async function runStep9TestSuite() {
  console.log('\n============================================================');
  console.log('RIYAAI STEP 9: CONTINUOUS SELF-LEARNING INTELLIGENCE SUITE');
  console.log('============================================================\n');

  const userId = `step9_user_${Date.now()}`;
  await dbService.updateUserPreferences(userId, { learningEnabled: true });
  await experienceCollector.clearAllUserExperiences(userId);

  // ============================================================
  // 1. RECURRING ERROR DETECTION & EVIDENCE-BASED LESSON EXTRACTION
  // ============================================================
  console.log('--- 1. Recurring Error Detection & Procedural Lessons ---');
  {
    // Record repeated failure 1
    await experienceCollector.collectExperience({
      userId,
      category: 'tool_selection',
      source: 'task_outcome',
      inputQuery: 'Query external real-time stock quotes',
      toolName: 'external_fetch',
      contextSnippet: 'Connection timeout: gateway unreachable after 5000ms',
      executionSuccess: false,
      outcome: 'negative',
    });

    // Record repeated failure 2 (triggers recurring error pattern)
    await experienceCollector.collectExperience({
      userId,
      category: 'tool_selection',
      source: 'task_outcome',
      inputQuery: 'Fetch exchange rates from external API',
      toolName: 'external_fetch',
      contextSnippet: 'Connection timeout: gateway unreachable after 5000ms',
      executionSuccess: false,
      outcome: 'negative',
    });

    // Record explicit user correction
    await experienceCollector.collectCorrection({
      userId,
      inputQuery: 'What is the standard format for financial summary?',
      originalOutput: 'Bullet points with raw numbers',
      correctedOutput: 'Executive overview followed by GAAP metrics table and percentage change',
      taskCategory: 'response_quality',
    });

    // Extract lessons
    const extraction = await lessonExtractor.extractLessonsFromExperiences(userId);

    assert(extraction.recurringErrors.length >= 1, 'Recurring error pattern detected across repeated failures');
    assert(
      extraction.recurringErrors[0].affectedTools.includes('external_fetch'),
      'Identified affected tool in recurring error pattern'
    );
    assert(extraction.newLessons.length >= 2, 'Generated reusable procedural lessons from failures and user corrections');

    const correctionLesson = extraction.newLessons.find((l) => l.source === 'user_correction');
    assert(correctionLesson !== undefined, 'Extracted lesson from explicit human correction');
    assert(correctionLesson?.isVerified === true, 'Human-corrected lesson marked as verified fact');
    assert(correctionLesson?.confidence === 0.90, 'Human-corrected lesson assigned high confidence (0.90)');

    const failureLesson = extraction.newLessons.find((l) => l.source === 'task_failure');
    assert(failureLesson !== undefined, 'Extracted guardrail lesson from recurring failure pattern');
    assert(failureLesson?.evidenceCount === 2, 'Lesson tracks evidence count from 2 corroborated experiences');
  }

  // ============================================================
  // 2. LESSON LIFECYCLE: APPROVAL, REJECTION & ROLLBACK
  // ============================================================
  console.log('\n--- 2. Lesson Lifecycle: Approval, Rejection & Rollback ---');
  {
    const lessons = await dbService.getLearnedLessons(userId);
    const targetLesson = lessons[0];

    // Approve
    const approved = await lessonExtractor.approveLesson(targetLesson.id, userId, 'admin_supervisor');
    assert(approved.status === 'approved', 'Candidate lesson approved successfully');
    assert(approved.approvedBy === 'admin_supervisor', 'Administrator approval signature recorded');
    assert(approved.isVerified === true, 'Approved lesson marked as verified');

    // Rollback
    const rolledBack = await lessonExtractor.rollbackLesson(
      targetLesson.id,
      userId,
      'Rolled back due to API behavior change.'
    );
    assert(rolledBack.status === 'rolled_back', 'Approved lesson instantly rolled back');
    assert(
      rolledBack.rollbackNotes?.includes('API behavior change') === true,
      'Rollback rationale recorded in audit trail'
    );

    // Reject a separate candidate
    const candidateLesson = await dbService.saveLearnedLesson({
      id: `lesson_temp_${Date.now()}`,
      userId,
      title: 'Temporary Unverified Suggestion',
      taskType: 'tool_selection',
      triggerCondition: 'When querying test data',
      actionRecommendation: 'Skip cache check',
      confidence: 0.45,
      evidenceCount: 1,
      supportingExperienceIds: [],
      source: 'task_success',
      status: 'candidate',
      isVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const rejected = await lessonExtractor.rejectLesson(candidateLesson.id, userId);
    assert(rejected.status === 'rejected', 'Low-confidence candidate lesson explicitly rejected');
  }

  // ============================================================
  // 3. ADAPTIVE STRATEGY SELECTION & SAFETY GUARDRAILS
  // ============================================================
  console.log('\n--- 3. Adaptive Strategy Selection & Safety Guardrails ---');
  {
    // Retrieve strategy for doc_analysis
    const strategy = await strategyManager.getStrategyForTask('doc_analysis', userId);
    assert(strategy !== null, 'Adaptive strategy retrieved for task');
    assert(strategy.preferredToolSequence.length > 0, 'Preferred tool sequence defined');
    assert(strategy.fallbackToolSequence.length > 0, 'Fallback tool sequence defined');

    // Execute with successful preferred sequence
    let executedTools: string[] = [];
    const exec1 = await strategyManager.executeWithStrategy({
      taskType: 'doc_analysis',
      userId,
      executeFn: async (tools) => {
        executedTools = tools;
        return { success: true, result: 'Document summarized with key highlights.' };
      },
    });

    assert(exec1.success === true, 'Task executed successfully with adaptive strategy');
    assert(exec1.usedFallback === false, 'Preferred tool sequence succeeded without fallback');
    assert(exec1.toolsExecuted.includes('doc_search'), 'Executed preferred tools');

    // Execute where preferred tool sequence fails -> triggers fallback!
    let fallbackExecuted: boolean = false;
    const exec2 = await strategyManager.executeWithStrategy({
      taskType: 'doc_analysis',
      userId,
      executeFn: async (tools) => {
        if (tools.includes('generate_report')) {
          // Preferred sequence contains generate_report which fails
          return { success: false, error: 'Report generation service unavailable' };
        }
        // Fallback sequence does not contain generate_report and succeeds
        fallbackExecuted = true;
        return { success: true, result: 'Fallback summary generated.' };
      },
    });

    assert(exec2.success === true, 'Task recovered using fallback tool sequence');
    assert(exec2.usedFallback === true, 'Strategy automatically routed to fallback tool sequence');
    assert(Boolean(fallbackExecuted) === true, 'Fallback execution completed');

    // CRITICAL SAFETY GUARD: Destructive action MUST NEVER auto-retry!
    let attemptCount = 0;
    const destructiveExec = await strategyManager.executeWithStrategy({
      taskType: 'file_deletion',
      userId,
      isDestructive: true, // Irreversible / Destructive operation
      executeFn: async () => {
        attemptCount++;
        return { success: false, error: 'Permission denied on destructive target' };
      },
    });

    assert(destructiveExec.success === false, 'Destructive task stopped upon failure');
    assert(attemptCount === 1, 'Safety guard: Destructive operation was NOT retried automatically');
  }

  // ============================================================
  // 4. CONTINUOUS EVALUATION BENCHMARK SUITE
  // ============================================================
  console.log('\n--- 4. Continuous Evaluation Benchmark Suite ---');
  {
    const evalResult = await continuousEvaluator.runEvaluationSuite(userId);

    assert(evalResult !== null, 'Continuous evaluation suite executed');
    assert(evalResult.metrics.safetyComplianceRate === 1.0, 'Safety compliance strictly 1.0 (100% compliant)');
    assert(evalResult.metrics.taskCompletionRate >= 0.85, `Task completion rate (${evalResult.metrics.taskCompletionRate}) meets baseline`);
    assert(evalResult.metrics.retrievalMrr >= 0.70, `Retrieval MRR (${evalResult.metrics.retrievalMrr}) meets baseline`);
    assert(evalResult.metrics.regressionsDetected === 0, 'Zero regressions detected across benchmark');
    assert(evalResult.passed === true, 'Continuous evaluation suite passed all quality and safety gates');
  }

  // ============================================================
  // 5. AUTONOMY & APPROVAL BOUNDARIES
  // ============================================================
  console.log('\n--- 5. Autonomy & Approval Boundaries ---');
  {
    // Seed an uncertain candidate lesson to trigger approval queue
    await dbService.saveLearnedLesson({
      id: `lesson_uncertain_${Date.now()}`,
      userId,
      title: 'Uncertain Heuristic: Skip OCR on blurry scans',
      taskType: 'doc_analysis',
      triggerCondition: 'When scan resolution is low',
      actionRecommendation: 'Skip OCR processing',
      confidence: 0.50,
      evidenceCount: 1,
      supportingExperienceIds: [],
      source: 'task_failure',
      status: 'candidate',
      isVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run learning cycle
    const cycleResult = await learningScheduler.runLearningCycle(userId, {
      minNewExamples: 1,
    });

    assert(cycleResult.status === 'COMPLETED', 'Learning cycle completed');
    assert(cycleResult.report !== undefined, 'Auditable learning report generated');
    assert(
      cycleResult.report?.requiresUserApproval === true,
      'Uncertain candidate lesson queued for human approval before promotion'
    );
    assert(
      cycleResult.report?.approvalRequestId !== undefined,
      'ApprovalRequest record created in database with auditable token'
    );

    // Verify approval request was saved in database
    const approval = await dbService.getApprovalRequestById(
      cycleResult.report!.approvalRequestId!,
      userId
    );
    assert(approval !== null, 'Approval request retrievable from database');
    assert(approval?.riskLevel === 'MEDIUM', 'Approval request assigned MEDIUM risk level');
  }

  // ============================================================
  // 6. SCHEDULER CONTROLS & CONCURRENCY GUARD
  // ============================================================
  console.log('\n--- 6. Scheduler Controls (Pause, Resume & Concurrency) ---');
  {
    // Test Pause
    learningScheduler.pause();
    assert(learningScheduler.getIsPaused() === true, 'Scheduler paused');

    const pausedRun = await learningScheduler.runLearningCycle(userId);
    assert(pausedRun.status === 'PAUSED', 'Learning cycle safely skipped when scheduler is paused');

    // Test Resume
    learningScheduler.resume();
    assert(learningScheduler.getIsPaused() === false, 'Scheduler resumed');

    // Verify worker telemetry
    const status = learningScheduler.getStatus();
    assert(status.isJobRunning === false, 'Job lock released after execution');
    assert(status.lastRunAt !== null, 'Last execution timestamp recorded');
  }

  // ============================================================
  // 7. SINGLE-LLM INTEGRITY (GEMINI PRESERVED)
  // ============================================================
  console.log('\n--- 7. Single-LLM Integrity (Gemini Sole Provider) ---');
  {
    assert(AVAILABLE_MODELS.length > 0, 'AI models configured');
    assert(
      AVAILABLE_MODELS.every((m) => m.provider === 'gemini'),
      'Strict constraint verified: Google Gemini is the ONLY LLM provider across RiyaAI'
    );
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n============================================================');
  console.log(`STEP 9 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('============================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runStep9TestSuite().catch((err) => {
  console.error('Fatal Step 9 test execution error:', err);
  process.exit(1);
});
