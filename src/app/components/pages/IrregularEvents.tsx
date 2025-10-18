'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';

/** ---------- Types ---------- */
export type AvailabilityRow = {
  Name: string;
  Job?: string; // can be comma-separated
  Position?: string;
  [k: string]: any;
};

export type IrregularEvent = {
  type:
    | 'Meeting'
    | 'Time Off'
    | 'Training'
    | 'Special Assignment'
    | 'Holiday'
    | 'Company Event'
    | 'Other';
  person: string;
  date: string; // ISO date string: 'YYYY-MM-DD'
  start_time: string; // 'HH:MM' 24h
  end_time: string; // 'HH:MM' 24h
  description?: string;
  group_type:
    | 'Individual Person'
    | 'Group Selection'
    | 'All Staff'
    | 'Custom Selection';
  group_identifier: string;
  ignore_scheduling_rules: boolean;
};

export type IrregularEventsProps = {
  teamId: number | null;

  // Data to drive pickers:
  availability: AvailabilityRow[] | null;

  // Existing events (e.g., loaded from DB)
  initialEvents?: IrregularEvent[] | null;

  // Persist new events:
  onSaveEvents?: (events: IrregularEvent[]) => Promise<void> | void;

  // Delete a whole group at once:
  onDeleteGroup?: (args: {
    group_identifier: string;
    type: IrregularEvent['type'];
    date: string;
    start_time: string;
    end_time: string;
  }) => Promise<void> | void;

  // Delete a single event (one person):
  onDeleteSingle?: (ev: IrregularEvent) => Promise<void> | void;

  // Cleanup past events (optional top-right button)
  onCleanupPast?: () => Promise<number> | number | void;
};

/** ---------- Time helpers ---------- */
function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** Parse AM/PM or 24h into 'HH:MM' (24h). Returns null if invalid. */
export function parseTimeToHHMM(input: string): string | null {
  if (!input) return null;
  const s = input.trim().toUpperCase().replace(/\s+/g, '');

  // Patterns like '9AM', '9:15PM'
  const ampm = s.match(/^(\d{1,2})(?::?(\d{2}))?(AM|PM)$/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? 0);
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (ampm[3] === 'AM') {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return `${pad2(h)}:${pad2(m)}`;
  }

  // 'h:mm AM/PM' with space like '9:30 PM'
  const spaced = input
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/);
  if (spaced) {
    let h = Number(spaced[1]);
    const m = Number(spaced[2] ?? 0);
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (spaced[3] === 'AM') {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return `${pad2(h)}:${pad2(m)}`;
  }

  // 24h 'HH:MM'
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${pad2(h)}:${pad2(m)}`;
  }
  return null;
}

function formatHHMMToAmPm(hhmm: string): string {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

/** ---------- Component ---------- */
export default function IrregularEvents({
  teamId,
  availability,
  initialEvents = [],
  onSaveEvents,
  onDeleteGroup,
  onDeleteSingle,
  onCleanupPast,
}: IrregularEventsProps) {
  // selection state
  const [selectionMethod, setSelectionMethod] = useState<
    'Individual Person' | 'Group Selection' | 'All Staff' | 'Custom Selection'
  >('Individual Person');

  const [personName, setPersonName] = useState<string>('');
  const [customNames, setCustomNames] = useState<string>('');

  const [selectedJob, setSelectedJob] = useState<string>('Any');
  const [selectedPosition, setSelectedPosition] = useState<string>('Any');

  // event form
  const [eventType, setEventType] = useState<IrregularEvent['type']>('Meeting');
  const [eventDate, setEventDate] = useState<string>(''); // yyyy-mm-dd
  const [startStr, setStartStr] = useState<string>(''); // free text '9:00 AM'
  const [endStr, setEndStr] = useState<string>(''); // free text
  const [description, setDescription] = useState<string>('');
  const [ignoreRules, setIgnoreRules] = useState<boolean>(true);

  // events local list
  const [events, setEvents] = useState<IrregularEvent[]>(initialEvents ?? []);

  // Derived lists for pickers
  const names = useMemo(
    () => (availability?.map((r) => r.Name).filter(Boolean) ?? []).sort(),
    [availability]
  );

  const jobs = useMemo(() => {
    const set = new Set<string>();
    availability?.forEach((r) => {
      String(r.Job ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((j) => set.add(j));
    });
    return ['Any', ...Array.from(set).sort()];
  }, [availability]);

  const positions = useMemo(() => {
    const set = new Set<string>();
    availability?.forEach((r) => {
      const p = String(r.Position ?? '').trim();
      if (p) set.add(p);
    });
    return ['Any', ...Array.from(set).sort()];
  }, [availability]);

  // Affected people according to current selection
  const affectedPeople = useMemo(() => {
    if (selectionMethod === 'Individual Person') {
      return personName ? [personName] : [];
    }
    if (selectionMethod === 'All Staff') {
      return names;
    }
    if (selectionMethod === 'Custom Selection') {
      return customNames
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    // Group Selection
    if (!availability) return [];
    let data = availability;
    if (selectedJob !== 'Any') {
      data = data.filter((r) =>
        String(r.Job ?? '')
          .split(',')
          .map((s) => s.trim())
          .includes(selectedJob)
      );
    }
    if (selectedPosition !== 'Any') {
      data = data.filter(
        (r) => String(r.Position ?? '').trim() === selectedPosition
      );
    }
    return data.map((r) => r.Name);
  }, [
    selectionMethod,
    personName,
    customNames,
    names,
    availability,
    selectedJob,
    selectedPosition,
  ]);

  // Group identifier
  const groupDescription = useMemo(() => {
    switch (selectionMethod) {
      case 'Individual Person':
        return personName ? `Individual: ${personName}` : 'Individual';
      case 'All Staff':
        return 'All Staff';
      case 'Custom Selection':
        return `Custom Group (${affectedPeople.length} people)`;
      case 'Group Selection': {
        const j = selectedJob !== 'Any' ? selectedJob : 'Any Job';
        const p =
          selectedPosition !== 'Any' ? selectedPosition : 'Any Position';
        return `${j} - ${p}`;
      }
    }
  }, [
    selectionMethod,
    affectedPeople.length,
    personName,
    selectedJob,
    selectedPosition,
  ]);
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.onmouseenter = Swal.stopTimer;
      toast.onmouseleave = Swal.resumeTimer;
    },
  });

  // Add event(s)
  const addEvents = async () => {
    // Validate
    const start = parseTimeToHHMM(startStr);
    const end = parseTimeToHHMM(endStr);
    const errors: string[] = [];
    if (!affectedPeople.length) errors.push('Select at least one person.');
    if (!eventDate) errors.push('Pick a date.');
    if (!start) errors.push('Invalid start time (e.g., 9:00 AM)');
    if (!end) errors.push('Invalid end time (e.g., 5:00 PM)');
    if (start && end && start >= end) errors.push('Start must be before end.');

    if (errors.length) {
      Toast.fire({
        icon: 'warning',
        title: 'Please Fix:',
        html: errors.map((e) => `&bull; ${e}<br/>`).join(''),
        position: 'bottom-end',
      });
      return;
    }

    const newEvents: IrregularEvent[] = affectedPeople.map((person) => ({
      type: eventType,
      person,
      date: eventDate,
      start_time: start!,
      end_time: end!,
      description: description.trim() || undefined,
      group_type: selectionMethod,
      group_identifier: groupDescription,
      ignore_scheduling_rules: ignoreRules,
    }));

    setEvents((prev) => [...prev, ...newEvents]);
    await onSaveEvents?.(newEvents);

    // Reset only the times/desc for convenience
    // (keep selection in case you add more for same group)
    setStartStr('');
    setEndStr('');
    setDescription('');
  };

  // Grouping for display (group identifier + type + date + times)
  type GroupKey = string; // JSON string
  const grouped = useMemo(() => {
    const map = new Map<GroupKey, IrregularEvent[]>();
    for (const ev of events) {
      const key = JSON.stringify({
        group_identifier: ev.group_identifier,
        type: ev.type,
        date: ev.date,
        start_time: ev.start_time,
        end_time: ev.end_time,
      });
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  // Delete handlers
  const deleteGroup = async (key: GroupKey) => {
    const meta = JSON.parse(key) as {
      group_identifier: string;
      type: IrregularEvent['type'];
      date: string;
      start_time: string;
      end_time: string;
    };
    // update local first (optimistic)
    setEvents((prev) =>
      prev.filter(
        (e) =>
          !(
            e.group_identifier === meta.group_identifier &&
            e.type === meta.type &&
            e.date === meta.date &&
            e.start_time === meta.start_time &&
            e.end_time === meta.end_time
          )
      )
    );
    await onDeleteGroup?.(meta);
  };

  const deleteSingle = async (ev: IrregularEvent) => {
    setEvents((prev) =>
      prev.filter(
        (e) =>
          !(
            e.person === ev.person &&
            e.type === ev.type &&
            e.date === ev.date &&
            e.start_time === ev.start_time &&
            e.end_time === ev.end_time
          )
      )
    );
    await onDeleteSingle?.(ev);
  };

  // Cleanup past events (optional)
  const cleanupPast = async () => {
    const removedCount = (await onCleanupPast?.()) ?? 0;
    if (removedCount) {
      // If backend pruned, ask caller to reload; here we just notify
      alert(`Cleaned ${removedCount} past events.`);
    }
  };

  /** ---------- UI ---------- */
  return (
    <div className="space-y-8">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">🎯 Irregular Events</h1>
          <p className="text-sm text-neutral-600">
            Add meetings, time off, trainings, holidays, and custom assignments.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={cleanupPast}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-500"
            title="Remove past events from the database"
          >
            🧹 Clean Past Events
          </button>
        </div>
      </div>

      {/* Selection + form */}
      <section className="rounded-2xl border p-5">
        <div className="grid gap-5 md:grid-cols-2">
          {/* Left: Who */}
          <div className="space-y-4">
            <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
              Who does this affect?
            </label>
            <select
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-900 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              value={selectionMethod}
              onChange={(e) =>
                setSelectionMethod(
                  e.target.value as IrregularEvent['group_type']
                )
              }
            >
              <option>Individual Person</option>
              <option>Group Selection</option>
              <option>All Staff</option>
              <option>Custom Selection</option>
            </select>

            {/* Individual */}
            {selectionMethod === 'Individual Person' &&
              (availability ? (
                <select
                  className="w-full rounded-lg border p-2 text-sm"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                >
                  <option value="">Select person...</option>
                  {names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full rounded-lg border p-2 text-sm"
                  placeholder="Enter person name"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                />
              ))}

            {/* Group */}
            {selectionMethod === 'Group Selection' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-neutral-600">Job Type</label>
                    <select
                      className="mt-1 w-full rounded-lg border p-2 text-sm"
                      value={selectedJob}
                      onChange={(e) => setSelectedJob(e.target.value)}
                    >
                      {jobs.map((j) => (
                        <option key={j}>{j}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600">Position</label>
                    <select
                      className="mt-1 w-full rounded-lg border p-2 text-sm"
                      value={selectedPosition}
                      onChange={(e) => setSelectedPosition(e.target.value)}
                    >
                      {positions.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-neutral-600">
                  {availability
                    ? `${affectedPeople.length} people match`
                    : 'Upload availability to enable group selection'}
                </p>
              </>
            )}

            {/* Custom */}
            {selectionMethod === 'Custom Selection' && (
              <textarea
                className="h-24 w-full rounded-lg border p-2 text-sm"
                placeholder="One name per line"
                value={customNames}
                onChange={(e) => setCustomNames(e.target.value)}
              />
            )}

            {/* Preview affected */}
            {affectedPeople.length > 0 && (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer select-none text-sm font-medium">
                  Affected People ({affectedPeople.length})
                </summary>
                <ul className="mt-2 max-h-40 overflow-auto text-sm">
                  {affectedPeople.map((n) => (
                    <li key={n}>• {n}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* Right: What/When */}
          <div className="space-y-3">
            <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
              Event
            </label>
            <select
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-900 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              value={eventType}
              onChange={(e) =>
                setEventType(e.target.value as IrregularEvent['type'])
              }
            >
              {[
                'Meeting',
                'Time Off',
                'Training',
                'Special Assignment',
                'Holiday',
                'Company Event',
                'Other',
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-neutral-600">Date</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                  Ignore Scheduling Rules
                </label>
                <select
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-900 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                  value={ignoreRules ? 'yes' : 'no'}
                  onChange={(e) => setIgnoreRules(e.target.value === 'yes')}
                >
                  <option value="yes">Yes (exclude from regular shifts)</option>
                  <option value="no">No (counts toward limits)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-neutral-600">Start Time</label>
                <input
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                  type="time"
                  value={startStr}
                  onChange={(e) => setStartStr(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-600">End Time</label>
                <input
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                  type="time"
                  value={endStr}
                  onChange={(e) => setEndStr(e.target.value)}
                />
              </div>
            </div>

            <textarea
              className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-900 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <button
              onClick={addEvents}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Add Event
            </button>
          </div>
        </div>
      </section>

      {/* Events list (grouped) */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">Current Irregular Events</h2>

        {events.length === 0 ? (
          <p className="text-sm text-neutral-600">No irregular events yet.</p>
        ) : (
          Array.from(grouped.entries()).map(([key, arr], idx) => {
            const meta = JSON.parse(key) as {
              group_identifier: string;
              type: IrregularEvent['type'];
              date: string;
              start_time: string;
              end_time: string;
            };
            const first = arr[0];
            const friendlyDate = new Date(
              meta.date + 'T00:00:00'
            ).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div key={key} className="mb-4 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">
                      {meta.type}{' '}
                      <span className="text-sm font-normal text-neutral-500">
                        • {meta.group_identifier}
                      </span>
                    </div>
                    <div className="text-sm text-neutral-700">
                      📅 {friendlyDate} &nbsp;|&nbsp; ⏰{' '}
                      {formatHHMMToAmPm(meta.start_time)}–
                      {formatHHMMToAmPm(meta.end_time)}
                    </div>
                    {first.description && (
                      <div className="mt-1 text-sm text-neutral-600">
                        📝 {first.description}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-neutral-500">
                      {first.ignore_scheduling_rules
                        ? '🔓 Ignores rules'
                        : '⚠️ Follows rules'}
                    </div>
                  </div>

                  <button
                    onClick={() => deleteGroup(key)}
                    className="text-red-700 hover:text-white border border-red-700 hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center me-2 mb-2 dark:border-red-500 dark:text-red-500 dark:hover:text-white dark:hover:bg-red-600 dark:focus:ring-red-900"
                    title={`Delete ${meta.type} event for ${arr.length} people`}
                  >
                    Delete Group
                  </button>
                </div>

                {/* People in this group */}
                <div className="relative overflow-x-auto shadow-md sm:rounded-lg mt-4">
                  <table className="w-full table-fixed text-left text-sm rtl:text-right text-gray-500 dark:text-gray-300">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                      <tr>
                        <th className="px-6 py-3">Person</th>
                        <th className="px-6 py-3">Rules</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arr.map((ev) => (
                        <tr
                          key={`${ev.person}-${ev.date}-${ev.start_time}-${ev.end_time}`}
                          className="odd:bg-white odd:dark:bg-gray-900 even:bg-gray-50 even:dark:bg-gray-800 border-b dark:border-gray-700 border-gray-200"
                        >
                          <td className="px-6 py-3">{ev.person}</td>
                          <td className="px-6 py-3">
                            {ev.ignore_scheduling_rules
                              ? 'Ignores scheduling rules'
                              : 'Follows scheduling rules'}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button
                              onClick={() => deleteSingle(ev)}
                              className="font-medium text-red-600 dark:text-red-500 hover:underline"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
