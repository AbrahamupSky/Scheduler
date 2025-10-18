'use client';

import React, { useMemo, useState } from 'react';

/** ---------- Types ---------- */
export type OptimizationPriority = 'Balanced Workload' | 'Minimize Conflicts' | 'Maximize Coverage';

export type ScheduleCell = string | null; // e.g., "08:00–16:00" or null
export type ScheduleRow = { Name: string; [col: string]: ScheduleCell }; // Start/End columns per day

export type IrregularEvent = {
  person: string;
  type: string;
  date: string;        // 'YYYY-MM-DD'
  start_time: string;  // 'HH:MM'
  end_time: string;    // 'HH:MM'
  description?: string;
  ignore_scheduling_rules: boolean;
};

export type GenerateScheduleProps = {
  // Data you’ll schedule from
  availability: { Name: string; [k: string]: any }[] | null;
  shifts: { [k: string]: any }[] | null;

  // Optional: events shown in the summary (if passed)
  irregularEvents?: IrregularEvent[] | null;

  // Hook this to your scheduler backend
  onGenerate?: (args: {
    startDate: string; // 'YYYY-MM-DD'
    endDate: string;   // 'YYYY-MM-DD'
    optimization: OptimizationPriority;
    allowOvertime: boolean;
    availability: any[] | null;
    shifts: any[] | null;
    irregularEvents: IrregularEvent[] | null | undefined;
  }) => Promise<ScheduleRow[]> | ScheduleRow[];

  // Optional “save schedule” callback
  onSaveSchedule?: (args: {
    name: string;
    schedule: ScheduleRow[];
    startDate: string;
    endDate: string;
    optimization: OptimizationPriority;
    allowOvertime: boolean;
  }) => Promise<void> | void;
};

/** ---------- Helpers ---------- */
function fmtRange(start: string, end: string) {
  return `${start}–${end}`;
}

function dayNamesFromRange(startISO: string, endISO: string) {
  const out: { label: string; key: string }[] = [];
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const label = d.toLocaleDateString(undefined, { weekday: 'long' }) + ' ' +
      d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
    const key = d.toISOString().slice(0, 10);
    out.push({ label, key });
  }
  return out;
}

function detectConflicts(rows: ScheduleRow[], dayKeys: string[]) {
  // Simple placeholder: flags empty end with non-empty start or vice-versa.
  // Extend with real overlapping logic if your schema stores exact intervals per person/day.
  const issues: string[] = [];
  for (const r of rows) {
    for (const k of dayKeys) {
      const sCol = `${k} Start`;
      const eCol = `${k} End`;
      const s = r[sCol];
      const e = r[eCol];
      const onlyOne = (!!s && !e) || (!!e && !s);
      if (onlyOne) issues.push(`${r.Name}: incomplete assignment on ${k}`);
    }
  }
  return issues;
}

/** ---------- Component ---------- */
export default function GenerateSchedule({
  availability,
  shifts,
  irregularEvents,
  onGenerate,
  onSaveSchedule,
}: GenerateScheduleProps) {
  // params
  const todayISO = new Date().toISOString().slice(0, 10);
  const nextWeekISO = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState<string>(todayISO);
  const [endDate, setEndDate] = useState<string>(nextWeekISO);
  const [optimization, setOptimization] =
    useState<OptimizationPriority>('Balanced Workload');
  const [allowOvertime, setAllowOvertime] = useState<boolean>(false);

  // results
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saveName, setSaveName] = useState<string>(
    `Schedule_${new Date().toISOString().slice(0,16).replace('T','_')}`
  );

  const days = useMemo(() => dayNamesFromRange(startDate, endDate), [startDate, endDate]);
  const dayKeys = days.map((d) => d.key);

  const issues = useMemo(
    () => (schedule ? detectConflicts(schedule, dayKeys) : []),
    [schedule, dayKeys]
  );

  const summary = useMemo(() => {
    if (!schedule) return { totalShifts: 0, activeEmployees: 0, daysCovered: dayKeys.length };
    const startCols = dayKeys.map((k) => `${k} Start`);
    let total = 0;
    for (const r of schedule) {
      for (const c of startCols) total += r[c] ? 1 : 0;
    }
    const active = schedule.filter((r) => startCols.some((c) => !!r[c])).length;
    return { totalShifts: total, activeEmployees: active, daysCovered: dayKeys.length };
  }, [schedule, dayKeys]);

  const eventsInWindow = useMemo(() => {
    if (!irregularEvents || !irregularEvents.length) return [];
    const start = startDate;
    const end = endDate;
    return irregularEvents.filter((ev) => ev.date >= start && ev.date <= end);
  }, [irregularEvents, startDate, endDate]);

  /** Stub scheduler if no onGenerate provided */
  const fallbackGenerate = (): ScheduleRow[] => {
    // Make a tiny fake schedule for demo purposes only.
    const names = (availability ?? []).map((r) => r.Name).slice(0, 6);
    return names.map((name, i) => {
      const row: ScheduleRow = { Name: name };
      for (const k of dayKeys) {
        // every other day assign 08:00–16:00
        const on = (i + dayKeys.indexOf(k)) % 2 === 0;
        row[`${k} Start`] = on ? '08:00' : null;
        row[`${k} End`] = on ? '16:00' : null;
      }
      return row;
    });
  };

  const doGenerate = async () => {
    setGenerating(true);
    try {
      const result = await (onGenerate
        ? onGenerate({
            startDate,
            endDate,
            optimization,
            allowOvertime,
            availability,
            shifts,
            irregularEvents,
          })
        : Promise.resolve(fallbackGenerate()));
      setSchedule(result);
    } catch (e: any) {
      alert(`Generation error: ${e?.message ?? e}`);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!schedule || !onSaveSchedule) return;
    try {
      await onSaveSchedule({
        name: saveName || 'Schedule',
        schedule,
        startDate,
        endDate,
        optimization,
        allowOvertime,
      });
      alert('✅ Schedule saved!');
    } catch (e: any) {
      alert(`Save failed: ${e?.message ?? e}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">⚙️ Generate Schedule</h1>
        <p className="text-sm text-neutral-600">
          Pick the date range and priorities, then generate an optimized schedule.
        </p>
      </div>

      {/* Controls */}
      <section className="rounded-2xl border p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm font-medium">Schedule Start Date</label>
            <input
              type="date"
              className="w-full rounded-lg border p-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Schedule End Date</label>
            <input
              type="date"
              className="w-full rounded-lg border p-2 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Optimization Priority</label>
            <select
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-900 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              value={optimization}
              onChange={(e) => setOptimization(e.target.value as OptimizationPriority)}
            >
              <option>Balanced Workload</option>
              <option>Minimize Conflicts</option>
              <option>Maximize Coverage</option>
            </select>
          </div>

          <div className="space-y-3">
            <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Allow Overtime</label>
            <select
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-900 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              value={allowOvertime ? 'yes' : 'no'}
              onChange={(e) => setAllowOvertime(e.target.value === 'yes')}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={doGenerate}
            disabled={generating || !availability || !shifts}
            className={`rounded-lg px-4 py-2 text-sm ${
              generating || !availability || !shifts
                ? 'bg-neutral-100 text-neutral-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title={!availability || !shifts ? 'Upload availability and shifts first' : 'Generate schedule'}
          >
            {generating ? 'Generating…' : '🚀 Generate Schedule'}
          </button>
        </div>
      </section>

      {/* Irregular events summary */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-2 text-lg font-semibold">🎯 Irregular Events in Range</h2>
        {eventsInWindow.length === 0 ? (
          <p className="text-sm text-neutral-600">No events for the selected period.</p>
        ) : (
          <ul className="text-sm text-neutral-700">
            {eventsInWindow.map((ev, idx) => (
              <li key={idx} className="border-t py-2 first:border-0">
                <span className="font-medium">{ev.person}</span> — {ev.type} on{' '}
                {new Date(`${ev.date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: '2-digit',
                  day: '2-digit',
                })}{' '}
                ({ev.start_time}-{ev.end_time}) •{' '}
                {ev.ignore_scheduling_rules ? '🔓 Ignores rules' : '⚠️ Follows rules'}
                {ev.description ? <> — <span className="text-neutral-600">{ev.description}</span></> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Events marked “Ignores rules” should exclude people from regular shift assignment during those times.
        </p>
      </section>

      {/* Results */}
      {schedule && (
        <>
          <section className="rounded-2xl border p-5">
            <h2 className="mb-2 text-lg font-semibold">📋 Weekly Schedule Grid</h2>
            <div className="overflow-auto rounded-lg border relative overflow-x-auto shadow-md sm:rounded-lg">
              <table className="w-full text-sm text-left rtl:text-right text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-4000">
                  <tr>
                    <th className="px-6 py-3">Name</th>
                    {days.map((d) => (
                      <th key={d.key} className="px-3 py-2">
                        {d.label} <span className="block text-xs text-neutral-500">Start / End</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row) => (
                    <tr key={row.Name} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600">
                      <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">{row.Name}</td>
                      {dayKeys.map((k) => {
                        const s = row[`${k} Start`];
                        const e = row[`${k} End`];
                        return (
                          <td key={k} className="px-6 py-4">
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
                <div className="text-lg font-semibold">{summary.activeEmployees}</div>
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

          {/* Save */}
          {onSaveSchedule && (
            <section className="rounded-2xl border p-5">
              <h2 className="mb-3 text-lg font-semibold">💾 Save Schedule</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-64 rounded-lg border p-2 text-sm"
                  placeholder="Schedule name"
                />
                <button
                  onClick={save}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Save to Database
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
