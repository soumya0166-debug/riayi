import { NextRequest, NextResponse } from 'next/server';
import { strategyManager } from '@/services/learning/strategyManager';
import { formatErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const strategies = await strategyManager.getAllStrategies();
    return NextResponse.json({
      success: true,
      strategies,
      count: strategies.length,
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
    const body = await req.json().catch(() => null);
    if (!body || !body.strategyId) {
      return NextResponse.json(
        { success: false, error: 'strategyId is required.' },
        { status: 400 }
      );
    }

    if (body.action === 'reset') {
      const reset = await strategyManager.resetStrategyStats(body.strategyId);
      return NextResponse.json({
        success: true,
        action: 'reset',
        strategy: reset,
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action: ${body.action}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
