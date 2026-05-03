'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import Papa from 'papaparse';

/* ── Availability CSV → DB payload ──────────────────── */
function _parseAvailCell(val: string): { start: string; end: string } | null {
  const s = String(val ?? '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('unavailable')) return null;
  if (lower === 'available all day') return { start: '00:00', end: '23:59' };
  const match = s.match(/partially\s+available\s*(.+)/i);
  if (match) {
    const range = match[1].trim();
    const dash = range.indexOf(' - ');
    if (dash !== -1) {
      const start = _normTime(range.slice(0, dash).trim());
      const end = _normTime(range.slice(dash + 3).trim());
      if (start && end) return { start, end };
    }
  }
  return null;
}

function _normTime(t?: string | null): string | null {
  if (!t) return null;
  const s = String(t).trim();
  if (!s || s.toLowerCase() === 'off') return null;
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

const _AVAIL_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const _DAY_ENUM: Record<string, string> = {
  sunday: 'SUN',
  monday: 'MON',
  tuesday: 'TUE',
  wednesday: 'WED',
  thursday: 'THU',
  friday: 'FRI',
  saturday: 'SAT',
};

function _parseAvailForDb(rows: Record<string, string>[]) {
  const headers = Object.keys(rows[0] ?? {});
  const isNewFmt = _AVAIL_DAYS.some((d) => headers.includes(d));

  const members: Record<string, unknown>[] = [];
  const windows: Record<string, unknown>[] = [];

  for (const row of rows) {
    const name = row['Name']?.trim();
    if (!name) continue;

    const position = row['Position']?.trim() || null;
    const leadership = row['Leadership']?.trim() || null;
    const rankingRaw = parseFloat(row['Ranking'] ?? '');
    const minH = parseFloat(
      row['Min hours per week'] ?? row['Min Hours/Week'] ?? '',
    );
    const maxH = parseFloat(
      row['Max hours per week'] ?? row['Max Hours/Week'] ?? '',
    );
    const minD = parseFloat(
      row['Min Days per week'] ?? row['Min Days/Week'] ?? '',
    );
    const maxD = parseFloat(
      row['Max Days per week'] ?? row['Max Days/Week'] ?? '',
    );

    members.push({
      name,
      job: position,
      position,
      leadership,
      ranking: Number.isFinite(rankingRaw) ? rankingRaw : null,
      minHoursWeek: Number.isFinite(minH) ? minH : null,
      maxHoursWeek: Number.isFinite(maxH) ? maxH : null,
      minDaysWeek: Number.isFinite(minD) ? minD : null,
      maxDaysWeek: Number.isFinite(maxD) ? maxD : null,
      notes: row['Notes']?.trim() || null,
    });

    if (isNewFmt) {
      for (const day of _AVAIL_DAYS) {
        if (!headers.includes(day)) continue;
        const times = _parseAvailCell(row[day] ?? '');
        if (!times) continue;
        windows.push({
          memberName: name,
          weekday: _DAY_ENUM[day.toLowerCase()],
          startHHMM: times.start,
          endHHMM: times.end,
        });
      }
    } else {
      for (const day of _AVAIL_DAYS) {
        const start = _normTime(
          row[`${day} Start`] ?? row[`${day}Start`] ?? '',
        );
        const end = _normTime(row[`${day} End`] ?? row[`${day}End`] ?? '');
        const wd = _DAY_ENUM[day.toLowerCase()];
        if (wd && (start || end))
          windows.push({
            memberName: name,
            weekday: wd,
            startHHMM: start,
            endHHMM: end,
          });
      }
    }
  }

  return { members, windows };
}

/* ── Shift CSV helpers ───────────────────────────────── */
const _WEEKDAY_MAP: Record<string, string> = {
  monday: 'MON',
  tuesday: 'TUE',
  wednesday: 'WED',
  thursday: 'THU',
  friday: 'FRI',
  saturday: 'SAT',
  sunday: 'SUN',
};
const _ALL_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function _normalizeTime(t?: string | null): string | null {
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

function _parseShiftsFromCsv(rows: Record<string, string>[]) {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const isPivoted = _ALL_DAYS.some((d) => headers.includes(d));
  const templates: {
    shiftName: string;
    jobType: string | null;
    weekday: string;
    startHHMM: string;
    endHHMM: string;
  }[] = [];

  if (isPivoted) {
    for (const r of rows) {
      const firstKey = Object.keys(r)[0];
      const shiftName = String(r[firstKey] ?? '').trim();
      if (!shiftName) continue;
      const lower = shiftName.toLowerCase();
      let jobType: string | null = null;
      if (
        lower.includes('boh') ||
        lower.includes('back') ||
        lower.includes('kitchen')
      )
        jobType = 'BOH';
      else if (lower.includes('foh') || lower.includes('front'))
        jobType = 'FOH';
      else if (lower.includes('truck') || lower.includes('delivery'))
        jobType = 'TRUCK';
      else if (lower.includes('prep')) jobType = 'PREP';

      for (const day of _ALL_DAYS) {
        if (!headers.includes(day)) continue;
        const val = String(r[day] ?? '').trim();
        if (!val) continue;
        const weekday = _WEEKDAY_MAP[day.toLowerCase()];
        if (!weekday) continue;
        const entries = val.includes('\n') ? val.split('\n') : [val];
        for (const entry of entries) {
          const dashIdx = entry.indexOf(' - ');
          if (dashIdx === -1) continue;
          const start = _normalizeTime(entry.slice(0, dashIdx).trim());
          const end = _normalizeTime(entry.slice(dashIdx + 3).trim());
          if (!start || !end) continue;
          templates.push({
            shiftName,
            jobType,
            weekday,
            startHHMM: start,
            endHHMM: end,
          });
        }
      }
    }
  } else {
    for (const r of rows) {
      const shiftName = String(r['Shift'] ?? '').trim();
      const jobType = String(r['Job_Type'] ?? '').trim() || null;
      const weekday =
        _WEEKDAY_MAP[
          String(r['Day'] ?? '')
            .trim()
            .toLowerCase()
        ];
      const start = _normalizeTime(String(r['Start_Time'] ?? ''));
      const end = _normalizeTime(String(r['End_Time'] ?? ''));
      if (!shiftName || !weekday || !start || !end) continue;
      templates.push({
        shiftName,
        jobType,
        weekday,
        startHHMM: start,
        endHHMM: end,
      });
    }
  }
  return templates;
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

  // create team state
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // availability re-upload
  const availUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingAvail, setUploadingAvail] = useState(false);

  // shift re-upload
  const shiftsUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingShifts, setUploadingShifts] = useState(false);

  // drag-over state for the two drop zones
  const [availDragOver, setAvailDragOver] = useState(false);
  const [shiftsDragOver, setShiftsDragOver] = useState(false);

  // raw CSV rows uploaded by user — displayed exactly as-is
  const [availCsvRawRows, setAvailCsvRawRows] = useState<
    Record<string, string>[] | null
  >(null);
  const [shiftCsvRawRows, setShiftCsvRawRows] = useState<
    Record<string, string>[] | null
  >(null);

  const availabilityCount = availCsvRawRows?.length ?? 0;
  const shiftsCount = shiftCsvRawRows?.length ?? 0;

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
      } catch (e: unknown) {
        setTeamsError((e as Error)?.message || 'Unable to fetch teams');
        setTeams([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore CSV rows from localStorage when the selected team changes,
  // or clear them if no localStorage data exists for that team.
  useEffect(() => {
    if (!effectiveTeamId) {
      setAvailCsvRawRows(null);
      setShiftCsvRawRows(null);
      return;
    }

    // Persist the active team so Generate page picks it up too
    try {
      localStorage.setItem('currentTeamId', String(effectiveTeamId));
    } catch {
      /* non-fatal */
    }

    // Restore shifts CSV
    try {
      const raw = localStorage.getItem(`shifts_csv_${effectiveTeamId}`);
      setShiftCsvRawRows(
        raw ? (JSON.parse(raw) as Record<string, string>[]) : null,
      );
    } catch {
      setShiftCsvRawRows(null);
    }

    // Restore availability CSV
    try {
      const raw = localStorage.getItem(`avail_csv_${effectiveTeamId}`);
      setAvailCsvRawRows(
        raw ? (JSON.parse(raw) as Record<string, string>[]) : null,
      );
    } catch {
      setAvailCsvRawRows(null);
    }
  }, [effectiveTeamId]);

  const handleUploadShifts = (file: File) => {
    if (!effectiveTeamId) return;
    setUploadingShifts(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res: Papa.ParseResult<Record<string, string>>) => {
        // Keep raw rows exactly as PapaParse returned them (display as-is)
        const rawRows = res.data
          .map((r) => {
            const row: Record<string, string> = {};
            Object.keys(r).forEach((k) => {
              row[k.trim()] = String(r[k] ?? '').trim();
            });
            return row;
          })
          .filter((r) => Object.values(r).some((v) => v !== ''));

        if (!rawRows.length) {
          Swal.fire('Empty file', 'The CSV has no data rows.', 'warning');
          setUploadingShifts(false);
          return;
        }

        // Show the raw CSV immediately
        setShiftCsvRawRows(rawRows);

        // Persist to localStorage so Generate page reads these rows (not stale DB data)
        try {
          localStorage.setItem(
            `shifts_csv_${effectiveTeamId}`,
            JSON.stringify(rawRows),
          );
        } catch {
          /* quota exceeded — non-fatal */
        }

        // Save to DB in the background so Generate can use it
        try {
          const templates = _parseShiftsFromCsv(rawRows);
          if (templates.length) {
            const token = localStorage.getItem('authToken') ?? '';
            const postRes = await fetch(
              `/api/teams/${effectiveTeamId}/shifts`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ templates }),
              },
            );
            const data = await postRes.json().catch(() => ({}));
            if (!postRes.ok)
              throw new Error(data?.error ?? 'Failed to save shifts');
          }
          Swal.fire({
            toast: true,
            position: 'top',
            icon: 'success',
            title: `${rawRows.length} rows loaded`,
            showConfirmButton: false,
            timer: 2000,
          });
        } catch (e: unknown) {
          Swal.fire(
            'Warning',
            `CSV displayed but DB save failed: ${(e as Error)?.message || 'unknown error'}`,
            'warning',
          );
        } finally {
          setUploadingShifts(false);
        }
      },
      error: () => {
        Swal.fire('Parse Error', 'Failed to read the CSV file.', 'error');
        setUploadingShifts(false);
      },
    });
  };

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
    } catch (e: unknown) {
      setTeamsError((e as Error)?.message || 'Unable to refresh teams');
    }
  };

  const handlePickTeam = (t: { id: number; name: string }) => {
    setSelectedTeamId(t.id);
    setSelectedTeamName(t.name);
    setDeleteError(null);
    try {
      localStorage.setItem('currentTeamId', String(t.id));
    } catch {
      /* non-fatal */
    }
    // CSV rows are restored by the effectiveTeamId effect
  };

  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    const token =
      typeof window !== 'undefined'
        ? (localStorage.getItem('authToken') ?? '')
        : '';
    try {
      setCreatingTeam(true);
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const created = data as { id: number; name: string };
      setTeams((prev) => (prev ? [...prev, created] : [created]));
      setNewTeamName('');
      handlePickTeam(created);
      Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: `Team "${created.name}" created`,
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (e: unknown) {
      Swal.fire(
        'Error',
        (e as Error)?.message || 'Failed to create team',
        'error',
      );
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleUploadAvail = (file: File) => {
    if (!effectiveTeamId) return;
    setUploadingAvail(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res: Papa.ParseResult<Record<string, string>>) => {
        const rawRows = res.data
          .map((r) => {
            const row: Record<string, string> = {};
            Object.keys(r).forEach((k) => {
              row[k.trim()] = String(r[k] ?? '').trim();
            });
            return row;
          })
          .filter((r) => Object.values(r).some((v) => v !== ''));

        if (!rawRows.length) {
          Swal.fire('Empty file', 'The CSV has no data rows.', 'warning');
          setUploadingAvail(false);
          return;
        }

        // Show raw CSV immediately
        setAvailCsvRawRows(rawRows);

        // Persist to localStorage so Generate page reads these rows (not stale DB data)
        try {
          localStorage.setItem(
            `avail_csv_${effectiveTeamId}`,
            JSON.stringify(rawRows),
          );
        } catch {
          /* quota exceeded — non-fatal */
        }

        // Save to DB in the background so Generate can use it
        try {
          const token = localStorage.getItem('authToken') ?? '';
          const postRes = await fetch(
            `/api/teams/${effectiveTeamId}/availability`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify(_parseAvailForDb(rawRows)),
            },
          );
          const data = await postRes.json().catch(() => ({}));
          if (!postRes.ok)
            throw new Error(data?.error ?? 'Failed to save availability');
          Swal.fire({
            toast: true,
            position: 'top',
            icon: 'success',
            title: `${rawRows.length} rows loaded`,
            showConfirmButton: false,
            timer: 2000,
          });
        } catch (e: unknown) {
          Swal.fire(
            'Warning',
            `CSV displayed but DB save failed: ${(e as Error)?.message || 'unknown error'}`,
            'warning',
          );
        } finally {
          setUploadingAvail(false);
        }
      },
      error: () => {
        Swal.fire('Parse Error', 'Failed to read the CSV file.', 'error');
        setUploadingAvail(false);
      },
    });
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
      let payload: unknown = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = raw;
      }

      if (!res.ok) {
        const p = payload as Record<string, string> | null;
        const msg =
          p?.message ||
          p?.error ||
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
        setAvailCsvRawRows(null);
        setShiftCsvRawRows(null);
      }

      await Swal.fire({
        title: 'Deleted!',
        text: 'Team deleted successfully.',
        icon: 'success',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Unable to delete team';

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
    const a = availCsvRawRows
      ? `${availabilityCount} people`
      : 'No availability uploaded';
    const s = shiftCsvRawRows ? `${shiftsCount} shifts` : 'No shifts uploaded';
    return `${a} • ${s}`;
  }, [
    effectiveTeamId,
    availCsvRawRows,
    shiftCsvRawRows,
    availabilityCount,
    shiftsCount,
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            👥 Team Data
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            {effectiveTeamName ? (
              <>
                Viewing:{' '}
                <strong style={{ color: 'var(--text-2)' }}>
                  {effectiveTeamName}
                </strong>{' '}
                — {statusText}
              </>
            ) : (
              'No team selected'
            )}
          </p>
        </div>
        <button
          onClick={handleDeleteTeam}
          disabled={!effectiveTeamId || deleting}
          className="btn-danger"
          title={
            !effectiveTeamId ? 'Select a team to delete' : 'Delete this team'
          }
        >
          {deleting ? 'Deleting…' : '🗑️ Delete Team'}
        </button>
      </div>

      {deleteError && (
        <div
          style={{
            borderRadius: 8,
            border: '1px solid var(--danger)',
            background: 'var(--danger-soft)',
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--danger)',
          }}
        >
          {deleteError}
        </div>
      )}

      {/* Teams selector */}
      <section className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <h2 className="section-title" style={{ margin: 0 }}>
            Teams
          </h2>
          <button
            onClick={refreshTeams}
            className="btn-ghost"
            style={{ padding: '4px 12px', fontSize: 13 }}
          >
            Refresh
          </button>
        </div>

        {teamsError && (
          <div
            style={{
              borderRadius: 8,
              border: '1px solid var(--danger)',
              background: 'var(--danger-soft)',
              padding: '8px 12px',
              fontSize: 13,
              color: 'var(--danger)',
              marginBottom: 10,
            }}
          >
            {teamsError}
          </div>
        )}

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {teams === null ? (
              <div
                style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}
              >
                Loading teams…
              </div>
            ) : teams.length === 0 ? (
              <div
                style={{ padding: 16, fontSize: 13, color: 'var(--text-2)' }}
              >
                No teams yet. Click <b>+ New Team</b> to add one.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {teams.map((t) => {
                  const active = t.id === effectiveTeamId;
                  return (
                    <li
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                        background: active
                          ? 'var(--accent-soft)'
                          : 'var(--surface)',
                      }}
                    >
                      <div>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: active
                              ? 'var(--accent-text)'
                              : 'var(--text)',
                          }}
                        >
                          {t.name}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          ID: {t.id}
                        </p>
                      </div>
                      {active ? (
                        <span className="badge badge-accent">Active</span>
                      ) : (
                        <button
                          onClick={() => handlePickTeam(t)}
                          className="btn-ghost"
                          style={{ padding: '3px 10px', fontSize: 12 }}
                        >
                          Select
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
          Select a team to view its availability and shift templates.
        </p>

        {/* Create new team */}
        <div
          style={{
            marginTop: 14,
            borderTop: '1px solid var(--border)',
            paddingTop: 14,
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-2)',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            + New Team
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Team name…"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTeam();
              }}
              disabled={creatingTeam}
              style={{
                flex: 1,
                padding: '7px 12px',
                fontSize: 13,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleCreateTeam}
              disabled={creatingTeam || !newTeamName.trim()}
              className="btn-ghost"
              style={{
                padding: '7px 16px',
                fontSize: 13,
                whiteSpace: 'nowrap',
              }}
            >
              {creatingTeam ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </section>

      {/* Tables */}
      <div
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        {/* Availability */}
        <section
          className="card"
          onDragOver={(e) => { e.preventDefault(); if (effectiveTeamId && !uploadingAvail) setAvailDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); if (effectiveTeamId && !uploadingAvail) setAvailDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAvailDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setAvailDragOver(false);
            if (!effectiveTeamId || uploadingAvail) return;
            const f = e.dataTransfer.files?.[0];
            if (f) handleUploadAvail(f);
          }}
          style={availDragOver ? { outline: '2px dashed var(--accent)', outlineOffset: -2 } : undefined}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Team Availability
            </h2>
            {effectiveTeamId && (
              <>
                <input
                  ref={availUploadRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadAvail(f);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => availUploadRef.current?.click()}
                  disabled={uploadingAvail}
                  className="btn-ghost"
                  style={{ padding: '4px 12px', fontSize: 13 }}
                >
                  {uploadingAvail ? 'Uploading…' : '📤 Upload CSV'}
                </button>
              </>
            )}
          </div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-3)',
              marginTop: 4,
              marginBottom: 14,
            }}
          >
            Team availability. Upload a CSV to view and update.
          </p>
          {availCsvRawRows && availCsvRawRows.length > 0 ? (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{ maxHeight: 320, overflowX: 'auto', overflowY: 'auto' }}
              >
                <table
                  style={{
                    width: 'max-content',
                    minWidth: '100%',
                    fontSize: 13,
                    borderCollapse: 'collapse',
                    tableLayout: 'auto',
                  }}
                >
                  <thead
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      background: 'var(--elevated)',
                    }}
                  >
                    <tr>
                      {Object.keys(availCsvRawRows[0]).map((k) => (
                        <th
                          key={k}
                          style={{
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-2)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {availCsvRawRows.map((row, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        {Object.keys(availCsvRawRows[0]).map((k) => (
                          <td
                            key={k}
                            style={{
                              padding: '8px 12px',
                              fontSize: 13,
                              color: 'var(--text)',
                              verticalAlign: 'top',
                              whiteSpace: 'pre-line',
                              wordBreak: 'break-word',
                            }}
                          >
                            {String(row[k] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p
                style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  color: 'var(--text-3)',
                  textAlign: 'right',
                  borderTop: '1px solid var(--border)',
                }}
              >
                {availCsvRawRows.length} rows ×{' '}
                {Object.keys(availCsvRawRows[0]).length} columns
              </p>
            </div>
          ) : (
            <div
              onClick={() => effectiveTeamId && availUploadRef.current?.click()}
              style={{
                border: `2px dashed ${availDragOver ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: 32,
                fontSize: 13,
                color: availDragOver ? 'var(--accent-text)' : 'var(--text-3)',
                textAlign: 'center',
                cursor: effectiveTeamId ? 'pointer' : 'default',
                background: availDragOver ? 'var(--accent-soft)' : 'transparent',
                transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                userSelect: 'none',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>
                {availDragOver ? 'Drop CSV here' : 'Drag & drop a CSV here'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                or click <strong>Upload CSV</strong> above
              </div>
            </div>
          )}
        </section>

        {/* Shifts */}
        <section
          className="card"
          onDragOver={(e) => { e.preventDefault(); if (effectiveTeamId && !uploadingShifts) setShiftsDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); if (effectiveTeamId && !uploadingShifts) setShiftsDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setShiftsDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setShiftsDragOver(false);
            if (!effectiveTeamId || uploadingShifts) return;
            const f = e.dataTransfer.files?.[0];
            if (f) handleUploadShifts(f);
          }}
          style={shiftsDragOver ? { outline: '2px dashed var(--accent)', outlineOffset: -2 } : undefined}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Shift Requirements
            </h2>
            {effectiveTeamId && (
              <>
                <input
                  ref={shiftsUploadRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadShifts(f);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => shiftsUploadRef.current?.click()}
                  disabled={uploadingShifts}
                  className="btn-ghost"
                  style={{ padding: '4px 12px', fontSize: 13 }}
                >
                  {uploadingShifts ? 'Uploading…' : '📤 Upload CSV'}
                </button>
              </>
            )}
          </div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-3)',
              marginTop: 4,
              marginBottom: 14,
            }}
          >
            Saved shift templates. Upload a CSV to update.
          </p>
          {shiftCsvRawRows && shiftCsvRawRows.length > 0 ? (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{ maxHeight: 320, overflowX: 'auto', overflowY: 'auto' }}
              >
                <table
                  style={{
                    width: 'max-content',
                    minWidth: '100%',
                    fontSize: 13,
                    borderCollapse: 'collapse',
                    tableLayout: 'auto',
                  }}
                >
                  <thead
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      background: 'var(--elevated)',
                    }}
                  >
                    <tr>
                      {Object.keys(shiftCsvRawRows[0]).map((k) => (
                        <th
                          key={k}
                          style={{
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-2)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shiftCsvRawRows.map((r, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        {Object.keys(shiftCsvRawRows[0]).map((k) => (
                          <td
                            key={k}
                            style={{
                              padding: '8px 12px',
                              fontSize: 13,
                              color: 'var(--text)',
                              verticalAlign: 'top',
                              whiteSpace: 'pre-line',
                              wordBreak: 'break-word',
                            }}
                          >
                            {String(r[k] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p
                style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  color: 'var(--text-3)',
                  textAlign: 'right',
                  borderTop: '1px solid var(--border)',
                }}
              >
                {shiftCsvRawRows.length} rows ×{' '}
                {Object.keys(shiftCsvRawRows[0]).length} columns
              </p>
            </div>
          ) : (
            <div
              onClick={() => effectiveTeamId && shiftsUploadRef.current?.click()}
              style={{
                border: `2px dashed ${shiftsDragOver ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: 32,
                fontSize: 13,
                color: shiftsDragOver ? 'var(--accent-text)' : 'var(--text-3)',
                textAlign: 'center',
                cursor: effectiveTeamId ? 'pointer' : 'default',
                background: shiftsDragOver ? 'var(--accent-soft)' : 'transparent',
                transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                userSelect: 'none',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>
                {shiftsDragOver ? 'Drop CSV here' : 'Drag & drop a CSV here'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                or click <strong>Upload CSV</strong> above
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Status summary */}
      <section className="card">
        <h3 className="section-title">Data Status</h3>
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          }}
        >
          {[
            {
              label: 'Availability',
              value: availCsvRawRows
                ? `${availabilityCount} rows`
                : 'Not uploaded',
              ok: !!availCsvRawRows,
            },
            {
              label: 'Shifts',
              value: shiftCsvRawRows ? `${shiftsCount} rows` : 'Not uploaded',
              ok: !!shiftCsvRawRows,
            },
            {
              label: 'Team',
              value: effectiveTeamName ?? '—',
              ok: !!effectiveTeamName,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 16px',
                background: 'var(--elevated)',
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 4,
                }}
              >
                {stat.label}
              </p>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: stat.ok ? 'var(--success)' : 'var(--text-3)',
                }}
              >
                {stat.ok ? '✓ ' : ''}
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
