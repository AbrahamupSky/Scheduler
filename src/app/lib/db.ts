// src/lib/db.ts
import { prisma } from './prisma';
import { OptimizationPriority, Weekday, EventType } from '@prisma/client';

// ---- AUTH ----
export async function createUser(
  username: string,
  email: string,
  hashedPassword: string
) {
  return prisma.user.create({
    data: { username, email, password: hashedPassword },
  });
}

export async function createSession(
  userId: number,
  token: string,
  ttlHours = 72
) {
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
  return prisma.session.create({ data: { userId, token, expiresAt } });
}

export async function validateSession(token: string) {
  const s = await prisma.session.findUnique({ where: { token } });
  return !!s && s.expiresAt > new Date();
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { token } });
}

// ---- TEAMS ----
export async function upsertTeamWithMembers(
  ownerId: number,
  teamName: string,
  members: Array<{
    name: string;
    job?: string | null;
    position?: string | null;
  }>
) {
  const team = await prisma.team.upsert({
    where: { name_ownerId: { name: teamName, ownerId } },
    create: { name: teamName, ownerId },
    update: {},
  });

  for (const m of members) {
    await prisma.teamMember.upsert({
      where: { teamId_name: { teamId: team.id, name: m.name } },
      create: {
        teamId: team.id,
        name: m.name,
        job: m.job ?? null,
        position: m.position ?? null,
      },
      update: { job: m.job ?? null, position: m.position ?? null },
    });
  }
  return team;
}

// ---- AVAILABILITY ----
export async function setMemberAvailability(
  teamId: number,
  memberName: string,
  windows: Array<{
    weekday: Weekday;
    startHHMM?: string | null;
    endHHMM?: string | null;
  }>
) {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_name: { teamId, name: memberName } },
  });
  if (!member) throw new Error('member not found');

  await prisma.availabilityWindow.deleteMany({
    where: { memberId: member.id },
  });
  await prisma.availabilityWindow.createMany({
    data: windows.map((w) => ({
      memberId: member.id,
      weekday: w.weekday,
      startHHMM: w.startHHMM ?? null,
      endHHMM: w.endHHMM ?? null,
    })),
  });
}

// ---- SHIFT TEMPLATES ----
export async function replaceShiftTemplates(
  teamId: number,
  templates: Array<{
    shiftName: string;
    jobType?: string | null;
    weekday: Weekday;
    startHHMM: string;
    endHHMM: string;
  }>
) {
  await prisma.shiftTemplate.deleteMany({ where: { teamId } });
  await prisma.shiftTemplate.createMany({
    data: templates.map((t) => ({ ...t, teamId })),
  });
}

// ---- EVENTS ----
export async function addIrregularEvents(
  teamId: number,
  events: Array<{
    person: string;
    type: EventType;
    dateISO: string;
    startHHMM: string;
    endHHMM: string;
    description?: string;
    groupType?: string | null;
    groupIdentifier?: string | null;
    ignoreRules?: boolean;
  }>
) {
  await prisma.irregularEvent.createMany({
    data: events.map((e) => ({
      teamId,
      person: e.person,
      type: e.type,
      date: new Date(e.dateISO),
      startHHMM: e.startHHMM,
      endHHMM: e.endHHMM,
      description: e.description ?? null,
      groupType: e.groupType ?? null,
      groupIdentifier: e.groupIdentifier ?? null,
      ignoreRules: e.ignoreRules ?? true,
    })),
  });
}

export async function deletePastIrregularEvents(teamId: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const res = await prisma.irregularEvent.deleteMany({
    where: { teamId, date: { lt: today } },
  });
  return res.count;
}

// ---- SCHEDULES ----
export async function saveSchedule(
  teamId: number,
  args: {
    name: string;
    startDateISO: string;
    endDateISO: string;
    optimization: OptimizationPriority;
    allowOvertime: boolean;
    data: any;
  }
) {
  return prisma.savedSchedule.create({
    data: {
      teamId,
      name: args.name,
      startDate: new Date(args.startDateISO),
      endDate: new Date(args.endDateISO),
      optimization: args.optimization,
      allowOvertime: args.allowOvertime,
      data: args.data,
    },
  });
}

export async function loadSchedule(id: number) {
  return prisma.savedSchedule.findUnique({ where: { id } });
}

export async function listSchedules(teamId: number) {
  return prisma.savedSchedule.findMany({
    where: { teamId },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      optimization: true,
    },
  });
}

// ---- RULES ----
export async function setSchedulingRules(teamId: number, rulesJson: any) {
  return prisma.schedulingRules.upsert({
    where: { teamId },
    create: { teamId, rules: rulesJson },
    update: { rules: rulesJson },
  });
}
