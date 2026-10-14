import { NextRequest, NextResponse } from 'next/server';
import { curationPipeline } from '@/services/learning/curationPipeline';
import { dbService } from '@/services/database/clientDb';
import { formatErrorMessage } from '@/lib/errors';
import { ExperienceCategory } from '@/types/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') as ExperienceCategory | undefined;

    const datasets = await dbService.getCuratedDatasets(category);
    return NextResponse.json({
      success: true,
      datasets,
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
    const userId = body.userId || 'guest_user_default';
    const category: ExperienceCategory = body.category || 'retrieval_ranking';

    // 1. Fetch eligible experiences
    const experiences = await dbService.getExperiences(userId, { category });
    const eligible = experiences.filter(
      (e) => e.retentionStatus !== 'deleted' && e.consentStatus !== 'opted_out'
    );

    if (eligible.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No eligible experiences found for category "${category}" to curate.`,
        },
        { status: 400 }
      );
    }

    // 2. Run Curation Pipeline
    const dataset = await curationPipeline.curateExperiences(eligible, {
      taskCategory: category,
      versionTag: body.versionTag,
    });

    return NextResponse.json({
      success: true,
      dataset,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
