import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  return NextResponse.json({ ok: true });
}
