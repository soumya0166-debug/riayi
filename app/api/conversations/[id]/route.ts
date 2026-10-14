import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/services/database/clientDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations/[id]
 * Fetch a conversation and its messages with ownership check.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!id || !id.trim()) {
      return NextResponse.json({ error: 'Conversation id is required.' }, { status: 400 });
    }

    const conv = await dbService.getConversationById(id, userId || undefined);
    if (!conv) {
      return NextResponse.json(
        { error: 'Conversation not found or unauthorized.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ conversation: conv });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve conversation.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/conversations/[id]
 * Rename, pin, or update conversation.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const { userId, title, isPinned } = body;

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return NextResponse.json(
        { error: 'Unauthorized: userId is required.' },
        { status: 401 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (typeof title === 'string') {
      if (!title.trim()) {
        return NextResponse.json(
          { error: 'Validation Error: Title cannot be empty.' },
          { status: 400 }
        );
      }
      updates.title = title.trim();
    }
    if (typeof isPinned === 'boolean') {
      updates.isPinned = isPinned;
    }

    const updated = await dbService.updateConversation(id, updates, userId.trim());
    return NextResponse.json({ conversation: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update conversation.';
    const status = message.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/conversations/[id]
 * Delete conversation and its messages with ownership enforcement.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId || !userId.trim()) {
      return NextResponse.json(
        { error: 'Unauthorized: userId is required to delete conversation.' },
        { status: 401 }
      );
    }

    await dbService.deleteConversation(id, userId.trim());
    return NextResponse.json({ success: true, message: 'Conversation deleted.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete conversation.';
    const status = message.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
