"use client";

import React, { useEffect, useMemo, useState } from "react";

type Cap = "FOH" | "BOH" | "TRUCK" | "PREP";

const CAPS: Cap[] = ["FOH", "BOH", "TRUCK", "PREP"];

type Role = {
  id: number;
  name: string;
  caps: Cap[];
  createdAt?: string;
};

export default function RoleCreator({ teamId }: { teamId: number | null }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [selectedCaps, setSelectedCaps] = useState<Set<Cap>>(new Set(["FOH"]));

  // edit mode
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCaps, setEditCaps] = useState<Set<Cap>>(new Set());

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("authToken") ?? "";
  }, []);

  async function loadRoles() {
    if (!teamId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/roles`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to load roles");
      }
      const j = await res.json();
      setRoles(Array.isArray(j?.roles) ? j.roles : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load roles");
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  function toggleCap(setter: (s: Set<Cap>) => void, current: Set<Cap>, cap: Cap) {
    const next = new Set(current);
    if (next.has(cap)) next.delete(cap);
    else next.add(cap);
    setter(next);
  }

  async function createRole() {
    if (!teamId) return;
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (!cleanName) return setErr("Role name is required.");
    if (selectedCaps.size === 0) return setErr("Pick at least one capability.");

    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: cleanName,
          caps: Array.from(selectedCaps),
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to create role");

      setName("");
      setSelectedCaps(new Set(["FOH"]));
      await loadRoles();
    } catch (e: any) {
      setErr(e?.message || "Failed to create role");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(r: Role) {
    setEditingId(r.id);
    setEditName(r.name);
    setEditCaps(new Set(r.caps));
    setErr(null);
  }

  async function saveEdit() {
    if (!teamId || !editingId) return;
    const cleanName = editName.trim().replace(/\s+/g, " ");
    if (!cleanName) return setErr("Role name is required.");
    if (editCaps.size === 0) return setErr("Pick at least one capability.");

    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/roles/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: cleanName,
          caps: Array.from(editCaps),
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to update role");

      setEditingId(null);
      await loadRoles();
    } catch (e: any) {
      setErr(e?.message || "Failed to update role");
    } finally {
      setLoading(false);
    }
  }

  async function deleteRole(roleId: number) {
    if (!teamId) return;
    if (!confirm("Delete this role? Members using it will be unassigned.")) return;

    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/roles/${roleId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to delete role");
      await loadRoles();
    } catch (e: any) {
      setErr(e?.message || "Failed to delete role");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Roles</h2>
        <button
          onClick={loadRoles}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 dark:border-gray-700 dark:hover:bg-gray-800"
          disabled={!teamId || loading}
        >
          Refresh
        </button>
      </div>

      {!teamId ? (
        <div className="mt-3 text-sm text-neutral-500">Select a team to manage roles.</div>
      ) : (
        <>
          {err && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}

          {/* Create */}
          <div className="mt-4 rounded-xl border p-4">
            <p className="text-sm font-medium">Create a role</p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-neutral-500">Role name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  placeholder="FOH BOH Truck Prep"
                />
              </label>

              <div className="grid gap-1">
                <span className="text-xs text-neutral-500">Capabilities</span>
                <div className="flex flex-wrap gap-2">
                  {CAPS.map((c) => {
                    const active = selectedCaps.has(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCap(setSelectedCaps, selectedCaps, c)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          active
                            ? "bg-blue-600 text-white border-blue-600"
                            : "hover:bg-neutral-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <button
                onClick={createRole}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Create Role
              </button>
            </div>
          </div>

          {/* List */}
          <div className="mt-4 overflow-hidden rounded-xl border">
            <div className="max-h-72 overflow-y-auto">
              {loading && roles.length === 0 ? (
                <div className="p-4 text-sm text-neutral-500">Loading…</div>
              ) : roles.length === 0 ? (
                <div className="p-4 text-sm text-neutral-500">No roles yet.</div>
              ) : (
                <ul className="divide-y">
                  {roles.map((r) => {
                    const isEditing = editingId === r.id;
                    return (
                      <li key={r.id} className="p-3">
                        {!isEditing ? (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{r.name}</p>
                              <p className="mt-1 text-xs text-neutral-500">
                                Caps: {r.caps.join(", ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startEdit(r)}
                                className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50 dark:border-gray-700 dark:hover:bg-gray-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteRole(r.id)}
                                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <span className="text-xs text-neutral-500">Role name</span>
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                              />
                            </div>

                            <div className="grid gap-1">
                              <span className="text-xs text-neutral-500">Capabilities</span>
                              <div className="flex flex-wrap gap-2">
                                {CAPS.map((c) => {
                                  const active = editCaps.has(c);
                                  return (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => toggleCap(setEditCaps, editCaps, c)}
                                      className={`rounded-full border px-3 py-1 text-xs ${
                                        active
                                          ? "bg-blue-600 text-white border-blue-600"
                                          : "hover:bg-neutral-50 dark:border-gray-700 dark:hover:bg-gray-800"
                                      }`}
                                    >
                                      {c}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={saveEdit}
                                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 dark:border-gray-700 dark:hover:bg-gray-800"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}