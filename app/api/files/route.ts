import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/services/database/clientDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/files?userId=...&conversationId=...
 * List user files.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';
    const conversationId = searchParams.get('conversationId') || undefined;

    const files = await dbService.getFiles(userId, conversationId);

    return NextResponse.json({ files, count: files.length });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve files.' },
      { status: 500 }
    );
  }
}
