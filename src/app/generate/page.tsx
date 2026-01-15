'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Team = { id: number; name: string };
type WdEnum = 'SUN'|'MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT';

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
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

export default function GenerateSchedulePage() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);

  const [startDate, setStartDate] = useState(todayYMD());
  const [endDate, setEndDate] = useState(todayYMD());

  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState<GeneratedSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const canGenerate = useMemo(() => {
    return Boolean(teamId) && Boolean(startDate) && Boolean(endDate) && !busy;
  }, [teamId, startDate, endDate, busy]);

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

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">🧠 Generate Schedule</h1>
          <p className="text-sm text-neutral-600">
            v1 generator (Greedy + scoring). Blackout irregular events.
          </p>
        </div>
      </header>

      {/* Controls */}
      <section className="rounded-2xl border p-5 space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm text-neutral-600">Team</label>
            <select
              className="mt-1 w-full rounded-lg border p-2"
              value={teamId ?? ''}
              onChange={(e) => setTeamId(Number(e.target.value))}
            >
              {teams === null && <option value="">Loading…</option>}
              {teams?.length === 0 && <option value="">No teams</option>}
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (#{t.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-neutral-600">Start date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border p-2"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-neutral-600">End date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border p-2"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <button
          disabled={!canGenerate}
          onClick={generate}
          className={`rounded-lg px-4 py-2 text-sm text-white ${
            canGenerate ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300'
          }`}
        >
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </section>

      {/* Result */}
      {schedule && (
        <section className="rounded-2xl border p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Result</h2>
              <p className="text-sm text-neutral-600">
                {schedule.startDate} → {schedule.endDate} • Unfilled slots:{' '}
                <b>{schedule.stats.totalUnfilledSlots}</b>
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border overflow-hidden">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-xs uppercase text-gray-600">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Shift</th>
                    <th className="px-3 py-2">Job</th>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Required</th>
                    <th className="px-3 py-2">Assigned</th>
                    <th className="px-3 py-2">Unfilled</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.shifts.map((s) => (
                    <tr key={s.shiftId} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {s.date} ({s.weekday})
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{s.shiftName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{s.jobType ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {s.startHHMM}–{s.endHHMM}
                      </td>
                      <td className="px-3 py-2">{s.required}</td>
                      <td className="px-3 py-2">
                        {s.assigned.length
                          ? s.assigned.map((a) => a.name).join(', ')
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {s.unfilled > 0 ? (
                          <span className="text-red-600 font-medium">{s.unfilled}</span>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Notes / Warnings ({schedule.notes.length})
            </summary>
            <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
              {schedule.notes.slice(0, 200).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            {schedule.notes.length > 200 && (
              <p className="mt-2 text-xs text-neutral-500">Showing first 200 notes…</p>
            )}
          </details>
        </section>
      )}
    </main>
  );
}
