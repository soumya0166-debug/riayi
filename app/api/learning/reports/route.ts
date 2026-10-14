import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/services/database/clientDb';
import { formatErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || undefined;

    const reports = await dbService.getLearningReports(userId);
    return NextResponse.json({
      success: true,
      reports,
      count: reports.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
