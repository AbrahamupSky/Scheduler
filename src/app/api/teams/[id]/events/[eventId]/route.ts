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

function parseIntId(x: string) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function validateHHMM(s: any) {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; eventId: string } }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = parseIntId(params.id);
    const eventId = parseIntId(params.eventId);
    if (!teamId || !eventId)
      return NextResponse.json({ error: 'bad id' }, { status: 400 });

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();

    const title = String(body.title ?? '').trim();
    const dateStr = String(body.date ?? '').trim();
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

    const updated = await prisma.irregularEvent.update({
      where: { id: eventId },
      data: { title, date, startTime, endTime, jobType },
    });

    // safety: ensure event belongs to team
    if (updated.teamId !== teamId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ event: updated });
  } catch (err) {
    console.error('PUT /api/teams/[id]/events/[eventId]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; eventId: string } }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = parseIntId(params.id);
    const eventId = parseIntId(params.eventId);
    if (!teamId || !eventId)
      return NextResponse.json({ error: 'bad id' }, { status: 400 });

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const existing = await prisma.irregularEvent.findUnique({ where: { id: eventId } });
    if (!existing || existing.teamId !== teamId)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.irregularEvent.delete({ where: { id: eventId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/teams/[id]/events/[eventId]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
