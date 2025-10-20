// src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/app/lib/prisma';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { usernameOrEmail, password } = await req.json();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      },
      select: { id: true, username: true, email: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Create a simple session (replace with JWT if you prefer)
    const token = crypto.randomBytes(24).toString('hex');
    // 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    await prisma.session.create({
      data: { userId: user.id, token, expiresAt },
    });

    return NextResponse.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Login failed' },
      { status: 500 }
    );
  }
}
