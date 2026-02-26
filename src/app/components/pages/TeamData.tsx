'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Swal from "sweetalert2";

/** Helpers to normalize API shape -> table rows */
const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const INT_TO_DAY = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function buildAvailabilityRowsFromApi(
  members: Array<{
    id: number;
    name: string;
    job?: string | null;
    position?: string | null;
  }>,
  windows: Array<{
    memberId: number;
    dayOfWeek: number; // 0-6 (Sun-Sat)
    startTime: string; // "HH:MM"
    endTime: string; // "HH:MM"
  }>,
) {
  const byId = new Map<number, any>();

  members.forEach((m) => {
    const row: any = {
      Name: m.name,
      Job: m.job ?? '',
      Position: m.position ?? '',
    };
    WEEKDAYS.forEach((d) => (row[d] = ''));
    byId.set(m.id, row);
  });

  windows.forEach((w) => {
    const row = byId.get(w.memberId);
    if (!row) return;
    const day = INT_TO_DAY[w.dayOfWeek] ?? 'Monday';
    const seg = `${w.startTime}-${w.endTime}`;
    row[day] = row[day] ? `${row[day]}, ${seg}` : seg;
  });

  return Array.from(byId.values());
}

function buildShiftRowsFromApi(
  templates: Array<{
    shift: string;
    jobType?: string | null;
    day: string; // "Monday"
    startTime: string; // "HH:MM"
    endTime: string; // "HH:MM"
    required?: number;
  }>,
) {
  return templates.map((t) => ({
    Shift: t.shift,
    Job_Type: t.jobType ?? '',
    Day: t.day,
    Start_Time: t.startTime,
    End_Time: t.endTime,
    Required: t.required ?? 1,
  }));
}

/** Component (display-only) */
export default function TeamData({
  teamId,
  teamName,
}: {
  teamId: number | null;
  teamName: string | null;
}) {
  // teams list + selection
  const [teams, setTeams] = useState<{ id: number; name: string }[] | null>(
    null,
  );
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(teamId);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(
    teamName,
  );

  // delete state
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // loaded tables
  const [availabilityRows, setAvailabilityRows] = useState<any[] | null>(null);
  const [shiftsRows, setShiftsRows] = useState<any[] | null>(null);

  const availabilityCount = availabilityRows?.length ?? 0;
  const shiftsCount = shiftsRows?.length ?? 0;

  const effectiveTeamId = selectedTeamId ?? teamId ?? null;
  const effectiveTeamName = selectedTeamName ?? teamName ?? null;

  // Load teams on mount
  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

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

        // preselect first if none provided
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

  // Whenever team changes, load availability + shifts from their real endpoints
  useEffect(() => {
    if (!effectiveTeamId) {
      setAvailabilityRows(null);
      setShiftsRows(null);
      return;
    }

    (async () => {
      const token = localStorage.getItem('authToken') ?? '';
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      // ---- Availability ----
      const aRes = await fetch(`/api/teams/${effectiveTeamId}/availability`, {
        cache: 'no-store',
        headers,
      });

      if (aRes.ok) {
        const a = await aRes.json();
        if (Array.isArray(a?.members) && Array.isArray(a?.windows)) {
          setAvailabilityRows(
            buildAvailabilityRowsFromApi(a.members, a.windows),
          );
        } else {
          setAvailabilityRows(null);
        }
      } else {
        const err = await aRes.json().catch(() => ({}));
        console.warn('load availability failed', aRes.status, err);
        setAvailabilityRows(null);
      }

      // ---- Shifts ----
      const sRes = await fetch(`/api/teams/${effectiveTeamId}/shifts`, {
        cache: 'no-store',
        headers,
      });

      if (sRes.ok) {
        const s = await sRes.json();
        if (Array.isArray(s?.templates)) {
          setShiftsRows(buildShiftRowsFromApi(s.templates));
        } else {
          setShiftsRows(null);
        }
      } else {
        const err = await sRes.json().catch(() => ({}));
        console.warn('load shifts failed', sRes.status, err);
        setShiftsRows(null);
      }
    })();
  }, [effectiveTeamId]);

  const refreshTeams = async () => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
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
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    try {
      setDeleting(true);
      setDeleteError(null);

      // optional: show a loading modal
      Swal.fire({
        title: 'Deleting…',
        text: 'Please wait',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
      });

      const res = await fetch(`/api/teams/${effectiveTeamId}`, {
        method: 'DELETE',
        headers,
      });

      const raw = await res.text();
      let payload: any = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = raw;
      }

      if (!res.ok) {
        const msg =
          (payload && (payload.message || payload.error)) ||
          `Failed to delete team (HTTP ${res.status})`;
        throw new Error(msg);
      }

      // Refresh list after delete
      const listRes = await fetch('/api/teams', { cache: 'no-store', headers });
      const listRaw = await listRes.text();
      const data = listRes.ok
        ? ((JSON.parse(listRaw || '[]') as { id: number; name: string }[]) ??
          [])
        : [];

      setTeams(data);

      // Pick a new team (first) or clear
      if (data.length > 0) {
        setSelectedTeamId(data[0].id);
        setSelectedTeamName(data[0].name);
      } else {
        setSelectedTeamId(null);
        setSelectedTeamName(null);
        setAvailabilityRows(null);
        setShiftsRows(null);
      }

      await Swal.fire({
        title: 'Deleted!',
        text: 'Team deleted successfully.',
        icon: 'success',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e: any) {
      const msg = e?.message || 'Unable to delete team';

      setDeleteError(msg);

      await Swal.fire({
        title: 'Delete failed',
        text: msg,
        icon: 'error',
      });
    } finally {
      setDeleting(false);
      Swal.close(); // closes loading if still open
    }
  };

  const statusText = useMemo(() => {
    if (!effectiveTeamId) return 'No team selected';
    const a = availabilityRows
      ? `${availabilityCount} people`
      : 'No availability';
    const s = shiftsRows ? `${shiftsCount} shifts` : 'No shifts';
    return `${a} • ${s}`;
  }, [
    effectiveTeamId,
    availabilityRows,
    shiftsRows,
    availabilityCount,
    shiftsCount,
  ]);

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">📁 Team Data</h1>
          <p className="text-sm text-neutral-600">
            {effectiveTeamName ? (
              <>
                Viewing team:{' '}
                <span className="font-medium">{effectiveTeamName}</span> —{' '}
                {statusText}
              </>
            ) : (
              'No team selected'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDeleteTeam}
            disabled={!effectiveTeamId || deleting}
            className="rounded-lg border border-red-300 bg-red-600 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-700/20"
            title={
              !effectiveTeamId ? 'Select a team to delete' : 'Delete this team'
            }
          >
            {deleting ? 'Deleting...' : '🗑️ Delete Team'}
          </button>

          <Link
            href="/teams/new"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
          >
            + Create New Team
          </Link>
        </div>
      </div>

      {/* Delete error */}
      {deleteError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {/* Teams selector */}
      <section className="rounded-2xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Teams</h2>
          <button
            onClick={refreshTeams}
            className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-neutral-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Refresh
          </button>
        </div>

        <div className="mt-3">
          {teamsError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {teamsError}
            </div>
          )}

          <div className="relative mt-2 overflow-hidden rounded-xl border">
            <div className="h-48 overflow-y-auto">
              {teams === null ? (
                <div className="p-4 text-sm text-neutral-400">
                  Loading teams…
                </div>
              ) : teams.length === 0 ? (
                <div className="p-4 text-sm text-neutral-600">
                  No teams yet. Click <b>+ Create New Team</b> to add one.
                </div>
              ) : (
                <ul className="divide-y">
                  {teams.map((t) => {
                    const active = t.id === effectiveTeamId;
                    return (
                      <li
                        key={t.id}
                        className={`flex items-center justify-between p-3 ${
                          active
                            ? 'bg-blue-50 dark:bg-blue-950/30'
                            : 'bg-white dark:bg-gray-900'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {t.name}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            ID: {t.id}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {active ? (
                            <span className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white">
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={() => handlePickTeam(t)}
                              className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50 dark:border-gray-700 dark:hover:bg-gray-800"
                            >
                              Use This
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <p className="mt-2 text-xs text-neutral-500">
            Pick a team to view its saved availability and shift templates.
          </p>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Team Availability (read-only) */}
        <section className="rounded-2xl border p-5">
          <h2 className="mb-2 text-lg font-semibold">Team Availability</h2>
          <p className="mb-4 text-sm text-neutral-600">
            Read-only view of saved availability for this team.
          </p>

          {availabilityRows && availabilityRows.length > 0 ? (
            <div className="relative mt-2 rounded-lg border border-neutral-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900">
              <div className="h-80 overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[800px] text-left text-sm text-gray-600 dark:text-gray-300">
                  <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700">
                    <tr className="text-xs uppercase text-gray-700 dark:text-gray-300">
                      {Object.keys(availabilityRows[0]).map((key) => (
                        <th
                          key={key}
                          className="whitespace-nowrap px-3 py-2 font-medium"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {availabilityRows.map((row, i) => (
                      <tr key={i} className="border-t dark:border-gray-700">
                        {Object.keys(availabilityRows[0]).map((key) => (
                          <td key={key} className="whitespace-nowrap px-3 py-2">
                            {String(row[key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="p-2 text-right text-xs text-neutral-500">
                Total: {availabilityRows.length} rows ×{' '}
                {Object.keys(availabilityRows[0]).length} columns
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-neutral-500">
              No availability saved for this team.
            </div>
          )}
        </section>

        {/* Shift Requirements (read-only) */}
        <section className="rounded-2xl border p-5">
          <h2 className="mb-2 text-lg font-semibold">Shift Requirements</h2>
          <p className="mb-4 text-sm text-neutral-600">
            Read-only view of saved shift templates for this team.
          </p>

          {shiftsRows && shiftsRows.length > 0 ? (
            <div className="relative mt-2 rounded-lg border border-neutral-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900">
              <div className="h-80 overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[600px] table-fixed text-left text-sm text-gray-500 dark:text-gray-300">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
                    <tr>
                      {Object.keys(shiftsRows[0]).map((k) => (
                        <th
                          key={k}
                          className="whitespace-nowrap px-3 py-2 font-medium"
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shiftsRows.map((r, i) => (
                      <tr key={i} className="border-t dark:border-gray-700">
                        {Object.keys(shiftsRows[0]).map((k) => (
                          <td key={k} className="whitespace-nowrap px-3 py-2">
                            {String(r[k] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="p-2 text-right text-xs text-neutral-500">
                Total: {shiftsRows.length} rows ×{' '}
                {Object.keys(shiftsRows[0]).length} columns
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-neutral-500">
              No shift templates saved for this team.
            </div>
          )}
        </section>
      </div>

      {/* Status */}
      <section className="rounded-2xl border p-5">
        <h3 className="mb-3 text-base font-semibold">📊 Current Data Status</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border p-3">
            <p className="text-sm">Availability</p>
            <p className="text-sm text-neutral-600">
              {availabilityRows ? `✅ ${availabilityCount} people` : '⚠️ None'}
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-sm">Shifts</p>
            <p className="text-sm text-neutral-600">
              {shiftsRows ? `✅ ${shiftsCount} shifts` : '⚠️ None'}
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-sm">Team</p>
            <p className="text-sm text-neutral-600">
              {effectiveTeamName ?? '—'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
