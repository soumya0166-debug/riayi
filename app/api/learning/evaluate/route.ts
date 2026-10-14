import { NextRequest, NextResponse } from 'next/server';
import { deploymentGate } from '@/services/learning/deploymentGate';
import { dbService } from '@/services/database/clientDb';
import { formatErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const reports = await dbService.getEvaluationReports();
    return NextResponse.json({
      success: true,
      reports,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const checkpointId = body.checkpointId;
    const datasetId = body.datasetId;

    let checkpoint = null;
    if (checkpointId) {
      checkpoint = await dbService.getModelCheckpointById(checkpointId);
    } else {
      const checkpoints = await dbService.getModelCheckpoints();
      if (checkpoints.length > 0) checkpoint = checkpoints[0];
    }

    if (!checkpoint) {
      return NextResponse.json(
        { success: false, error: 'No model checkpoint found to evaluate.' },
        { status: 400 }
      );
    }

    let dataset = null;
    if (datasetId) {
      dataset = await dbService.getCuratedDatasetById(datasetId);
    } else {
      dataset = await dbService.getCuratedDatasetById(checkpoint.datasetId);
      if (!dataset) {
        const datasets = await dbService.getCuratedDatasets();
        if (datasets.length > 0) dataset = datasets[0];
      }
    }

    if (!dataset) {
      return NextResponse.json(
        { success: false, error: 'No matching curated dataset found with held-out test split.' },
        { status: 400 }
      );
    }

    // Run held-out evaluation against baseline
    const report = await deploymentGate.evaluateCandidate({
      candidateCheckpoint: checkpoint,
      dataset,
      options: body.options,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
