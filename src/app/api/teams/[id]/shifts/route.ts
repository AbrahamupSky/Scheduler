import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { loadShiftTemplates } from "@/app/lib/scheduler/loadShiftTemplates";

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

const ENUM_TO_DAY: Record<
  "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT",
  string
> = {
  SUN: "Sunday",
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
};

function toHHMM12hTo24h(hhmmAmpm: string): string {
  const s = (hhmmAmpm || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return s;

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
// Returns saved shift templates for this team (for your read-only UI panel)
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

    const templates = await prisma.shiftTemplate.findMany({
      where: { teamId },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({ templates });
  } catch (err) {
    console.error("GET /teams/[id]/shifts error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------------- POST --------------------------------- */
// Saves shift templates. Supports:
// 1) your existing body format (templates)
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
      const shifts = loadShiftTemplates();

      await prisma.shiftTemplate.deleteMany({ where: { teamId } });

      const data = shifts.map((t) => ({
        teamId,
        shift: t.role,
        jobType: null,
        day: t.day,
        startTime: toHHMM12hTo24h(t.start),
        endTime: toHHMM12hTo24h(t.end),
        required: 1,
      }));

      if (data.length) {
        await prisma.shiftTemplate.createMany({ data });
      }

      return NextResponse.json({ ok: true, source: "csv", templates: data.length });
    }

    // --------------------- EXISTING BODY FORMAT MODE ---------------------
    const templates = (body?.templates ?? []) as Array<{
      shiftName: string;
      jobType?: string | null;
      weekday: "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
      startHHMM: string;
      endHHMM: string;
    }>;

    // ✅ If nothing provided, fall back to CSV import automatically
    if (!Array.isArray(templates) || templates.length === 0) {
      const shifts = loadShiftTemplates();

      await prisma.shiftTemplate.deleteMany({ where: { teamId } });

      const data = shifts.map((t) => ({
        teamId,
        shift: t.role,
        jobType: null,
        day: t.day,
        startTime: toHHMM12hTo24h(t.start),
        endTime: toHHMM12hTo24h(t.end),
        required: 1,
      }));

      if (data.length) {
        await prisma.shiftTemplate.createMany({ data });
      }

      return NextResponse.json({ ok: true, source: "csv-default", templates: data.length });
    }

    if (!Array.isArray(templates) || templates.length === 0) {
      return NextResponse.json({ error: "No templates" }, { status: 400 });
    }

    await prisma.shiftTemplate.deleteMany({ where: { teamId } });

    const data = templates.map((t) => ({
      teamId,
      shift: t.shiftName,
      jobType: t.jobType ?? null,
      day: ENUM_TO_DAY[t.weekday],
      startTime: t.startHHMM,
      endTime: t.endHHMM,
      required: 1,
    }));

    await prisma.shiftTemplate.createMany({ data });

    return NextResponse.json({ ok: true, source: "body", templates: data.length });
  } catch (err) {
    console.error("POST /teams/[id]/shifts error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}