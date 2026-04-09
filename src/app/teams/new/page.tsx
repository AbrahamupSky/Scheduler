'use client';

import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { RefreshCw, Upload, Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

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

const WEEKDAY_MAP: Record<string, 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'> = {
  monday: 'MON', tuesday: 'TUE', wednesday: 'WED', thursday: 'THU',
  friday: 'FRI', saturday: 'SAT', sunday: 'SUN',
};

function dayToEnum(day: string) {
  return WEEKDAY_MAP[String(day || '').trim().toLowerCase()] ?? null;
}

function normalizeTime(t?: string | null) {
  if (!t) return null;
  const s = String(t).trim();
  if (s.toLowerCase() === 'off' || s === '') return null;
  const ampm = s.match(/am|pm/i);
  if (ampm) {
    const d = new Date(`1970-01-01 ${s}`);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
}

async function apiCreateTeam(name: string) {
  const token = localStorage.getItem('authToken') ?? '';
  const res = await fetch('/api/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Failed to create team');
  return data as { id: number; name: string };
}

async function apiSaveAvailability(teamId: number, payload: any) {
  const token = localStorage.getItem('authToken') ?? '';
  const res = await fetch(`/api/teams/${teamId}/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Failed to save availability');
}

async function apiSaveShifts(teamId: number, payload: any) {
  const token = localStorage.getItem('authToken') ?? '';
  const res = await fetch(`/api/teams/${teamId}/shifts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Failed to save shifts');
}

export default function CreateTeamPage() {
  const router = useRouter();

  const [teamName, setTeamName] = useState('');
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[] | null>(null);
  const [shiftRows, setShiftRows] = useState<ShiftRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const onUploadAvailability = (file?: File | null) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data as any[]).map((r) => {
          const row: AvailabilityRow = {};
          Object.keys(r || {}).forEach((k) => { row[k?.trim?.() ?? k] = (r as any)[k]; });
          return row;
        });
        setAvailabilityRows(rows);
      },
      error: (err) => Toast.fire('Error', `Availability parse error: ${err.message}`, 'error'),
    });
  };

  const onUploadShifts = (file?: File | null) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data as any[]).map((r) => {
          const row: ShiftRow = {};
          Object.keys(r || {}).forEach((k) => { row[k?.trim?.() ?? k] = (r as any)[k]; });
          return row;
        });
        setShiftRows(rows);
      },
      error: (err) => Toast.fire('Error', `Shifts parse error: ${err.message}`, 'error'),
    });
  };

  const availabilityPayload = useMemo(() => {
    if (!availabilityRows || availabilityRows.length === 0) return null;
    const members: { name: string; job?: string | null; position?: string | null }[] = [];
    const windows: { memberName: string; weekday: any; startHHMM: string | null; endHHMM: string | null }[] = [];

    for (const row of availabilityRows) {
      const name = String(row['Name'] ?? '').trim();
      if (!name) continue;
      const job = String(row['Position'] ?? row['Job'] ?? '').trim() || null;
      const position = String(row['Leadership'] ?? row['PositionTitle'] ?? '').trim() || null;
      members.push({ name, job, position });

      (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const).forEach((day) => {
        const start = normalizeTime(String(row[`${day} Start`] ?? row[`${day}Start`] ?? row[`${day}`] ?? '').trim());
        const end = normalizeTime(String(row[`${day} End`] ?? row[`${day}End`] ?? '').trim());
        const enumDay = dayToEnum(day);
        if (!enumDay) return;
        if (start !== null || end !== null) {
          windows.push({ memberName: name, weekday: enumDay, startHHMM: start, endHHMM: end });
        }
      });
    }
    return { members, windows };
  }, [availabilityRows]);

  const shiftTemplatesPayload = useMemo(() => {
    if (!shiftRows || shiftRows.length === 0) return null;
    const templates: { shiftName: string; jobType?: string | null; weekday: any; startHHMM: string; endHHMM: string }[] = [];

    for (const r of shiftRows) {
      const shiftName = String(r['Shift'] ?? '').trim();
      const jobType = String(r['Job_Type'] ?? '').trim() || null;
      const day = dayToEnum(String(r['Day'] ?? ''));
      const start = normalizeTime(String(r['Start_Time'] ?? ''));
      const end = normalizeTime(String(r['End_Time'] ?? ''));
      if (!shiftName || !day || !start || !end) continue;
      templates.push({ shiftName, jobType, weekday: day, startHHMM: start, endHHMM: end });
    }
    return { templates };
  }, [shiftRows]);

  const canSave = teamName.trim().length > 0 && !!availabilityPayload && !!shiftTemplatesPayload;

  const saveAll = async () => {
    try {
      if (!canSave) { Swal.fire('Error', 'Provide team name + both CSVs', 'error'); return; }
      setBusy(true);
      const team = await apiCreateTeam(teamName.trim());
      localStorage.setItem('currentTeamId', String(team.id));
      await apiSaveAvailability(team.id, { members: availabilityPayload!.members, windows: availabilityPayload!.windows });
      await apiSaveShifts(team.id, { templates: shiftTemplatesPayload!.templates });
      Toast.fire('Success', `Team "${team.name}" created and data saved!`, 'success');
      router.replace('/');
      router.refresh();
    } catch (e: any) {
      Swal.fire('Error', e?.message ?? 'Failed to save data', 'error');
    } finally {
      setBusy(false);
    }
  };

  const thClass = 'px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap';
  const tdClass = 'px-3 py-2 text-xs text-gray-300 whitespace-nowrap';
  const inputClass = 'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-colors';

  return (
    <main className="min-h-dvh bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-200">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <h1 className="text-sm font-semibold text-gray-100">Create New Team</h1>
          <button
            onClick={saveAll}
            disabled={!canSave || busy}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {busy ? 'Saving…' : 'Create Team'}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-5 p-6">
        {/* Step 1: Team name */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-100">1. Team Info</h2>
          </div>
          <div className="p-5">
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Team Name</label>
            <input
              className={inputClass}
              placeholder="e.g., Main Store"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>
        </div>

        {/* Step 2: Availability CSV */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-100">2. Team Availability (CSV)</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Columns: <code className="rounded bg-gray-900 px-1 py-0.5 text-gray-400">Name, Position, Leadership, Monday Start, Monday End, …</code>
            </p>
          </div>
          <div className="p-5">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-600 bg-gray-900/30 px-4 py-4 transition-colors hover:border-indigo-500 hover:bg-indigo-900/10">
              <Upload className="h-5 w-5 shrink-0 text-gray-500" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-300">
                  {availabilityRows ? `${availabilityRows.length} rows loaded` : 'Choose availability CSV'}
                </div>
                <div className="text-xs text-gray-600">Only .csv is allowed</div>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".csv,text/csv"
                onChange={(e) => onUploadAvailability(e.target.files?.[0] ?? null)}
              />
            </label>

            {availabilityRows && availabilityRows.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-gray-500">Preview</p>
                <div className="overflow-hidden rounded-lg border border-gray-700">
                  <div className="max-h-72 overflow-x-auto overflow-y-auto">
                    <table className="min-w-[800px] w-full text-left">
                      <thead className="sticky top-0 bg-gray-800/80">
                        <tr>
                          {Object.keys(availabilityRows[0]).map((k) => (
                            <th key={k} className={thClass}>{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {availabilityRows.map((row, idx) => (
                          <tr key={idx} className={`border-t border-gray-700/50 ${idx % 2 === 0 ? 'bg-gray-900/30' : ''}`}>
                            {Object.keys(availabilityRows[0]).map((k) => (
                              <td key={k} className={tdClass}>{String(row[k] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-gray-600">
                  {availabilityRows.length} rows × {Object.keys(availabilityRows[0]).length} columns
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Shift requirements */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-100">3. Shift Requirements (CSV)</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Required columns: <code className="rounded bg-gray-900 px-1 py-0.5 text-gray-400">Shift, Job_Type, Day, Start_Time, End_Time, Required</code>
            </p>
          </div>
          <div className="p-5">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-600 bg-gray-900/30 px-4 py-4 transition-colors hover:border-indigo-500 hover:bg-indigo-900/10">
              <Upload className="h-5 w-5 shrink-0 text-gray-500" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-300">
                  {shiftRows ? `${shiftRows.length} rows loaded` : 'Choose shift requirements CSV'}
                </div>
                <div className="text-xs text-gray-600">Only .csv is allowed</div>
              </div>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onUploadShifts(e.target.files?.[0] ?? null)}
              />
            </label>

            {shiftRows && shiftRows.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-gray-500">Preview</p>
                <div className="overflow-hidden rounded-lg border border-gray-700">
                  <div className="max-h-72 overflow-x-auto overflow-y-auto">
                    <table className="min-w-[800px] w-full text-left">
                      <thead className="sticky top-0 bg-gray-800/80">
                        <tr>
                          {Object.keys(shiftRows[0]).map((k) => (
                            <th key={k} className={thClass}>{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {shiftRows.map((row, idx) => (
                          <tr key={idx} className={`border-t border-gray-700/50 ${idx % 2 === 0 ? 'bg-gray-900/30' : ''}`}>
                            {Object.keys(shiftRows[0]).map((k) => (
                              <td key={k} className={tdClass}>{String(row[k] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-gray-600">
                  {shiftRows.length} rows × {Object.keys(shiftRows[0]).length} columns
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 px-5 py-4">
          <p className="text-xs text-gray-500">
            Make sure you&apos;re logged in. We&apos;ll create the team and save both datasets.
          </p>
          <button
            onClick={saveAll}
            disabled={!canSave || busy}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            title={!canSave ? 'Provide team name + both CSVs' : undefined}
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {busy ? 'Saving…' : 'Create Team & Save Data'}
          </button>
        </div>
      </div>
    </main>
  );
}
