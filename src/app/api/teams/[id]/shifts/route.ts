import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

async function requireUser(req: NextRequest) {
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

const ENUM_TO_DAY: Record<
  'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT',
  string
> = {
  SUN: 'Sunday',
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(req);
    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = Number(params.id);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'bad team id' }, { status: 400 });
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const templates = (body?.templates ?? []) as Array<{
      shiftName: string;
      jobType?: string | null;
      weekday: 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
      startHHMM: string;
      endHHMM: string;
    }>;

    if (!Array.isArray(templates) || templates.length === 0) {
      return NextResponse.json({ error: 'No templates' }, { status: 400 });
    }

    // wipe existing templates and recreate (simple approach)
    await prisma.shiftTemplate.deleteMany({ where: { teamId } });

    const data = templates.map((t) => ({
      teamId,
      shift: t.shiftName,
      jobType: t.jobType ?? null,
      day: ENUM_TO_DAY[t.weekday], // schema has 'day' as String
      startTime: t.startHHMM,
      endTime: t.endHHMM,
      required: 1, // you can store Required if you extended schema
    }));

    await prisma.shiftTemplate.createMany({ data });

    return NextResponse.json({ ok: true, templates: data.length });
  } catch (err: any) {
    console.error('POST /teams/[id]/shifts error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
