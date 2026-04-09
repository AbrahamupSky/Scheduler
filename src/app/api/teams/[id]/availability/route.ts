import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { loadAvailability } from '@/app/lib/scheduler/loadAvailability';
import {
  parseCapsFromText,
  normalizeRoleName,
} from '@/app/lib/scheduler/roleUtils';

/* ------------------------------- auth helper ------------------------------ */
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

/* ------------------------------ day utilities ----------------------------- */
const DAYNAME_TO_INT: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const SHORT_TO_INT: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const LONG_TO_INT: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function parseWeekdayToInt(weekday: string): number | null {
  const w = (weekday || '').trim();
  if (!w) return null;

  const upper = w.toUpperCase();

  if (upper in SHORT_TO_INT) return SHORT_TO_INT[upper];
  if (upper in LONG_TO_INT) return LONG_TO_INT[upper];

  // also accept "Monday", "Tuesday", etc
  const cap = w[0]?.toUpperCase() + w.slice(1).toLowerCase();
  if (cap in DAYNAME_TO_INT) return DAYNAME_TO_INT[cap];

  return null;
}

function toHHMM12hTo24h(value: string): string {
  const s = (value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return s; // already "HH:MM"

  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3].toUpperCase();

  if (ap === 'AM') {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/* ----------------------------------- GET ---------------------------------- */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const teamId = Number(id);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'bad team id' }, { status: 400 });
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const members = await prisma.teamMember.findMany({
      where: { teamId },
      select: {
        id: true,
        name: true,
        job: true,
        position: true,
        leadership: true,
        minHoursWeek: true,
        maxHoursWeek: true,
        minDaysWeek: true,
        maxDaysWeek: true,
        notes: true,
      },
      orderBy: { name: 'asc' },
    });

    const memberIds = members.map((m) => m.id);

    const windows = await prisma.availabilityWindow.findMany({
      where: { memberId: { in: memberIds } },
      select: {
        memberId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
      },
      orderBy: [{ memberId: 'asc' }, { dayOfWeek: 'asc' }],
    });

    return NextResponse.json({ members, windows });
  } catch (err) {
    console.error('GET /teams/[id]/availability error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/* ----------------------------------- POST --------------------------------- */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const teamId = Number(id);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'bad team id' }, { status: 400 });
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}) as any);
    const mode = body?.mode === 'update_week' ? 'update_week' : 'replace_all';

    // Decide mode:
    // - explicit { source: "csv" }
    // - OR fallback if windows are missing/empty
    const membersBody = Array.isArray(body?.members) ? body.members : [];
    const windowsBody = Array.isArray(body?.windows) ? body.windows : [];

    const windowsHaveAnyTimes = windowsBody.some(
      (w: any) => w?.startHHMM != null || w?.endHHMM != null,
    );

    const useCsv = body?.source === 'csv' || !windowsHaveAnyTimes;

    // Always wipe windows (weekly availability refresh)
    await prisma.availabilityWindow.deleteMany({
      where: { member: { teamId } },
    });

    // Only wipe members if doing a full replace
    if (mode === 'replace_all') {
      await prisma.teamMember.deleteMany({ where: { teamId } });
    }

    if (useCsv) {
      const employees = loadAvailability();
      console.log('CSV employees[0] sample:', employees?.[0]);

      // Build unique roles needed from this CSV
      const roleNames = Array.from(
        new Set(
          employees.map((e) => normalizeRoleName(e.position) || 'Unassigned'),
        ),
      );

      // Create or fetch roles
      const roles = await prisma.$transaction(
        roleNames.map((name) =>
          prisma.role.upsert({
            where: { teamId_name: { teamId, name } }, // uses @@unique([teamId, name])
            update: {},
            create: { teamId, name },
            select: { id: true, name: true },
          }),
        ),
      );

      const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));

      // Ensure role capabilities exist
      for (const r of roles) {
        const sampleEmployee = employees.find(
          (e) => (normalizeRoleName(e.position) || 'Unassigned') === r.name,
        );

        const caps = parseCapsFromText(sampleEmployee?.position);

        if (caps.length) {
          // Replace caps for this role (portable: no skipDuplicates)
          await prisma.roleCapability.deleteMany({ where: { roleId: r.id } });

          await prisma.roleCapability.createMany({
            data: caps.map((code) => ({ roleId: r.id, code })),
          });
        }
      }

      // Now create members with roleId
      const createdMembers = await prisma.$transaction(
        employees.map((e) => {
          const roleName = normalizeRoleName(e.position) || 'Unassigned';
          const roleId = roleIdByName.get(roleName) ?? null;

          return prisma.teamMember.upsert({
            where: { teamId_name: { teamId, name: e.name } }, // uses @@unique
            update: {
              job: e.position ?? null,
              position: e.position ?? null,

              ranking: e.ranking ?? null,
              leadership: e.leadership ?? null,
              minHoursWeek: e.minHoursWeek ?? null,
              maxHoursWeek: e.maxHoursWeek ?? null,
              minDaysWeek: e.minDaysWeek ?? null,
              maxDaysWeek: e.maxDaysWeek ?? null,
              notes: (e as any).notes ?? null,

              // only update roleId if you want it to follow CSV:
              roleId,
            },
            create: {
              teamId,
              name: e.name,
              job: e.position ?? null,
              position: e.position ?? null,

              ranking: e.ranking ?? null,
              leadership: e.leadership ?? null,
              minHoursWeek: e.minHoursWeek ?? null,
              maxHoursWeek: e.maxHoursWeek ?? null,
              minDaysWeek: e.minDaysWeek ?? null,
              maxDaysWeek: e.maxDaysWeek ?? null,
              notes: (e as any).notes ?? null,

              roleId,
            },
            select: { id: true, name: true },
          });
        }),
      );

      const sample = await prisma.teamMember.findFirst({
        where: { teamId },
        select: {
          name: true,
          ranking: true,
          leadership: true,
          minHoursWeek: true,
          maxHoursWeek: true,
        },
      });
      console.log('DB saved sample:', sample);

      const idByName = new Map(createdMembers.map((m) => [m.name, m.id]));

      const winData: Array<{
        memberId: number;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
      }> = [];

      for (const e of employees) {
        const memberId = idByName.get(e.name);
        if (!memberId) continue;

        for (const [dayName, rule] of Object.entries(e.availability)) {
          const dayOfWeek = DAYNAME_TO_INT[dayName];
          if (dayOfWeek === undefined) continue;

          if (rule.type === 'unavailable') continue;

          if (rule.type === 'all_day') {
            winData.push({
              memberId,
              dayOfWeek,
              startTime: '00:00',
              endTime: '23:59',
            });
          } else if (rule.type === 'partial') {
            winData.push({
              memberId,
              dayOfWeek,
              startTime: toHHMM12hTo24h(rule.start),
              endTime: toHHMM12hTo24h(rule.end),
            });
          }
        }
      }

      if (winData.length) {
        await prisma.availabilityWindow.createMany({ data: winData });
      }

      return NextResponse.json({
        ok: true,
        source: body?.source === 'csv' ? 'csv' : 'csv-default',
        members: createdMembers.length,
        windows: winData.length,
      });
    }

    // BODY MODE (expects members + windows from client)
    if (!Array.isArray(membersBody) || membersBody.length === 0) {
      return NextResponse.json({ error: 'No members' }, { status: 400 });
    }

    const createdMembers = await prisma.$transaction(
      membersBody.map((m: any) =>
        prisma.teamMember.create({
          data: {
            teamId,
            name: m.name,
            job: m.position ?? null,
            position: m.position ?? null,

            ranking: m.ranking ?? null,
            leadership: m.leadership ?? null,
            minHoursWeek: m.minHoursWeek ?? null,
            maxHoursWeek: m.maxHoursWeek ?? null,
            minDaysWeek: m.minDaysWeek ?? null,
            maxDaysWeek: m.maxDaysWeek ?? null,
            notes: m.notes ?? null,

            roleId: m.roleId ?? null, // if you're assigning roles
          },
        }),
      ),
    );

    const idByName = new Map(createdMembers.map((m) => [m.name, m.id]));

    const winData = windowsBody
      .map((w: any) => {
        const memberId = idByName.get(String(w.memberName ?? '').trim());
        const dayOfWeek = parseWeekdayToInt(String(w.weekday ?? ''));
        if (!memberId || dayOfWeek == null) return null;

        const start = w.startHHMM ?? null;
        const end = w.endHHMM ?? null;
        if (start == null && end == null) return null;

        return {
          memberId,
          dayOfWeek,
          startTime: start ?? '00:00',
          endTime: end ?? '00:00',
        };
      })
      .filter(Boolean) as Array<{
      memberId: number;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }>;

    if (winData.length) {
      await prisma.availabilityWindow.createMany({ data: winData });
    }

    return NextResponse.json({
      ok: true,
      source: 'body',
      members: createdMembers.length,
      windows: winData.length,
    });
  } catch (err) {
    console.error('POST /teams/[id]/availability error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
