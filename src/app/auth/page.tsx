'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiLogin, apiSignup } from '@/app/lib/clientApi';
import Swal from 'sweetalert2';

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

  async function onLogin() {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      }
    });

    setErr(null);
    setBusy(true);
    try {
      const res = await apiLogin(usernameOrEmail.trim(), password);
      localStorage.setItem('authToken', res.token);
      localStorage.setItem('username', res.username);
      localStorage.setItem('userId', String(res.user_id));
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

      // Auto-login right after signup
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

  return (
    <main className="min-h-dvh bg-white dark:bg-gray-900">
      <div className="lg:min-h-screen flex fle-col items-center justify-center p-6">
        <div className="grid lg:grid-cols-2 items-center gap-10 max-w-6xl max-lg:max-w-lg w-full">
          <div>
            <h1 className="lg:text-5xl text-4xl font-bold text-gray-300 !leading-tight">
              Auto Scheduler
            </h1>
            <p className="text-[15px] mt-6 text-slate-600 leading-relaxed" />
            {mode === 'login' ? (
              <p className="text-[15px] mt-6 lg:mt-12 text-slate-600">
                Don&apos;t have an account
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="text-blue-600 font-medium hover:underline ml-1"
                >
                  Register here
                </button>
              </p>
            ) : (
              <p className="text-[15px] mt-6 lg:mt-12 text-slate-600">
                Already have an account?
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-blue-600 font-medium hover:underline ml-1"
                >
                  Sign in here
                </button>
              </p>
            )}
          </div>

          {mode === 'login' ? (
            // ===================== LOGIN =====================
            <form
              className="max-w-md lg:ml-auto w-full"
              onSubmit={(e) => {
                e.preventDefault();
                onLogin();
              }}
            >
              <h2 className="text-gray-300 text-3xl font-semibold mb-4">
                Sign in
              </h2>

              {err && (
                <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="text-sm text-gray-300 font-medium mb-2 block">
                    Email or Username
                  </label>
                  <input
                    name="email"
                    type="text"
                    required
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                    className="bg-slate-900 w-full text-sm text-slate-100 px-4 py-3 rounded-md outline-0 border border-gray-200 focus:border-blue-600 focus:bg-transparent"
                    placeholder="Enter email or username"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-medium mb-2 block">
                    Password
                  </label>
                  <input
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                    className="bg-slate-900 w-full text-sm text-slate-100 px-4 py-3 rounded-md outline-0 border border-gray-200 focus:border-blue-600 focus:bg-transparent"
                    placeholder="Enter Password"
                    autoComplete="current-password"
                  />
                </div>

                {/* <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                    />
                    <label
                      htmlFor="remember-me"
                      className="ml-3 block text-sm text-gray-300"
                    >
                      Remember me
                    </label>
                  </div>
                  <div className="text-sm">
                    <a
                      href="javascript:void(0);"
                      className="text-blue-600 hover:text-blue-500 font-medium"
                    >
                      Forgot your password?
                    </a>
                  </div>
                </div> */}
              </div>

              <div className="!mt-8">
                <button
                  type="submit"
                  disabled={busy}
                  className={`w-full shadow-xl py-2.5 px-4 text-[15px] font-medium rounded-md text-white ${
                    busy ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {busy ? 'Signing in…' : 'Log in'}
                </button>
              </div>
            </form>
          ) : (
            // ===================== SIGNUP =====================
            <form
              className="max-w-md lg:ml-auto w-full"
              onSubmit={(e) => {
                e.preventDefault();
                onSignup();
              }}
            >
              <h2 className="text-gray-300 text-3xl font-semibold mb-4">
                Create account
              </h2>

              {err && (
                <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="text-sm text-gray-300 font-medium mb-2 block">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={suUsername}
                    onChange={(e) => setSuUsername(e.target.value)}
                    className="bg-slate-900 w-full text-sm text-slate-100 px-4 py-3 rounded-md outline-0 border border-gray-200 focus:border-blue-600 focus:bg-transparent"
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-medium mb-2 block">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                    className="bg-slate-900 w-full text-sm text-slate-100 px-4 py-3 rounded-md outline-0 border border-gray-200 focus:border-blue-600 focus:bg-transparent"
                    placeholder="Enter Email"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-medium mb-2 block">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    className="bg-slate-900 w-full text-sm text-slate-100 px-4 py-3 rounded-md outline-0 border border-gray-200 focus:border-blue-600 focus:bg-transparent"
                    placeholder="Enter Password"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-medium mb-2 block">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    className="bg-slate-900 w-full text-sm text-slate-100 px-4 py-3 rounded-md outline-0 border border-gray-200 focus:border-blue-600 focus:bg-transparent"
                    placeholder="Confirm Password"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="!mt-8">
                <button
                  type="submit"
                  disabled={busy}
                  className={`w-full shadow-xl py-2.5 px-4 text-[15px] font-medium rounded-md text-white ${
                    busy ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {busy ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
