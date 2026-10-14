import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/services/database/clientDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations
 * List conversations for an authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId || !userId.trim()) {
      return NextResponse.json(
        { error: 'Unauthorized: userId is required to access conversations.' },
        { status: 401 }
      );
    }

    const conversations = await dbService.getConversations(userId.trim());
    return NextResponse.json({ conversations, count: conversations.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve conversations.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/conversations
 * Create a new conversation for an authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const { userId, title, modelId } = body;

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return NextResponse.json(
        { error: 'Unauthorized: userId is required to create a conversation.' },
        { status: 401 }
      );
    }

    const conv = await dbService.createConversation({
      userId: userId.trim(),
      title: typeof title === 'string' && title.trim() ? title.trim() : 'New Conversation',
      modelId: typeof modelId === 'string' ? modelId : undefined,
    });

    return NextResponse.json({ conversation: conv }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create conversation.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
