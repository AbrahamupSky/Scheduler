// src/app/api/teams/[id]/roles/[roleId]/route.ts
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

/* ----------------------------------- PUT ---------------------------------- */
/**
 * PUT /api/teams/:id/roles/:roleId
 * Body can include:
 *  { "name": "...", "caps": ["FOH","BOH"] }
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; roleId: string }> }
) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, roleId } = await ctx.params;
    const teamId = Number(id);
    const rid = Number(roleId);

    if (!Number.isFinite(teamId) || !Number.isFinite(rid)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }

    // Ensure team belongs to user
    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Ensure role belongs to team
    const existingRole = await prisma.role.findFirst({
      where: { id: rid, teamId },
      select: { id: true, name: true },
    });
    if (!existingRole) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({} as any));
    const newNameRaw = body?.name;
    const capsRaw = body?.caps;

    const hasName = typeof newNameRaw !== "undefined";
    const hasCaps = typeof capsRaw !== "undefined";

    if (!hasName && !hasCaps) {
      return NextResponse.json(
        { error: "Provide at least one of: name, caps" },
        { status: 400 }
      );
    }

    const newName = hasName ? normalizeRoleName(newNameRaw) : null;
    const newCaps = hasCaps ? normalizeCaps(capsRaw) : null;

    if (hasName && !newName) {
      return NextResponse.json({ error: "Role name cannot be empty" }, { status: 400 });
    }
    if (hasCaps && (!newCaps || newCaps.length === 0)) {
      return NextResponse.json(
        { error: "caps must include at least one of: FOH, BOH, TRUCK, PREP" },
        { status: 400 }
      );
    }

    // If renaming, prevent duplicate name within team
    if (hasName && newName && newName !== existingRole.name) {
      const dup = await prisma.role.findFirst({
        where: { teamId, name: newName },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: "Role name already exists in this team" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id: rid },
        data: hasName && newName ? { name: newName } : {},
        select: { id: true, name: true, createdAt: true },
      });

      if (hasCaps && newCaps) {
        // Replace caps (simple + clean)
        await tx.roleCapability.deleteMany({ where: { roleId: rid } });
        await tx.roleCapability.createMany({
          data: newCaps.map((code) => ({ roleId: rid, code })),
        });
      }

      const caps = await tx.roleCapability.findMany({
        where: { roleId: rid },
        select: { code: true },
      });

      return {
        id: role.id,
        name: role.name,
        createdAt: role.createdAt,
        caps: caps.map((c) => c.code),
      };
    });

    return NextResponse.json({ ok: true, role: updated });
  } catch (err) {
    console.error("PUT /teams/[id]/roles/[roleId] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* --------------------------------- DELETE --------------------------------- */
/**
 * DELETE /api/teams/:id/roles/:roleId
 * Removes the role; members with that role become roleId=null (if you set onDelete:SetNull).
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; roleId: string }> }
) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, roleId } = await ctx.params;
    const teamId = Number(id);
    const rid = Number(roleId);

    if (!Number.isFinite(teamId) || !Number.isFinite(rid)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await prisma.role.findFirst({
      where: { id: rid, teamId },
      select: { id: true },
    });
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

    await prisma.role.delete({ where: { id: rid } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /teams/[id]/roles/[roleId] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}