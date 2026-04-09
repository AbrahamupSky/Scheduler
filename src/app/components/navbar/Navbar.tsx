'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamData from '../pages/TeamData';
import SchedulingRules from '../pages/SchedulingRules';
import IrregularEvents from '../pages/IrregularEvents';
import GenerateSchedule from '@/app/generate/page';
import ViewSchedule from '../pages/ViewSchedule';
import RoleCreator from '../pages/RoleCreator';

const availabilityRows: unknown[] = [];
const shiftsRows: unknown[] = [];
const events: unknown[] = [];

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

type PageId =
  | 'Team Data'
  | 'Scheduling Rules'
  | 'Irregular Events'
  | 'Generate Schedule'
  | 'Schedules'
  | 'Roles';

const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: 'Team Data',         label: 'Team Data',    icon: '👥' },
  { id: 'Roles',             label: 'Roles',        icon: '🎭' },
  { id: 'Scheduling Rules',  label: 'Rules',        icon: '⚙️' },
  { id: 'Irregular Events',  label: 'Events',       icon: '📅' },
  { id: 'Generate Schedule', label: 'Generate',     icon: '✨' },
  { id: 'Schedules',         label: 'Schedules',    icon: '🗓️' },
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    await apiLogout(token);
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

  const [generatedSchedule, setGeneratedSchedule] = useState<unknown[] | null>(null);
  const [startDateISO, setStartDateISO] = useState<string | null>(null);
  const [endDateISO, setEndDateISO] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);

  const [page, setPage] = useState<PageId>('Team Data');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const Body = useMemo(() => {
    switch (page) {
      case 'Team Data':
        return <TeamData teamId={null} teamName={null} />;
      case 'Scheduling Rules':
        return <SchedulingRules />;
      case 'Irregular Events':
        return <IrregularEvents />;
      case 'Generate Schedule':
        return (
          <GenerateSchedule
            availability={availabilityRows}
            shifts={shiftsRows}
            irregularEvents={events}
            onGenerate={async () => []}
            onSaveSchedule={async () => {}}
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
      default:
        return null;
    }
  }, [page, generatedSchedule, startDateISO, endDateISO, teamName]);

  const initials = username ? username[0].toUpperCase() : '?';

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Top Navigation ─────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: '1px solid var(--border)',
          background: 'color-mix(in srgb, var(--surface) 85%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 16px',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
              }}
            >
              🗓️
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              Auto Scheduler
            </span>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

          {/* Nav pills — desktop */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flex: 1,
              overflow: 'hidden',
            }}
            className="hidden md:flex"
          >
            {NAV_ITEMS.map((item) => {
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 12px',
                    borderRadius: 7,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.12s, color 0.12s',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-2)',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--elevated)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
                    }
                  }}
                >
                  <span style={{ fontSize: 13 }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Spacer on mobile */}
          <div style={{ flex: 1 }} className="md:hidden" />

          {/* Mobile menu toggle */}
          <button
            className="md:hidden"
            onClick={() => setMobileMenuOpen((o) => !o)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 7,
              padding: '5px 8px',
              cursor: 'pointer',
              fontSize: 16,
              color: 'var(--text-2)',
            }}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>

          {/* Right: user + logout — always shown when authenticated */}
          {authenticated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {/* Avatar */}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: 'var(--accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--accent-text)',
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>

              {/* Username (hidden on very small screens) */}
              {username && (
                <span
                  className="hidden sm:block"
                  style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {username}
                </span>
              )}

              {/* Logout — always visible */}
              <button
                onClick={logout}
                style={{
                  background: 'var(--danger-soft)',
                  border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
                  borderRadius: 7,
                  padding: '5px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--danger) 18%, transparent)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--danger-soft)';
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
            className="md:hidden"
          >
            {NAV_ITEMS.map((item) => {
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setPage(item.id); setMobileMenuOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 14,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    color: active ? 'var(--accent-text)' : 'var(--text)',
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}

            {/* Logout in mobile menu */}
            {authenticated && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                {username && (
                  <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--text-3)' }}>
                    Signed in as <strong style={{ color: 'var(--text-2)' }}>{username}</strong>
                  </div>
                )}
                <button
                  onClick={() => { setMobileMenuOpen(false); logout(); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: 'var(--danger-soft)',
                    color: 'var(--danger)',
                    width: '100%',
                  }}
                >
                  🚪 Sign out
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {/* ── Page content ──────────────────────────────────────── */}
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 16px' }}>
        {Body}
      </main>
    </div>
  );
}
