'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Swal from 'sweetalert2';
import { RefreshCw, Plus, Pencil, Trash2, CalendarDays, AlertTriangle } from 'lucide-react';

type Team = { id: number; name: string };

type IrregularEvent = {
  id: number;
  teamId: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  jobType: string | null;
};

const Toast = Swal.mixin({
  toast: true,
  position: 'top',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true,
});

function isoToYYYYMMDD(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

const inputClass =
  'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-colors';

export default function IrregularEventsPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') ?? '' : '';

  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);

  const [events, setEvents] = useState<IrregularEvent[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [form, setForm] = useState({
    title: '',
    date: '',
    startTime: '09:00',
    endTime: '17:00',
    jobType: '',
  });

  useEffect(() => {
    (async () => {
      try {
        setTeamsError(null);
        const res = await fetch('/api/teams', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || 'Failed to load teams');
        }
        const data = (await res.json()) as Team[];
        setTeams(data);
        if (data.length > 0 && !selectedTeamId) {
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
    if (!selectedTeamId) return;
    (async () => {
      setLoadingEvents(true);
      try {
        const res = await fetch(`/api/teams/${selectedTeamId}/events`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || 'Failed to load events');
        }
        const payload = await res.json();
        setEvents(payload.events ?? []);
      } catch (e: any) {
        Toast.fire({ icon: 'error', title: e?.message || 'Failed to load events' });
        setEvents(null);
      } finally {
        setLoadingEvents(false);
      }
    })();
  }, [selectedTeamId, token]);

  const refreshTeams = async () => {
    try {
      setTeamsError(null);
      const res = await fetch('/api/teams', {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('Failed to refresh teams');
      const data = (await res.json()) as Team[];
      setTeams(data);
    } catch (e: any) {
      setTeamsError(e?.message || 'Unable to refresh teams');
    }
  };

  const pickTeam = (t: Team) => {
    setSelectedTeamId(t.id);
    setSelectedTeamName(t.name);
  };

  const createEvent = async () => {
    if (!selectedTeamId) return Swal.fire('Error', 'Pick a team first.', 'error');
    if (!form.title.trim()) return Swal.fire('Error', 'Title is required.', 'error');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return Swal.fire('Error', 'Date must be YYYY-MM-DD.', 'error');

    try {
      const res = await fetch(`/api/teams/${selectedTeamId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: form.title.trim(),
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          jobType: form.jobType.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to create event');

      Toast.fire({ icon: 'success', title: 'Event added' });
      setForm((s) => ({ ...s, title: '' }));
      setEvents((prev) => (prev ? [...prev, data.event] : [data.event]));
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'Failed to create event', 'error');
    }
  };

  const editEvent = async (ev: IrregularEvent) => {
    if (!selectedTeamId) return;
    const { value } = await Swal.fire({
      title: 'Edit event',
      html: `
        <div style="text-align:left; display:grid; gap:10px;">
          <label>Title</label>
          <input id="t" class="swal2-input" value="${ev.title}" />
          <label>Date</label>
          <input id="d" class="swal2-input" value="${isoToYYYYMMDD(ev.date)}" />
          <label>Start (HH:MM)</label>
          <input id="s" class="swal2-input" value="${ev.startTime}" />
          <label>End (HH:MM)</label>
          <input id="e" class="swal2-input" value="${ev.endTime}" />
          <label>Job Type (optional)</label>
          <input id="j" class="swal2-input" value="${ev.jobType ?? ''}" />
        </div>
      `,
      focusConfirm: false,
      preConfirm: () => {
        const title = (document.getElementById('t') as HTMLInputElement).value;
        const date = (document.getElementById('d') as HTMLInputElement).value;
        const startTime = (document.getElementById('s') as HTMLInputElement).value;
        const endTime = (document.getElementById('e') as HTMLInputElement).value;
        const jobType = (document.getElementById('j') as HTMLInputElement).value;
        return { title, date, startTime, endTime, jobType };
      },
      showCancelButton: true,
      confirmButtonText: 'Save',
    });

    if (!value) return;
    try {
      const res = await fetch(`/api/teams/${selectedTeamId}/events/${ev.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: String(value.title ?? '').trim(),
          date: String(value.date ?? '').trim(),
          startTime: String(value.startTime ?? '').trim(),
          endTime: String(value.endTime ?? '').trim(),
          jobType: String(value.jobType ?? '').trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to update event');
      Toast.fire({ icon: 'success', title: 'Event updated' });
      setEvents((prev) => prev ? prev.map((x) => (x.id === ev.id ? data.event : x)) : prev);
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'Failed to update event', 'error');
    }
  };

  const deleteEvent = async (ev: IrregularEvent) => {
    if (!selectedTeamId) return;
    const ok = await Swal.fire({
      title: 'Delete this event?',
      text: `${ev.title} (${isoToYYYYMMDD(ev.date)} ${ev.startTime}-${ev.endTime})`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
    });
    if (!ok.isConfirmed) return;

    try {
      const res = await fetch(`/api/teams/${selectedTeamId}/events/${ev.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete event');
      Toast.fire({ icon: 'success', title: 'Deleted' });
      setEvents((prev) => (prev ? prev.filter((x) => x.id !== ev.id) : prev));
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'Failed to delete event', 'error');
    }
  };

  const grouped = useMemo(() => {
    const list = events ?? [];
    const map = new Map<string, IrregularEvent[]>();
    for (const ev of list) {
      const k = isoToYYYYMMDD(ev.date);
      map.set(k, [...(map.get(k) ?? []), ev]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Irregular Events</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {selectedTeamName ? (
              <>Team: <span className="text-gray-300">{selectedTeamName}</span></>
            ) : (
              'Pick a team to manage its events.'
            )}
          </p>
        </div>
        <Link
          href="/teams/new"
          className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          New Team
        </Link>
      </div>

      {/* Team picker */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50">
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-100">Teams</h2>
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
            <div className="max-h-52 overflow-y-auto">
              {teams === null ? (
                <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading teams…
                </div>
              ) : teams.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No teams yet.</div>
              ) : (
                <ul className="divide-y divide-gray-700/50">
                  {teams.map((t) => {
                    const active = t.id === selectedTeamId;
                    return (
                      <li
                        key={t.id}
                        className={`flex items-center justify-between px-4 py-3 transition-colors ${active ? 'bg-indigo-900/20' : 'hover:bg-gray-700/30'}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-200">{t.name}</p>
                          <p className="text-xs text-gray-500">ID: {t.id}</p>
                        </div>
                        {active ? (
                          <span className="rounded-full border border-indigo-600 bg-indigo-700 px-2 py-0.5 text-xs text-white">Active</span>
                        ) : (
                          <button
                            onClick={() => pickTeam(t)}
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
        </div>
      </div>

      {/* Add event */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2 border-b border-gray-700 px-5 py-4">
          <Plus className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-gray-100">Add Event</h2>
        </div>
        <div className="p-5">
          <p className="mb-4 text-xs text-gray-500">Use this for meetings, training, time off, special assignments, etc.</p>
          <div className="grid gap-3 md:grid-cols-5">
            <input
              className={`${inputClass} md:col-span-2`}
              placeholder="Title (e.g., Staff meeting)"
              value={form.title}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            />
            <input
              className={inputClass}
              type="date"
              value={form.date}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
            />
            <input
              className={inputClass}
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((s) => ({ ...s, startTime: e.target.value }))}
            />
            <input
              className={inputClass}
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((s) => ({ ...s, endTime: e.target.value }))}
            />
            <input
              className={`${inputClass} md:col-span-2`}
              placeholder="Job Type (optional) e.g., FOH / BOH"
              value={form.jobType}
              onChange={(e) => setForm((s) => ({ ...s, jobType: e.target.value }))}
            />
            <div className="md:col-span-3">
              <button
                onClick={createEvent}
                disabled={!selectedTeamId}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Event
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Events list */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50">
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-100">Events</h2>
          </div>
          <div className="text-xs text-gray-500">
            {loadingEvents ? (
              <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Loading…</span>
            ) : (
              `${events?.length ?? 0} total`
            )}
          </div>
        </div>

        <div className="p-4">
          {!selectedTeamId ? (
            <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-600">
              Pick a team to see events.
            </div>
          ) : !events ? (
            <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-600">
              Could not load events.
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-600">
              No irregular events yet.
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(([day, items]) => (
                <div key={day} className="overflow-hidden rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800/60 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-200">{day}</div>
                    <div className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                      {items.length} {items.length === 1 ? 'event' : 'events'}
                    </div>
                  </div>
                  <div className="divide-y divide-gray-700/50">
                    {items.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-700/20"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-200">{ev.title}</div>
                          <div className="text-xs text-gray-500">
                            {ev.startTime}–{ev.endTime}
                            {ev.jobType ? <span className="ml-1.5 rounded bg-gray-700 px-1.5 py-0.5 text-gray-300">{ev.jobType}</span> : ''}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => editEvent(ev)}
                            className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => deleteEvent(ev)}
                            className="flex items-center gap-1 rounded-lg border border-red-800 bg-red-950/30 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-950/60"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
