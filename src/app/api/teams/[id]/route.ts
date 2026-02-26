// app/api/teams/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUserFromAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = Number(params.id);
  if (!Number.isFinite(teamId)) {
    return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  }

  try {
    // Ensure the team belongs to the user
    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: user.id },
      select: { id: true },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Optional but common: delete children first if FK constraints exist.
    // Uncomment + adjust these names to match your Prisma models:
    //
    // await prisma.availabilityWindow.deleteMany({ where: { teamId } });
    // await prisma.shiftTemplate.deleteMany({ where: { teamId } });
    // await prisma.member.deleteMany({ where: { teamId } });

    await prisma.team.delete({ where: { id: teamId } });

    return NextResponse.json({ message: "Team deleted" });
  } catch (err: any) {
    console.error("DELETE /api/teams/[id] error", err);

    // Prisma FK constraint = P2003
    if (err?.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "Cannot delete team because it has related records (members/shifts/availability). Delete those first or enable cascade.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}