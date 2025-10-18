'use client';

import React, { useEffect, useMemo, useState } from 'react';
import LoginForm from './components/login/Login';
import { AuthResult, AuthState } from '../../AuthResult';
import SignupForm from './components/login/signup/Sign';
import Navbar from './components/navbar/Navbar';
import Swal from 'sweetalert2';

// ---- Faux API helpers (replace with real routes later) ----
async function apiLogin(
  usernameOrEmail: string,
  password: string
): Promise<AuthResult> {
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
}

async function apiLogout(_token: string | null): Promise<void> {
  // TODO: call your real API: await fetch('/api/auth/logout', { ... })
  return;
}

async function apiValidateSession(token: string | null): Promise<boolean> {
  // TODO: call your real API: await fetch('/api/auth/validate', { ... })
  return Boolean(token); // demo: any token is “valid”
}

// ---- Auth Forms ----
<LoginForm />;

// ---- Main Page ----
export default function Page() {
  // Replaces st.session_state for auth-only (we’ll add the rest in later parts)
  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    userId: null,
    username: null,
    authToken: null,
  });
  const [showSignup, setShowSignup] = useState(false);
  const [validating, setValidating] = useState(true);

  // On mount, load token from localStorage & validate
  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const username =
      typeof window !== 'undefined' ? localStorage.getItem('username') : null;
    const userIdStr =
      typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

    (async () => {
      const ok = await apiValidateSession(token);
      if (ok && token && username && userIdStr) {
        setAuth({
          authenticated: true,
          authToken: token,
          username,
          userId: Number(userIdStr),
        });
      }
      setValidating(false);
    })();
  }, []);

  const handleAuthSuccess = (r: Extract<AuthResult, { success: true }>) => {
    // persist
    localStorage.setItem('authToken', r.token);
    localStorage.setItem('username', r.username);
    localStorage.setItem('userId', String(r.user_id));
    // state
    setAuth({
      authenticated: true,
      userId: r.user_id,
      username: r.username,
      authToken: r.token,
    });
    setShowSignup(false);
  };

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
  };

  const topBar = useMemo(
    () => (
      <header className="">
        <Navbar />
      </header>
    ),
    [auth.authenticated, auth.username]
  );

  if (validating) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="rounded-2xl border p-6 shadow-sm">
          <p className="text-neutral-700">Validating session…</p>
        </div>
      </div>
    );
  }

  // Gate: if not authenticated, show login/signup
  if (!auth.authenticated) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-6xl place-items-center px-4 py-10">
        <section className="w-full">
          {showSignup ? (
            <SignupForm
              onSignupSuccess={handleAuthSuccess}
              backToLogin={() => setShowSignup(false)}
            />
          ) : (
            <LoginForm
              onLoginSuccess={handleAuthSuccess}
              switchToSignup={() => setShowSignup(true)}
            />
          )}
        </section>
      </main>
    );
  }

  // Authenticated shell — we’ll build the real app pages in later parts
  return (
    <main className="min-h-dvh">
      {topBar}
    </main>
  );
}
