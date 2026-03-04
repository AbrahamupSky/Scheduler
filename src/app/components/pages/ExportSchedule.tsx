'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/** ---------- Types ---------- */
export type ScheduleCell = string | null; // 'HH:MM' or null
export type ScheduleRow = { Name: string; [col: string]: ScheduleCell };

export type ExportScheduleProps = {
  schedule: ScheduleRow[] | null;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  teamName?: string; // optional for filename presets
  onAfterExport?: (
    fileName: string,
    format: 'CSV' | 'Excel' | 'Clipboard'
  ) => void;
};

/** ---------- Helpers ---------- */
function dayKeysFromRange(startISO: string, endISO: string) {
  const out: string[] = [];
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function computeStats(rows: ScheduleRow[] | null, dayKeys: string[]) {
  if (!rows)
    return {
      totalShifts: 0,
      activeEmployees: 0,
      daysCovered: dayKeys.length,
      avgPerEmployee: 0,
    };
  const startCols = dayKeys.map((k) => `${k} Start`);
  let total = 0;
  let active = 0;
  for (const r of rows) {
    const has = startCols.some((c) => !!r[c]);
    if (has) active++;
    for (const c of startCols) total += r[c] ? 1 : 0;
  }
  const avg = rows.length ? total / rows.length : 0;
  return {
    totalShifts: total,
    activeEmployees: active,
    daysCovered: dayKeys.length,
    avgPerEmployee: avg,
  };
}

function scheduleToCsv(rows: ScheduleRow[], dayKeys: string[]) {
  const fields = [
    'Name',
    ...dayKeys.flatMap((k) => [`${k} Start`, `${k} End`]),
  ];
  const data = rows.map((r) => fields.map((f) => r[f] ?? ''));
  return Papa.unparse({ fields, data });
}

function statsToCsv(stats: ReturnType<typeof computeStats>) {
  const rows = [
    ['Metric', 'Value'],
    ['Total Shifts', stats.totalShifts],
    ['Active Employees', stats.activeEmployees],
    ['Days Covered', stats.daysCovered],
    ['Average Shifts per Employee', stats.avgPerEmployee],
  ];
  return Papa.unparse(rows);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toClipboardText(rows: ScheduleRow[], dayKeys: string[]) {
  const header = [
    'Name',
    ...dayKeys.flatMap((k) => [`${k} Start`, `${k} End`]),
  ];
  const lines = [header.join('\t')];
  for (const r of rows) {
    const line = [
      r.Name,
      ...dayKeys.flatMap((k) => [r[`${k} Start`] ?? '', r[`${k} End`] ?? '']),
    ].join('\t');
    lines.push(line);
  }
  return lines.join('\n');
}

/** ---------- Component ---------- */
export default function ExportSchedule({
  schedule,
  startDate,
  endDate,
  teamName,
  onAfterExport,
}: ExportScheduleProps) {
  const dayKeys = useMemo(
    () => dayKeysFromRange(startDate, endDate),
    [startDate, endDate]
  );
  const stats = useMemo(
    () => computeStats(schedule, dayKeys),
    [schedule, dayKeys]
  );

  const [format, setFormat] = useState<'CSV' | 'Excel' | 'Clipboard'>('CSV');
  const [includeStats, setIncludeStats] = useState(true);

  // ---- Filename presets (dedup + stable keys) ----
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const defaultBase = `schedule_${startDate}_to_${endDate}`;
  const teamSlug = (teamName || 'team').trim().replace(/\s+/g, '_');

  const presets = useMemo(() => {
    const weekly = `weekly_schedule_${new Date(startDate + 'T00:00:00')
      .toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      })
      .replaceAll('/', '_')}`;

    // Build, then de-dupe while preserving order.
    const raw = [
      'Custom',
      defaultBase,
      weekly,
      `team_schedule_${today}`,
      `${teamSlug}_schedule_${today}`,
    ];

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const p of raw) {
      if (!seen.has(p)) {
        seen.add(p);
        unique.push(p);
      }
    }
    return unique;
  }, [defaultBase, startDate, teamSlug, today]);

  // Choose initial preset safely even if the second item was removed by de-dupe
  const [preset, setPreset] = useState<string>(() => presets[1] ?? 'Custom');
  const [customName, setCustomName] = useState(defaultBase);

  // If presets change and current value no longer exists, fall back gracefully
  useEffect(() => {
    if (!presets.includes(preset)) {
      setPreset(presets[0] ?? 'Custom');
    }
  }, [presets, preset]);

  const baseName = preset === 'Custom' ? customName : preset;
  const invalid = /[<>:"/\\|?*]/.test(baseName);

  const disabled = !schedule || !schedule.length;

  const doExport = async () => {
    if (!schedule || !schedule.length) return;
    if (invalid) {
      alert('Filename has invalid characters: < > : " / \\ | ? *');
      return;
    }

    if (format === 'CSV') {
      const parts: string[] = [scheduleToCsv(schedule, dayKeys)];
      if (includeStats) {
        parts.push('', statsToCsv(stats)); // blank line + stats
      }
      const csv = parts.join('\n');
      downloadBlob(
        `${baseName}.csv`,
        new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      );
      onAfterExport?.(`${baseName}.csv`, 'CSV');
      return;
    }

    if (format === 'Excel') {
      const wsData = [
        ['Name', ...dayKeys.flatMap((k) => [`${k} Start`, `${k} End`])],
        ...schedule.map((r) => [
          r.Name,
          ...dayKeys.flatMap((k) => [
            r[`${k} Start`] ?? '',
            r[`${k} End`] ?? '',
          ]),
        ]),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Schedule');

      if (includeStats) {
        const statsAoA = [
          ['Metric', 'Value'],
          ['Total Shifts', stats.totalShifts],
          ['Active Employees', stats.activeEmployees],
          ['Days Covered', stats.daysCovered],
          ['Average Shifts per Employee', stats.avgPerEmployee],
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(statsAoA);
        XLSX.utils.book_append_sheet(wb, ws2, 'Statistics');
      }

      const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      downloadBlob(
        `${baseName}.xlsx`,
        new Blob([wbout], { type: 'application/octet-stream' })
      );
      onAfterExport?.(`${baseName}.xlsx`, 'Excel');
      return;
    }

    // Clipboard
    try {
      const txt = toClipboardText(schedule, dayKeys);
      await navigator.clipboard.writeText(txt);
      onAfterExport?.(`${baseName}.txt`, 'Clipboard');
      alert('✅ Copied to clipboard!');
    } catch (e: any) {
      alert(`Copy failed: ${e?.message ?? e}`);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">📤 Export</h1>
        <p className="text-sm text-neutral-600">
          Export the current schedule as CSV/Excel or copy it to your clipboard.
        </p>
      </div>

      {/* Options */}
      <section className="rounded-2xl border p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Format</label>
            <select
              className="w-full rounded-lg border p-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value as any)}
            >
              <option>CSV</option>
              <option>Excel</option>
              <option>Clipboard</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Include Statistics</label>
            <select
              className="w-full rounded-lg border p-2 text-sm"
              value={includeStats ? 'yes' : 'no'}
              onChange={(e) => setIncludeStats(e.target.value === 'yes')}
              disabled={format === 'Clipboard'}
              title={
                format === 'Clipboard' ? 'Not applicable for clipboard' : ''
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          {/* Quick Filename (dedup + stable keys) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Quick Filename</label>
            <select
              className="w-full rounded-lg border p-2 text-sm"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {presets.map((p, i) => (
                <option key={`${p}__${i}`} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {preset === 'Custom' && (
            <div className="md:col-span-3 space-y-1">
              <label className="text-sm font-medium">
                Custom File Name (no extension)
              </label>
              <input
                className="w-full rounded-lg border p-2 text-sm"
                placeholder={defaultBase}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <p
                className={`text-xs ${
                  invalid ? 'text-red-600' : 'text-neutral-500'
                }`}
              >
                {invalid
                  ? 'Do not use: < > : " / \\ | ? *'
                  : 'Extension will be added automatically'}
              </p>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="mt-4 text-sm text-neutral-600">
          <div>
            <span className="font-medium">Final filename: </span>
            <code className="rounded bg-neutral-50 px-2 py-1">
              {baseName}.
              {format === 'CSV' ? 'csv' : format === 'Excel' ? 'xlsx' : 'txt'}
            </code>
          </div>
        </div>

        {/* Export button */}
        <div className="mt-4">
          <button
            onClick={doExport}
            disabled={!schedule || !schedule.length}
            className={`rounded-lg px-4 py-2 text-sm ${
              !schedule || !schedule.length
                ? 'bg-neutral-100 text-neutral-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title={
              !schedule || !schedule.length ? 'No schedule to export' : 'Export'
            }
          >
            📥 Export Schedule
          </button>
        </div>
      </section>

      {/* Quick stats (always visible for context) */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">📊 Snapshot</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border p-3 text-sm">
            <div>Range</div>
            <div className="text-lg font-semibold">
              {new Date(`${startDate}T00:00:00`).toLocaleDateString()} –{' '}
              {new Date(`${endDate}T00:00:00`).toLocaleDateString()}
            </div>
          </div>
          <div className="rounded-xl border p-3 text-sm">
            <div>Total Shifts</div>
            <div className="text-lg font-semibold">{stats.totalShifts}</div>
          </div>
          <div className="rounded-xl border p-3 text-sm">
            <div>Active Employees</div>
            <div className="text-lg font-semibold">{stats.activeEmployees}</div>
          </div>
          <div className="rounded-xl border p-3 text-sm">
            <div>Days Covered</div>
            <div className="text-lg font-semibold">{stats.daysCovered}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
