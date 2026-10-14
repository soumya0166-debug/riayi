import { NextRequest, NextResponse } from 'next/server';
import { neuralTrainer } from '@/services/learning/neuralTrainer';
import { dbService } from '@/services/database/clientDb';
import { formatErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const checkpoints = await dbService.getModelCheckpoints();
    return NextResponse.json({
      success: true,
      checkpoints,
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
    const datasetId = body.datasetId;

    let dataset = null;
    if (datasetId) {
      dataset = await dbService.getCuratedDatasetById(datasetId);
    } else {
      // Pick latest curated dataset
      const datasets = await dbService.getCuratedDatasets();
      if (datasets.length > 0) {
        dataset = datasets[0];
      }
    }

    if (!dataset) {
      return NextResponse.json(
        {
          success: false,
          error: 'No curated dataset found to train on. Please curate a dataset first.',
        },
        { status: 400 }
      );
    }

    // Run actual training with Adam optimizer + backpropagation
    const checkpoint = await neuralTrainer.trainNeuralRanker({
      dataset,
      hyperparameters: body.hyperparameters,
      versionTag: body.versionTag,
    });

    return NextResponse.json({
      success: true,
      checkpoint,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
