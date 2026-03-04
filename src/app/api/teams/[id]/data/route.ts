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

/* --------------------------- small mapping helpers --------------------------- */
const INT_TO_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const ENUM_TO_DAY: Record<(typeof INT_TO_ENUM)[number], string> = {
  SUN: 'Sunday',
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

type WdEnum = (typeof INT_TO_ENUM)[number];

function hhmm(s: string | null | undefined) {
  if (!s) return null;
  // already HH:MM in DB, just sanitize
  const m = String(s).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = String(m[1]).padStart(2, '0');
  return `${hh}:${m[2]}`;
}

/** Build CSV-like availability rows from members/windows (for your preview table) */
function buildAvailabilityRowsFromDb(
  members: Array<{ name: string; job: string | null; position: string | null }>,
  windows: Array<{
    memberName: string;
    weekday: WdEnum;
    startHHMM: string | null;
    endHHMM: string | null;
  }>
) {
  const byName = new Map<string, any>();
  for (const m of members) {
    const row: any = {
      Name: m.name,
      Job: m.job ?? '',
      Position: m.position ?? '',
    };
    [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ].forEach((d) => (row[d] = ''));
    byName.set(m.name, row);
  }
  for (const w of windows) {
    const row = byName.get(w.memberName);
    if (!row) continue;
    if (w.startHHMM == null && w.endHHMM == null) continue; // off
    const day = ENUM_TO_DAY[w.weekday];
    const seg = `${w.startHHMM ?? '00:00'}-${w.endHHMM ?? '00:00'}`;
    row[day] = row[day] ? `${row[day]}, ${seg}` : seg;
  }
  return Array.from(byName.values());
}

/** Build CSV-like shift rows from templates (for your preview table) */
function buildShiftRowsFromDb(
  templates: Array<{
    shiftName: string;
    jobType: string | null;
    weekday: WdEnum;
    startHHMM: string;
    endHHMM: string;
    required?: number;
  }>
) {
  return templates.map((t) => ({
    Shift: t.shiftName,
    Job_Type: t.jobType ?? '',
    Day: ENUM_TO_DAY[t.weekday],
    Start_Time: t.startHHMM,
    End_Time: t.endHHMM,
    Required: t.required ?? 1,
  }));
}

/* ----------------------------------- GET ---------------------------------- */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const teamId = Number(id);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
    }

    // Ensure the team exists and belongs to the auth user
    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: {
        id: true,
        name: true,
        members: {
          select: {
            id: true,
            name: true,
            job: true,
            position: true,
            availability: {
              select: { dayOfWeek: true, startTime: true, endTime: true },
              orderBy: [{ dayOfWeek: 'asc' }, { id: 'asc' }],
            },
          },
          orderBy: { id: 'asc' },
        },
        shiftTemplates: {
          select: {
            shift: true,
            jobType: true,
            day: true, // stored as text like "Monday" OR you used int; adjust below if needed
            startTime: true,
            endTime: true,
            required: true,
          },
          orderBy: [{ id: 'asc' }],
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    /* -------- normalize DB -> payload your UI expects (two shapes) -------- */
    // 1) canonical shape (members/windows/templates)
    const members = team.members.map((m) => ({
      id: m.id,
      name: m.name,
      job: m.job,
      position: m.position,
    }));

    const windows = team.members.flatMap((m) =>
      m.availability.map((a) => ({
        memberName: m.name,
        weekday: INT_TO_ENUM[(a.dayOfWeek ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6], // DB stores 0-6
        startHHMM: hhmm(a.startTime),
        endHHMM: hhmm(a.endTime),
      }))
    );

    // Shift weekday normalization:
    // If your schema saved day as string ('Monday'...), map it to enum; if you saved int, change this accordingly
    function dayStringToEnum(d: string): WdEnum {
      const s = d?.toLowerCase?.() ?? '';
      if (s.startsWith('mon')) return 'MON';
      if (s.startsWith('tue')) return 'TUE';
      if (s.startsWith('wed')) return 'WED';
      if (s.startsWith('thu')) return 'THU';
      if (s.startsWith('fri')) return 'FRI';
      if (s.startsWith('sat')) return 'SAT';
      if (s.startsWith('sun')) return 'SUN';
      return 'MON';
    }

    const templates = team.shiftTemplates.map((t) => ({
      shiftName: t.shift,
      jobType: t.jobType,
      weekday: dayStringToEnum(t.day),
      startHHMM: hhmm(t.startTime) ?? t.startTime,
      endHHMM: hhmm(t.endTime) ?? t.endTime,
      required: t.required ?? 1,
    }));

    // 2) table-ready (CSV-like) shape for your current UI
    const availabilityRows = buildAvailabilityRowsFromDb(members, windows);
    const shiftRows = buildShiftRowsFromDb(templates);

    return NextResponse.json({
      team: { id: team.id, name: team.name },
      // canonical (preferred for programmatic use)
      members,
      windows,
      templates,
      // table-ready (for your UploadData preview without extra transforms)
      availabilityRows,
      shiftRows,
    });
  } catch (err: any) {
    console.error('GET /api/teams/[id]/data error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
