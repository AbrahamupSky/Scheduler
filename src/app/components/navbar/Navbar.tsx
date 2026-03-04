'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamData from '../pages/TeamData';
import SchedulingRules from '../pages/SchedulingRules';
import IrregularEvents from '../pages/IrregularEvents';
import GenerateSchedule from '@/app/generate/page';
import ViewSchedule from '../pages/ViewSchedule';
import ExportSchedule from '../pages/ExportSchedule';
import SavedSchedules from '../pages/SavedSchedules';
import RoleCreator from '../pages/RoleCreator';

// ❌ REMOVE this: import router from 'next/router';

// Sample data - replace with actual data from your database
const availabilityRows: any[] = [];
const shiftsRows: any[] = [];
const events: any[] = [];

export async function apiValidateSession(
  token: string | null
): Promise<boolean> {
  if (!token) return false;
  const res = await fetch('/api/auth/validate', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data?.valid);
}

export async function apiLogout(token: string | null): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
  }).catch(() => {});
}

/** Keep navbar in sync with localStorage auth and cross-tab changes */
function useAuthMirror() {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('authToken')
          : null;
      const user =
        typeof window !== 'undefined' ? localStorage.getItem('username') : null;
      setAuthenticated(Boolean(token));
      setUsername(user && user !== 'undefined' ? user : null);
    };

    // initial read
    read();

    // react to app-wide events
    const onLogin = () => read();
    const onLogout = () => read();
    window.addEventListener('auth:login', onLogin);
    window.addEventListener('auth:logout', onLogout);

    // cross-tab sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'authToken' || e.key === 'username' || e.key === 'userId')
        read();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('auth:login', onLogin);
      window.removeEventListener('auth:logout', onLogout);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return { authenticated, username };
}

type AuthState = {
  authenticated: boolean;
  userId: number | null;
  username: string | null;
  authToken: string | null;
};

export default function AppShell() {
  const router = useRouter();

  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    userId: null,
    username: null,
    authToken: null,
  });

  const logout = async () => {
    await apiLogout(auth.authToken);
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    setAuth({
      authenticated: false,
      userId: null,
      username: null,
      authToken: null,
    });

    // Try to do an SPA-style refresh first…
    router.replace('/'); // safe even if you're already on '/'
    router.refresh();

    // …then force a full reload so all client trees reset
    if (typeof window !== 'undefined') window.location.reload();

    // Notify any listeners (e.g., useAuthMirror)
    window.dispatchEvent(new Event('auth:logout'));
  };

  const { authenticated, username } = useAuthMirror();

  // local state to hold a generated/exported schedule and its metadata
  const [generatedSchedule, setGeneratedSchedule] = useState<any[] | null>(
    null
  );
  const [startDateISO, setStartDateISO] = useState<string | null>(null);
  const [endDateISO, setEndDateISO] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);

  const [page, setPage] = useState<
    | 'Team Data'
    | 'Scheduling Rules'
    | 'Irregular Events'
    | 'Generate Schedule'
    | 'Schedules'
    | 'Roles'
    | 'Not in use (saved schedules)'
  >('Team Data');

  const Body = useMemo(() => {
    switch (page) {
      case 'Team Data':
        return <TeamData teamId={null} teamName={null} />;
      case 'Scheduling Rules':
        return (
          <SchedulingRules
            initialRules={undefined}
            onSave={async (rules) => {
              console.log('Saving rules', rules);
            }}
          />
        );
      case 'Irregular Events':
        return <IrregularEvents />;
      case 'Generate Schedule':
        return (
          <GenerateSchedule
            availability={availabilityRows}
            shifts={shiftsRows}
            irregularEvents={events}
            onGenerate={async () => {
              return [];
            }}
            onSaveSchedule={async () => {
              // persist
            }}
          />
        );
      case 'Schedules':
        return <ViewSchedule />;
      case 'Roles':
        return (
          <RoleCreator
            teamId={Number(localStorage.getItem('currentTeamId')) || null}
          />
        );
      case 'Not in use (saved schedules)':
        return (
          <SavedSchedules
            fetchSavedSchedules={async () => {
              const teamId = Number(localStorage.getItem('currentTeamId'));
              const res = await fetch(`/api/teams/${teamId}/schedules`, {
                cache: 'no-store',
              });
              if (!res.ok) throw new Error('Failed to load schedules');
              const list = await res.json();
              return list.map((s: any) => ({
                id: s.id,
                name: s.name,
                start_date: s.startDate,
                end_date: s.endDate,
                created_at: s.createdAt,
                optimization_priority: s.optimization,
              }));
            }}
            onLoadSchedule={async (id) => {
              const res = await fetch(`/api/schedules/${id}`, {
                cache: 'no-store',
              });
              if (!res.ok) throw new Error('Not found');
              const s = await res.json();
              return s.data as any[];
            }}
            onDeleteSchedule={async (id) => {
              const res = await fetch(`/api/schedules/${id}`, {
                method: 'DELETE',
              });
              if (!res.ok) throw new Error('Delete failed');
            }}
            onLoaded={({ schedule, startDate, endDate }) => {
              // setGeneratedSchedule(schedule); setStartDateISO(startDate); setEndDateISO(endDate); setPage('Schedules');
            }}
          />
        );
      default:
        return null;
    }
  }, [page, generatedSchedule, startDateISO, endDateISO, teamName]);

  return (
    <main className="min-h-dvh bg-white dark:bg-gray-900">
      {/* NAVBAR */}
      <div className="sticky top-0 z-10 border-b bg-white/70 p-4 backdrop-blur dark:bg-gray-900/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-800 dark:text-gray-100">
              Auto-Scheduler
            </h2>

            {/* Only render line if we have a real username */}
            {authenticated && username ? (
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                Signed in as{' '}
                <span className="text-base font-semibold text-gray-900 underline dark:text-white decoration-indigo-500">
                  {username}
                </span>
              </p>
            ) : null}
          </div>

          {/* NAV BUTTONS */}
          <div className="hidden gap-2 md:flex">
            {[
              'Team Data',
              'Scheduling Rules',
              'Irregular Events',
              'Generate Schedule',
              'Schedules',
              'Roles',
              'Not in use (saved schedules)',
            ].map((p) => (
              <button
                key={p}
                onClick={() => setPage(p as any)}
                className={`rounded-lg px-3 py-1 text-sm ${
                  page === p
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-neutral-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'
                }`}
              >
                {p}
              </button>
            ))}

            {/* 🔒 LOGOUT BUTTON */}
            {authenticated && (
              <button
                onClick={logout}
                className="rounded-lg border border-neutral-300 px-3 py-1 text-sm text-gray-700 hover:bg-neutral-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Page body */}
      <div className="mx-auto max-w-7xl p-6">{Body}</div>
    </main>
  );
}
