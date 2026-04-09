'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import Link from 'next/link';
import { RefreshCw, Save, Plus, AlertTriangle, Settings, Clock } from 'lucide-react';

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
  const [teams, setTeams] = useState<{ id: number; name: string }[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);
  const [rules, setRules] = useState<RulesV1>(withDefaults(null));
  const [loadingRules, setLoadingRules] = useState(false);
  const [saving, setSaving] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') ?? '' : '';

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
        Toast.fire({ icon: 'error', title: e?.message || 'Failed to load rules' });
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
    return `${rules.minHoursPerWeek}h–${rules.maxHoursPerWeek}h · ${rules.maxDaysPerWeek} days · ${rules.minRestHours}h rest`;
  }, [rules]);

  const ToggleRow = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-700 px-4 py-3 transition-colors hover:bg-gray-700/20">
      <div>
        <div className="text-sm font-medium text-gray-200">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      <div
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-700'}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </div>
    </label>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Scheduling Rules</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {selectedTeamName ? (
              <><span className="text-gray-300">{selectedTeamName}</span> — {summary}</>
            ) : (
              'Pick a team to edit its rules.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/teams/new"
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            New Team
          </Link>
          <button
            onClick={save}
            disabled={!selectedTeamId || saving || loadingRules}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : 'Save Rules'}
          </button>
        </div>
      </div>

      {/* Teams selector */}
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
                <div className="p-4 text-sm text-gray-500">No teams yet. Create one first.</div>
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
          {loadingRules && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <RefreshCw className="h-3 w-3 animate-spin" /> Loading rules…
            </div>
          )}
        </div>
      </div>

      {/* Rules */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Workload */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-2 border-b border-gray-700 px-5 py-4">
            <Settings className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-100">Workload Rules</h2>
          </div>
          <div className="space-y-3 p-5">
            {[
              { key: 'minHoursPerWeek' as const, label: 'Min hours / week', desc: 'Target minimum hours per person.', min: 0, max: 80 },
              { key: 'maxHoursPerWeek' as const, label: 'Max hours / week', desc: 'Hard cap unless overtime is allowed.', min: 0, max: 80 },
              { key: 'maxDaysPerWeek' as const, label: 'Max days / week', desc: 'Limit how many days someone can work.', min: 1, max: 7 },
            ].map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-200">{f.label}</div>
                  <div className="text-xs text-gray-500">{f.desc}</div>
                </div>
                <input
                  type="number"
                  className="w-24 shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors"
                  value={rules[f.key] as number}
                  onChange={(e) => setNum(f.key, e.target.value, f.min, f.max)}
                />
              </div>
            ))}
            <ToggleRow
              label="Balance workload"
              description="Try to distribute hours fairly."
              checked={rules.enforceFairness}
              onChange={(v) => setRules((p) => ({ ...p, enforceFairness: v }))}
            />
          </div>
        </div>

        {/* Time */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-2 border-b border-gray-700 px-5 py-4">
            <Clock className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-100">Time Rules</h2>
          </div>
          <div className="space-y-3 p-5">
            {[
              { key: 'minRestHours' as const, label: 'Min rest hours', desc: 'Minimum time between shifts.', min: 0, max: 24 },
              { key: 'maxShiftHours' as const, label: 'Max shift hours', desc: 'Shift length limit.', min: 1, max: 24 },
            ].map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-200">{f.label}</div>
                  <div className="text-xs text-gray-500">{f.desc}</div>
                </div>
                <input
                  type="number"
                  className="w-24 shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors"
                  value={rules[f.key] as number}
                  onChange={(e) => setNum(f.key, e.target.value, f.min, f.max)}
                />
              </div>
            ))}
            <ToggleRow
              label="Prefer availability"
              description="Schedule inside availability windows first."
              checked={rules.preferAvailability}
              onChange={(v) => setRules((p) => ({ ...p, preferAvailability: v }))}
            />
            <ToggleRow
              label="Allow overtime"
              description="Permit exceeding max hours/week if needed."
              checked={rules.allowOvertime}
              onChange={(v) => setRules((p) => ({ ...p, allowOvertime: v }))}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50">
        <div className="border-b border-gray-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-100">Notes</h2>
          <p className="mt-0.5 text-xs text-gray-500">Optional notes for managers (not used by the optimizer).</p>
        </div>
        <div className="p-5">
          <textarea
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none transition-colors"
            rows={4}
            value={rules.notes ?? ''}
            onChange={(e) => setRules((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Example: Avoid scheduling new hires for closing on Fridays."
          />
        </div>
      </div>
    </div>
  );
}
