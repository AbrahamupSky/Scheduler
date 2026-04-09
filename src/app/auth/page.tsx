'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiLogin, apiSignup } from '@/app/lib/clientApi';
import Swal from 'sweetalert2';

const Toast = Swal.mixin({
  toast: true,
  position: 'top',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [suUsername, setSuUsername] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');

  const [busy, setBusy] = useState(false);

  async function onLogin() {
    setBusy(true);
    try {
      const res = await apiLogin(usernameOrEmail.trim(), password);
      localStorage.setItem('authToken', res.token);
      localStorage.setItem('username', res.username);
      localStorage.setItem('userId', String(res.user_id));
      window.dispatchEvent(new Event('auth:login'));
      router.replace('/');
      router.refresh();
    } catch (e: unknown) {
      Toast.fire({ icon: 'error', title: 'Login failed', text: (e as Error)?.message || 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  async function onSignup() {
    if (suPassword !== suConfirm) {
      Swal.fire({ icon: 'warning', title: 'Passwords do not match', text: 'Please confirm your password again.' });
      return;
    }
    setBusy(true);
    try {
      await apiSignup(suUsername.trim(), suEmail.trim(), suPassword);
      Toast.fire({ icon: 'success', title: 'Account created!' });
      const res = await apiLogin(suEmail.trim(), suPassword);
      localStorage.setItem('authToken', res.token);
      localStorage.setItem('username', res.user.username);
      localStorage.setItem('userId', String(res.user.id));
      window.dispatchEvent(new Event('auth:login'));
      router.replace('/');
      router.refresh();
    } catch (e: unknown) {
      Swal.fire({ icon: 'error', title: 'Signup failed', text: (e as Error)?.message || 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 48,
          alignItems: 'center',
        }}
      >
        {/* ── Left: Brand ───────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}
            >
              🗓️
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
              Auto Scheduler
            </span>
          </div>

          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', lineHeight: 1.25, marginBottom: 12 }}>
            {mode === 'login' ? 'Welcome back' : 'Get started'}
          </h1>

          <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
            {mode === 'login'
              ? 'Sign in to manage your team schedules.'
              : 'Create an account to start building smart schedules.'}
          </p>

          <p style={{ fontSize: 14, color: 'var(--text-3)' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: 14,
                padding: 0,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              {mode === 'login' ? 'Register here' : 'Sign in here'}
            </button>
          </p>
        </div>

        {/* ── Right: Form card ──────────────────────────────── */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 32,
          }}
        >
          {mode === 'login' ? (
            <form onSubmit={(e) => { e.preventDefault(); onLogin(); }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>
                Sign in
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Field label="Email or Username">
                  <input
                    className="input"
                    type="text"
                    required
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                    placeholder="Enter email or username"
                    autoComplete="username"
                  />
                </Field>

                <Field label="Password">
                  <input
                    className="input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-primary"
                style={{ width: '100%', marginTop: 24, padding: '10px 16px', fontSize: 15 }}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); onSignup(); }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>
                Create account
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Field label="Username">
                  <input
                    className="input"
                    type="text"
                    required
                    value={suUsername}
                    onChange={(e) => setSuUsername(e.target.value)}
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </Field>

                <Field label="Email">
                  <input
                    className="input"
                    type="email"
                    required
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                    placeholder="Enter email"
                    autoComplete="email"
                  />
                </Field>

                <Field label="Password">
                  <input
                    className="input"
                    type="password"
                    required
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                  />
                </Field>

                <Field label="Confirm Password">
                  <input
                    className="input"
                    type="password"
                    required
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-primary"
                style={{ width: '100%', marginTop: 24, padding: '10px 16px', fontSize: 15 }}
              >
                {busy ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-2)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
