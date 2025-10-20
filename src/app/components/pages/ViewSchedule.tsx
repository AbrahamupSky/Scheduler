'use client';

import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/** ---------- Types ---------- */
export type ScheduleCell = string | null; // e.g., "08:00" (Start/End cells) or null
export type ScheduleRow = { Name: string; [col: string]: ScheduleCell }; // columns like 'YYYY-MM-DD Start'/'YYYY-MM-DD End'

export type IrregularEvent = {
  person: string;
  type: string;
  date: string; // 'YYYY-MM-DD'
  start_time: string; // 'HH:MM'
  end_time: string; // 'HH:MM'
  description?: string;
  ignore_scheduling_rules: boolean;
};

export type ViewScheduleProps = {
  schedule: ScheduleRow[] | null; // generated or loaded
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  irregularEvents?: IrregularEvent[] | null; // optional

  /** Optional: override export handlers */
  onExportCsv?: (csv: string, defaultFileName: string) => void;
  onExportXlsx?: (wb: XLSX.WorkBook, defaultFileName: string) => void;
};

/** ---------- Helpers ---------- */
function dayKeysFromRange(startISO: string, endISO: string) {
  const out: { label: string; key: string }[] = [];
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const label = d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: '2-digit',
      day: '2-digit',
    });
    const key = d.toISOString().slice(0, 10);
    out.push({ label, key });
  }
  return out;
}

function detectConflicts(rows: ScheduleRow[], dayKeys: string[]) {
  const issues: string[] = [];
  for (const r of rows) {
    for (const k of dayKeys) {
      const s = r[`${k} Start`];
      const e = r[`${k} End`];
      const onlyOne = (!!s && !e) || (!!e && !s);
      if (onlyOne) issues.push(`${r.Name}: incomplete assignment on ${k}`);
      // hook: add true overlap checks if you later store multiple intervals per day
    }
  }
  return issues;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** ---------- Component ---------- */
export default function ViewSchedule({
  schedule,
  startDate,
  endDate,
  irregularEvents,
  onExportCsv,
  onExportXlsx,
}: ViewScheduleProps) {
  const days = useMemo(
    () => dayKeysFromRange(startDate, endDate),
    [startDate, endDate]
  );
  const dayKeys = days.map((d) => d.key);

  const issues = useMemo(
    () => (schedule ? detectConflicts(schedule, dayKeys) : []),
    [schedule, dayKeys]
  );

  const summary = useMemo(() => {
    if (!schedule)
      return {
        totalShifts: 0,
        activeEmployees: 0,
        daysCovered: dayKeys.length,
      };
    const startCols = dayKeys.map((k) => `${k} Start`);
    let total = 0;
    for (const r of schedule) {
      for (const c of startCols) total += r[c] ? 1 : 0;
    }
    const active = schedule.filter((r) => startCols.some((c) => !!r[c])).length;
    return {
      totalShifts: total,
      activeEmployees: active,
      daysCovered: dayKeys.length,
    };
  }, [schedule, dayKeys]);

  const eventsInWindow = useMemo(() => {
    if (!irregularEvents || !irregularEvents.length) return [];
    return irregularEvents.filter(
      (ev) => ev.date >= startDate && ev.date <= endDate
    );
  }, [irregularEvents, startDate, endDate]);

  /** ---------- Export ---------- */
  const exportCsv = () => {
    if (!schedule) return;
    // Flatten to one column per Start/End + Name
    const cols = [
      'Name',
      ...dayKeys.flatMap((k) => [`${k} Start`, `${k} End`]),
    ];
    const rows = schedule.map((r) => {
      const out: Record<string, any> = { Name: r.Name };
      for (const k of dayKeys) {
        out[`${k} Start`] = r[`${k} Start`] ?? '';
        out[`${k} End`] = r[`${k} End`] ?? '';
      }
      return out;
    });
    const csv = Papa.unparse({
      fields: cols,
      data: rows.map((r) => cols.map((c) => r[c] ?? '')),
    });
    const defaultName = `schedule_${startDate}_to_${endDate}.csv`;
    if (onExportCsv) onExportCsv(csv, defaultName);
    else
      downloadBlob(
        defaultName,
        new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      );
  };

  const exportXlsx = () => {
    if (!schedule) return;
    const header = [
      'Name',
      ...dayKeys.flatMap((k) => [`${k} Start`, `${k} End`]),
    ];
    const matrix = (schedule ?? []).map((r) => {
      const row: any[] = [r.Name];
      for (const k of dayKeys) {
        row.push(r[`${k} Start`] ?? '');
        row.push(r[`${k} End`] ?? '');
      }
      return row;
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...matrix]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');

    const defaultName = `schedule_${startDate}_to_${endDate}.xlsx`;
    if (onExportXlsx) onExportXlsx(wb, defaultName);
    else {
      const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      downloadBlob(
        defaultName,
        new Blob([wbout], { type: 'application/octet-stream' })
      );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">📋 View Schedule</h1>
          <p className="text-sm text-neutral-600">
            {new Date(`${startDate}T00:00:00`).toLocaleDateString()} –{' '}
            {new Date(`${endDate}T00:00:00`).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            disabled={!schedule}
            className={`rounded-lg px-3 py-2 text-sm ${
              schedule
                ? 'border hover:bg-neutral-50'
                : 'border text-neutral-400'
            }`}
          >
            Export CSV
          </button>
          <button
            onClick={exportXlsx}
            disabled={!schedule}
            className={`rounded-lg px-3 py-2 text-sm ${
              schedule
                ? 'border hover:bg-neutral-50'
                : 'border text-neutral-400'
            }`}
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* Irregular events summary */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-2 text-lg font-semibold">
          🎯 Irregular Events in Range
        </h2>
        {!eventsInWindow.length ? (
          <p className="text-sm text-neutral-600">
            No irregular events for this range.
          </p>
        ) : (
          <ul className="text-sm text-neutral-700">
            {eventsInWindow.map((ev, idx) => (
              <li key={idx} className="border-t py-2 first:border-0">
                <span className="font-medium">{ev.person}</span> — {ev.type} (
                {ev.start_time}-{ev.end_time}) on{' '}
                {new Date(`${ev.date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: '2-digit',
                  day: '2-digit',
                })}{' '}
                •{' '}
                {ev.ignore_scheduling_rules
                  ? '🔓 Ignores rules'
                  : '⚠️ Follows rules'}
                {ev.description ? (
                  <>
                    {' '}
                    — <span className="text-neutral-600">{ev.description}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Grid */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">Weekly Schedule Grid</h2>
        {!schedule || schedule.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No schedule loaded. Generate or load one first.
          </p>
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-[900px] text-left text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  {days.map((d) => (
                    <th key={d.key} className="px-3 py-2">
                      {d.label}
                      <span className="block text-xs text-neutral-500">
                        Start / End
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={row.Name} className="border-t align-top">
                    <td className="px-3 py-2 font-medium">{row.Name}</td>
                    {dayKeys.map((k) => {
                      const s = row[`${k} Start`];
                      const e = row[`${k} End`];
                      return (
                        <td key={k} className="px-3 py-2">
                          {s || e ? (
                            <>
                              <div>{s}</div>
                              <div>{e}</div>
                            </>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Each day has “Start” and “End” cells. Empty means no shift assigned.
        </p>
      </section>

      {/* Stats */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">📊 Schedule Statistics</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border p-3 text-sm">
            <div>Total Shifts Assigned</div>
            <div className="text-lg font-semibold">{summary.totalShifts}</div>
          </div>
          <div className="rounded-xl border p-3 text-sm">
            <div>Active Employees</div>
            <div className="text-lg font-semibold">
              {summary.activeEmployees}
            </div>
          </div>
          <div className="rounded-xl border p-3 text-sm">
            <div>Days Covered</div>
            <div className="text-lg font-semibold">{summary.daysCovered}</div>
          </div>
        </div>
      </section>

      {/* Conflicts */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">🔍 Conflict Detection</h2>
        {issues.length ? (
          <ul className="list-disc pl-5 text-sm text-amber-800">
            {issues.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-700">✅ No conflicts detected.</p>
        )}
      </section>
    </div>
  );
}
