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
      } catch (e: unknown) {
        setTeamsError((e as Error)?.message || 'Unable to fetch teams');
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
      } catch (e: unknown) {
        Toast.fire({ icon: 'error', title: (e as Error)?.message || 'Failed to load events' });
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
    } catch (e: unknown) {
      setTeamsError((e as Error)?.message || 'Unable to refresh teams');
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
    } catch (e: unknown) {
      Swal.fire('Error', (e as Error)?.message || 'Failed to create event', 'error');
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
    } catch (e: unknown) {
      Swal.fire('Error', (e as Error)?.message || 'Failed to update event', 'error');
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
    } catch (e: unknown) {
      Swal.fire('Error', (e as Error)?.message || 'Failed to delete event', 'error');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            📅 Irregular Events
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            {selectedTeamName
              ? <><strong style={{ color: 'var(--text-2)' }}>{selectedTeamName}</strong></>
              : 'Pick a team to manage its events.'}
          </p>
        </div>
        <Link href="/teams/new" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          + New Team
        </Link>
      </div>

      {/* Team picker */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Teams</h2>
          <button onClick={refreshTeams} className="btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }}>
            Refresh
          </button>
        </div>

        {teamsError && (
          <div style={{ borderRadius: 8, border: '1px solid var(--danger)', background: 'var(--danger-soft)', padding: '8px 12px', fontSize: 13, color: 'var(--danger)', marginBottom: 10 }}>
            {teamsError}
          </div>
        )}

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {teams === null ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}>Loading teams…</div>
            ) : teams.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-2)' }}>No teams yet.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {teams.map((t) => {
                  const active = t.id === selectedTeamId;
                  return (
                    <li key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: active ? 'var(--accent-soft)' : 'var(--surface)' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 500, color: active ? 'var(--accent-text)' : 'var(--text)' }}>{t.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)' }}>ID: {t.id}</p>
                      </div>
                      {active ? (
                        <span className="badge badge-accent">Active</span>
                      ) : (
                        <button onClick={() => pickTeam(t)} className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }}>Select</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Add event */}
      <section className="card">
        <h2 className="section-title">➕ Add Event</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: -8, marginBottom: 16 }}>
          Meetings, training, time off, special assignments, etc.
        </p>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <input
            className="input"
            style={{ gridColumn: 'span 2' }}
            placeholder="Title (e.g., Staff meeting)"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
          />
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
          />
          <input
            className="input"
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((s) => ({ ...s, startTime: e.target.value }))}
          />
          <input
            className="input"
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((s) => ({ ...s, endTime: e.target.value }))}
          />
          <input
            className="input"
            style={{ gridColumn: 'span 2' }}
            placeholder="Job Type (optional) e.g., FOH / BOH"
            value={form.jobType}
            onChange={(e) => setForm((s) => ({ ...s, jobType: e.target.value }))}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <button onClick={createEvent} disabled={!selectedTeamId} className="btn-primary">
            Add Event
          </button>
        </div>
      </section>

      {/* Events list */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="section-title" style={{ margin: 0 }}>📌 Events</h2>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {loadingEvents ? 'Loading…' : `${events?.length ?? 0} total`}
          </span>
        </div>

        {!selectedTeamId ? (
          <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 24, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            Pick a team to see events.
          </div>
        ) : !events ? (
          <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 24, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            Could not load events.
          </div>
        ) : events.length === 0 ? (
          <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 24, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            No irregular events yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {grouped.map(([day, items]) => (
              <div key={day} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Day header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--elevated)', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{day}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{items.length} event{items.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Event rows */}
                {items.map((ev, idx) => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: idx > 0 ? '1px solid var(--border)' : undefined, gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        {ev.startTime}–{ev.endTime}
                        {ev.jobType && (
                          <span style={{ marginLeft: 8 }}>
                            <span className="badge badge-accent">{ev.jobType}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => editEvent(ev)} className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }}>
                        Edit
                      </button>
                      <button onClick={() => deleteEvent(ev)} className="btn-danger" style={{ padding: '3px 10px', fontSize: 12 }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
