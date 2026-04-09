'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiLogin, apiSignup } from '@/app/lib/clientApi';
import Swal from 'sweetalert2';
import { Calendar, RefreshCw } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // login fields
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  // signup fields
  const [suUsername, setSuUsername] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  async function onLogin() {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiLogin(usernameOrEmail.trim(), password);
      localStorage.setItem('authToken', res.token);
      localStorage.setItem('username', res.user.username);
      localStorage.setItem('userId', String(res.user.id));
      window.dispatchEvent(new Event('auth:login'));
      router.replace('/');
      router.refresh();
    } catch (e: any) {
      Toast.fire({
        icon: 'error',
        title: 'Login failed',
        text: e?.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function onSignup() {
    setErr(null);

    if (suPassword !== suConfirm) {
      Swal.fire({
        icon: 'warning',
        title: 'Passwords do not match',
        text: 'Please confirm your password again.',
      });
      return;
    }

    setBusy(true);
    try {
      await apiSignup(suUsername.trim(), suEmail.trim(), suPassword);

      Toast.fire({
        icon: 'success',
        title: 'Account created successfully',
      });

      const res = await apiLogin(suEmail.trim(), suPassword);
      localStorage.setItem('authToken', res.token);
      localStorage.setItem('username', res.user.username);
      localStorage.setItem('userId', String(res.user.id));

      window.dispatchEvent(new Event('auth:login'));
      router.replace('/');
      router.refresh();
    } catch (e: any) {
      Swal.fire({
        icon: 'error',
        title: 'Signup failed',
        text: e?.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder:text-gray-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors';

  return (
    <main className="min-h-dvh bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-700">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-100">Auto Scheduler</h1>
            <p className="text-xs text-gray-500">Shift scheduling made simple</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-8">
          {/* Mode toggle */}
          <div className="mb-6 flex rounded-lg border border-gray-700 bg-gray-900 p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); setErr(null); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-indigo-700 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setErr(null); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-indigo-700 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Create account
            </button>
          </div>

          {err && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400">
              {err}
            </div>
          )}

          {mode === 'login' ? (
            <form
              onSubmit={(e) => { e.preventDefault(); onLogin(); }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Email or Username
                </label>
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                  className={inputClass}
                  placeholder="Enter email or username"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                  className={inputClass}
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
              >
                {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); onSignup(); }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={suUsername}
                  onChange={(e) => setSuUsername(e.target.value)}
                  className={inputClass}
                  placeholder="Choose a username"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={suEmail}
                  onChange={(e) => setSuEmail(e.target.value)}
                  className={inputClass}
                  placeholder="Enter your email"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={suPassword}
                  onChange={(e) => setSuPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={suConfirm}
                  onChange={(e) => setSuConfirm(e.target.value)}
                  className={inputClass}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
              >
                {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
                {busy ? 'Creating…' : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
