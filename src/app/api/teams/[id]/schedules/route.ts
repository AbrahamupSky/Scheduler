import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // 👈 key change
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params; // 👈 await params
    const teamId = Number(id);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
    }

    // ensure team belongs to user
    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const schedules = await prisma.savedSchedule.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        optimization: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ schedules });
  } catch (err) {
    console.error('GET /api/teams/[id]/schedules error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
