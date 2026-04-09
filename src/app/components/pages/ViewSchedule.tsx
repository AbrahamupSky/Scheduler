'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  canLeadLane,
  isShiftLeaderName,
  laneFromJobType,
} from '@/app/lib/scheduler/leadershipUtils';

type Team = { id: number; name: string };

type ScheduleMeta = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  optimization: string | null;
  createdAt: string;
};

type TeamMemberOption = { id: number; name: string; leadership?: string | null };

type GeneratedSchedule = {
  shifts: Array<{
    shiftId: string;
    date: string;
    weekday: 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
    shiftName: string;
    jobType: string | null;
    startHHMM: string;
    endHHMM: string;
    required: number;
    assigned: Array<{ memberId: number; name: string }>;
    unfilled: number;
  }>;
  stats?: any;
  notes?: string[];
};

function fmtDate(d: string) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString();
}

function recomputeUnfilled(d: GeneratedSchedule): GeneratedSchedule {
  return {
    ...d,
    shifts: d.shifts.map((s) => ({
      ...s,
      unfilled: Math.max(0, (s.required ?? 0) - (s.assigned?.length ?? 0)),
    })),
  };
}

function addAssigned(
  d: GeneratedSchedule,
  shiftId: string,
  member: { id: number; name: string },
) {
  const next = {
    ...d,
    shifts: d.shifts.map((s) => {
      if (s.shiftId !== shiftId) return s;

      const already = s.assigned.some((a) => a.memberId === member.id);
      const full = s.assigned.length >= s.required;

      if (already || full) return s;

      return {
        ...s,
        assigned: [...s.assigned, { memberId: member.id, name: member.name }],
      };
    }),
  };
  return recomputeUnfilled(next);
}

function removeAssigned(
  d: GeneratedSchedule,
  shiftId: string,
  memberId: number,
) {
  const next = {
    ...d,
    shifts: d.shifts.map((s) => {
      if (s.shiftId !== shiftId) return s;
      return {
        ...s,
        assigned: s.assigned.filter((a) => a.memberId !== memberId),
      };
    }),
  };
  return recomputeUnfilled(next);
}

function memberCanBeAddedToShift(
  member: TeamMemberOption,
  shift: GeneratedSchedule['shifts'][number],
) {
  if (!isShiftLeaderName(shift.shiftName)) return true;
  return canLeadLane(member.leadership, laneFromJobType(shift.jobType));
}

export default function SchedulesPage() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);

  const [list, setList] = useState<ScheduleMeta[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [schedule, setSchedule] = useState<{
    id: number;
    name: string;
    createdAt: string;
    optimization: string | null;
    team: { id: number; name: string };
    data: GeneratedSchedule;
  } | null>(null);

  // --- Edit Mode ---
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<GeneratedSchedule | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [saving, setSaving] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token =
    typeof window !== 'undefined'
      ? (localStorage.getItem('authToken') ?? '')
      : '';

  // Load teams
  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const res = await fetch('/api/teams', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data?.error ?? 'Failed to load teams');
        setTeams(data);
        if (data?.length) setTeamId((prev) => prev ?? data[0].id);
      } catch (e: any) {
        setTeams([]);
        setError(e?.message ?? 'Failed to load teams');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load schedules list when team changes
  useEffect(() => {
    if (!teamId) {
      setList(null);
      setSelectedId(null);
      setSchedule(null);
      setEditMode(false);
      setDraft(null);
      return;
    }
    (async () => {
      try {
        setBusy(true);
        setError(null);
        setSchedule(null);
        setSelectedId(null);
        setEditMode(false);
        setDraft(null);

        const res = await fetch(`/api/teams/${teamId}/schedules`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(payload?.error ?? 'Failed to load schedules');

        setList(payload.schedules ?? []);
      } catch (e: any) {
        setList([]);
        setError(e?.message ?? 'Failed to load schedules');
      } finally {
        setBusy(false);
      }
    })();
  }, [teamId, token]);

  const loadSchedule = async (scheduleId: number) => {
    try {
      setBusy(true);
      setError(null);
      setSelectedId(scheduleId);

      setEditMode(false);
      setDraft(null);

      const res = await fetch(`/api/schedules/${scheduleId}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load schedule');

      setSchedule(payload.schedule);
      setDraft(payload.schedule?.data ?? null);
    } catch (e: any) {
      setSchedule(null);
      setDraft(null);
      setError(e?.message ?? 'Failed to load schedule');
    } finally {
      setBusy(false);
    }
  };

  // --- Edit mode: load team members (must include member IDs from /api/teams/[id]/data) ---
  const enterEditMode = async () => {
    if (!schedule) return;

    setError(null);
    setEditMode(true);
    setDraft(schedule.data);

    try {
      const res = await fetch(`/api/teams/${schedule.team.id}/data`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Failed to load team members');
      }

      const members: TeamMemberOption[] = Array.isArray(payload?.members)
        ? payload.members
            .map((m: any) => ({
              id: Number(m.id),
              name: String(m.name ?? '').trim(),
              leadership:
                m?.leadership == null ? null : String(m.leadership).trim(),
            }))
            .filter((m: TeamMemberOption) => Number.isFinite(m.id) && m.name)
        : [];

      setTeamMembers(members);
    } catch (e: any) {
      setTeamMembers([]);
      setError(e?.message ?? 'Failed to load team members');
    }
  };

  const cancelEdits = () => {
    setEditMode(false);
    setDraft(schedule?.data ?? null);
  };

  const saveEdits = async () => {
    if (!schedule || !draft) return;

    try {
      setSaving(true);
      setError(null);

      const scheduleId = (schedule as any)?.id; // ideally schedule.id
      if (!scheduleId) throw new Error('Missing schedule id');

      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          data: draft,
          name: (schedule as any)?.name, // optional
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to save schedule');

      setSchedule((prev) => (prev ? { ...prev, data: draft } : prev));
      setEditMode(false);
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    if (!schedule?.data?.shifts) return;

    const rows = [
      [
        'Date',
        'Weekday',
        'Shift',
        'Job',
        'Start',
        'End',
        'Required',
        'Assigned',
        'Unfilled',
      ],
    ];

    for (const s of schedule.data.shifts) {
      rows.push([
        s.date,
        s.weekday,
        s.shiftName,
        s.jobType ?? '',
        s.startHHMM,
        s.endHHMM,
        String(s.required),
        s.assigned?.map((a: any) => a.name).join(', ') ?? '',
        String(s.unfilled ?? 0),
      ]);
    }

    const csvContent = rows
      .map((row) =>
        row
          .map((field) => `"${String(field ?? '').replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${schedule.startDate}_${schedule.endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeData = editMode ? draft : schedule?.data;
  const rows = activeData?.shifts ?? [];
  const totalUnfilled = activeData?.stats?.totalUnfilledSlots ?? 0;

  const statsPairs = useMemo(() => {
    const h = activeData?.stats?.hoursByMember ?? {};
    const s = activeData?.stats?.shiftsByMember ?? {};
    const names = Array.from(new Set([...Object.keys(h), ...Object.keys(s)]));
    return names
      .map((name) => ({
        name,
        hours: Number(h[name] ?? 0),
        shifts: Number(s[name] ?? 0),
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [activeData]);

  const hasUnsavedChanges = useMemo(() => {
    if (!editMode) return false;
    if (!schedule || !draft) return false;
    try {
      return JSON.stringify(schedule.data) !== JSON.stringify(draft);
    } catch {
      return true;
    }
  }, [editMode, schedule, draft]);

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">📅 View Schedules</h1>
          <p className="text-sm text-neutral-600">
            Select a team, then view saved schedules.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/generate"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
          >
            + Generate Schedule
          </Link>
          <Link
            href="/teams/new"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            + Create Team
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Team selector */}
      <section className="rounded-2xl border p-5 space-y-3">
        <div className="grid gap-3 md:grid-cols-3 items-end">
          <div className="md:col-span-2">
            <label className="text-sm text-neutral-600">Team</label>
            <select
              className="mt-1 w-full rounded-lg border p-2"
              value={teamId ?? ''}
              onChange={(e) => setTeamId(Number(e.target.value))}
              disabled={editMode} // prevent switching while editing
              title={
                editMode ? 'Finish editing before switching teams' : undefined
              }
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
          <div className="text-xs text-neutral-500">
            {busy ? 'Loading…' : list ? `${list.length} schedules` : '—'}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
        {/* Left: schedules list */}
        <section className="rounded-2xl border p-4">
          <h2 className="text-lg font-semibold">Saved Schedules</h2>
          <p className="text-sm text-neutral-600 mb-3">
            Click one to view details.
          </p>

          <div className="max-h-[520px] overflow-auto rounded-xl border border-t dark:border-gray-700">
            {list === null ? (
              <div className="p-4 text-sm text-neutral-500">Loading…</div>
            ) : list.length === 0 ? (
              <div className="p-4 text-sm text-neutral-500">
                No schedules saved yet.
                <div className="mt-2">
                  <Link className="text-blue-600 underline" href="/generate">
                    Generate your first schedule
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-gray-700 cursor-pointer">
                {list.map((s) => {
                  const active = s.id === selectedId;
                  return (
                    <li
                      key={s.id}
                      className={`p-3 ${active ? 'bg-blue-50' : 'bg-blue-25 hover:bg-blue-200'}`}
                    >
                      <button
                        className="w-full text-left cursor-pointer"
                        onClick={() => {
                          if (editMode) return;
                          loadSchedule(s.id);
                        }}
                        disabled={editMode}
                        title={
                          editMode
                            ? 'Finish editing before switching schedules'
                            : undefined
                        }
                      >
                        <div className="text-sm font-medium truncate">
                          {s.name}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          {String(s.startDate).slice(0, 10)} →{' '}
                          {String(s.endDate).slice(0, 10)} •{' '}
                          {s.optimization ?? '—'}
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          Created: {fmtDate(s.createdAt)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Right: schedule detail */}
        <section className="rounded-2xl border p-5 space-y-4">
          {!schedule ? (
            <div className="rounded-lg border border-dashed p-8 text-sm text-neutral-500">
              Select a schedule on the left to view it here.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{schedule.name}</h2>
                  <p className="text-sm text-neutral-600">
                    Team: <b>{schedule.team.name}</b> • Created:{' '}
                    {fmtDate(schedule.createdAt)} • Unfilled:{' '}
                    <b>{totalUnfilled}</b>
                    {editMode && (
                      <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-neutral-600">
                        Edit mode {hasUnsavedChanges ? '• unsaved' : ''}
                      </span>
                    )}
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  {!editMode ? (
                    <button
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
                      onClick={enterEditMode}
                      disabled={busy}
                    >
                      ✏️ Edit
                    </button>
                  ) : (
                    <>
                      <button
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
                        onClick={cancelEdits}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                        onClick={saveEdits}
                        disabled={saving || !draft || !hasUnsavedChanges}
                        title={
                          !hasUnsavedChanges ? 'No changes to save' : undefined
                        }
                      >
                        {saving ? 'Saving…' : '💾 Save Changes'}
                      </button>
                    </>
                  )}

                  <button
                    className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
                    onClick={exportCSV}
                    disabled={editMode}
                    title={
                      editMode ? 'Finish editing before exporting' : undefined
                    }
                  >
                    ⬇️ Export
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-[980px] w-full text-left text-sm">
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
                      {rows.map((r) => {
                        const eligibleMembers = teamMembers.filter((m) =>
                          memberCanBeAddedToShift(m, r),
                        );

                        return (
                        <tr key={r.shiftId} className="border-t align-top">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.date} ({r.weekday})
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.shiftName}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.jobType ?? '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.startHHMM}–{r.endHHMM}
                          </td>
                          <td className="px-3 py-2">{r.required}</td>

                          {/* Assigned */}
                          <td className="px-3 py-2">
                            {!editMode ? (
                              r.assigned.length ? (
                                r.assigned.map((a) => a.name).join(', ')
                              ) : (
                                '—'
                              )
                            ) : (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {r.assigned.length ? (
                                    r.assigned.map((a) => (
                                      <span
                                        key={a.memberId}
                                        className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs"
                                      >
                                        {a.name}
                                        <button
                                          className="text-red-600"
                                          onClick={() =>
                                            setDraft((d) =>
                                              d
                                                ? removeAssigned(
                                                    d,
                                                    r.shiftId,
                                                    a.memberId,
                                                  )
                                                : d,
                                            )
                                          }
                                          title="Remove"
                                        >
                                          ✕
                                        </button>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-neutral-500">
                                      —
                                    </span>
                                  )}
                                </div>

                                <select
                                  className="w-full rounded-lg border p-2 text-sm"
                                  defaultValue=""
                                  onChange={(e) => {
                                    const id = Number(e.target.value);
                                    const m = eligibleMembers.find(
                                      (x) => x.id === id,
                                    );
                                    if (!m) return;

                                    setDraft((d) =>
                                      d ? addAssigned(d, r.shiftId, m) : d,
                                    );
                                    e.currentTarget.value = '';
                                  }}
                                  disabled={eligibleMembers.length === 0}
                                  title={
                                    eligibleMembers.length === 0
                                      ? 'No eligible members for this shift'
                                      : undefined
                                  }
                                >
                                  <option value="">+ Add team member…</option>
                                  {eligibleMembers.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>

                                <div className="text-xs text-neutral-500">
                                  {r.assigned.length}/{r.required} filled
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2">
                            {r.unfilled > 0 ? (
                              <span className="text-red-600 font-medium">
                                {r.unfilled}
                              </span>
                            ) : (
                              '0'
                            )}
                          </td>
                        </tr>
                        );
                      })}
                      {rows.length === 0 && (
                        <tr>
                          <td
                            className="px-3 py-6 text-sm text-neutral-500"
                            colSpan={7}
                          >
                            No shifts found in this schedule.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stats */}
              <details className="rounded-lg border p-3" open={!editMode}>
                <summary className="cursor-pointer text-sm font-medium">
                  Stats
                </summary>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="text-sm font-medium">Hours by member</div>
                    <div className="mt-2 space-y-1 text-sm">
                      {statsPairs.slice(0, 12).map((p) => (
                        <div
                          key={p.name}
                          className="flex items-center justify-between"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="tabular-nums text-neutral-600">
                            {p.hours.toFixed(2)}h • {p.shifts} shifts
                          </span>
                        </div>
                      ))}
                      {statsPairs.length === 0 && (
                        <div className="text-neutral-500">No stats found.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="text-sm font-medium">Notes</div>
                    <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
                      {(activeData?.notes ?? []).slice(0, 10).map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                    {(activeData?.notes?.length ?? 0) > 10 && (
                      <div className="mt-2 text-xs text-neutral-500">
                        Showing first 10 notes…
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
