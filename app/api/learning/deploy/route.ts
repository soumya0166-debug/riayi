import { NextRequest, NextResponse } from 'next/server';
import { deploymentGate } from '@/services/learning/deploymentGate';
import { dbService } from '@/services/database/clientDb';
import { formatErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const deployment = await dbService.getActiveDeployment();
    return NextResponse.json({
      success: true,
      deployment,
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
    if (!body || !body.action) {
      return NextResponse.json(
        { success: false, error: 'action ("promote" or "rollback") is required.' },
        { status: 400 }
      );
    }

    const adminUserId = body.adminUserId || 'admin_user';

    if (body.action === 'promote') {
      if (!body.reportId) {
        return NextResponse.json(
          { success: false, error: 'reportId is required for promotion.' },
          { status: 400 }
        );
      }

      const deployment = await deploymentGate.promoteCandidate({
        reportId: body.reportId,
        adminUserId,
        overrideReason: body.overrideReason,
      });

      return NextResponse.json({
        success: true,
        action: 'promote',
        deployment,
      });
    }

    if (body.action === 'rollback') {
      const rolledBack = await deploymentGate.rollbackDeployment(adminUserId);
      return NextResponse.json({
        success: true,
        action: 'rollback',
        deployment: rolledBack,
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
