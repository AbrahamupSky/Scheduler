// src/app/api/auth/signup/route.ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/app/lib/prisma';

export async function POST(req: Request) {
  try {
    const { username, email, password } = await req.json();

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Username or email already in use.' },
        { status: 409 }
      );
    }

    // Hash and create
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash, // ✅ correct field name & value
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Signup failed' },
      { status: 500 }
    );
  }
}
