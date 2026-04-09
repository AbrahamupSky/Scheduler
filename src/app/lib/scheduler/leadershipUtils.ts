export type LeadLane = 'FOH' | 'BOH';

function toUpper(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase();
}

export function isShiftLeaderName(shiftName: string | null | undefined): boolean {
  const s = toUpper(shiftName);
  return s.includes('SHIFT LEADER');
}

export function laneFromJobType(jobType: string | null | undefined): LeadLane | null {
  const s = toUpper(jobType);
  if (s === 'FOH') return 'FOH';
  if (s === 'BOH') return 'BOH';
  if (s.includes('FRONT')) return 'FOH';
  if (s.includes('BACK') || s.includes('KITCHEN')) return 'BOH';
  return null;
}

function hasAnyLeadershipTag(raw: string | null | undefined): boolean {
  const s = toUpper(raw);
  return (
    s.includes('BOH TL') ||
    s.includes('FOH TL') ||
    s.includes('BOH DIR') ||
    s.includes('FOH DIR') ||
    s.includes('BOH FOH DIR')
  );
}

export function canLeadLane(
  leadership: string | null | undefined,
  lane: LeadLane | null,
): boolean {
  const s = toUpper(leadership);
  if (!s) return false;

  const bothSidesDirector = s.includes('BOH FOH DIR');
  if (bothSidesDirector) return true;

  if (lane === 'BOH') {
    return s.includes('BOH TL') || s.includes('BOH DIR');
  }
  if (lane === 'FOH') {
    return s.includes('FOH TL') || s.includes('FOH DIR');
  }

  // If lane is unknown for a shift leader row, allow any known leadership tag.
  return hasAnyLeadershipTag(s);
}
