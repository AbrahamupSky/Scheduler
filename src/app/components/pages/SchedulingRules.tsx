'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import Link from 'next/link';

const Toast = Swal.mixin({
  toast: true,
  position: 'top',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

type RulesV1 = {
  minHoursPerWeek: number;
  maxHoursPerWeek: number;
  maxDaysPerWeek: number;
  minRestHours: number;

  maxShiftHours: number;
  allowOvertime: boolean;

  enforceFairness: boolean;
  preferAvailability: boolean;

  notes: string | null;
};

function withDefaults(r: Partial<RulesV1> | null | undefined): RulesV1 {
  return {
    minHoursPerWeek: Number(r?.minHoursPerWeek ?? 0),
    maxHoursPerWeek: Number(r?.maxHoursPerWeek ?? 40),
    maxDaysPerWeek: Number(r?.maxDaysPerWeek ?? 6),
    minRestHours: Number(r?.minRestHours ?? 8),

    maxShiftHours: Number(r?.maxShiftHours ?? 10),
    allowOvertime: Boolean(r?.allowOvertime ?? false),

    enforceFairness: Boolean(r?.enforceFairness ?? true),
    preferAvailability: Boolean(r?.preferAvailability ?? true),

    notes: (r?.notes ?? null) as string | null,
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function SchedulingRules() {
  // teams list + selection
  const [teams, setTeams] = useState<{ id: number; name: string }[] | null>(
    null
  );
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);

  // rules state
  const [rules, setRules] = useState<RulesV1>(withDefaults(null));
  const [loadingRules, setLoadingRules] = useState(false);
  const [saving, setSaving] = useState(false);

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('authToken') ?? '' : '';

  // load teams on mount
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
        const data = (await res.json()) as { id: number; name: string }[];
        setTeams(data);

        // auto pick first team
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

  // when selectedTeamId changes -> load rules
  useEffect(() => {
    if (!selectedTeamId) return;
    (async () => {
      setLoadingRules(true);
      try {
        const res = await fetch(`/api/teams/${selectedTeamId}/rules`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || 'Failed to load rules');
        }
        const payload = await res.json();
        setRules(withDefaults(payload?.rules));
      } catch (e: unknown) {
        Toast.fire({
          icon: 'error',
          title: (e as Error)?.message || 'Failed to load rules',
        });
      } finally {
        setLoadingRules(false);
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
      const data = (await res.json()) as { id: number; name: string }[];
      setTeams(data);
    } catch (e: unknown) {
      setTeamsError((e as Error)?.message || 'Unable to refresh teams');
    }
  };

  const handlePickTeam = (t: { id: number; name: string }) => {
    setSelectedTeamId(t.id);
    setSelectedTeamName(t.name);
  };

  const setNum = (key: keyof RulesV1, v: unknown, min: number, max: number) => {
    setRules((prev) => ({ ...prev, [key]: clampInt(v, min, max, prev[key] as number) }));
  };

  const save = async () => {
    if (!selectedTeamId) {
      Swal.fire('Error', 'Pick a team first.', 'error');
      return;
    }
    setSaving(true);
    try {
      // client-side sanity
      const payload: RulesV1 = {
        ...rules,
        minHoursPerWeek: clampInt(rules.minHoursPerWeek, 0, 80, 0),
        maxHoursPerWeek: clampInt(rules.maxHoursPerWeek, 0, 80, 40),
        maxDaysPerWeek: clampInt(rules.maxDaysPerWeek, 1, 7, 6),
        minRestHours: clampInt(rules.minRestHours, 0, 24, 8),
        maxShiftHours: clampInt(rules.maxShiftHours, 1, 24, 10),
      };

      if (payload.maxHoursPerWeek < payload.minHoursPerWeek) {
        payload.maxHoursPerWeek = payload.minHoursPerWeek;
      }

      const res = await fetch(`/api/teams/${selectedTeamId}/rules`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to save rules');

      setRules(withDefaults(data?.rules));
      Toast.fire({ icon: 'success', title: 'Rules saved' });
    } catch (e: unknown) {
      Swal.fire('Error', (e as Error)?.message || 'Failed to save rules', 'error');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    // just a quick status line
    return `Min ${rules.minHoursPerWeek}h • Max ${rules.maxHoursPerWeek}h • ${rules.maxDaysPerWeek} days • Rest ${rules.minRestHours}h`;
  }, [rules]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚙️ Scheduling Rules
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            {selectedTeamName ? (
              <><strong style={{ color: 'var(--text-2)' }}>{selectedTeamName}</strong> — {summary}</>
            ) : 'Pick a team to edit its rules.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/teams/new" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            + New Team
          </Link>
          <button
            onClick={save}
            disabled={!selectedTeamId || saving || loadingRules}
            className="btn-primary"
          >
            {saving ? 'Saving…' : '💾 Save Rules'}
          </button>
        </div>
      </div>

      {/* Teams selector */}
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
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-2)' }}>No teams yet. Create one first.</div>
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
                        <button onClick={() => handlePickTeam(t)} className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }}>Select</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        {loadingRules && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>Loading rules…</p>}
      </section>

      {/* Rules grid */}
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Workload */}
        <section className="card">
          <h2 className="section-title">📊 Workload</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { key: 'minHoursPerWeek' as const, label: 'Min hours / week', desc: 'Target minimum per person.', min: 0, max: 80 },
              { key: 'maxHoursPerWeek' as const, label: 'Max hours / week', desc: 'Hard cap unless overtime is on.', min: 0, max: 80 },
              { key: 'maxDaysPerWeek' as const, label: 'Max days / week', desc: 'How many days someone can work.', min: 1, max: 7 },
            ].map(({ key, label, desc, min, max }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{desc}</div>
                </div>
                <input
                  type="number"
                  className="input"
                  style={{ width: 80, flexShrink: 0 }}
                  value={rules[key]}
                  onChange={(e) => setNum(key, e.target.value, min, max)}
                />
              </div>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Balance workload</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Distribute hours fairly.</div>
              </div>
              <input type="checkbox" checked={rules.enforceFairness} onChange={(e) => setRules((p) => ({ ...p, enforceFairness: e.target.checked }))} />
            </label>
          </div>
        </section>

        {/* Time */}
        <section className="card">
          <h2 className="section-title">⏰ Time</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { key: 'minRestHours' as const, label: 'Min rest hours', desc: 'Min time between shifts.', min: 0, max: 24 },
              { key: 'maxShiftHours' as const, label: 'Max shift hours', desc: 'Shift length limit.', min: 1, max: 24 },
            ].map(({ key, label, desc, min, max }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{desc}</div>
                </div>
                <input
                  type="number"
                  className="input"
                  style={{ width: 80, flexShrink: 0 }}
                  value={rules[key]}
                  onChange={(e) => setNum(key, e.target.value, min, max)}
                />
              </div>
            ))}
            {[
              { key: 'preferAvailability' as const, label: 'Prefer availability', desc: 'Schedule inside availability first.' },
              { key: 'allowOvertime' as const, label: 'Allow overtime', desc: 'Permit exceeding max hours/week.' },
            ].map(({ key, label, desc }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{desc}</div>
                </div>
                <input type="checkbox" checked={rules[key]} onChange={(e) => setRules((p) => ({ ...p, [key]: e.target.checked }))} />
              </label>
            ))}
          </div>
        </section>
      </div>

      {/* Notes */}
      <section className="card">
        <h2 className="section-title">📝 Notes</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: -8, marginBottom: 12 }}>
          Optional notes for managers (not used by the optimizer).
        </p>
        <textarea
          className="input"
          style={{ resize: 'vertical', minHeight: 96, fontFamily: 'inherit' }}
          rows={4}
          value={rules.notes ?? ''}
          onChange={(e) => setRules((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Example: Avoid scheduling new hires for closing on Fridays."
        />
      </section>
    </div>
  );
}
