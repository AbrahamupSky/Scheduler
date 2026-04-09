'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamData from '../pages/TeamData';
import SchedulingRules from '../pages/SchedulingRules';
import IrregularEvents from '../pages/IrregularEvents';
import GenerateSchedule from '@/app/generate/page';
import ViewSchedule from '../pages/ViewSchedule';
import RoleCreator from '../pages/RoleCreator';
import { Calendar, LogOut, Menu, X } from 'lucide-react';

const availabilityRows: any[] = [];
const shiftsRows: any[] = [];
const events: any[] = [];

export async function apiValidateSession(token: string | null): Promise<boolean> {
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

function useAuthMirror() {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
      const user = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
      setAuthenticated(Boolean(token));
      setUsername(user && user !== 'undefined' ? user : null);
    };

    read();

    const onLogin = () => read();
    const onLogout = () => read();
    window.addEventListener('auth:login', onLogin);
    window.addEventListener('auth:logout', onLogout);

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'authToken' || e.key === 'username' || e.key === 'userId') read();
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

type Page =
  | 'Team Data'
  | 'Scheduling Rules'
  | 'Irregular Events'
  | 'Generate Schedule'
  | 'Schedules'
  | 'Roles';

const NAV_PAGES: Page[] = [
  'Team Data',
  'Scheduling Rules',
  'Irregular Events',
  'Generate Schedule',
  'Schedules',
  'Roles',
];

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
    setAuth({ authenticated: false, userId: null, username: null, authToken: null });
    router.replace('/');
    router.refresh();
    if (typeof window !== 'undefined') window.location.reload();
    window.dispatchEvent(new Event('auth:logout'));
  };

  const { authenticated, username } = useAuthMirror();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [generatedSchedule, setGeneratedSchedule] = useState<any[] | null>(null);
  const [startDateISO, setStartDateISO] = useState<string | null>(null);
  const [endDateISO, setEndDateISO] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);

  const [page, setPage] = useState<Page>('Team Data');

  const navigate = (p: Page) => {
    setPage(p);
    setMobileOpen(false);
  };

  const Body = useMemo(() => {
    switch (page) {
      case 'Team Data':
        return <TeamData teamId={null} teamName={null} />;
      case 'Scheduling Rules':
        return <SchedulingRules />;
      case 'Irregular Events':
        return <IrregularEvents />;
      case 'Generate Schedule':
        return <GenerateSchedule />;
      case 'Schedules':
        return <ViewSchedule />;
      case 'Roles':
        return (
          <RoleCreator
            teamId={Number(localStorage.getItem('currentTeamId')) || null}
          />
        );
      default:
        return null;
    }
  }, [page, generatedSchedule, startDateISO, endDateISO, teamName]);

  return (
    <main className="min-h-dvh bg-gray-950">
      {/* NAVBAR */}
      <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-700">
              <Calendar className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-gray-100">Auto-Scheduler</h2>
              {authenticated && username && (
                <p className="truncate text-xs text-gray-500">
                  {username}
                </p>
              )}
            </div>
          </div>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_PAGES.map((p) => (
              <button
                key={p}
                onClick={() => navigate(p)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  page === p
                    ? 'border-indigo-600 bg-indigo-700 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}

            {authenticated && (
              <button
                onClick={logout}
                className="ml-1 flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-red-800 hover:bg-red-950/30 hover:text-red-400"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="rounded-lg border border-gray-700 bg-gray-800 p-2 text-gray-400 hover:text-white md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="border-t border-gray-800 bg-gray-950 px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {NAV_PAGES.map((p) => (
                <button
                  key={p}
                  onClick={() => navigate(p)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                    page === p
                      ? 'border-indigo-600 bg-indigo-700 text-white'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
              {authenticated && (
                <button
                  onClick={logout}
                  className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-950/50"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Page body */}
      <div className="mx-auto max-w-7xl p-6">{Body}</div>
    </main>
  );
}
