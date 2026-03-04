import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { loadShiftTemplates } from "@/app/lib/scheduler/loadShiftTemplates";
import { loadAvailability } from "@/app/lib/scheduler/loadAvailability";

/* -------------------------- auth helper (Bearer) -------------------------- */
async function getUserFromAuth(req: NextRequest) {
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

/* ----------------------------------- GET ---------------------------------- */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const scheduleId = Number(id);

    if (!Number.isFinite(scheduleId)) {
      return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 });
    }

    // Load schedule AND ensure it belongs to this user (through team.ownerId)
    const schedule = await prisma.savedSchedule.findFirst({
      where: {
        id: scheduleId,
        team: { ownerId: user.id },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        optimization: true,
        createdAt: true,
        data: true,
        team: { select: { id: true, name: true } },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Keep what your UI expects
    const shiftTemplates = loadShiftTemplates();
    const availability = loadAvailability();

    return NextResponse.json({
      schedule: {
        ...schedule,
        data: schedule.data,
      },
      shiftTemplates,
      availability,
    });
  } catch (err) {
    console.error("GET /api/schedules/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------------------------- PATCH --------------------------------- */
/**
 * Save edits to an existing schedule.
 * Expects body: { data: <GeneratedSchedule JSON>, name?: string }
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const scheduleId = Number(id);

    if (!Number.isFinite(scheduleId)) {
      return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const data = body?.data;
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;

    if (!data) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // Ensure schedule belongs to this user
    const existing = await prisma.savedSchedule.findFirst({
      where: { id: scheduleId, team: { ownerId: user.id } },
      select: { id: true },
    });

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.savedSchedule.update({
      where: { id: scheduleId },
      data: {
        ...(name ? { name } : {}),
        data: data as any,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: updated.id });
  } catch (err) {
    console.error("PATCH /api/schedules/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------------- PUT ---------------------------------- */
/** Support PUT if your frontend uses it */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PATCH(req, ctx);
}