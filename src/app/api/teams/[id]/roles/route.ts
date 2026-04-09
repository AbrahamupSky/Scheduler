// src/app/api/teams/[id]/roles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

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

/* ------------------------------ small helpers ----------------------------- */
type CapabilityCode = "FOH" | "BOH" | "TRUCK" | "PREP";
const VALID_CAPS = new Set<CapabilityCode>(["FOH", "BOH", "TRUCK", "PREP"]);

function normalizeRoleName(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCaps(raw: unknown): CapabilityCode[] {
  if (!Array.isArray(raw)) return [];
  const out: CapabilityCode[] = [];
  for (const v of raw) {
    const c = String(v ?? "").toUpperCase() as CapabilityCode;
    if (VALID_CAPS.has(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

/* ----------------------------------- GET ---------------------------------- */
/**
 * GET /api/teams/:id/roles
 * Returns team roles + their capabilities.
 */
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

    const roles = await prisma.role.findMany({
      where: { teamId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        caps: { select: { code: true } }, // RoleCapability rows
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        caps: r.caps.map((c) => c.code),
      })),
    });
  } catch (err) {
    console.error("GET /teams/[id]/roles error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------------- POST --------------------------------- */
/**
 * POST /api/teams/:id/roles
 * Body:
 *  {
 *    "name": "FOH BOH Truck Prep",
 *    "caps": ["FOH","BOH","TRUCK","PREP"]
 *  }
 */
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
    const name = normalizeRoleName(body?.name);
    const caps = normalizeCaps(body?.caps);

    if (!name) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    }
    if (caps.length === 0) {
      return NextResponse.json(
        { error: "caps must include at least one of: FOH, BOH, TRUCK, PREP" },
        { status: 400 }
      );
    }

    // Enforce unique (teamId, name)
    const existing = await prisma.role.findFirst({
      where: { teamId, name },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Role already exists", roleId: existing.id },
        { status: 409 }
      );
    }

    const created = await prisma.role.create({
      data: { teamId, name },
      select: { id: true, name: true, createdAt: true },
    });

    await prisma.roleCapability.createMany({
      data: caps.map((code) => ({ roleId: created.id, code })) as any,
    });

    return NextResponse.json({
      ok: true,
      role: { ...created, caps },
    });
  } catch (err) {
    console.error("POST /teams/[id]/roles error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}