import { NextResponse } from 'next/server';
import { listSchedules } from '@/lib/db';

export async function GET(
  _: Request,
  { params }: { params: { teamId: string } }
) {
  const teamId = Number(params.teamId);
  const schedules = await listSchedules(teamId);
  return NextResponse.json(schedules);
}
