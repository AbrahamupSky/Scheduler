import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/* -------------------------- auth helper (Bearer) -------------------------- */
async function getUserFromAuth(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return null;

  const session = await prisma.session.findFirst({
    where: { token, expiresAt: { gt: new Date() } },
    include: { user: true },
  });

  return session?.user ?? null;
}

/* ----------------------------------- GET ---------------------------------- */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;

    const scheduleId = Number(id);
    if (!Number.isFinite(scheduleId)) {
      return NextResponse.json({ error: 'Invalid schedule id' }, { status: 400 });
    }

    // Load schedule AND make sure it belongs to this user (through team.ownerId)
    const schedule = await prisma.savedSchedule.findFirst({
      where: {
        id: scheduleId,
        team: { ownerId: user.id },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        optimization: true,
        createdAt: true,
        data: true,
        team: { select: { id: true, name: true } },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      schedule: {
        ...schedule,
        // ensure JSON comes back as your GeneratedSchedule
        data: schedule.data,
      },
    });
  } catch (err) {
    console.error('GET /api/schedules/[id] error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
