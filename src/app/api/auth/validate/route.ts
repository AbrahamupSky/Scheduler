import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ valid: false });

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    return NextResponse.json({ valid: false });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, email: true },
  });

  return NextResponse.json({ valid: true, user });
}
