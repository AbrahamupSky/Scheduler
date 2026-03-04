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

function clampInt(v: any, min: number, max: number, fallback: number) {
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
      } catch (e: any) {
        setTeamsError(e?.message || 'Unable to fetch teams');
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
      } catch (e: any) {
        Toast.fire({
          icon: 'error',
          title: e?.message || 'Failed to load rules',
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
    } catch (e: any) {
      setTeamsError(e?.message || 'Unable to refresh teams');
    }
  };

  const handlePickTeam = (t: { id: number; name: string }) => {
    setSelectedTeamId(t.id);
    setSelectedTeamName(t.name);
  };

  const setNum = (key: keyof RulesV1, v: any, min: number, max: number) => {
    setRules((prev) => ({ ...prev, [key]: clampInt(v, min, max, prev[key] as any) }));
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
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'Failed to save rules', 'error');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    // just a quick status line
    return `Min ${rules.minHoursPerWeek}h • Max ${rules.maxHoursPerWeek}h • ${rules.maxDaysPerWeek} days • Rest ${rules.minRestHours}h`;
  }, [rules]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">📏 Scheduling Rules</h1>
          <p className="text-sm text-neutral-600">
            {selectedTeamName ? (
              <>
                Team: <span className="font-medium">{selectedTeamName}</span> — {summary}
              </>
            ) : (
              'Pick a team to edit its rules.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/teams/new"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            + Create Team
          </Link>
          <button
            onClick={save}
            disabled={!selectedTeamId || saving || loadingRules}
            className={`rounded-lg px-4 py-2 text-sm text-white ${
              !selectedTeamId || saving || loadingRules
                ? 'bg-blue-300'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? 'Saving…' : '💾 Save Rules'}
          </button>
        </div>
      </div>

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
            <div className="max-h-[220px] overflow-y-auto">
              {teams === null ? (
                <div className="p-4 text-sm text-neutral-400">Loading teams…</div>
              ) : teams.length === 0 ? (
                <div className="p-4 text-sm text-neutral-600">
                  No teams yet. Create one first.
                </div>
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
                            onClick={() => handlePickTeam(t)}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50 dark:border-gray-700 dark:hover:bg-gray-800"
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

          {loadingRules && (
            <p className="mt-2 text-xs text-neutral-500">Loading rules…</p>
          )}
        </div>
      </section>

      {/* Rules UI */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Workload */}
        <section className="rounded-2xl border p-5">
          <h2 className="mb-2 text-lg font-semibold">📊 Workload Rules</h2>

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr,120px] items-center gap-3">
              <div>
                <div className="text-sm font-medium">Min hours per week</div>
                <div className="text-xs text-neutral-500">Target minimum hours per person.</div>
              </div>
              <input
                type="number"
                className="rounded-lg border p-2 text-sm"
                value={rules.minHoursPerWeek}
                onChange={(e) => setNum('minHoursPerWeek', e.target.value, 0, 80)}
              />
            </div>

            <div className="grid grid-cols-[1fr,120px] items-center gap-3">
              <div>
                <div className="text-sm font-medium">Max hours per week</div>
                <div className="text-xs text-neutral-500">Hard cap unless overtime is allowed.</div>
              </div>
              <input
                type="number"
                className="rounded-lg border p-2 text-sm"
                value={rules.maxHoursPerWeek}
                onChange={(e) => setNum('maxHoursPerWeek', e.target.value, 0, 80)}
              />
            </div>

            <div className="grid grid-cols-[1fr,120px] items-center gap-3">
              <div>
                <div className="text-sm font-medium">Max days per week</div>
                <div className="text-xs text-neutral-500">Limit how many days someone can work.</div>
              </div>
              <input
                type="number"
                className="rounded-lg border p-2 text-sm"
                value={rules.maxDaysPerWeek}
                onChange={(e) => setNum('maxDaysPerWeek', e.target.value, 1, 7)}
              />
            </div>

            <label className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <div className="text-sm font-medium">Balance workload</div>
                <div className="text-xs text-neutral-500">Try to distribute hours fairly.</div>
              </div>
              <input
                type="checkbox"
                checked={rules.enforceFairness}
                onChange={(e) => setRules((p) => ({ ...p, enforceFairness: e.target.checked }))}
              />
            </label>
          </div>
        </section>

        {/* Time */}
        <section className="rounded-2xl border p-5">
          <h2 className="mb-2 text-lg font-semibold">⏰ Time Rules</h2>

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr,120px] items-center gap-3">
              <div>
                <div className="text-sm font-medium">Min rest hours</div>
                <div className="text-xs text-neutral-500">Minimum time between shifts.</div>
              </div>
              <input
                type="number"
                className="rounded-lg border p-2 text-sm"
                value={rules.minRestHours}
                onChange={(e) => setNum('minRestHours', e.target.value, 0, 24)}
              />
            </div>

            <div className="grid grid-cols-[1fr,120px] items-center gap-3">
              <div>
                <div className="text-sm font-medium">Max shift hours</div>
                <div className="text-xs text-neutral-500">Shift length limit.</div>
              </div>
              <input
                type="number"
                className="rounded-lg border p-2 text-sm"
                value={rules.maxShiftHours}
                onChange={(e) => setNum('maxShiftHours', e.target.value, 1, 24)}
              />
            </div>

            <label className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <div className="text-sm font-medium">Prefer availability</div>
                <div className="text-xs text-neutral-500">Schedule inside availability first.</div>
              </div>
              <input
                type="checkbox"
                checked={rules.preferAvailability}
                onChange={(e) =>
                  setRules((p) => ({ ...p, preferAvailability: e.target.checked }))
                }
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <div className="text-sm font-medium">Allow overtime</div>
                <div className="text-xs text-neutral-500">Permit exceeding max hours/week if needed.</div>
              </div>
              <input
                type="checkbox"
                checked={rules.allowOvertime}
                onChange={(e) => setRules((p) => ({ ...p, allowOvertime: e.target.checked }))}
              />
            </label>
          </div>
        </section>
      </div>

      {/* Notes */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-2 text-lg font-semibold">📝 Notes</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Optional notes for managers (not used by the optimizer unless you decide to later).
        </p>
        <textarea
          className="w-full rounded-xl border p-3 text-sm"
          rows={4}
          value={rules.notes ?? ''}
          onChange={(e) => setRules((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Example: Avoid scheduling new hires for closing on Fridays."
        />
      </section>
    </div>
  );
}
