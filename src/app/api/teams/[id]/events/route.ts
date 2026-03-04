import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/** Bearer auth */
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

function parseTeamId(params: { id: string }) {
  const teamId = Number(params.id);
  return Number.isFinite(teamId) ? teamId : null;
}

function validateHHMM(s: any) {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = parseTeamId(params);
    if (!teamId) return NextResponse.json({ error: 'bad team id' }, { status: 400 });

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const events = await prisma.irregularEvent.findMany({
      where: { teamId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });

    return NextResponse.json({ events });
  } catch (err) {
    console.error('GET /api/teams/[id]/events', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = parseTeamId(params);
    if (!teamId) return NextResponse.json({ error: 'bad team id' }, { status: 400 });

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();

    const title = String(body.title ?? '').trim();
    const dateStr = String(body.date ?? '').trim(); // expect YYYY-MM-DD
    const startTime = String(body.startTime ?? '').trim();
    const endTime = String(body.endTime ?? '').trim();
    const jobType =
      body.jobType == null || String(body.jobType).trim() === ''
        ? null
        : String(body.jobType).trim();

    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
      return NextResponse.json({ error: 'Date must be YYYY-MM-DD' }, { status: 400 });
    if (!validateHHMM(startTime) || !validateHHMM(endTime))
      return NextResponse.json({ error: 'Time must be HH:MM' }, { status: 400 });

    const date = new Date(`${dateStr}T00:00:00`);

    const created = await prisma.irregularEvent.create({
      data: { teamId, title, date, startTime, endTime, jobType },
    });

    return NextResponse.json({ event: created });
  } catch (err) {
    console.error('POST /api/teams/[id]/events', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
