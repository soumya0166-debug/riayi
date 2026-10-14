import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memory/memoryService';
import { checkPrivacy } from '@/services/memory/privacyScreening';
import { MemoryType } from '@/types/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/memory
 * Retrieve memories for an authenticated user.
 * Query params:
 * - userId (required)
 * - query (optional: search/filter memories)
 * - limit (optional, default: 20)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const query = searchParams.get('query');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    if (!userId || !userId.trim()) {
      return NextResponse.json(
        { error: 'Unauthorized: userId is required to access memories.' },
        { status: 401 }
      );
    }

    if (query && query.trim()) {
      const searchResults = await memoryService.searchMemories(userId.trim(), query.trim());
      const filtered = searchResults.slice(0, limit).map((r) => r.memory);
      return NextResponse.json({ memories: filtered, count: filtered.length });
    }

    const allMemories = await memoryService.getMemories(userId.trim());
    return NextResponse.json({ memories: allMemories, count: allMemories.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve memories.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/memory
 * Create a new user memory or update an existing one.
 * Body:
 * - userId (required)
 * - content (required)
 * - memoryType (optional)
 * - importance (optional, 1-5)
 * - sourceConversationId (optional)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const { userId, content, memoryType, importance, sourceConversationId } = body;

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return NextResponse.json(
        { error: 'Unauthorized: userId is required.' },
        { status: 401 }
      );
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'Validation Error: Memory content cannot be empty.' },
        { status: 400 }
      );
    }

    // Server-side privacy screening: Never store credentials, passwords, or API keys
    const privacy = checkPrivacy(content);
    if (privacy.isSensitive) {
      return NextResponse.json(
        {
          error:
            'For your security and privacy, RIYAI does not store passwords, API keys, or sensitive credentials in memory.',
          code: 'PRIVACY_VIOLATION',
        },
        { status: 400 }
      );
    }

    const result = await memoryService.createMemory({
      userId: userId.trim(),
      content: content.trim(),
      memoryType: memoryType as MemoryType | undefined,
      importance: typeof importance === 'number' ? Math.min(5, Math.max(1, importance)) : 3,
      sourceConversationId: typeof sourceConversationId === 'string' ? sourceConversationId : undefined,
    });

    return NextResponse.json({ memory: result.memory, isNew: result.isNew }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save memory.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/memory
 * Update an existing memory record.
 * Body:
 * - id (required)
 * - userId (required)
 * - content (optional)
 * - memoryType (optional)
 * - importance (optional)
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const { id, userId, content, memoryType, importance } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Validation Error: memory id is required.' }, { status: 400 });
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Unauthorized: userId is required.' }, { status: 401 });
    }

    if (content) {
      const privacy = checkPrivacy(content);
      if (privacy.isSensitive) {
        return NextResponse.json(
          {
            error:
              'For your security and privacy, RIYAI does not store passwords, API keys, or sensitive credentials in memory.',
            code: 'PRIVACY_VIOLATION',
          },
          { status: 400 }
        );
      }
    }

    const updated = await memoryService.updateMemory(id, userId, {
      ...(content ? { content: content.trim() } : {}),
      ...(memoryType ? { memoryType } : {}),
      ...(typeof importance === 'number' ? { importance } : {}),
    });

    return NextResponse.json({ memory: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update memory.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/memory
 * Delete a specific memory or clear all memories for a user.
 * Query params:
 * - userId (required)
 * - id (optional: if omitted and clearAll=true, clears all)
 * - clearAll (optional boolean)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const memoryId = searchParams.get('id');
    const clearAll = searchParams.get('clearAll') === 'true';

    if (!userId || !userId.trim()) {
      return NextResponse.json({ error: 'Unauthorized: userId is required.' }, { status: 401 });
    }

    if (clearAll) {
      await memoryService.clearMemories(userId.trim());
      return NextResponse.json({ success: true, message: 'All memories cleared.' });
    }

    if (!memoryId) {
      return NextResponse.json(
        { error: 'Validation Error: specify either memory "id" to delete or "clearAll=true".' },
        { status: 400 }
      );
    }

    await memoryService.deleteMemory(memoryId, userId.trim());
    return NextResponse.json({ success: true, message: `Memory ${memoryId} deleted.` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete memory.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
