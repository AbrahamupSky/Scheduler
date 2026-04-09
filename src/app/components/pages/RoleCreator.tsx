"use client";

import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus, Pencil, Trash2, X, Check, AlertTriangle } from "lucide-react";

type Cap = "FOH" | "BOH" | "TRUCK" | "PREP";

const CAPS: Cap[] = ["FOH", "BOH", "TRUCK", "PREP"];

type Role = {
  id: number;
  name: string;
  caps: Cap[];
  createdAt?: string;
};

const inputClass =
  "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-colors";

export default function RoleCreator({ teamId }: { teamId: number | null }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [selectedCaps, setSelectedCaps] = useState<Set<Cap>>(new Set(["FOH"]));

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
        body: JSON.stringify({ name: cleanName, caps: Array.from(selectedCaps) }),
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
        body: JSON.stringify({ name: cleanName, caps: Array.from(editCaps) }),
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

  const CapToggle = ({
    cap,
    active,
    onClick,
  }: {
    cap: Cap;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-indigo-600 bg-indigo-700 text-white"
          : "border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
      }`}
    >
      {cap}
    </button>
  );

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-100">Roles</h2>
        <button
          onClick={loadRoles}
          disabled={!teamId || loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {!teamId ? (
        <div className="p-6 text-sm text-gray-600">Select a team to manage roles.</div>
      ) : (
        <div className="p-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {err}
            </div>
          )}

          {/* Create form */}
          <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-4">
            <p className="mb-3 text-xs font-medium text-gray-400">Create a role</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs text-gray-500">Role name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="e.g., FOH BOH Truck Prep"
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-gray-500">Capabilities</span>
                <div className="flex flex-wrap gap-2">
                  {CAPS.map((c) => (
                    <CapToggle
                      key={c}
                      cap={c}
                      active={selectedCaps.has(c)}
                      onClick={() => toggleCap(setSelectedCaps, selectedCaps, c)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <button
                onClick={createRole}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-3 py-2 text-sm text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Create Role
              </button>
            </div>
          </div>

          {/* Roles list */}
          <div className="overflow-hidden rounded-lg border border-gray-700">
            <div className="max-h-72 overflow-y-auto">
              {loading && roles.length === 0 ? (
                <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : roles.length === 0 ? (
                <div className="p-4 text-sm text-gray-600">No roles yet.</div>
              ) : (
                <ul className="divide-y divide-gray-700/50">
                  {roles.map((r) => {
                    const isEditing = editingId === r.id;
                    return (
                      <li key={r.id} className="px-4 py-3 transition-colors hover:bg-gray-700/20">
                        {!isEditing ? (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-200">{r.name}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {r.caps.map((c) => (
                                  <span
                                    key={c}
                                    className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-400"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                onClick={() => startEdit(r)}
                                className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                              <button
                                onClick={() => deleteRole(r.id)}
                                className="flex items-center gap-1 rounded-lg border border-red-800 bg-red-950/30 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-950/60"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <span className="mb-1 block text-xs text-gray-500">Role name</span>
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <span className="mb-1 block text-xs text-gray-500">Capabilities</span>
                              <div className="flex flex-wrap gap-2">
                                {CAPS.map((c) => (
                                  <CapToggle
                                    key={c}
                                    cap={c}
                                    active={editCaps.has(c)}
                                    onClick={() => toggleCap(setEditCaps, editCaps, c)}
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={saveEdit}
                                className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-700 px-3 py-2 text-xs text-white transition-colors hover:bg-indigo-600"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                              >
                                <X className="h-3.5 w-3.5" />
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
        </div>
      )}
    </div>
  );
}
