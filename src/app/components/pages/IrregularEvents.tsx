'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Swal from 'sweetalert2';

type Team = { id: number; name: string };

type IrregularEvent = {
  id: number;
  teamId: number;
  title: string;
  date: string; // ISO from API
  startTime: string; // HH:MM
  endTime: string; // HH:MM
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
  // API date is at midnight; safe conversion:
  return new Date(iso).toISOString().slice(0, 10);
}

export default function IrregularEventsPage() {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('authToken') ?? '' : '';

  // teams
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);

  // events
  const [events, setEvents] = useState<IrregularEvent[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // form
  const [form, setForm] = useState({
    title: '',
    date: '',
    startTime: '09:00',
    endTime: '17:00',
    jobType: '',
  });

  // load teams
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

  // load events when team changes
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date))
      return Swal.fire('Error', 'Date must be YYYY-MM-DD.', 'error');

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

      // refresh list
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

      setEvents((prev) =>
        prev ? prev.map((x) => (x.id === ev.id ? data.event : x)) : prev
      );
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">🗓️ Irregular Events</h1>
          <p className="text-sm text-neutral-600">
            {selectedTeamName ? (
              <>
                Team: <span className="font-medium">{selectedTeamName}</span>
              </>
            ) : (
              'Pick a team to manage its events.'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/teams/new"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            + Create Team
          </Link>
        </div>
      </div>

      {/* Team picker */}
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
            <div className="max-h-[220px] overflow-y-auto">
              {teams === null ? (
                <div className="p-4 text-sm text-neutral-400">Loading teams…</div>
              ) : teams.length === 0 ? (
                <div className="p-4 text-sm text-neutral-600">No teams yet.</div>
              ) : (
                <ul className="divide-y">
                  {teams.map((t) => {
                    const active = t.id === selectedTeamId;
                    return (
                      <li
                        key={t.id}
                        className={`flex items-center justify-between p-3 ${
                          active ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-white dark:bg-gray-900'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{t.name}</p>
                          <p className="truncate text-xs text-neutral-500">ID: {t.id}</p>
                        </div>
                        {active ? (
                          <span className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white">
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() => pickTeam(t)}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
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
      </section>

      {/* Add event */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-2 text-lg font-semibold">➕ Add Event</h2>
        <p className="mb-4 text-sm text-neutral-600">
          Use this for meetings, training, time off, special assignments, etc.
        </p>

        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="rounded-lg border p-2 text-sm md:col-span-2"
            placeholder="Title (e.g., Staff meeting)"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
          />
          <input
            className="rounded-lg border p-2 text-sm"
            type="date"
            value={form.date}
            onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
          />
          <input
            className="rounded-lg border p-2 text-sm"
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((s) => ({ ...s, startTime: e.target.value }))}
          />
          <input
            className="rounded-lg border p-2 text-sm"
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((s) => ({ ...s, endTime: e.target.value }))}
          />

          <input
            className="rounded-lg border p-2 text-sm md:col-span-2"
            placeholder="Job Type (optional) e.g., FOH / BOH"
            value={form.jobType}
            onChange={(e) => setForm((s) => ({ ...s, jobType: e.target.value }))}
          />

          <div className="md:col-span-3">
            <button
              onClick={createEvent}
              disabled={!selectedTeamId}
              className={`rounded-lg px-4 py-2 text-sm text-white ${
                selectedTeamId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300'
              }`}
            >
              Add Event
            </button>
          </div>
        </div>
      </section>

      {/* Events list */}
      <section className="rounded-2xl border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">📌 Events</h2>
          <div className="text-xs text-neutral-500">
            {loadingEvents ? 'Loading…' : `${events?.length ?? 0} total`}
          </div>
        </div>

        {!selectedTeamId ? (
          <div className="mt-3 rounded-lg border border-dashed p-6 text-sm text-neutral-500">
            Pick a team to see events.
          </div>
        ) : !events ? (
          <div className="mt-3 rounded-lg border border-dashed p-6 text-sm text-neutral-500">
            Could not load events.
          </div>
        ) : events.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-6 text-sm text-neutral-500">
            No irregular events yet.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {grouped.map(([day, items]) => (
              <div key={day} className="rounded-xl border">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="text-sm font-semibold">{day}</div>
                  <div className="text-xs text-neutral-500">{items.length} events</div>
                </div>

                <div className="divide-y">
                  {items.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{ev.title}</div>
                        <div className="text-xs text-neutral-500">
                          {ev.startTime}–{ev.endTime}
                          {ev.jobType ? ` • ${ev.jobType}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => editEvent(ev)}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteEvent(ev)}
                          className="rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
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
      </section>
    </div>
  );
}
