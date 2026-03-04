import { prisma } from './prisma';

export async function requireUserFromAuthHeader(req: Request) {
  const auth =
    req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length).trim();
  if (!token) return null;

  const session = await prisma.session.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
    select: {
      userId: true,
      user: { select: { id: true, username: true, email: true } },
    },
  });
  return session?.user ?? null;
}
