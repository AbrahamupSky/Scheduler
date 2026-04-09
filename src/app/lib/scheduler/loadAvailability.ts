import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

export type DailyAvailability =
  | { type: "unavailable" }
  | { type: "all_day" }
  | { type: "partial"; start: string; end: string };

export type EmployeeAvailability = {
  name: string;
  position: string;
  ranking?: number | null;
  leadership?: string | null;
  minHoursWeek?: number | null;
  maxHoursWeek?: number | null;
  minDaysWeek?: number | null;
  maxDaysWeek?: number | null;
  notes?: string | null;
  availability: Record<string, DailyAvailability>;
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function parseAvailability(value: string): DailyAvailability {
  if (!value) {
    return { type: "unavailable" };
  }

  const clean = value.trim();

  if (clean.includes("Unavailable")) {
    return { type: "unavailable" };
  }

  if (clean.includes("Available All Day")) {
    return { type: "all_day" };
  }

  if (clean.includes("Partially Available")) {
    // Handles both:
    // "Partially Available 5:00 AM - 5:00 PM"
    // "Partially Available5:00 AM - 5:00 PM"
    const timePart = clean
      .replace("Partially Available", "")
      .trim();

    const [start, end] = timePart.split(" - ");

    if (!start || !end) {
      return { type: "unavailable" };
    }

    return {
      type: "partial",
      start: start.trim(),
      end: end.trim(),
    };
  }

  return { type: "unavailable" };
}

export function loadAvailability(): EmployeeAvailability[] {
  const filePath = path.join(process.cwd(), "data", "Availability.csv");

  const fileContent = fs.readFileSync(filePath, "utf8");

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row: any) => {
    const availability: Record<string, DailyAvailability> = {};

    for (const day of DAYS) {
      availability[day] = parseAvailability(row[day]);
    }

    return {
      name: row["Name"]?.trim(),
      position: row["Position"]?.trim(),
      ranking: Number(row["Ranking"]) || 0,
      leadership: row["Leadership"]?.trim() || "",
      minHoursWeek: Number(row["Min hours per week"]) || 0,
      maxHoursWeek: Number(row["Max hours per week"]) || 0,
      minDaysWeek: Number(row["Min Days per week"]) || 0,
      maxDaysWeek: Number(row["Max Days per week"]) || 0,
      availability,
    };
  });
}