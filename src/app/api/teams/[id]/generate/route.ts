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

/* ------------------------------ Types / Rules ----------------------------- */
type WdEnum = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

type RuleValue = number | boolean;
type RuleType = 'int' | 'float' | 'bool';
type Rule = {
  name: string;
  description: string;
  type: RuleType;
  value: RuleValue;
  enabled: boolean;
  category: 'Daily' | 'Time' | 'Workload' | 'Advanced' | 'Custom';
};

type RulesMap = Record<string, Rule>;

function defaultRulesV1(): Rule[] {
  return [
    {
      name: 'max_shifts_per_day',
      description: '',
      type: 'int',
      value: 2,
      enabled: true,
      category: 'Daily',
    },
    {
      name: 'max_hours_per_day',
      description: '',
      type: 'int',
      value: 10,
      enabled: true,
      category: 'Daily',
    },
    {
      name: 'min_hours_between_shifts',
      description: '',
      type: 'int',
      value: 12,
      enabled: true,
      category: 'Time',
    },
    {
      name: 'enforce_availability_strict',
      description: '',
      type: 'bool',
      value: true,
      enabled: true,
      category: 'Time',
    },
    {
      name: 'max_weekly_hours',
      description: '',
      type: 'int',
      value: 40,
      enabled: true,
      category: 'Workload',
    },
    {
      name: 'balance_workload',
      description: '',
      type: 'bool',
      value: true,
      enabled: true,
      category: 'Workload',
    },
  ];
}

function rulesToMap(rules: Rule[]): RulesMap {
  const out: RulesMap = {};
  for (const r of rules) out[r.name] = r;
  return out;
}

function ruleNum(rules: RulesMap, name: string, fallback: number) {
  const r = rules[name];
  if (!r || !r.enabled) return fallback;
  const n = Number(r.value);
  return Number.isFinite(n) ? n : fallback;
}
function ruleBool(rules: RulesMap, name: string, fallback: boolean) {
  const r = rules[name];
  if (!r || !r.enabled) return fallback;
  return Boolean(r.value);
}

/* ------------------------------ Date / Time ------------------------------ */
const INT_TO_ENUM: WdEnum[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseHHMMtoMin(hhmm: string) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (
    !Number.isFinite(hh) ||
    !Number.isFinite(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  )
    return null;
  return hh * 60 + mm;
}

function minutesToHours(min: number) {
  return min / 60;
}

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function enumerateDates(startYMD: string, endYMD: string) {
  const start = new Date(`${startYMD}T00:00:00`);
  const end = new Date(`${endYMD}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  if (start > end) return [];
  const out: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dayStringToEnum(d: string): WdEnum | null {
  const s = (d ?? '').toLowerCase();
  if (s.startsWith('mon')) return 'MON';
  if (s.startsWith('tue')) return 'TUE';
  if (s.startsWith('wed')) return 'WED';
  if (s.startsWith('thu')) return 'THU';
  if (s.startsWith('fri')) return 'FRI';
  if (s.startsWith('sat')) return 'SAT';
  if (s.startsWith('sun')) return 'SUN';
  return null;
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  return aStart < bEnd && bStart < aEnd;
}

/* -------------------------- Generator core types -------------------------- */
// capability codes (match your Prisma enum)
type CapCode = 'FOH' | 'BOH' | 'TRUCK' | 'PREP';

type MemberDb = {
  id: number;
  name: string;
  job: string | null;
  position: string | null;
  availability: { dayOfWeek: number; startTime: string; endTime: string }[];
  role: { id: number; name: string; caps: { code: CapCode }[] } | null;
};

type ShiftTemplateDb = {
  id: number;
  shift: string;
  jobType: any; // can be CapCode (enum) OR string in your current DB
  day: string;
  startTime: string;
  endTime: string;
  required: number;
};

type IrregularEventDb = {
  id: number;
  title: string;
  date: Date;
  startTime: string;
  endTime: string;
  jobType: any; // can be CapCode? or string?
};

type ShiftInstance = {
  shiftId: string;
  date: string;
  weekday: WdEnum;
  shiftName: string;
  jobType: CapCode; // normalized
  startHHMM: string;
  endHHMM: string;
  startMin: number;
  endMin: number;
  required: number;
  assigned: number[];
  unfilled: number;
  blocked: boolean;
  blockedReason?: string;
};

type GeneratedSchedule = {
  teamId: number;
  startDate: string;
  endDate: string;
  shifts: Array<{
    shiftId: string;
    date: string;
    weekday: WdEnum;
    shiftName: string;
    jobType: CapCode;
    startHHMM: string;
    endHHMM: string;
    required: number;
    assigned: Array<{ memberId: number; name: string }>;
    unfilled: number;
  }>;
  stats: {
    hoursByMember: Record<string, number>;
    shiftsByMember: Record<string, number>;
    unfilledShifts: number;
    totalUnfilledSlots: number;
  };
  notes: string[];
};

/* -------------------- Normalize jobType to CapabilityCode ------------------ */
function toCapCode(x: unknown): CapCode | null {
  const s = String(x ?? '')
    .trim()
    .toUpperCase();

  // accept common human strings too
  if (s === 'TRUCK' || s === 'DELIVERY') return 'TRUCK';
  if (s === 'PREP') return 'PREP';
  if (s === 'FOH' || s === 'FRONT' || s === 'FRONT OF HOUSE') return 'FOH';
  if (s === 'BOH' || s === 'BACK' || s === 'BACK OF HOUSE') return 'BOH';

  return null;
}

/* ----------------------------- Build instances ---------------------------- */
function buildShiftInstances(
  templates: ShiftTemplateDb[],
  startYMD: string,
  endYMD: string,
  irregular: IrregularEventDb[],
): { instances: ShiftInstance[]; notes: string[] } {
  const notes: string[] = [];
  const dates = enumerateDates(startYMD, endYMD);

  const irregularByDate = new Map<string, IrregularEventDb[]>();
  for (const ev of irregular) {
    const ymd = toYMD(new Date(ev.date));
    const arr = irregularByDate.get(ymd) ?? [];
    arr.push(ev);
    irregularByDate.set(ymd, arr);
  }

  const instances: ShiftInstance[] = [];

  for (const d of dates) {
    const weekday: WdEnum = INT_TO_ENUM[d.getDay()];
    const ymd = toYMD(d);

    for (const t of templates) {
      const tWd = dayStringToEnum(t.day);
      if (!tWd || tWd !== weekday) continue;

      const cap = toCapCode(t.jobType);
      if (!cap) {
        notes.push(
          `Template "${t.shift}" has unknown jobType "${String(t.jobType)}". Skipped.`,
        );
        continue;
      }

      const sMin = parseHHMMtoMin(t.startTime);
      const eMin = parseHHMMtoMin(t.endTime);
      if (sMin == null || eMin == null || eMin <= sMin) {
        notes.push(
          `Template "${t.shift}" has invalid time (${t.startTime}-${t.endTime}). Skipped.`,
        );
        continue;
      }

      const evs = irregularByDate.get(ymd) ?? [];
      let blocked = false;
      let blockedReason: string | undefined;

      for (const ev of evs) {
        const evStart = parseHHMMtoMin(ev.startTime);
        const evEnd = parseHHMMtoMin(ev.endTime);
        if (evStart == null || evEnd == null) continue;

        const evCap = ev.jobType == null ? null : toCapCode(ev.jobType);
        const jobMatch = evCap == null || evCap === cap;

        if (jobMatch && rangesOverlap(sMin, eMin, evStart, evEnd)) {
          blocked = true;
          blockedReason = `Blackout: "${ev.title}" ${ev.startTime}-${ev.endTime}`;
          break;
        }
      }

      const shiftId = `${ymd}_${weekday}_${t.shift}_${t.startTime}_${t.endTime}_${cap}`;

      instances.push({
        shiftId,
        date: ymd,
        weekday,
        shiftName: t.shift,
        jobType: cap,
        startHHMM: t.startTime,
        endHHMM: t.endTime,
        startMin: sMin,
        endMin: eMin,
        required: blocked ? 0 : (t.required ?? 1),
        assigned: [],
        unfilled: blocked ? 0 : (t.required ?? 1),
        blocked,
        blockedReason,
      });
    }
  }

  instances.sort((a, b) =>
    a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date),
  );
  return { instances, notes };
}

/* ----------------------------- Eligibility checks ---------------------------- */
function availabilityCoversShiftStrict(member: MemberDb, shift: ShiftInstance) {
  const dayIdx = INT_TO_ENUM.indexOf(shift.weekday);
  const windows = member.availability.filter(
    (w) => (w.dayOfWeek ?? 0) === dayIdx,
  );

  for (const w of windows) {
    const s = parseHHMMtoMin(w.startTime);
    const e = parseHHMMtoMin(w.endTime);
    if (s == null || e == null) continue;
    if (s <= shift.startMin && e >= shift.endMin) return true;
  }
  return false;
}

function memberHasCapability(member: MemberDb, cap: CapCode) {
  const caps = member.role?.caps ?? [];
  return caps.some((c) => c.code === cap);
}

/* ----------------------------- Greedy fill (v1) ---------------------------- */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const teamId = Number(id);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const startDate = String(body?.startDate ?? '').trim();
    const endDate = String(body?.endDate ?? '').trim();
    const scheduleName = String(
      body?.scheduleName ?? `Schedule ${startDate} → ${endDate}`,
    ).trim();
    const optimization = String(body?.optimization ?? 'BALANCED_WORKLOAD');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required (YYYY-MM-DD).' },
        { status: 400 },
      );
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      include: {
        members: {
          include: {
            availability: true,
            role: { include: { caps: true } }, // ✅ critical
          },
        },
        shiftTemplates: true,
        irregularEvents: true,
        rules: true,
      },
    });

    if (!team)
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    const dbRules: Rule[] | null = null;
    const rulesMap = rulesToMap(defaultRulesV1());

    const strictAvailability = ruleBool(
      rulesMap,
      'enforce_availability_strict',
      true,
    );
    const maxShiftsPerDay = ruleNum(rulesMap, 'max_shifts_per_day', 2);
    const maxHoursPerDay = ruleNum(rulesMap, 'max_hours_per_day', 10);
    const maxWeeklyHours = ruleNum(rulesMap, 'max_weekly_hours', 40);
    const minHoursBetween = ruleNum(rulesMap, 'min_hours_between_shifts', 12);
    const balanceWorkload = ruleBool(rulesMap, 'balance_workload', true);

    const { instances, notes } = buildShiftInstances(
      team.shiftTemplates as any,
      startDate,
      endDate,
      team.irregularEvents as any,
    );

    const memberById = new Map<number, MemberDb>(
      (team.members as any).map((m: any) => [m.id, m]),
    );

    const hoursByMember: Record<number, number> = {};
    const shiftsByMember: Record<number, number> = {};

    const shiftsByMemberByDate = new Map<string, number>();
    const minutesByMemberByDate = new Map<string, number>();
    const lastShiftEndByMember = new Map<
      number,
      { date: string; endMin: number }
    >();

    const scheduleNotes: string[] = [...notes];

    function getKey(memberId: number, date: string) {
      return `${memberId}_${date}`;
    }

    function weekKey(ymd: string) {
      const d = new Date(`${ymd}T00:00:00`);
      const day = d.getDay();
      const diffToMon = (day + 6) % 7;
      d.setDate(d.getDate() - diffToMon);
      return toYMD(d);
    }
    const minutesByMemberByWeek = new Map<string, number>();

    function eligible(member: MemberDb, shift: ShiftInstance): boolean {
      if (shift.blocked || shift.required <= 0) return false;

      // ✅ capability check (THIS fixes “wrong job”)
      if (!memberHasCapability(member, shift.jobType)) return false;

      if (strictAvailability) {
        if (!availabilityCoversShiftStrict(member, shift)) return false;
      }

      const dayK = getKey(member.id, shift.date);
      const dayShiftCount = shiftsByMemberByDate.get(dayK) ?? 0;
      if (dayShiftCount >= maxShiftsPerDay) return false;

      const dayMinutes = minutesByMemberByDate.get(dayK) ?? 0;
      const shiftMinutes = shift.endMin - shift.startMin;
      if (minutesToHours(dayMinutes + shiftMinutes) > maxHoursPerDay)
        return false;

      const wk = weekKey(shift.date);
      const wkK = `${member.id}_${wk}`;
      const wkMinutes = minutesByMemberByWeek.get(wkK) ?? 0;
      if (minutesToHours(wkMinutes + shiftMinutes) > maxWeeklyHours)
        return false;

      const last = lastShiftEndByMember.get(member.id);
      if (last) {
        if (last.date === shift.date) {
          const gapMin = shift.startMin - last.endMin;
          if (gapMin < minHoursBetween * 60) return false;
        } else {
          const lastDt = new Date(`${last.date}T00:00:00`);
          const thisDt = new Date(`${shift.date}T00:00:00`);
          const lastEnd = new Date(lastDt);
          lastEnd.setMinutes(lastEnd.getMinutes() + last.endMin);

          const thisStart = new Date(thisDt);
          thisStart.setMinutes(thisStart.getMinutes() + shift.startMin);

          const gapMin = (thisStart.getTime() - lastEnd.getTime()) / 60000;
          if (gapMin < minHoursBetween * 60) return false;
        }
      }

      return true;
    }

    function score(member: MemberDb, shift: ShiftInstance): number {
      const dayK = getKey(member.id, shift.date);
      const dayMinutes = minutesByMemberByDate.get(dayK) ?? 0;
      const dayShifts = shiftsByMemberByDate.get(dayK) ?? 0;

      const wk = weekKey(shift.date);
      const wkK = `${member.id}_${wk}`;
      const wkMinutes = minutesByMemberByWeek.get(wkK) ?? 0;

      if (!balanceWorkload) {
        return dayShifts * 1000 + dayMinutes;
      }
      return wkMinutes * 2 + dayMinutes * 1.5 + dayShifts * 200;
    }

    for (const shift of instances) {
      if (shift.blocked) {
        scheduleNotes.push(
          `⛔ ${shift.date} ${shift.shiftName} blocked (${shift.blockedReason})`,
        );
        continue;
      }

      const candidates: MemberDb[] = [];
      for (const m of team.members as any as MemberDb[]) {
        if (eligible(m, shift)) candidates.push(m);
      }

      candidates.sort((a, b) => score(a, shift) - score(b, shift));

      const need = shift.required;
      for (const m of candidates) {
        if (shift.assigned.length >= need) break;

        if (!memberHasCapability(m, shift.jobType)) {
          scheduleNotes.push(
            `🚫 Blocked: ${m.name} lacks capability "${shift.jobType}" for ${shift.shiftName} on ${shift.date}`,
          );
          continue;
        }

        shift.assigned.push(m.id);
        const shiftMinutes = shift.endMin - shift.startMin;

        const dayK = getKey(m.id, shift.date);
        shiftsByMemberByDate.set(
          dayK,
          (shiftsByMemberByDate.get(dayK) ?? 0) + 1,
        );
        minutesByMemberByDate.set(
          dayK,
          (minutesByMemberByDate.get(dayK) ?? 0) + shiftMinutes,
        );

        const wk = weekKey(shift.date);
        const wkK = `${m.id}_${wk}`;
        minutesByMemberByWeek.set(
          wkK,
          (minutesByMemberByWeek.get(wkK) ?? 0) + shiftMinutes,
        );

        hoursByMember[m.id] =
          (hoursByMember[m.id] ?? 0) + minutesToHours(shiftMinutes);
        shiftsByMember[m.id] = (shiftsByMember[m.id] ?? 0) + 1;

        lastShiftEndByMember.set(m.id, {
          date: shift.date,
          endMin: shift.endMin,
        });
      }

      shift.unfilled = Math.max(0, shift.required - shift.assigned.length);
      if (shift.unfilled > 0) {
        scheduleNotes.push(
          `⚠️ Unfilled: ${shift.date} ${shift.shiftName} (${shift.startHHMM}-${shift.endHHMM}) needs ${shift.required}, assigned ${shift.assigned.length}`,
        );
      }
    }

    let totalUnfilledSlots = 0;
    let unfilledShifts = 0;

    const shiftsOut = instances.map((s) => {
      const assigned = s.assigned.map((id) => ({
        memberId: id,
        name: memberById.get(id)?.name ?? `#${id}`,
      }));
      if (s.unfilled > 0) {
        totalUnfilledSlots += s.unfilled;
        unfilledShifts += 1;
      }
      return {
        shiftId: s.shiftId,
        date: s.date,
        weekday: s.weekday,
        shiftName: s.shiftName,
        jobType: s.jobType,
        startHHMM: s.startHHMM,
        endHHMM: s.endHHMM,
        required: s.required,
        assigned,
        unfilled: s.unfilled,
      };
    });

    const hoursByMemberName: Record<string, number> = {};
    const shiftsByMemberName: Record<string, number> = {};
    for (const [idStr, hrs] of Object.entries(hoursByMember)) {
      const id = Number(idStr);
      const name = memberById.get(id)?.name ?? `#${id}`;
      hoursByMemberName[name] = Number(hrs.toFixed(2));
    }
    for (const [idStr, cnt] of Object.entries(shiftsByMember)) {
      const id = Number(idStr);
      const name = memberById.get(id)?.name ?? `#${id}`;
      shiftsByMemberName[name] = cnt;
    }

    const generated: GeneratedSchedule = {
      teamId,
      startDate,
      endDate,
      shifts: shiftsOut,
      stats: {
        hoursByMember: hoursByMemberName,
        shiftsByMember: shiftsByMemberName,
        unfilledShifts,
        totalUnfilledSlots,
      },
      notes: scheduleNotes,
    };

    const saved = await prisma.savedSchedule.create({
      data: {
        teamId,
        name: scheduleName,
        startDate: new Date(`${startDate}T00:00:00`),
        endDate: new Date(`${endDate}T00:00:00`),
        data: generated as any,
        optimization,
      },
      select: { id: true },
    });

    return NextResponse.json({
      schedule: generated,
      savedScheduleId: saved.id,
    });
  } catch (err: any) {
    console.error('POST /api/teams/[id]/generate error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
