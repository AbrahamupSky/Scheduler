'use client';

import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';

type AvailabilityRow = Record<string, string | null | undefined>;
type ShiftRow = Record<string, string | number | null | undefined>;

const Toast = Swal.mixin({
  toast: true,
  position: 'top',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

// Helpers
const WEEKDAY_MAP: Record<
  string,
  'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
> = {
  monday: 'MON',
  tuesday: 'TUE',
  wednesday: 'WED',
  thursday: 'THU',
  friday: 'FRI',
  saturday: 'SAT',
  sunday: 'SUN',
};
const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function dayToEnum(day: string) {
  const key = String(day || '').trim().toLowerCase();
  return WEEKDAY_MAP[key] ?? null;
}
function normalizeTime(t?: string | null) {
  if (!t) return null;
  const s = String(t).trim();
  if (s.toLowerCase() === 'off' || s === '') return null;
  const ampm = s.match(/am|pm/i);
  if (ampm) {
    const d = new Date(`1970-01-01 ${s}`);
    if (isNaN(d.getTime())) return null;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = String(m[1]).padStart(2, '0');
  const mm = m[2];
  return `${hh}:${mm}`;
}

// Parses compound availability cell: "Available All Day" / "Partially Available5:00 AM - 2:00 PM" / "Unavailable All Day"
function parseAvailCell(val: string | null | undefined): { start: string; end: string } | null {
  const s = String(val ?? '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('unavailable')) return null;
  if (lower === 'available all day') return { start: '00:00', end: '23:59' };
  // "Partially Available5:00 AM - 2:00 PM" or "Partially Available 5:00 AM - 2:00 PM"
  const match = s.match(/partially\s+available\s*(.+)/i);
  if (match) {
    const range = match[1].trim();
    const dashIdx = range.indexOf(' - ');
    if (dashIdx !== -1) {
      const start = normalizeTime(range.slice(0, dashIdx).trim());
      const end = normalizeTime(range.slice(dashIdx + 3).trim());
      if (start && end) return { start, end };
    }
  }
  return null;
}

// API client helpers (client-safe fetch)
async function apiCreateTeam(name: string) {
  const token = localStorage.getItem('authToken') ?? '';
  const res = await fetch('/api/teams', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Failed to create team');
  return data as { id: number; name: string };
}

async function apiSaveAvailability(
  teamId: number,
  payload: {
    members: {
      name: string;
      job?: string | null;
      position?: string | null;
      leadership?: string | null;
      ranking?: number | null;
      minHoursWeek?: number | null;
      maxHoursWeek?: number | null;
      minDaysWeek?: number | null;
      maxDaysWeek?: number | null;
      notes?: string | null;
    }[];
    windows: {
      memberName: string;
      weekday: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
      startHHMM: string | null;
      endHHMM: string | null;
    }[];
  }
) {
  const token = localStorage.getItem('authToken') ?? '';
  const res = await fetch(`/api/teams/${teamId}/availability`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Failed to save availability');
}

async function apiSaveShifts(
  teamId: number,
  payload: {
    templates: {
      shiftName: string;
      jobType?: string | null;
      weekday: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
      startHHMM: string;
      endHHMM: string;
    }[];
  }
) {
  const token = localStorage.getItem('authToken') ?? '';
  const res = await fetch(`/api/teams/${teamId}/shifts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Failed to save shifts');
}

export default function CreateTeamPage() {
  const router = useRouter();

  const [teamName, setTeamName] = useState('');
  const [availabilityRows, setAvailabilityRows] = useState<
    AvailabilityRow[] | null
  >(null);
  const [shiftRows, setShiftRows] = useState<ShiftRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  // ===== Availability CSV upload =====
  const onUploadAvailability = (file?: File | null) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data as any[]).map((r) => {
          // clean up values
          const row: AvailabilityRow = {};
          Object.keys(r || {}).forEach((k) => {
            row[k?.trim?.() ?? k] = (r as any)[k];
          });
          return row;
        });
        setAvailabilityRows(rows);
      },
      error: (err) =>
        Toast.fire(
          'Error',
          `Availability parse error: ${err.message}`,
          'error'
        ),
    });
  };

  // ===== Shifts CSV upload =====
  const onUploadShifts = (file?: File | null) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data as any[]).map((r) => {
          const row: ShiftRow = {};
          Object.keys(r || {}).forEach((k) => {
            row[k?.trim?.() ?? k] = (r as any)[k];
          });
          return row;
        });
        setShiftRows(rows);
      },
      error: (err) =>
        Toast.fire('Error', `Shifts parse error: ${err.message}`, 'error'),
    });
  };

  // ===== Transform availability to API shape =====
  const availabilityPayload = useMemo(() => {
    if (!availabilityRows || availabilityRows.length === 0) return null;

    const headers = Object.keys(availabilityRows[0]);
    // Detect format: new format has single day columns like "Monday" containing compound values;
    // old format has "Monday Start" / "Monday End" pairs.
    const isNewFormat = ALL_DAYS.some((d) => headers.includes(d));

    const members: {
      name: string;
      job?: string | null;
      position?: string | null;
      leadership?: string | null;
      ranking?: number | null;
      minHoursWeek?: number | null;
      maxHoursWeek?: number | null;
      minDaysWeek?: number | null;
      maxDaysWeek?: number | null;
      notes?: string | null;
    }[] = [];
    const windows: {
      memberName: string;
      weekday: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
      startHHMM: string | null;
      endHHMM: string | null;
    }[] = [];

    for (const row of availabilityRows) {
      const name = String(row['Name'] ?? '').trim();
      if (!name) continue;

      const job = String(row['Position'] ?? row['Job'] ?? '').trim() || null;
      const position = String(row['PositionTitle'] ?? row['Position'] ?? '').trim() || null;
      const leadership = String(row['Leadership'] ?? '').trim() || null;

      if (isNewFormat) {
        const rankingRaw = parseFloat(String(row['Ranking'] ?? ''));
        const minH = parseFloat(String(row['Min hours per week'] ?? row['Min Hours/Week'] ?? ''));
        const maxH = parseFloat(String(row['Max hours per week'] ?? row['Max Hours/Week'] ?? ''));
        const minD = parseFloat(String(row['Min Days per week'] ?? row['Min Days/Week'] ?? ''));
        const maxD = parseFloat(String(row['Max Days per week'] ?? row['Max Days/Week'] ?? ''));
        const notes = String(row['Notes'] ?? '').trim() || null;

        members.push({
          name, job, position, leadership,
          ranking: Number.isFinite(rankingRaw) ? rankingRaw : null,
          minHoursWeek: Number.isFinite(minH) ? minH : null,
          maxHoursWeek: Number.isFinite(maxH) ? maxH : null,
          minDaysWeek: Number.isFinite(minD) ? minD : null,
          maxDaysWeek: Number.isFinite(maxD) ? maxD : null,
          notes,
        });

        for (const day of ALL_DAYS) {
          if (!headers.includes(day)) continue;
          const enumDay = dayToEnum(day);
          if (!enumDay) continue;
          const times = parseAvailCell(String(row[day] ?? ''));
          if (times) {
            windows.push({ memberName: name, weekday: enumDay, startHHMM: times.start, endHHMM: times.end });
          }
        }
      } else {
        // Old format: "Monday Start" / "Monday End" pairs
        members.push({ name, job, position, leadership });
        ALL_DAYS.forEach((day) => {
          const start = normalizeTime(String(row[`${day} Start`] ?? row[`${day}Start`] ?? row[`${day}`] ?? '').trim());
          const end = normalizeTime(String(row[`${day} End`] ?? row[`${day}End`] ?? '').trim());
          const enumDay = dayToEnum(day);
          if (!enumDay) return;
          if (start !== null || end !== null) {
            windows.push({ memberName: name, weekday: enumDay, startHHMM: start, endHHMM: end });
          }
        });
      }
    }

    return { members, windows };
  }, [availabilityRows]);

  // ===== Transform shift requirements to API shape =====
  const shiftTemplatesPayload = useMemo(() => {
    if (!shiftRows || shiftRows.length === 0) return null;

    const headers = Object.keys(shiftRows[0]);
    // Detect pivoted format: columns include day names like "Monday", "Tuesday", etc.
    const isPivoted = ALL_DAYS.some((d) => headers.includes(d));

    const templates: {
      shiftName: string;
      jobType?: string | null;
      weekday: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
      startHHMM: string;
      endHHMM: string;
    }[] = [];

    if (isPivoted) {
      // Pivoted format: first column = shift/role name, day columns = "HH:MM AM - HH:MM PM"
      for (const r of shiftRows) {
        const firstKey = Object.keys(r)[0];
        const shiftName = String(r[firstKey] ?? '').trim();
        if (!shiftName) continue;

        // Derive jobType from shift name
        const lower = shiftName.toLowerCase();
        let jobType: string | null = null;
        if (lower.includes('boh') || lower.includes('back') || lower.includes('kitchen')) jobType = 'BOH';
        else if (lower.includes('foh') || lower.includes('front')) jobType = 'FOH';
        else if (lower.includes('truck') || lower.includes('delivery')) jobType = 'TRUCK';
        else if (lower.includes('prep')) jobType = 'PREP';

        for (const day of ALL_DAYS) {
          if (!headers.includes(day)) continue;
          const val = String(r[day] ?? '').trim();
          if (!val) continue;
          const enumDay = dayToEnum(day);
          if (!enumDay) continue;

          // Support multiple time ranges per cell separated by newlines
          const entries = val.includes('\n') ? val.split('\n') : [val];
          for (const entry of entries) {
            const dashIdx = entry.indexOf(' - ');
            if (dashIdx === -1) continue;
            const start = normalizeTime(entry.slice(0, dashIdx).trim());
            const end = normalizeTime(entry.slice(dashIdx + 3).trim());
            if (!start || !end) continue;
            templates.push({ shiftName, jobType, weekday: enumDay, startHHMM: start, endHHMM: end });
          }
        }
      }
    } else {
      // Flat format: Shift, Job_Type, Day, Start_Time, End_Time columns
      for (const r of shiftRows) {
        const shiftName = String(r['Shift'] ?? '').trim();
        const jobType = String(r['Job_Type'] ?? '').trim() || null;
        const day = dayToEnum(String(r['Day'] ?? ''));
        const start = normalizeTime(String(r['Start_Time'] ?? ''));
        const end = normalizeTime(String(r['End_Time'] ?? ''));
        if (!shiftName || !day || !start || !end) continue;
        templates.push({ shiftName, jobType, weekday: day, startHHMM: start, endHHMM: end });
      }
    }

    return templates.length > 0 ? { templates } : null;
  }, [shiftRows]);

  const canSave =
    teamName.trim().length > 0 &&
    !!availabilityPayload &&
    !!shiftTemplatesPayload;

  const saveAll = async () => {
    try {
      if (!canSave) {
        Swal.fire('Error', 'Provide team name + both CSVs', 'error');
        return;
      }
      setBusy(true);

      // 1) Create team
      const team = await apiCreateTeam(teamName.trim());
      localStorage.setItem('currentTeamId', String(team.id));

      // 2) Save availability
      await apiSaveAvailability(team.id, {
        members: availabilityPayload!.members,
        windows: availabilityPayload!.windows,
      });

      // 3) Save shift templates
      await apiSaveShifts(team.id, {
        templates: shiftTemplatesPayload!.templates,
      });

      Toast.fire(
        'Success',
        `Team "${team.name}" created and data saved!`,
        'success'
      );
      router.replace('/'); // or navigate to your Upload/View/Settings page
      router.refresh();
    } catch (e: any) {
      Swal.fire('Error', e?.message ?? 'Failed to save data', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-5xl p-6 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Create & Upload Team
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            Name your team, upload **Team Availability** and **Shift
            Requirements** CSVs, preview, and save to database.
          </p>
        </header>

        {/* Team name */}
        <section className="rounded-2xl border p-5 dark:border-gray-700">
          <h2 className="text-lg font-semibold">1) Team Info</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm w-32">Team Name</label>
            <input
              className="flex-1 rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-700"
              placeholder="e.g., Main Store"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>
        </section>

        {/* Availability upload */}
        <section className="rounded-2xl border p-5 dark:border-gray-700">
          <h2 className="text-lg font-semibold">2) Team Availability (CSV)</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Columns like:{' '}
            <code>
              Name, Position, Leadership, Monday Start, Monday End, … Sunday End
            </code>
            . Times can be <code>HH:MM</code> or <code>7:00 AM</code>. Use{' '}
            <code>Off</code> or blank for no availability.
          </p>
          <div className="mt-3">
            <label className="text-base text-slate-300 font-medium mb-3 block">
              Upload file
            </label>
            <input
              type="file"
              className="w-full text-slate-500 font-medium text-sm bg-gray-700 border file:cursor-pointer cursor-pointer file:border-0 file:py-3 file:px-4 file:mr-4 file:bg-gray-800 file:hover:bg-gray-200 file:text-slate-500 rounded"
              accept=".csv,text/csv"
              onChange={(e) =>
                onUploadAvailability(e.target.files?.[0] ?? null)
              }
            />
            <p className="text-xs text-slate-500 mt-2">Only .csv is allowed</p>
          </div>

          {/* Availability preview */}
          {availabilityRows && availabilityRows.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-neutral-700 dark:text-neutral-300">
                Preview
              </p>
              <div className="relative shadow-md sm:rounded-lg mt-4 border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                  <table className="min-w-[800px] w-full text-left text-sm text-gray-600 dark:text-gray-300">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700">
                      <tr className="text-xs uppercase text-gray-700 dark:text-gray-300">
                        {Object.keys(availabilityRows[0]).map((k) => (
                          <th
                            key={k}
                            className="px-3 py-2 font-medium whitespace-nowrap"
                          >
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {availabilityRows.map((row, idx) => (
                        <tr key={idx} className="border-t dark:border-gray-700">
                          {Object.keys(availabilityRows[0]).map((k) => (
                            <td key={k} className="px-3 py-2 whitespace-nowrap">
                              {String(row[k] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Total: {availabilityRows.length} rows ×{' '}
                {Object.keys(availabilityRows[0]).length} columns
              </p>
            </div>
          )}
        </section>

        {/* Shift requirements upload */}
        <section className="rounded-2xl border p-5 dark:border-gray-700">
          <h2 className="text-lg font-semibold">3) Shift Requirements (CSV)</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Required columns:{' '}
            <code>Shift, Job_Type, Day, Start_Time, End_Time, Required</code>{' '}
            (we store requirements separately or use in rules; templates save
            the timing).
          </p>
          <div className="mt-3">
            <label className="text-base text-slate-300 font-medium mb-3 block">
              Upload file
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="w-full text-slate-500 font-medium text-sm bg-gray-700 border file:cursor-pointer cursor-pointer file:border-0 file:py-3 file:px-4 file:mr-4 file:bg-gray-800 file:hover:bg-gray-200 file:text-slate-500 rounded"
              onChange={(e) => onUploadShifts(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-slate-500 mt-2">Only .csv is allowed</p>
          </div>

          {/* Shifts preview */}
          {shiftRows && shiftRows.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-neutral-700 dark:text-neutral-300">
                Preview
              </p>
              <div className="relative shadow-md sm:rounded-lg mt-4 border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                  <table className="min-w-[800px] w-full text-left text-sm text-gray-600 dark:text-gray-300">
                    <thead className="sticky top-0 text-xs uppercase z-10 bg-gray-50 dark:bg-gray-700 dark:text-gray-300">
                      <tr>
                        {Object.keys(shiftRows[0]).map((k) => (
                          <th
                            key={k}
                            className="px-3 py-2 font-medium whitespace-nowrap"
                          >
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shiftRows.map((row, idx) => (
                        <tr key={idx} className="border-t dark:border-gray-700">
                          {Object.keys(shiftRows[0]).map((k) => (
                            <td key={k} className="px-3 py-2 whitespace-nowrap">
                              {String(row[k] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Total: {shiftRows.length} rows ×{' '}
                {Object.keys(shiftRows[0]).length} columns
              </p>
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            Make sure you’re logged in. We’ll create the team and save both
            datasets.
          </div>
          <button
            onClick={saveAll}
            disabled={!canSave || busy}
            className={`rounded-lg px-4 py-2 text-white ${
              !canSave || busy ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title={!canSave ? 'Provide team name + both CSVs' : 'Save'}
          >
            {busy ? 'Saving…' : 'Create Team & Save Data'}
          </button>
        </section>
      </div>
    </main>
  );
}
