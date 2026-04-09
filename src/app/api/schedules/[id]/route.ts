import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { loadShiftTemplates } from "@/app/lib/scheduler/loadShiftTemplates";
import { loadAvailability } from "@/app/lib/scheduler/loadAvailability";
import {
  canLeadLane,
  isShiftLeaderName,
  laneFromJobType,
} from "@/app/lib/scheduler/leadershipUtils";

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

function isGeneratedScheduleLike(data: any): data is {
  shifts: Array<{
    shiftName?: string | null;
    jobType?: string | null;
    assigned?: Array<{ memberId?: number | null }>;
  }>;
} {
  return !!data && Array.isArray(data.shifts);
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
      select: { id: true, teamId: true },
    });

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (isGeneratedScheduleLike(data)) {
      const members = await prisma.teamMember.findMany({
        where: { teamId: existing.teamId },
        select: { id: true, leadership: true },
      });
      const leadershipByMemberId = new Map(
        members.map((m) => [m.id, m.leadership ?? null]),
      );

      for (const shift of data.shifts) {
        if (!isShiftLeaderName(shift?.shiftName)) continue;
        const lane = laneFromJobType(shift?.jobType ?? null);

        for (const assigned of shift?.assigned ?? []) {
          const memberId = Number(assigned?.memberId);
          if (!Number.isFinite(memberId)) continue;

          const leadership = leadershipByMemberId.get(memberId) ?? null;
          if (!canLeadLane(leadership, lane)) {
            return NextResponse.json(
              {
                error:
                  "Shift Leader assignments can only include BOH TL/Dir or FOH TL/Dir (or BOH FOH Dir for both).",
              },
              { status: 400 },
            );
          }
        }
      }
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
    console.error("PATCH /api/schedules/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------------- PUT ---------------------------------- */
/** Support PUT if your frontend uses it */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PATCH(req, ctx);
}
