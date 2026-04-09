'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Zap, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

type Team = { id: number; name: string };
type WdEnum = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

type GeneratedSchedule = {
  teamId: number;
  startDate: string;
  endDate: string;
  shifts: Array<{
    shiftId: string;
    date: string;
    weekday: WdEnum;
    shiftName: string;
    jobType: string | null;
    startHHMM: string;
    endHHMM: string;
    required: number;
    assigned: Array<{ memberId: number; name: string }>;
    unfilled: number;
  }>;
  stats: {
    hoursByMember: Record<string, number>;
    shiftsByMember: Record<string, number>;
    unfilledShifts: number;
    totalUnfilledSlots: number;
  };
  notes: string[];
};

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inputClass =
  'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors';

export default function GenerateSchedulePage() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(todayYMD());
  const [endDate, setEndDate] = useState(todayYMD());
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState<GeneratedSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('authToken') ?? '';
    (async () => {
      try {
        const res = await fetch('/api/teams', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data?.error ?? 'Failed to load teams');
        setTeams(data);
        if (data?.length && !teamId) setTeamId(data[0].id);
      } catch (e: any) {
        setTeams([]);
        setError(e?.message ?? 'Failed to load teams');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGenerate = useMemo(
    () => Boolean(teamId) && Boolean(startDate) && Boolean(endDate) && !busy,
    [teamId, startDate, endDate, busy]
  );

  const generate = async () => {
    if (!teamId) return;
    setBusy(true);
    setError(null);
    setSchedule(null);

    const token = localStorage.getItem('authToken') ?? '';
    try {
      const res = await fetch(`/api/teams/${teamId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          startDate,
          endDate,
          scheduleName: `Schedule ${startDate} → ${endDate}`,
          optimization: 'BALANCED_WORKLOAD',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to generate schedule');
      setSchedule(payload.schedule);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate schedule');
    } finally {
      setBusy(false);
    }
  };

  const thClass = 'px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Generate Schedule</h1>
        <p className="mt-0.5 text-sm text-gray-500">Greedy + scoring algorithm. Blackouts irregular events.</p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Team</label>
            <select
              className={inputClass}
              value={teamId ?? ''}
              onChange={(e) => setTeamId(Number(e.target.value))}
            >
              {teams === null && <option value="">Loading…</option>}
              {teams?.length === 0 && <option value="">No teams</option>}
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>{t.name} (#{t.id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Start date</label>
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">End date</label>
            <input
              type="date"
              className={inputClass}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <button
            disabled={!canGenerate}
            onClick={generate}
            className="flex items-center gap-2 rounded-lg border border-indigo-600 bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {busy ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {busy ? 'Generating…' : 'Generate Schedule'}
          </button>
        </div>
      </div>

      {/* Result */}
      {schedule && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          {/* Result header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-700 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Result</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {schedule.startDate} → {schedule.endDate} ·{' '}
                <span className={schedule.stats.totalUnfilledSlots > 0 ? 'text-red-400' : 'text-green-400'}>
                  {schedule.stats.totalUnfilledSlots} unfilled slots
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Total shifts', value: schedule.shifts.length },
                { label: 'Unfilled', value: schedule.stats.totalUnfilledSlots, red: schedule.stats.totalUnfilledSlots > 0 },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-2 text-center">
                  <div className={`text-lg font-bold ${stat.red ? 'text-red-400' : 'text-gray-100'}`}>{stat.value}</div>
                  <div className="text-xs text-gray-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden">
            <div className="max-h-[500px] overflow-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-800/80">
                  <tr>
                    {['Date', 'Shift', 'Job', 'Time', 'Required', 'Assigned', 'Unfilled'].map((h) => (
                      <th key={h} className={thClass}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.shifts.map((s, i) => (
                    <tr
                      key={s.shiftId}
                      className={`border-t border-gray-700/50 ${i % 2 === 0 ? 'bg-gray-900/20' : ''}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">
                        {s.date} <span className="text-gray-600">({s.weekday})</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">{s.shiftName}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400">{s.jobType ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-300">
                        {s.startHHMM}–{s.endHHMM}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">{s.required}</td>
                      <td className="px-3 py-2 text-xs text-gray-300">
                        {s.assigned.length ? s.assigned.map((a) => a.name).join(', ') : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {s.unfilled > 0 ? (
                          <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-400">
                            {s.unfilled}
                          </span>
                        ) : (
                          <span className="text-xs text-green-500">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes collapsible */}
          <div className="border-t border-gray-700">
            <button
              className="flex w-full items-center justify-between px-5 py-3 text-xs font-medium text-gray-400 transition-colors hover:text-gray-200"
              onClick={() => setNotesOpen((v) => !v)}
            >
              <span>Notes / Warnings ({schedule.notes.length})</span>
              {notesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {notesOpen && (
              <div className="px-5 pb-5">
                <ul className="space-y-1 text-xs text-gray-500">
                  {schedule.notes.slice(0, 200).map((n, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-0.5 shrink-0 text-gray-700">·</span>
                      {n}
                    </li>
                  ))}
                </ul>
                {schedule.notes.length > 200 && (
                  <p className="mt-2 text-xs text-gray-600">Showing first 200 notes…</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
