'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Pencil, Download, AlertTriangle, X, Plus } from 'lucide-react';

type Team = { id: number; name: string };

type ScheduleMeta = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  optimization: string | null;
  createdAt: string;
};

type TeamMemberOption = { id: number; name: string };

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

function addAssigned(d: GeneratedSchedule, shiftId: string, member: { id: number; name: string }) {
  const next = {
    ...d,
    shifts: d.shifts.map((s) => {
      if (s.shiftId !== shiftId) return s;
      const already = s.assigned.some((a) => a.memberId === member.id);
      const full = s.assigned.length >= s.required;
      if (already || full) return s;
      return { ...s, assigned: [...s.assigned, { memberId: member.id, name: member.name }] };
    }),
  };
  return recomputeUnfilled(next);
}

function removeAssigned(d: GeneratedSchedule, shiftId: string, memberId: number) {
  const next = {
    ...d,
    shifts: d.shifts.map((s) => {
      if (s.shiftId !== shiftId) return s;
      return { ...s, assigned: s.assigned.filter((a) => a.memberId !== memberId) };
    }),
  };
  return recomputeUnfilled(next);
}

const selectClass =
  'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors';

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

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<GeneratedSchedule | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token =
    typeof window !== 'undefined' ? (localStorage.getItem('authToken') ?? '') : '';

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

  useEffect(() => {
    if (!teamId) {
      setList(null); setSelectedId(null); setSchedule(null); setEditMode(false); setDraft(null);
      return;
    }
    (async () => {
      try {
        setBusy(true); setError(null); setSchedule(null); setSelectedId(null); setEditMode(false); setDraft(null);
        const res = await fetch(`/api/teams/${teamId}/schedules`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error ?? 'Failed to load schedules');
        setList(payload.schedules ?? []);
      } catch (e: any) {
        setList([]); setError(e?.message ?? 'Failed to load schedules');
      } finally {
        setBusy(false);
      }
    })();
  }, [teamId, token]);

  const loadSchedule = async (scheduleId: number) => {
    try {
      setBusy(true); setError(null); setSelectedId(scheduleId); setEditMode(false); setDraft(null);
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load schedule');
      setSchedule(payload.schedule);
      setDraft(payload.schedule?.data ?? null);
    } catch (e: any) {
      setSchedule(null); setDraft(null); setError(e?.message ?? 'Failed to load schedule');
    } finally {
      setBusy(false);
    }
  };

  const enterEditMode = async () => {
    if (!schedule) return;
    setError(null); setEditMode(true); setDraft(schedule.data);
    try {
      const res = await fetch(`/api/teams/${schedule.team.id}/data`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load team members');
      const members: TeamMemberOption[] = Array.isArray(payload?.members)
        ? payload.members
            .map((m: any) => ({ id: Number(m.id), name: String(m.name ?? '').trim() }))
            .filter((m: TeamMemberOption) => Number.isFinite(m.id) && m.name)
        : [];
      setTeamMembers(members);
    } catch (e: any) {
      setTeamMembers([]); setError(e?.message ?? 'Failed to load team members');
    }
  };

  const cancelEdits = () => { setEditMode(false); setDraft(schedule?.data ?? null); };

  const saveEdits = async () => {
    if (!schedule || !draft) return;
    try {
      setSaving(true); setError(null);
      const scheduleId = (schedule as any)?.id;
      if (!scheduleId) throw new Error('Missing schedule id');
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ data: draft, name: (schedule as any)?.name }),
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
    const rows = [['Date', 'Weekday', 'Shift', 'Job', 'Start', 'End', 'Required', 'Assigned', 'Unfilled']];
    for (const s of schedule.data.shifts) {
      rows.push([s.date, s.weekday, s.shiftName, s.jobType ?? '', s.startHHMM, s.endHHMM,
        String(s.required), s.assigned?.map((a: any) => a.name).join(', ') ?? '', String(s.unfilled ?? 0)]);
    }
    const csvContent = rows.map((row) =>
      row.map((field) => `"${String(field ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${(schedule as any).startDate}_${(schedule as any).endDate}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
      .map((name) => ({ name, hours: Number(h[name] ?? 0), shifts: Number(s[name] ?? 0) }))
      .sort((a, b) => b.hours - a.hours);
  }, [activeData]);

  const hasUnsavedChanges = useMemo(() => {
    if (!editMode || !schedule || !draft) return false;
    try { return JSON.stringify(schedule.data) !== JSON.stringify(draft); } catch { return true; }
  }, [editMode, schedule, draft]);

  const thClass = 'px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Schedules</h1>
          <p className="mt-0.5 text-sm text-gray-500">Select a team, then view saved schedules.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/generate"
            className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Generate Schedule
          </Link>
          <Link
            href="/teams/new"
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            New Team
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Team selector */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
        <label className="mb-1.5 block text-xs font-medium text-gray-400">Team</label>
        <div className="flex items-center gap-3">
          <select
            className={selectClass}
            value={teamId ?? ''}
            onChange={(e) => setTeamId(Number(e.target.value))}
            disabled={editMode}
          >
            {teams === null && <option value="">Loading…</option>}
            {teams?.length === 0 && <option value="">No teams</option>}
            {teams?.map((t) => (
              <option key={t.id} value={t.id}>{t.name} (#{t.id})</option>
            ))}
          </select>
          <span className="shrink-0 text-xs text-gray-500">
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : list ? `${list.length} schedules` : '—'}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        {/* Saved schedules list */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-100">Saved Schedules</h2>
            <p className="mt-0.5 text-xs text-gray-500">Click one to view details.</p>
          </div>
          <div className="max-h-[520px] overflow-auto">
            {list === null ? (
              <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : list.length === 0 ? (
              <div className="p-5 text-sm text-gray-500">
                No schedules saved yet.
                <div className="mt-2">
                  <Link className="text-indigo-400 underline hover:text-indigo-300" href="/generate">
                    Generate your first schedule
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-gray-700/50">
                {list.map((s) => {
                  const active = s.id === selectedId;
                  return (
                    <li key={s.id}>
                      <button
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          active ? 'bg-indigo-900/20' : 'hover:bg-gray-700/30'
                        } ${editMode ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        onClick={() => { if (!editMode) loadSchedule(s.id); }}
                        disabled={editMode}
                      >
                        <div className="truncate text-sm font-medium text-gray-200">{s.name}</div>
                        <div className="mt-0.5 truncate text-xs text-gray-500">
                          {String(s.startDate).slice(0, 10)} → {String(s.endDate).slice(0, 10)}
                          {s.optimization ? ` · ${s.optimization}` : ''}
                        </div>
                        <div className="text-[11px] text-gray-600">Created: {fmtDate(s.createdAt)}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Schedule detail */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          {!schedule ? (
            <div className="flex h-full items-center justify-center p-10">
              <p className="text-sm text-gray-600">Select a schedule on the left to view it here.</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-700 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-100">{schedule.name}</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {schedule.team.name} · Created {fmtDate(schedule.createdAt)} ·{' '}
                    <span className={totalUnfilled > 0 ? 'text-red-400' : 'text-green-400'}>
                      {totalUnfilled} unfilled
                    </span>
                    {editMode && (
                      <span className="ml-2 rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                        Editing{hasUnsavedChanges ? ' · unsaved' : ''}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!editMode ? (
                    <button
                      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                      onClick={enterEditMode}
                      disabled={busy}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  ) : (
                    <>
                      <button
                        className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                        onClick={cancelEdits}
                        disabled={saving}
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                      <button
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
                        onClick={saveEdits}
                        disabled={saving || !draft || !hasUnsavedChanges}
                      >
                        {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </>
                  )}
                  <button
                    className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-40"
                    onClick={exportCSV}
                    disabled={editMode}
                  >
                    <Download className="h-3.5 w-3.5" /> Export
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-hidden">
                <div className="max-h-[480px] overflow-auto">
                  <table className="min-w-[960px] w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-800/80">
                      <tr>
                        {['Date', 'Shift', 'Job', 'Time', 'Required', 'Assigned', 'Unfilled'].map((h) => (
                          <th key={h} className={thClass}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr
                          key={r.shiftId}
                          className={`border-t border-gray-700/50 align-top ${i % 2 === 0 ? 'bg-gray-900/20' : ''}`}
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">
                            {r.date} <span className="text-gray-600">({r.weekday})</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">{r.shiftName}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400">{r.jobType ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-300">
                            {r.startHHMM}–{r.endHHMM}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400">{r.required}</td>

                          {/* Assigned */}
                          <td className="px-3 py-2">
                            {!editMode ? (
                              <span className="text-xs text-gray-300">
                                {r.assigned.length ? r.assigned.map((a) => a.name).join(', ') : '—'}
                              </span>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {r.assigned.length ? (
                                    r.assigned.map((a) => (
                                      <span
                                        key={a.memberId}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-300"
                                      >
                                        {a.name}
                                        <button
                                          className="text-red-400 hover:text-red-300"
                                          onClick={() =>
                                            setDraft((d) => d ? removeAssigned(d, r.shiftId, a.memberId) : d)
                                          }
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-gray-600">—</span>
                                  )}
                                </div>
                                <select
                                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
                                  defaultValue=""
                                  onChange={(e) => {
                                    const id = Number(e.target.value);
                                    const m = teamMembers.find((x) => x.id === id);
                                    if (!m) return;
                                    setDraft((d) => d ? addAssigned(d, r.shiftId, m) : d);
                                    e.currentTarget.value = '';
                                  }}
                                  disabled={teamMembers.length === 0}
                                >
                                  <option value="">+ Add member…</option>
                                  {teamMembers.map((m) => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                  ))}
                                </select>
                                <div className="text-xs text-gray-600">{r.assigned.length}/{r.required} filled</div>
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2">
                            {r.unfilled > 0 ? (
                              <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-400">
                                {r.unfilled}
                              </span>
                            ) : (
                              <span className="text-xs text-green-500">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-sm text-gray-600">No shifts found in this schedule.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stats */}
              <details className="border-t border-gray-700" open={!editMode}>
                <summary className="cursor-pointer px-5 py-3 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors">
                  Stats & Notes
                </summary>
                <div className="grid gap-3 p-5 pt-0 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-4">
                    <div className="mb-2 text-xs font-medium text-gray-400">Hours by member</div>
                    <div className="space-y-1.5">
                      {statsPairs.slice(0, 12).map((p) => (
                        <div key={p.name} className="flex items-center justify-between">
                          <span className="truncate text-xs text-gray-300">{p.name}</span>
                          <span className="shrink-0 font-mono text-xs text-gray-500">
                            {p.hours.toFixed(1)}h · {p.shifts}s
                          </span>
                        </div>
                      ))}
                      {statsPairs.length === 0 && <div className="text-xs text-gray-600">No stats found.</div>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-4">
                    <div className="mb-2 text-xs font-medium text-gray-400">Notes</div>
                    <ul className="space-y-1 text-xs text-gray-500">
                      {(activeData?.notes ?? []).slice(0, 10).map((n, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="mt-0.5 shrink-0 text-gray-700">·</span>
                          {n}
                        </li>
                      ))}
                    </ul>
                    {(activeData?.notes?.length ?? 0) > 10 && (
                      <div className="mt-2 text-xs text-gray-600">Showing first 10 notes…</div>
                    )}
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
