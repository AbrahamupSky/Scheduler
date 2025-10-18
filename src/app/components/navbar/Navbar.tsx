'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import UploadData from '../pages/UploadData';
import SchedulingRules from '../pages/SchedulingRules';
import IrregularEvents from '../pages/IrregularEvents';
import GenerateSchedule from '../pages/GenerateSchedule';

// Sample data - replace with actual data from your database
const availabilityRows: any[] = [];
const shiftsRows: any[] = [];
const events: any[] = [];

async function apiLogout(_token: string | null): Promise<void> {
  return;
}

// small page header
function ContentHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle ? (
        <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
      ) : null}
    </header>
  );
}

// auth mirror for username display
function useAuthMirror() {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const username =
      typeof window !== 'undefined' ? localStorage.getItem('username') : null;
    const userIdStr =
      typeof window !== 'undefined' ? localStorage.getItem('userId') : null;
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('username');
    setAuthenticated(Boolean(token));
    setUsername(user);

    const onLogout = () => {
      setAuthenticated(false);
      setUsername(null);
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
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

  const [page, setPage] = useState<
    | 'Upload Data'
    | 'Scheduling Rules'
    | 'Irregular Events'
    | 'Generate Schedule'
    | 'View Schedule'
    | 'Export'
    | 'Saved Schedules'
  >('Upload Data');

  const Body = useMemo(() => {
    switch (page) {
      case 'Upload Data':
        return (
          <>
            <UploadData teamId={null} teamName={null} />
          </>
        );
      case 'Scheduling Rules':
        return (
          <>
            <SchedulingRules
              initialRules={undefined /* or from your DB */}
              onSave={async (rules) => {
                // TODO: call your API to persist (db_manager-style)
                console.log('Saving rules', rules);
              }}
            />
          </>
        );
      case 'Irregular Events':
        return <IrregularEvents />;
      case 'Generate Schedule':
        return (
          <GenerateSchedule
            availability={availabilityRows /* or fetch from DB */}
            shifts={shiftsRows /* or fetch from DB */}
            irregularEvents={events /* optional */}
            onGenerate={async ({
              startDate,
              endDate,
              optimization,
              allowOvertime,
              availability,
              shifts,
              irregularEvents,
            }) => {
              // TODO: call your TeamScheduler equivalent; return ScheduleRow[]
              // return await scheduler.generate({...})
              return []; // or let the component’s fallbackGenerate run by omitting onGenerate
            }}
            onSaveSchedule={async ({
              name,
              schedule,
              startDate,
              endDate,
              optimization,
              allowOvertime,
            }) => {
              // TODO: persist to DB
              console.log('save schedule', {
                name,
                schedule,
                startDate,
                endDate,
                optimization,
                allowOvertime,
              });
            }}
          />
        );
      case 'View Schedule':
        return (
          <>
            <ContentHeader
              title="📋 View Schedule"
              subtitle="Grid view, conflict checks, and quick stats."
            />
            <section className="rounded-2xl border p-6 text-sm text-neutral-700">
              <p>Stub: schedule dataframe/grid goes here.</p>
            </section>
          </>
        );
      case 'Export':
        return (
          <>
            <ContentHeader
              title="📤 Export"
              subtitle="CSV/Excel export options and clipboard copy."
            />
            <section className="rounded-2xl border p-6 text-sm text-neutral-700">
              <p>Stub: export controls here.</p>
            </section>
          </>
        );
      case 'Saved Schedules':
        return (
          <>
            <ContentHeader
              title="💾 Saved Schedules"
              subtitle="Load, inspect, or delete past schedules."
            />
            <section className="rounded-2xl border p-6 text-sm text-neutral-700">
              <p>Stub: saved schedules list & actions.</p>
            </section>
          </>
        );
      default:
        return null;
    }
  }, [page]);

  return (
    <main className="min-h-dvh bg-white dark:bg-gray-900">
      {/* NAVBAR */}
      <div className="sticky top-0 z-10 border-b bg-white/70 p-4 backdrop-blur dark:bg-gray-900/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-800 dark:text-gray-100">
              Auto-Scheduler
            </h2>
            {authenticated && (
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                Signed in as{' '}
                <span className="font-medium">{username ?? '—'}</span>
              </p>
            )}
          </div>

          {/* NAV BUTTONS */}
          <div className="hidden gap-2 md:flex">
            {[
              'Upload Data',
              'Scheduling Rules',
              'Irregular Events',
              'Generate Schedule',
              'View Schedule',
              'Export',
              'Saved Schedules',
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
