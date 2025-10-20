import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// optional: share this helper across routes
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

const ENUM_TO_INT: Record<
  'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT',
  number
> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
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

    // ensure team belongs to user
    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const members = (body?.members ?? []) as Array<{
      name: string;
      job?: string | null;
      position?: string | null;
    }>;
    const windows = (body?.windows ?? []) as Array<{
      memberName: string;
      weekday: 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
      startHHMM: string | null;
      endHHMM: string | null;
    }>;

    if (!Array.isArray(members) || members.length === 0) {
      return NextResponse.json({ error: 'No members' }, { status: 400 });
    }

    // wipe old members/windows for this team (simple approach)
    await prisma.availabilityWindow.deleteMany({
      where: { member: { teamId } },
    });
    await prisma.teamMember.deleteMany({
      where: { teamId },
    });

    // create members
    const createdMembers = await prisma.$transaction(
      members.map((m) =>
        prisma.teamMember.create({
          data: {
            teamId,
            name: m.name,
            job: m.job ?? null,
            position: m.position ?? null,
          },
          select: { id: true, name: true },
        })
      )
    );

    const idByName = new Map(createdMembers.map((m) => [m.name, m.id]));

    // create windows (skip null-null)
    const winData = windows
      .filter(
        (w) =>
          idByName.has(w.memberName) &&
          (w.startHHMM !== null || w.endHHMM !== null)
      )
      .map((w) => ({
        memberId: idByName.get(w.memberName)!,
        dayOfWeek: ENUM_TO_INT[w.weekday],
        startTime: w.startHHMM ?? '00:00',
        endTime: w.endHHMM ?? '00:00',
      }));

    if (winData.length) {
      // chunk if you expect huge inserts
      await prisma.availabilityWindow.createMany({ data: winData });
    }

    return NextResponse.json({
      ok: true,
      members: createdMembers.length,
      windows: winData.length,
    });
  } catch (err: any) {
    console.error('POST /teams/[id]/availability error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
