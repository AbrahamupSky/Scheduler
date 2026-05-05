import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

type RouteParams = Promise<{ id: string }>;

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

async function parseTeamId(params: RouteParams) {
  const { id } = await params;
  const teamId = Number(id);

  if (!Number.isFinite(teamId)) return null;
  return teamId;
}

export async function GET(
  req: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = await parseTeamId(params);
    if (!teamId)
      return NextResponse.json({ error: 'bad team id' }, { status: 400 });

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const rules =
      (await prisma.schedulingRules.findUnique({ where: { teamId } })) ??
      (await prisma.schedulingRules.create({ data: { teamId } }));

    return NextResponse.json({ rules });
  } catch (err) {
    console.error('GET /api/teams/[id]/rules', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = await parseTeamId(params);
    if (!teamId)
      return NextResponse.json({ error: 'bad team id' }, { status: 400 });

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();

    const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, Math.trunc(n)));
    };

    const data = {
      minHoursPerWeek: clampInt(body.minHoursPerWeek, 0, 80, 0),
      maxHoursPerWeek: clampInt(body.maxHoursPerWeek, 0, 80, 40),
      maxDaysPerWeek: clampInt(body.maxDaysPerWeek, 1, 7, 6),
      minRestHours: clampInt(body.minRestHours, 0, 24, 8),
      maxShiftHours: clampInt(body.maxShiftHours, 1, 24, 10),
      allowOvertime: Boolean(body.allowOvertime),
      enforceFairness: Boolean(body.enforceFairness),
      preferAvailability: Boolean(body.preferAvailability),
      notes: typeof body.notes === 'string' ? body.notes : null,
    };

    if (data.maxHoursPerWeek < data.minHoursPerWeek) {
      data.maxHoursPerWeek = data.minHoursPerWeek;
    }

    const rules = await prisma.schedulingRules.upsert({
      where: { teamId },
      create: { teamId, ...data },
      update: data,
    });

    return NextResponse.json({ rules });
  } catch (err) {
    console.error('PUT /api/teams/[id]/rules', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
