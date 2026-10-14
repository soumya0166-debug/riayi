import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/services/database/clientDb';
import { strategyLearner } from '@/services/learning/strategyLearner';
import { learningScheduler } from '@/services/learning/learningScheduler';
import { formatErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';

    // 1. Experiences breakdown
    const allExperiences = await dbService.getExperiences(userId);
    const activeExperiences = allExperiences.filter((e) => e.retentionStatus !== 'deleted');

    const totalCollected = activeExperiences.length;
    const rawCount = activeExperiences.filter((e) => e.qualityStatus === 'raw').length;
    const curatedCount = activeExperiences.filter((e) => e.qualityStatus === 'curated').length;
    const rejectedCount = activeExperiences.filter((e) => e.qualityStatus === 'rejected').length;
    const pendingReviewCount = activeExperiences.filter((e) => e.qualityStatus === 'pending_review').length;

    // 2. Curated Datasets
    const datasets = await dbService.getCuratedDatasets();

    // 3. Model Checkpoints
    const checkpoints = await dbService.getModelCheckpoints();

    // 4. Evaluations
    const evaluations = await dbService.getEvaluationReports();
    const latestEvaluation = evaluations.length > 0 ? evaluations[0] : null;

    // 5. Active Deployment
    const activeDeployment = await dbService.getActiveDeployment();

    // 6. Strategy & Tool Reliability Metrics
    const strategyMetrics = await strategyLearner.getAllStrategyMetrics();
    const failurePatterns = await strategyLearner.analyzeFailurePatterns();

    // 7. Step 9: Learned Lessons & Adaptive Strategies
    const lessons = await dbService.getLearnedLessons(userId);
    const approvedLessons = lessons.filter((l) => l.status === 'approved');
    const candidateLessons = lessons.filter((l) => l.status === 'candidate');

    const strategies = await dbService.getAdaptiveStrategies();
    const reports = await dbService.getLearningReports(userId);
    const latestReport = reports.length > 0 ? reports[0] : null;

    // 8. Scheduler status
    const schedulerStatus = learningScheduler.getStatus();

    return NextResponse.json({
      success: true,
      stats: {
        experiences: {
          total: totalCollected,
          raw: rawCount,
          curated: curatedCount,
          rejected: rejectedCount,
          pendingReview: pendingReviewCount,
        },
        lessons: {
          total: lessons.length,
          approved: approvedLessons.length,
          candidate: candidateLessons.length,
          items: lessons.slice(0, 20),
        },
        strategies: strategies.slice(0, 10),
        latestReport,
        reports: reports.slice(0, 5),
        datasetsCount: datasets.length,
        checkpointsCount: checkpoints.length,
        evaluationsCount: evaluations.length,
        activeDeployment,
        latestEvaluation,
        datasets,
        checkpoints: checkpoints.slice(0, 10),
        evaluations: evaluations.slice(0, 10),
        strategyMetrics,
        failurePatterns,
        schedulerStatus,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
