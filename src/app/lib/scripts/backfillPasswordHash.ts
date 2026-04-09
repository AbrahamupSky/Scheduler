import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
await prisma.user.updateMany({
  where: { passwordHash: { equals: undefined } } as any,
  data: { passwordHash: 'TEMP_HASH_NEEDS_RESET' },
});
console.log('Backfilled passwordHash for users with null values.');