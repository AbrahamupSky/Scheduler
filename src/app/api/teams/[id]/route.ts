import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/* ---------- auth helper ---------- */
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

/* ------------------------------- GET (load) ------------------------------ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const scheduleId = Number(id);
    if (!Number.isFinite(scheduleId)) {
      return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 });
    }

    // Make sure the schedule exists and belongs to a team owned by this user
    const sched = await prisma.savedSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        teamId: true,
        name: true,
        startDate: true,
        endDate: true,
        optimization: true,
        data: true,
        createdAt: true,
        team: { select: { ownerId: true } },
      },
    });

    if (!sched) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (sched.team.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      schedule: {
        id: sched.id,
        teamId: sched.teamId,
        name: sched.name,
        startDate: sched.startDate,
        endDate: sched.endDate,
        optimization: sched.optimization,
        data: sched.data,
        createdAt: sched.createdAt,
      },
    });
  } catch (err) {
    console.error("GET /api/schedules/[id] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ------------------------------ PATCH (save) ----------------------------- */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const scheduleId = Number(id);
    if (!Number.isFinite(scheduleId)) {
      return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const data = body?.data;
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;

    if (!data) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const existing = await prisma.savedSchedule.findUnique({
      where: { id: scheduleId },
      select: { id: true, team: { select: { ownerId: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.team.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
    console.error("PATCH /api/schedules/[id] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* Optional: support PUT if your frontend uses it */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return PATCH(req, ctx);
}