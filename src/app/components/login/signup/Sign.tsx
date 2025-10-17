'use client';
import React, { useState } from 'react';
import Button from '../../Button';
import { AuthResult } from '../../AuthResult';
import TextInput from '../../TextInput';
import Swal from 'sweetalert2';

async function apiSignup(
  username: string,
  email: string,
  password: string
): Promise<AuthResult> {
  // TODO: call your real API: await fetch('/api/auth/signup', { ... })
  if (username && email && password.length >= 6) {
    return {
      success: true,
      user_id: 2,
      username,
      token: 'demo-token-' + Math.random().toString(36).slice(2),
    };
  }
  Swal.fire({
    icon: 'error',
    title: 'Oops...',
    text: 'Something went wrong!',
  });
}

export default function SignupForm({
  onSignupSuccess,
  backToLogin,
}: {
  onSignupSuccess: (r: Extract<AuthResult, { success: true }>) => void;
  backToLogin: () => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !email || !password1 || !password2) {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Please fill in all fields',
      });
      return;
    }
    if (password1 !== password2) {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Passwords do not match',
      });
      return;
    }
    if (password1.length < 6) {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Password must be at least 6 characters long',
      });
      return;
    }
    setBusy(true);
    const res = await apiSignup(username.trim(), email.trim(), password1);
    setBusy(false);
    if (res.success) onSignupSuccess(res);
    else setError(res.error);
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <h1 className="text-3xl font-bold">📝 Create Your Account</h1>
      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Username</label>
          <TextInput
            placeholder="Choose a unique username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <TextInput
            placeholder="your.email@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <TextInput
              placeholder="Create a secure password"
              type="password"
              value={password1}
              onChange={(e) => setPassword1(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Confirm Password
            </label>
            <TextInput
              placeholder="Confirm your password"
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            ❌ {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : '🎉 Create Account'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={backToLogin}
            disabled={busy}
          >
            ← Back to Login
          </Button>
        </div>
      </form>
    </div>
  );
}
