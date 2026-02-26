// app/api/teams/route.ts
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

// GET /api/teams  -> list teams owned by the user
export async function GET(req: NextRequest) {
  const user = await getUserFromAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teams = await prisma.team.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  return NextResponse.json(teams);
}

// POST /api/teams  -> create team
export async function POST(req: NextRequest) {
  const user = await getUserFromAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const team = await prisma.team.create({
      data: { name: name.trim(), ownerId: user.id },
      select: { id: true, name: true },
    });
    return NextResponse.json(team, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const existing = await prisma.team.findFirst({
        where: { ownerId: user.id, name: name.trim() },
        select: { id: true, name: true },
      });
      if (existing) return NextResponse.json(existing, { status: 200 });
    }
    console.error("POST /api/teams error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}