'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Swal from 'sweetalert2';
import { RefreshCw, Plus, Trash2, Users, CheckCircle2, AlertTriangle } from 'lucide-react';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const INT_TO_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function buildAvailabilityRowsFromApi(
  members: Array<{ id: number; name: string; job?: string | null; position?: string | null }>,
  windows: Array<{ memberId: number; dayOfWeek: number; startTime: string; endTime: string }>,
) {
  const byId = new Map<number, any>();

  members.forEach((m) => {
    const row: any = {
      Name: m.name,
      Job: (m as any).job ?? '',
      Position: (m as any).position ?? '',
      Ranking: (m as any).ranking ?? '',
      Leadership: (m as any).leadership ?? '',
      'Min Hours/Week': (m as any).minHoursWeek ?? '',
      'Max Hours/Week': (m as any).maxHoursWeek ?? '',
      'Min Days/Week': (m as any).minDaysWeek ?? '',
      'Max Days/Week': (m as any).maxDaysWeek ?? '',
      Notes: (m as any).notes ?? '',
    };
    WEEKDAYS.forEach((d) => (row[d] = ''));
    byId.set(m.id, row);
  });

  windows.forEach((w) => {
    const row = byId.get(w.memberId);
    if (!row) return;
    const day = INT_TO_DAY[w.dayOfWeek] ?? 'Monday';
    const seg = `${w.startTime}-${w.endTime}`;
    row[day] = row[day] ? `${row[day]}\n${seg}` : seg;
  });

  return Array.from(byId.values());
}

const SHIFT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function buildShiftRowsCsvStyle(
  templates: Array<{ shift: string; day: string; startTime: string; endTime: string }>,
) {
  const map = new Map<string, Record<string, string[]>>();

  for (const t of templates) {
    const jobType = (t.shift ?? '').trim();
    if (!jobType) continue;
    if (!map.has(jobType)) {
      const init: Record<string, string[]> = {};
      SHIFT_DAYS.forEach((d) => (init[d] = []));
      map.set(jobType, init);
    }
    const bucket = map.get(jobType)!;
    if (SHIFT_DAYS.includes(t.day as any)) {
      bucket[t.day].push(`${t.startTime} - ${t.endTime}`);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([jobType, byDay]) => {
      const row: any = { Job_Type: jobType };
      SHIFT_DAYS.forEach((d) => { row[d] = byDay[d].join('\n'); });
      return row;
    });
}

export default function TeamData({ teamId, teamName }: { teamId: number | null; teamName: string | null }) {
  const [teams, setTeams] = useState<{ id: number; name: string }[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(teamId);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(teamName);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [availabilityRows, setAvailabilityRows] = useState<any[] | null>(null);
  const [shiftsRows, setShiftsRows] = useState<any[] | null>(null);

  const availabilityCount = availabilityRows?.length ?? 0;
  const shiftsCount = shiftsRows?.length ?? 0;

  const effectiveTeamId = selectedTeamId ?? teamId ?? null;
  const effectiveTeamName = selectedTeamName ?? teamName ?? null;

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    (async () => {
      try {
        setTeamsError(null);
        const res = await fetch('/api/teams', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Failed to load teams');
        const data = (await res.json()) as { id: number; name: string }[];
        setTeams(data);
        if (!effectiveTeamId && data.length > 0) {
          setSelectedTeamId(data[0].id);
          setSelectedTeamName(data[0].name);
        }
      } catch (e: any) {
        setTeamsError(e?.message || 'Unable to fetch teams');
        setTeams([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!effectiveTeamId) {
      setAvailabilityRows(null);
      setShiftsRows(null);
      return;
    }
    (async () => {
      const token = localStorage.getItem('authToken') ?? '';
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const aRes = await fetch(`/api/teams/${effectiveTeamId}/availability`, { cache: 'no-store', headers });
      if (aRes.ok) {
        const a = await aRes.json();
        if (Array.isArray(a?.members) && Array.isArray(a?.windows)) {
          setAvailabilityRows(buildAvailabilityRowsFromApi(a.members, a.windows));
        } else {
          setAvailabilityRows(null);
        }
      } else {
        setAvailabilityRows(null);
      }

      const sRes = await fetch(`/api/teams/${effectiveTeamId}/shifts`, { cache: 'no-store', headers });
      if (sRes.ok) {
        const s = await sRes.json();
        if (Array.isArray(s?.templates)) {
          setShiftsRows(buildShiftRowsCsvStyle(s.templates));
        } else {
          setShiftsRows(null);
        }
      } else {
        setShiftsRows(null);
      }
    })();
  }, [effectiveTeamId]);

  const refreshTeams = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    try {
      setTeamsError(null);
      const res = await fetch('/api/teams', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to refresh teams');
      const data = (await res.json()) as { id: number; name: string }[];
      setTeams(data);
    } catch (e: any) {
      setTeamsError(e?.message || 'Unable to refresh teams');
    }
  };

  const handlePickTeam = (t: { id: number; name: string }) => {
    setSelectedTeamId(t.id);
    setSelectedTeamName(t.name);
    setDeleteError(null);
  };

  const handleDeleteTeam = async () => {
    if (!effectiveTeamId) return;
    const confirm = await Swal.fire({
      title: 'Delete team?',
      html: `Delete <b>${effectiveTeamName ?? 'this team'}</b>?<br/><br/>This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
      focusCancel: true,
    });
    if (!confirm.isConfirmed) return;

    const token = localStorage.getItem('authToken') ?? '';
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      setDeleting(true);
      setDeleteError(null);
      Swal.fire({ title: 'Deleting…', text: 'Please wait', allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });

      const res = await fetch(`/api/teams/${effectiveTeamId}`, { method: 'DELETE', headers });
      const raw = await res.text();
      let payload: any = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
      if (!res.ok) {
        const msg = (payload && (payload.message || payload.error)) || `Failed to delete team (HTTP ${res.status})`;
        throw new Error(msg);
      }

      const listRes = await fetch('/api/teams', { cache: 'no-store', headers });
      const listRaw = await listRes.text();
      const data = listRes.ok ? ((JSON.parse(listRaw || '[]') as { id: number; name: string }[]) ?? []) : [];
      setTeams(data);

      if (data.length > 0) {
        setSelectedTeamId(data[0].id);
        setSelectedTeamName(data[0].name);
      } else {
        setSelectedTeamId(null);
        setSelectedTeamName(null);
        setAvailabilityRows(null);
        setShiftsRows(null);
      }

      await Swal.fire({ title: 'Deleted!', text: 'Team deleted successfully.', icon: 'success', timer: 1400, showConfirmButton: false });
    } catch (e: any) {
      const msg = e?.message || 'Unable to delete team';
      setDeleteError(msg);
      await Swal.fire({ title: 'Delete failed', text: msg, icon: 'error' });
    } finally {
      setDeleting(false);
      Swal.close();
    }
  };

  const statusText = useMemo(() => {
    if (!effectiveTeamId) return 'No team selected';
    const a = availabilityRows ? `${availabilityCount} people` : 'No availability';
    const s = shiftsRows ? `${shiftsCount} shifts` : 'No shifts';
    return `${a} · ${s}`;
  }, [effectiveTeamId, availabilityRows, shiftsRows, availabilityCount, shiftsCount]);

  const thClass = 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500';
  const tdClass = 'px-3 py-2 align-top text-xs text-gray-300';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Team Data</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {effectiveTeamName ? (
              <>Viewing <span className="text-gray-300">{effectiveTeamName}</span> — {statusText}</>
            ) : (
              'No team selected'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDeleteTeam}
            disabled={!effectiveTeamId || deleting}
            className="flex items-center gap-1.5 rounded-lg border border-red-800 bg-red-950/30 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? 'Deleting…' : 'Delete Team'}
          </button>
          <Link
            href="/teams/new"
            className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
          >
            <Plus className="h-3.5 w-3.5" />
            New Team
          </Link>
        </div>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {deleteError}
        </div>
      )}

      {/* Teams selector */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50">
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-100">Teams</h2>
          </div>
          <button
            onClick={refreshTeams}
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="p-4">
          {teamsError && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {teamsError}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-gray-700">
            <div className="h-44 overflow-y-auto">
              {teams === null ? (
                <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading teams…
                </div>
              ) : teams.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  No teams yet. Click <span className="text-gray-300">New Team</span> to create one.
                </div>
              ) : (
                <ul className="divide-y divide-gray-700/50">
                  {teams.map((t) => {
                    const active = t.id === effectiveTeamId;
                    return (
                      <li
                        key={t.id}
                        className={`flex items-center justify-between px-4 py-3 transition-colors ${
                          active ? 'bg-indigo-900/20' : 'hover:bg-gray-700/30'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-200">{t.name}</p>
                          <p className="text-xs text-gray-500">ID: {t.id}</p>
                        </div>
                        {active ? (
                          <span className="rounded-full border border-indigo-600 bg-indigo-700 px-2 py-0.5 text-xs text-white">
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePickTeam(t)}
                            className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                          >
                            Use This
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-600">Pick a team to view its availability and shift templates.</p>
        </div>
      </div>

      {/* Tables */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Team Availability */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-100">Team Availability</h2>
            <p className="mt-0.5 text-xs text-gray-500">Read-only view of saved availability.</p>
          </div>
          <div className="p-4">
            {availabilityRows && availabilityRows.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-gray-700">
                <div className="h-72 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[1100px] text-left">
                    <thead className="sticky top-0 bg-gray-800/80">
                      <tr>
                        {Object.keys(availabilityRows[0]).map((key) => (
                          <th key={key} className={thClass}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {availabilityRows.map((row, i) => (
                        <tr
                          key={i}
                          className={`border-t border-gray-700/50 ${i % 2 === 0 ? 'bg-gray-900/30' : ''}`}
                        >
                          {Object.keys(availabilityRows[0]).map((key) => (
                            <td key={key} className={`${tdClass} whitespace-pre-line break-words`}>
                              {row[key] == null || row[key] === '' ? '—' : String(row[key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-gray-700/50 p-2 text-right text-xs text-gray-600">
                  {availabilityRows.length} rows × {Object.keys(availabilityRows[0]).length} columns
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-600">
                No availability saved for this team.
              </div>
            )}
          </div>
        </div>

        {/* Shift Requirements */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-100">Shift Requirements</h2>
            <p className="mt-0.5 text-xs text-gray-500">Read-only view of saved shift templates.</p>
          </div>
          <div className="p-4">
            {shiftsRows && shiftsRows.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-gray-700">
                <div className="h-72 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[1100px] table-fixed text-left">
                    <thead className="sticky top-0 bg-gray-800/80">
                      <tr>
                        {Object.keys(shiftsRows[0]).map((k) => (
                          <th key={k} className={thClass}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shiftsRows.map((r, i) => (
                        <tr
                          key={i}
                          className={`border-t border-gray-700/50 ${i % 2 === 0 ? 'bg-gray-900/30' : ''}`}
                        >
                          {Object.keys(shiftsRows[0]).map((k) => (
                            <td key={k} className={`${tdClass} whitespace-pre-line break-words`}>
                              {String(r[k] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-gray-700/50 p-2 text-right text-xs text-gray-600">
                  {shiftsRows.length} rows × {Object.keys(shiftsRows[0]).length} columns
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-600">
                No shift templates saved for this team.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Availability',
            value: availabilityRows ? `${availabilityCount} people` : 'None',
            ok: Boolean(availabilityRows),
          },
          {
            label: 'Shifts',
            value: shiftsRows ? `${shiftsCount} shifts` : 'None',
            ok: Boolean(shiftsRows),
          },
          {
            label: 'Team',
            value: effectiveTeamName ?? '—',
            ok: Boolean(effectiveTeamName),
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{stat.label}</p>
              {stat.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-gray-200">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
