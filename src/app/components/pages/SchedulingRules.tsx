'use client';

import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/** -------- Types -------- */
export type RuleValue = number | boolean;
export type RuleType = 'int' | 'float' | 'bool';

export type Rule = {
  name: string;
  description: string;
  type: RuleType;
  value: RuleValue;
  enabled: boolean;
  category: 'Daily' | 'Time' | 'Workload' | 'Advanced' | 'Custom';
};

export type SchedulingRulesProps = {
  /** Optional: pass initial rules from your DB */
  initialRules?: Rule[];

  /** Called when user clicks Save */
  onSave?: (rules: Rule[]) => Promise<void> | void;
};

/** -------- Defaults (edit freely) -------- */
function defaultRules(): Rule[] {
  return [
    // Daily
    {
      name: 'max_shifts_per_day',
      description: 'Maximum number of shifts per person per day',
      type: 'int',
      value: 2,
      enabled: true,
      category: 'Daily',
    },
    {
      name: 'max_hours_per_day',
      description: 'Maximum total hours per person per day',
      type: 'int',
      value: 10,
      enabled: true,
      category: 'Daily',
    },
    {
      name: 'overtime_threshold',
      description: 'Daily overtime threshold (hours)',
      type: 'int',
      value: 8,
      enabled: true,
      category: 'Daily',
    },
    {
      name: 'allow_split_shifts',
      description: 'Allow split shifts within a day',
      type: 'bool',
      value: false,
      enabled: true,
      category: 'Daily',
    },
    {
      name: 'allow_back_to_back_shifts',
      description: 'Allow back-to-back shifts with no gap',
      type: 'bool',
      value: false,
      enabled: true,
      category: 'Daily',
    },

    // Time
    {
      name: 'min_break_between_shifts',
      description: 'Minimum break (hours) between shifts',
      type: 'int',
      value: 10,
      enabled: true,
      category: 'Time',
    },
    {
      name: 'min_hours_between_shifts',
      description: 'Minimum hours between end and next start',
      type: 'int',
      value: 12,
      enabled: true,
      category: 'Time',
    },
    {
      name: 'max_consecutive_days',
      description: 'Maximum consecutive working days',
      type: 'int',
      value: 6,
      enabled: true,
      category: 'Time',
    },
    {
      name: 'enforce_availability_strict',
      description: 'Strictly enforce availability windows',
      type: 'bool',
      value: true,
      enabled: true,
      category: 'Time',
    },

    // Workload
    {
      name: 'max_weekly_hours',
      description: 'Maximum weekly hours per person',
      type: 'int',
      value: 40,
      enabled: true,
      category: 'Workload',
    },
    {
      name: 'balance_workload',
      description: 'Evenly balance workload across staff',
      type: 'bool',
      value: true,
      enabled: true,
      category: 'Workload',
    },
    {
      name: 'prefer_full_shifts',
      description: 'Prefer assigning full shifts over partials',
      type: 'bool',
      value: true,
      enabled: true,
      category: 'Workload',
    },
    {
      name: 'max_opening_shifts_per_week',
      description: 'Max opening shifts per person per week',
      type: 'int',
      value: 3,
      enabled: true,
      category: 'Workload',
    },
    {
      name: 'max_closing_shifts_per_week',
      description: 'Max closing shifts per person per week',
      type: 'int',
      value: 3,
      enabled: true,
      category: 'Workload',
    },

    // Advanced
    {
      name: 'min_staffing_per_shift',
      description: 'Minimum staffing per shift',
      type: 'int',
      value: 1,
      enabled: true,
      category: 'Advanced',
    },
    {
      name: 'require_weekend_coverage',
      description: 'Require weekend coverage',
      type: 'bool',
      value: true,
      enabled: true,
      category: 'Advanced',
    },
    {
      name: 'min_leadership_shifts_per_week',
      description: 'Minimum leadership shifts per week',
      type: 'int',
      value: 2,
      enabled: false,
      category: 'Advanced',
    },
  ];
}

/** -------- Utilities -------- */
function rulesToCsv(rules: Rule[]) {
  const rows = rules.map((r) => ({
    name: r.name,
    description: r.description,
    type: r.type,
    value: r.value,
    enabled: r.enabled ? 1 : 0,
    category: r.category,
  }));
  return Papa.unparse(rows);
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function parseRulesFile(file: File): Promise<Rule[]> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          try {
            resolve(rowsToRules(res.data as any[]));
          } catch (e) {
            reject(e);
          }
        },
        error: reject,
      });
    });
  }
  // xlsx / xls
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
  return rowsToRules(rows);
}

function rowsToRules(rows: any[]): Rule[] {
  return rows
    .map((r) => {
      const type = String(r.type || r.Type || '').toLowerCase() as RuleType;
      const name = String(r.name || r.Name || '').trim();
      const description = String(r.description || r.Description || '').trim();
      const category =
        (String(r.category || r.Category || '').trim() as Rule['category']) ||
        'Custom';

      if (!name || !type) return null;

      let value: RuleValue;
      if (type === 'bool') {
        const raw = String(r.value ?? r.Value ?? '').toLowerCase();
        value = raw === 'true' || raw === '1' || raw === 'yes';
      } else if (type === 'int') {
        value = Number.parseInt(String(r.value ?? r.Value ?? '0'), 10);
      } else {
        value = Number.parseFloat(String(r.value ?? r.Value ?? '0'));
      }

      const enabledField = r.enabled ?? r.Enabled ?? 1;
      const enabled =
        String(enabledField).toLowerCase() === 'true' ||
        String(enabledField) === '1' ||
        enabledField === true;

      const rule: Rule = {
        name,
        description: description || name.replaceAll('_', ' '),
        type,
        value: (type === 'bool'
          ? Boolean(value)
          : type === 'int'
          ? Number.isFinite(value)
            ? Math.round(Number(value))
            : 0
          : Number(value)) as RuleValue,
        enabled,
        category: ['Daily', 'Time', 'Workload', 'Advanced', 'Custom'].includes(
          category
        )
          ? (category as Rule['category'])
          : 'Custom',
      };
      return rule;
    })
    .filter(Boolean) as Rule[];
}

/** -------- Component -------- */
export default function SchedulingRules({
  initialRules,
  onSave,
}: SchedulingRulesProps) {
  const [rules, setRules] = useState<Rule[]>(
    initialRules && initialRules.length ? initialRules : defaultRules()
  );
  const [adding, setAdding] = useState({
    name: '',
    description: '',
    type: 'int' as RuleType,
    value: 1 as RuleValue,
  });

  const groups: { label: string; category: Rule['category'] }[] = useMemo(
    () => [
      { label: '📅 Daily Limits', category: 'Daily' },
      { label: '⏰ Time Rules', category: 'Time' },
      { label: '📊 Workload Rules', category: 'Workload' },
      { label: '🔧 Advanced Rules', category: 'Advanced' },
      { label: '🎯 Custom Rules', category: 'Custom' },
    ],
    []
  );

  const summary = useMemo(() => {
    const total = rules.length;
    const enabled = rules.filter((r) => r.enabled).length;
    return { total, enabled, disabled: total - enabled };
  }, [rules]);

  /** ------- Actions ------- */
  const updateRule = (name: string, patch: Partial<Rule>) =>
    setRules((prev) =>
      prev.map((r) => (r.name === name ? { ...r, ...patch } : r))
    );

  const removeRule = (name: string) =>
    setRules((prev) => prev.filter((r) => r.name !== name));

  const addCustomRule = () => {
    if (!adding.name.trim()) return;
    if (rules.some((r) => r.name === adding.name)) {
      alert('A rule with that name already exists.');
      return;
    }
    setRules((prev) => [
      ...prev,
      {
        name: adding.name.trim(),
        description: adding.description || adding.name.replaceAll('_', ' '),
        type: adding.type,
        value:
          adding.type === 'bool'
            ? Boolean(adding.value)
            : adding.type === 'int'
            ? Math.round(Number(adding.value ?? 0))
            : Number(adding.value ?? 0),
        enabled: true,
        category: 'Custom',
      },
    ]);
    setAdding({ name: '', description: '', type: 'int', value: 1 });
  };

  const enableAll = () =>
    setRules((prev) => prev.map((r) => ({ ...r, enabled: true })));
  const disableAll = () =>
    setRules((prev) => prev.map((r) => ({ ...r, enabled: false })));
  const resetDefaults = () => setRules(defaultRules());

  const exportTemplate = () => {
    const csv = rulesToCsv(defaultRules());
    downloadCsv('scheduling_rules_template.csv', csv);
  };

  const exportCurrent = () => {
    const csv = rulesToCsv(rules);
    downloadCsv('scheduling_rules_current.csv', csv);
  };

  const importFile = async (file: File) => {
    try {
      const imported = await parseRulesFile(file);
      if (!imported.length) {
        alert('No rules found in file.');
        return;
      }
      // Merge on name: imported replaces existing, others kept
      const map = new Map(imported.map((r) => [r.name, r]));
      const merged: Rule[] = [];
      const seen = new Set<string>();
      // replace existing
      for (const r of rules) {
        if (map.has(r.name)) {
          merged.push(map.get(r.name)!);
          seen.add(r.name);
        } else {
          merged.push(r);
        }
      }
      // add any new
      for (const r of imported) {
        if (!seen.has(r.name)) merged.push(r);
      }
      setRules(merged);
    } catch (e: any) {
      alert(`Import failed: ${e?.message ?? e}`);
    }
  };

  const handleSave = async () => {
    await onSave?.(rules);
  };

  /** ------- Render helpers ------- */
  const RuleRow = ({ r }: { r: Rule }) => {
    return (
      <div className="grid grid-cols-[auto,1fr,auto,auto] items-center gap-3 rounded-xl border p-3">
        {/* Toggle */}
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={r.enabled}
            onChange={(e) => updateRule(r.name, { enabled: e.target.checked })}
          />
          <span className="text-sm font-medium">{r.name}</span>
        </label>

        {/* Description */}
        <div className="min-w-0 text-sm text-neutral-700">
          <div className="truncate font-medium">{r.description}</div>
          <div className="truncate text-xs text-neutral-500">{r.category}</div>
        </div>

        {/* Value editor */}
        <div>
          {r.type === 'bool' ? (
            <select
              className="rounded-lg border p-1 text-sm"
              value={r.value ? 'true' : 'false'}
              onChange={(e) =>
                updateRule(r.name, { value: e.target.value === 'true' })
              }
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input
              type="number"
              step={r.type === 'float' ? '0.1' : '1'}
              className="w-24 rounded-lg border p-1 text-sm"
              value={String(r.value)}
              onChange={(e) =>
                updateRule(r.name, {
                  value:
                    r.type === 'int'
                      ? Math.round(Number(e.target.value || 0))
                      : Number(e.target.value || 0),
                })
              }
            />
          )}
        </div>

        {/* Remove (only for custom) */}
        <div className="text-right">
          {r.category === 'Custom' && (
            <button
              onClick={() => removeRule(r.name)}
              className="rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              title="Remove custom rule"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">📏 Scheduling Rules</h1>
          <p className="text-sm text-neutral-600">
            Toggle rules, adjust values, import/export, and add custom
            constraints.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={disableAll}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            🔴 Disable All
          </button>
          <button
            onClick={enableAll}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            🟢 Enable All
          </button>
          <button
            onClick={resetDefaults}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            🔄 Reset Defaults
          </button>
        </div>
      </div>

      {/* Import / Export */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-2 text-lg font-semibold">Import / Export</h2>
        <p className="mb-4 text-sm text-neutral-600">
          Upload a CSV/XLSX to replace/merge rules by name, or download
          templates for editing.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
            Upload rules file
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && importFile(e.target.files[0])
              }
            />
          </label>

          <button
            onClick={exportTemplate}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Download Template
          </button>
          <button
            onClick={exportCurrent}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Download Current Rules
          </button>

          <button
            onClick={handleSave}
            className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            💾 Save Rules
          </button>
        </div>
      </section>

      {/* Add custom rule */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">➕ Add Custom Rule</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <input
            placeholder="rule_name"
            value={adding.name}
            onChange={(e) => setAdding((s) => ({ ...s, name: e.target.value }))}
            className="rounded-lg border p-2 text-sm md:col-span-2"
          />
          <input
            placeholder="Description (optional)"
            value={adding.description}
            onChange={(e) =>
              setAdding((s) => ({ ...s, description: e.target.value }))
            }
            className="rounded-lg border p-2 text-sm md:col-span-2"
          />
          <select
            value={adding.type}
            onChange={(e) =>
              setAdding((s) => ({ ...s, type: e.target.value as RuleType }))
            }
            className="rounded-lg border p-2 text-sm"
          >
            <option value="int">Number (integer)</option>
            <option value="float">Number (decimal)</option>
            <option value="bool">True/False</option>
          </select>
          {adding.type === 'bool' ? (
            <select
              value={adding.value ? 'true' : 'false'}
              onChange={(e) =>
                setAdding((s) => ({ ...s, value: e.target.value === 'true' }))
              }
              className="rounded-lg border p-2 text-sm"
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input
              type="number"
              step={adding.type === 'float' ? '0.1' : '1'}
              value={Number(adding.value)}
              onChange={(e) =>
                setAdding((s) => ({
                  ...s,
                  value:
                    s.type === 'int'
                      ? Math.round(Number(e.target.value || 0))
                      : Number(e.target.value || 0),
                }))
              }
              className="rounded-lg border p-2 text-sm"
            />
          )}
          <div className="md:col-span-5">
            <button
              onClick={addCustomRule}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Add Rule
            </button>
          </div>
        </div>
      </section>

      {/* Rule groups */}
      {groups.map(({ label, category }) => {
        const items = rules.filter((r) => r.category === category);
        if (!items.length) return null;
        return (
          <section key={category} className="rounded-2xl border p-5">
            <h2 className="mb-3 text-lg font-semibold">{label}</h2>
            <div className="space-y-3">
              {items.map((r) => (
                <RuleRow key={r.name} r={r} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Summary */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">📊 Summary</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border p-3 text-sm">
            <div>Total Rules</div>
            <div className="text-lg font-semibold">{summary.total}</div>
          </div>
          <div className="rounded-xl border p-3 text-sm">
            <div>Enabled</div>
            <div className="text-lg font-semibold text-emerald-600">
              {summary.enabled}
            </div>
          </div>
          <div className="rounded-xl border p-3 text-sm">
            <div>Disabled</div>
            <div className="text-lg font-semibold text-amber-600">
              {summary.disabled}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
