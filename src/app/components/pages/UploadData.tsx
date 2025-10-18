'use client';

import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/** ---- Types ---- */
export type UploadDataProps = {
  teamId: number | null;
  teamName: string | null;

  /** Called when *both* datasets are available (or individually if you prefer) */
  onAvailabilityLoaded?: (rows: any[]) => void;
  onShiftsLoaded?: (rows: any[]) => void;

  /** Wire these to your backend if you want autosave buttons */
  onSaveTeamData?: (args: {
    teamId: number | null;
    teamName: string | null;
    availability: any[] | null;
    shifts: any[] | null;
  }) => Promise<void> | void;

  /** Optional: pre-fill counts in your navbar status */
  initialAvailability?: any[] | null;
  initialShifts?: any[] | null;
};

/** ---- Client-side templates (edit as needed or pass via props if you want) ---- */
const AVAILABILITY_TEMPLATE_DATA = [
  { Name: 'John Smith', Job: 'FOH', Position: 'Server', Monday: '8:00-16:00', Tuesday: '', Wednesday: '12:00-20:00', Thursday: '', Friday: '8:00-16:00' },
  { Name: 'Jane Doe', Job: 'BOH', Position: 'Cook', Monday: '', Tuesday: '8:00-16:00', Wednesday: '', Thursday: '8:00-16:00', Friday: '' },
];

const SHIFT_TEMPLATE_DATA = [
  { Shift: 'Breakfast', Job_Type: 'FOH', Day: 'Monday', Start_Time: '08:00', End_Time: '12:00', Required: 3 },
  { Shift: 'Lunch',     Job_Type: 'FOH', Day: 'Monday', Start_Time: '12:00', End_Time: '16:00', Required: 4 },
];

const TIME_FORMAT_EXAMPLES = [
  "8:00 AM / 8:00", "14:30 / 2:30 PM", "08:00-16:00", "9 AM - 5 PM"
];

const SHIFT_COLUMN_DESCRIPTIONS: Record<string, string> = {
  Shift: 'A human-friendly label for the shift block.',
  Job_Type: 'Team/job category the shift belongs to (e.g., FOH/BOH).',
  Day: 'Day of the week (Monday–Sunday).',
  Start_Time: 'Shift start in 24h HH:MM.',
  End_Time: 'Shift end in 24h HH:MM.',
  Required: 'Number of staff needed for the shift.',
};

const AVAILABILITY_COLUMN_DESCRIPTIONS: Record<string, string> = {
  Name: 'Employee full name.',
  Job: 'Primary job category (comma-separated allowed).',
  Position: 'Role/level (e.g. Server, Director).',
  'Monday..Friday': 'Time ranges like "8:00-16:00" or blank for not available.',
};

/** ---- Helpers ---- */
function downloadCsv(filename: string, rows: any[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function readFile(file: File): Promise<any[]> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve(res.data as any[]),
        error: reject,
      });
    });
  }
  // xlsx / xls
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
}

function validateHHMM(s: string) {
  return /^\d{2}:\d{2}$/.test(s);
}

/** ---- Component ---- */
export default function UploadData({
  teamId,
  teamName,
  onAvailabilityLoaded,
  onShiftsLoaded,
  onSaveTeamData,
  initialAvailability = null,
  initialShifts = null,
}: UploadDataProps) {
  const [availabilityFile, setAvailabilityFile] = useState<File | null>(null);
  const [shiftsFile, setShiftsFile] = useState<File | null>(null);

  const [availabilityRows, setAvailabilityRows] = useState<any[] | null>(initialAvailability);
  const [shiftsRows, setShiftsRows] = useState<any[] | null>(initialShifts);

  const availabilityCount = availabilityRows?.length ?? 0;
  const shiftsCount = shiftsRows?.length ?? 0;

  const missingShiftCols = useMemo(() => {
    if (!shiftsRows?.length) return [];
    const cols = ['Shift', 'Job_Type', 'Day', 'Start_Time', 'End_Time'];
    const keys = Object.keys(shiftsRows[0] ?? {});
    return cols.filter((c) => !keys.includes(c));
  }, [shiftsRows]);

  const invalidTimes = useMemo(() => {
    if (!shiftsRows?.length) return [];
    const bad: string[] = [];
    shiftsRows.forEach((row, i) => {
      ['Start_Time', 'End_Time'].forEach((c) => {
        const v = String(row[c] ?? '');
        if (!validateHHMM(v)) bad.push(`Row ${i + 1} ${c}: "${v}"`);
      });
    });
    return bad;
  }, [shiftsRows]);

  const canSave = teamName && availabilityRows && shiftsRows && missingShiftCols.length === 0 && invalidTimes.length === 0;

  /** Handlers */
  const handleUploadAvailability = async (file: File) => {
    setAvailabilityFile(file);
    const rows = await readFile(file);
    setAvailabilityRows(rows);
    onAvailabilityLoaded?.(rows);
  };

  const handleUploadShifts = async (file: File) => {
    setShiftsFile(file);
    const rows = await readFile(file);
    setShiftsRows(rows);
    onShiftsLoaded?.(rows);
  };

  const handleSave = async () => {
    if (!onSaveTeamData) return;
    await onSaveTeamData({
      teamId,
      teamName,
      availability: availabilityRows ?? null,
      shifts: shiftsRows ?? null,
    });
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">📁 Upload Team Data</h1>
          <p className="text-sm text-neutral-600">
            {teamName ? <>Managing team: <span className="font-medium">{teamName}</span></> : 'No team selected'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => downloadCsv('availability_template.csv', AVAILABILITY_TEMPLATE_DATA)}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Download Availability Template
          </button>
          <button
            onClick={() => downloadCsv('shifts_template.csv', SHIFT_TEMPLATE_DATA)}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Download Shifts Template
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Availability */}
        <section className="rounded-2xl border p-5">
          <h2 className="mb-2 text-lg font-semibold">Team Availability</h2>
          <p className="mb-4 text-sm text-neutral-600">Upload a CSV/XLSX with team members and their week availability.</p>

          <label className="mb-3 inline-block cursor-pointer rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
            Choose availability file
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUploadAvailability(e.target.files[0])}
            />
          </label>
          {availabilityFile && (
            <p className="text-xs text-neutral-500">Selected: {availabilityFile.name}</p>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer select-none text-sm font-medium">Expected format</summary>
            <div className="mt-2 space-y-2 text-sm">
              <p><b>Required columns:</b> Name, Job, Position, weekdays (e.g., Monday, Tuesday...).</p>
              <ul className="list-disc pl-5">
                {Object.entries(AVAILABILITY_COLUMN_DESCRIPTIONS).map(([k, v]) => (
                  <li key={k}><b>{k}</b>: {v}</li>
                ))}
              </ul>
              <p className="mt-2"><b>Time format examples:</b></p>
              <ul className="list-disc pl-5">
                {TIME_FORMAT_EXAMPLES.map((eg) => <li key={eg}>{eg}</li>)}
              </ul>
            </div>
          </details>

          {/* Preview */}
          {availabilityRows && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-neutral-700">Preview (first 5 rows)</p>
              <div className="overflow-auto rounded-lg border">
                <table className="min-w-[600px] text-left text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      {Object.keys(availabilityRows[0] || {}).slice(0, 10).map((k) => (
                        <th key={k} className="px-3 py-2 font-medium">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {availabilityRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t">
                        {Object.keys(availabilityRows[0] || {}).slice(0, 10).map((k) => (
                          <td key={k} className="px-3 py-2">{String(r[k] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Total: {availabilityRows.length} rows × {Object.keys(availabilityRows[0] || {}).length} columns
              </p>
            </div>
          )}
        </section>

        {/* Shifts */}
        <section className="rounded-2xl border p-5">
          <h2 className="mb-2 text-lg font-semibold">Shift Requirements</h2>
          <p className="mb-4 text-sm text-neutral-600">Upload a CSV/XLSX with shift blocks and required staffing.</p>

          <label className="mb-3 inline-block cursor-pointer rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
            Choose shifts file
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUploadShifts(e.target.files[0])}
            />
          </label>
          {shiftsFile && (
            <p className="text-xs text-neutral-500">Selected: {shiftsFile.name}</p>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer select-none text-sm font-medium">Expected format</summary>
            <div className="mt-2 space-y-2 text-sm">
              <p><b>Required columns:</b> Shift, Job_Type, Day, Start_Time, End_Time, Required</p>
              <ul className="list-disc pl-5">
                {Object.entries(SHIFT_COLUMN_DESCRIPTIONS).map(([k, v]) => (
                  <li key={k}><b>{k}</b>: {v}</li>
                ))}
              </ul>
              <p className="mt-2"><b>Alternative:</b> Your own columns are fine; just ensure these required fields exist after processing.</p>
            </div>
          </details>

          {/* Validation */}
          {missingShiftCols.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Missing required columns: <b>{missingShiftCols.join(', ')}</b>
            </div>
          )}
          {invalidTimes.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Invalid time values (expect HH:MM):
              <ul className="mt-1 list-disc pl-5">
                {invalidTimes.slice(0, 5).map((msg) => <li key={msg}>{msg}</li>)}
              </ul>
              {invalidTimes.length > 5 && <p className="mt-1">…and {invalidTimes.length - 5} more</p>}
            </div>
          )}

          {/* Preview */}
          {shiftsRows && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-neutral-700">Preview (first 5 rows)</p>
              <div className="overflow-auto rounded-lg border">
                <table className="min-w-[600px] text-left text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      {Object.keys(shiftsRows[0] || {}).slice(0, 10).map((k) => (
                        <th key={k} className="px-3 py-2 font-medium">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shiftsRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t">
                        {Object.keys(shiftsRows[0] || {}).slice(0, 10).map((k) => (
                          <td key={k} className="px-3 py-2">{String(r[k] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Total: {shiftsRows.length} rows × {Object.keys(shiftsRows[0] || {}).length} columns
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Status + Save */}
      <section className="rounded-2xl border p-5">
        <h3 className="mb-3 text-base font-semibold">📊 Current Data Status</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border p-3">
            <p className="text-sm">Availability</p>
            <p className="text-sm text-neutral-600">{availabilityRows ? `✅ ${availabilityCount} people` : '⚠️ None'}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-sm">Shifts</p>
            <p className="text-sm text-neutral-600">{shiftsRows ? `✅ ${shiftsCount} shifts` : '⚠️ None'}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-sm">Team</p>
            <p className="text-sm text-neutral-600">{teamName ?? '—'}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`rounded-lg px-4 py-2 text-sm ${
              canSave ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-neutral-100 text-neutral-400'
            }`}
            title={canSave ? 'Save data' : 'Upload valid files first'}
          >
            💾 Save to Database
          </button>

          {/* Optional: inline download of a sample schedule output layout */}
          <button
            onClick={() =>
              downloadCsv('sample_schedule_output.csv', [
                { Name: 'John Smith', 'Monday Start': '08:00', 'Monday End': '16:00', 'Tuesday Start': '', 'Tuesday End': '' },
                { Name: 'Jane Doe', 'Monday Start': '', 'Monday End': '', 'Tuesday Start': '08:00', 'Tuesday End': '16:00' },
              ])
            }
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Download Sample Output
          </button>
        </div>
      </section>
    </div>
  );
}
