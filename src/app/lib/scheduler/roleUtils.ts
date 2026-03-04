export type CapabilityCode = "FOH" | "BOH" | "TRUCK" | "PREP";

export function parseCapsFromText(raw: string | null | undefined): CapabilityCode[] {
  const s = (raw ?? "").toUpperCase();
  const found = new Set<CapabilityCode>();

  if (s.includes("FOH")) found.add("FOH");
  if (s.includes("BOH")) found.add("BOH");
  if (s.includes("TRUCK")) found.add("TRUCK");
  if (s.includes("PREP")) found.add("PREP");

  return Array.from(found);
}

/** Optional: normalize role names so duplicates don't happen from spacing */
export function normalizeRoleName(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\s+/g, " "); // collapse multiple spaces
}