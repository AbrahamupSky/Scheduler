import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

export type ShiftTemplate = {
  role: string;
  day: string;
  start: string;
  end: string;
};

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function loadShiftTemplates(): ShiftTemplate[] {
  const filePath = path.join(process.cwd(), "data", "Shift Templates.csv");

  const fileContent = fs.readFileSync(filePath, "utf8");

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const shifts: ShiftTemplate[] = [];

  for (const row of records) {
    // the first column in the csv has no header text, so depending on the parser
    // it may be called "" or `Unnamed: 0`.  just grab whatever the first key is
    // instead of hard–coding the header name.
    const firstKey = Object.keys(row)[0];
    const role = row[firstKey]?.trim();

    if (!role) continue; // skip empty rows

    for (const day of DAYS) {
      const value = row[day]?.trim();

      if (!value) continue;

      // Expect format: "5:30 AM - 2:15 PM"
      const [start, end] = value.split(" - ");

      if (!start || !end) continue;

      shifts.push({
        role,
        day,
        start: start.trim(),
        end: end.trim(),
      });
    }
  }

  return shifts;
}