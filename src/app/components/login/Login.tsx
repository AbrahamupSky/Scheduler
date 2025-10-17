'use client';

import React, { useState } from 'react';
import Button from '../Button';
import { AuthResult } from '../AuthResult';
import Swal from 'sweetalert2';

async function apiLogin(usernameOrEmail: string, password: string): Promise<AuthResult> {
  // TODO: call your real API: await fetch('/api/auth/login', { ... })
  // For now, pretend success if any non-empty creds:
  if (usernameOrEmail && password) {
    return {
      success: true,
      user_id: 1,
      username: usernameOrEmail.split('@')[0],
      token: 'demo-token-' + Math.random().toString(36).slice(2),
    };
  }
  Swal.fire({
    icon: 'error',
    title: 'Oops...',
    text: 'Invalid credentials!',
  });
  return { success: false };
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full rounded-xl border p-3 outline-none transition ' +
        'border-neutral-300 focus:border-blue-500 ' +
        (props.className ?? '')
      }
    />
  );
}

export default function LoginForm({
  onLoginSuccess,
  switchToSignup,
}: {
  onLoginSuccess: (r: Extract<AuthResult, { success: true }>) => void;
  switchToSignup: () => void;
}) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiLogin(usernameOrEmail.trim(), password);
    setBusy(false);
    if (res.success) onLoginSuccess(res);
    else setError(res.error);
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <h1 className="text-3xl font-bold">🔐 Login to Team Scheduler</h1>
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Username or Email</label>
          <TextInput
            placeholder="Enter your username or email"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <TextInput
            placeholder="Enter your password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">❌ {error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Logging in…' : '🚀 Login'}
          </Button>
          <Button type="button" variant="secondary" onClick={switchToSignup} disabled={busy}>
            📝 Create Account
          </Button>
        </div>
      </form>
    </div>
  );
}