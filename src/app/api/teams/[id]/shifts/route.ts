import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { loadShiftTemplates } from "@/app/lib/scheduler/loadShiftTemplates";

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

function toHHMM12hTo24h(value: string): string {
  const s = (value || "").trim();
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

  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/* ----------------------------------- GET ---------------------------------- */
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
      select: {
        id: true,
        shift: true,
        jobType: true,
        day: true,
        startTime: true,
        endTime: true,
        required: true,
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({ templates });
  } catch (err) {
    console.error("GET /teams/[id]/shifts error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------------- POST --------------------------------- */
export async function POST(
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

    const body = await req.json().catch(() => ({} as any));
    const templatesBody = Array.isArray(body?.templates) ? body.templates : [];

    const useCsv = body?.source === "csv" || templatesBody.length === 0;

    await prisma.shiftTemplate.deleteMany({ where: { teamId } });

    // CSV mode
    if (useCsv) {
      const shifts = loadShiftTemplates();

      const data = shifts.map((t) => ({
        teamId,
        shift: t.role,
        jobType: 'General' as const,
        day: t.day,
        startTime: toHHMM12hTo24h(t.start),
        endTime: toHHMM12hTo24h(t.end),
        required: 1,
      }));

      if (data.length) {
        await prisma.shiftTemplate.createMany({ data });
      }

      return NextResponse.json({
        ok: true,
        source: body?.source === "csv" ? "csv" : "csv-default",
        templates: data.length,
      });
    }

    // Body mode
    const data = templatesBody.map((t: any) => ({
      teamId,
      shift: t.shiftName,
      jobType: (t.jobType ?? "General"),
      day: ENUM_TO_DAY[t.weekday],
      startTime: t.startHHMM,
      endTime: t.endHHMM,
      required: t.required ?? 1,
    }));

    await prisma.shiftTemplate.createMany({ data });

    return NextResponse.json({ ok: true, source: "body", templates: data.length });
  } catch (err) {
    console.error("POST /teams/[id]/shifts error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}