'use client';

import React, { useEffect, useMemo, useState } from 'react';

/** ---------- Types ---------- */
export type ScheduleCell = string | null;
export type ScheduleRow = { Name: string; [col: string]: ScheduleCell };

export type SavedScheduleSummary = {
  id: number | string;
  name: string;
  start_date: string; // 'YYYY-MM-DD'
  end_date: string; // 'YYYY-MM-DD'
  created_at: string; // ISO string
  optimization_priority?: string;
};

export type SavedSchedulesProps = {
  /** Fetch summaries to display */
  fetchSavedSchedules: () =>
    | Promise<SavedScheduleSummary[]>
    | SavedScheduleSummary[];
  /** Given an id, return the full schedule rows */
  onLoadSchedule: (
    id: number | string
  ) => Promise<ScheduleRow[] | null> | (ScheduleRow[] | null);
  /** Optional deletion hook */
  onDeleteSchedule?: (id: number | string) => Promise<void> | void;

  /** Optional: notify parent when a schedule is loaded */
  onLoaded?: (payload: {
    id: number | string;
    name: string;
    schedule: ScheduleRow[] | null;
    startDate: string;
    endDate: string;
  }) => void;
};

/** ---------- Component ---------- */
export default function SavedSchedules({
  fetchSavedSchedules,
  onLoadSchedule,
  onDeleteSchedule,
  onLoaded,
}: SavedSchedulesProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SavedScheduleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [preview, setPreview] = useState<ScheduleRow[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [deletingId, setDeletingId] = useState<number | string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<null | {
    id: number | string;
    name: string;
  }>(null);

  // Initial fetch
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const list = await fetchSavedSchedules();
        // Sort newest first by created_at (fallback by id as string)
        const sorted = [...list].sort((a, b) => {
          const ta = Date.parse(a.created_at || '') || 0;
          const tb = Date.parse(b.created_at || '') || 0;
          if (tb !== ta) return tb - ta;
          return String(b.id).localeCompare(String(a.id));
        });
        setRows(sorted);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load saved schedules');
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchSavedSchedules]);

  const selectedSummary = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );

  const loadPreview = async (id: number | string) => {
    setSelectedId(id);
    setLoadingPreview(true);
    try {
      const data = await onLoadSchedule(id);
      setPreview(data ?? null);
    } catch (e: any) {
      setPreview(null);
      alert(`Load failed: ${e?.message ?? e}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const loadIntoApp = async (id: number | string) => {
    try {
      const data = await onLoadSchedule(id);
      const meta = rows.find((r) => r.id === id);
      if (onLoaded && meta) {
        onLoaded({
          id,
          name: meta.name,
          schedule: data ?? null,
          startDate: meta.start_date,
          endDate: meta.end_date,
        });
      }
      alert('✅ Schedule loaded.');
    } catch (e: any) {
      alert(`Load failed: ${e?.message ?? e}`);
    }
  };

  const doDelete = async (id: number | string) => {
    if (!onDeleteSchedule) return;
    setDeletingId(id);
    try {
      await onDeleteSchedule(id);
      setRows((r) => r.filter((x) => x.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setPreview(null);
      }
      setConfirmOpen(null);
    } catch (e: any) {
      alert(`Delete failed: ${e?.message ?? e}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">💾 Saved Schedules</h1>
        <p className="text-sm text-neutral-600">
          Load, preview, or delete past schedules saved in your database.
        </p>
      </div>

      {/* Summaries table */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">History</h2>

        {loading ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-600">No saved schedules yet.</p>
        ) : (
          <div className="relative overflow-x-auto shadow-md sm:rounded-lg mt-4">
            <table className="w-full table-fixed text-left text-sm rtl:text-right text-gray-500 dark:text-gray-300">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Range</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2">
                      {new Date(
                        `${r.start_date}T00:00:00`
                      ).toLocaleDateString()}{' '}
                      –{' '}
                      {new Date(`${r.end_date}T00:00:00`).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.optimization_priority || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => loadPreview(r.id)}
                          className={`rounded-lg border px-3 py-1 ${
                            selectedId === r.id
                              ? 'bg-neutral-100'
                              : 'hover:bg-neutral-50'
                          }`}
                          title="Preview"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => loadIntoApp(r.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
                          title="Load into app"
                        >
                          Load
                        </button>
                        {onDeleteSchedule && (
                          <button
                            onClick={() =>
                              setConfirmOpen({ id: r.id, name: r.name })
                            }
                            className="rounded-lg border px-3 py-1 hover:bg-neutral-50 text-red-600 border-red-300"
                            title="Delete"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Preview panel */}
      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 text-lg font-semibold">Preview</h2>
        {!selectedSummary ? (
          <p className="text-sm text-neutral-600">
            Select a schedule to preview.
          </p>
        ) : loadingPreview ? (
          <p className="text-sm text-neutral-600">Loading preview…</p>
        ) : !preview || preview.length === 0 ? (
          <p className="text-sm text-neutral-600">No preview available.</p>
        ) : (
          <>
            <div className="mb-3 text-sm text-neutral-600">
              <div>
                <span className="font-medium">{selectedSummary.name}</span> ·{' '}
                {new Date(
                  `${selectedSummary.start_date}T00:00:00`
                ).toLocaleDateString()}{' '}
                –{' '}
                {new Date(
                  `${selectedSummary.end_date}T00:00:00`
                ).toLocaleDateString()}
              </div>
            </div>

            <div className="relative overflow-x-auto shadow-md sm:rounded-lg mt-4">
              <table className="w-full table-fixed text-left text-sm rtl:text-right text-gray-500 dark:text-gray-300">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                  <tr>
                    {/* Build columns from first row keys (Name + date Start/End) */}
                    {Object.keys(preview[0]).map((k) => (
                      <th key={k} className="px-3 py-2">
                        {k === 'Name' ? 'Name' : k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="border-t align-top">
                      {Object.keys(preview[0]).map((k) => (
                        <td key={k} className="px-3 py-2">
                          {row[k] ?? (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 50 && (
              <p className="mt-2 text-xs text-neutral-500">
                Showing first 50 rows.
              </p>
            )}
          </>
        )}
      </section>

      {/* Delete confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow dark:bg-gray-900 dark:text-white">
            <h3 className="text-lg font-semibold">Delete schedule?</h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              This will permanently delete{' '}
              <span className="font-medium">{confirmOpen.name}</span>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(null)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(confirmOpen.id)}
                disabled={deletingId === confirmOpen.id}
                className={`rounded-lg px-4 py-2 text-sm ${
                  deletingId === confirmOpen.id
                    ? 'bg-red-300 text-white'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {deletingId === confirmOpen.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
