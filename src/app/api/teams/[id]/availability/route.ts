import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { loadAvailability } from "@/app/lib/scheduler/loadAvailability";

/* ------------------------------- auth helper ------------------------------ */
async function requireUser(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
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
  "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT",
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

const DAYNAME_TO_INT: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function toHHMM12hTo24h(hhmmAmpm: string): string {
  // Accepts "5:30 AM", "12:00 PM", etc.
  const s = (hhmmAmpm || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return s; // if already "HH:MM", just return as-is

  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3].toUpperCase();

  if (ap === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  const hh = String(h).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ----------------------------------- GET ---------------------------------- */
// Returns saved availability for this team (for your read-only UI panel)
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const teamId = Number(id);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: "bad team id" }, { status: 400 });
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const members = await prisma.teamMember.findMany({
      where: { teamId },
      select: { id: true, name: true, job: true, position: true },
      orderBy: { name: "asc" },
    });

    const memberIds = members.map((m) => m.id);

    const windows = await prisma.availabilityWindow.findMany({
      where: { memberId: { in: memberIds } },
      select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
      orderBy: [{ memberId: "asc" }, { dayOfWeek: "asc" }],
    });

    return NextResponse.json({ members, windows });
  } catch (err) {
    console.error("GET /teams/[id]/availability error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------------- POST --------------------------------- */
// Saves availability. Supports:
// 1) your existing body format (members/windows)
// 2) CSV import mode: { source: "csv" }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params; // ✅ Next.js 15 fix
    const teamId = Number(id);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: "bad team id" }, { status: 400 });
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({} as any));

    // ------------------------- CSV IMPORT MODE -------------------------
    if (body?.source === "csv") {
      const employees = loadAvailability();

      // wipe old
      await prisma.availabilityWindow.deleteMany({ where: { member: { teamId } } });
      await prisma.teamMember.deleteMany({ where: { teamId } });

      const createdMembers = await prisma.$transaction(
        employees.map((e) =>
          prisma.teamMember.create({
            data: {
              teamId,
              name: e.name,
              job: e.position ?? null,
              position: e.position ?? null,
            },
            select: { id: true, name: true },
          })
        )
      );

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

          if (rule.type === "unavailable") continue;

          if (rule.type === "all_day") {
            winData.push({
              memberId,
              dayOfWeek,
              startTime: "00:00",
              endTime: "23:59",
            });
          } else if (rule.type === "partial") {
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
        source: "csv",
        members: createdMembers.length,
        windows: winData.length,
      });
    }

    // --------------------- EXISTING BODY FORMAT MODE ---------------------
    const members = (body?.members ?? []) as Array<{
      name: string;
      job?: string | null;
      position?: string | null;
    }>;
    const windows = (body?.windows ?? []) as Array<{
      memberName: string;
      weekday: "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
      startHHMM: string | null;
      endHHMM: string | null;
    }>;

    if (!Array.isArray(members) || members.length === 0) {
      return NextResponse.json({ error: "No members" }, { status: 400 });
    }

    await prisma.availabilityWindow.deleteMany({ where: { member: { teamId } } });
    await prisma.teamMember.deleteMany({ where: { teamId } });

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

    const winData = windows
      .filter(
        (w) =>
          idByName.has(w.memberName) &&
          (w.startHHMM !== null || w.endHHMM !== null)
      )
      .map((w) => ({
        memberId: idByName.get(w.memberName)!,
        dayOfWeek: ENUM_TO_INT[w.weekday],
        startTime: w.startHHMM ?? "00:00",
        endTime: w.endHHMM ?? "00:00",
      }));

    if (winData.length) {
      await prisma.availabilityWindow.createMany({ data: winData });
    }

    return NextResponse.json({
      ok: true,
      source: "body",
      members: createdMembers.length,
      windows: winData.length,
    });
  } catch (err) {
    console.error("POST /teams/[id]/availability error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}