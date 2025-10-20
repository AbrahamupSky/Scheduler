'use client';

import React, { useEffect, useMemo, useState } from 'react';
import LoginForm from './components/login/Login';
import { AuthResult, AuthState } from '../../AuthResult';
import SignupForm from './components/login/signup/Sign';
import Navbar from './components/navbar/Navbar';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation'; // ✅ App Router hook

// ---- Faux API helpers (replace with real routes later) ----
async function apiLogin(
  usernameOrEmail: string,
  password: string
): Promise<AuthResult> {
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
  // keep TS happy
  return { success: false, error: 'Invalid credentials' } as any;
}

async function apiLogout(_token: string | null): Promise<void> {
  return;
}

async function apiValidateSession(token: string | null): Promise<boolean> {
  return Boolean(token); // demo: any token is “valid”
}

// ---- Main Page ----
export default function Page() {
  const router = useRouter(); // ✅ must be inside component

  // Replaces st.session_state for auth-only (we’ll add the rest in later parts)
  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    userId: null,
    username: null,
    authToken: null,
  });
  const [showSignup, setShowSignup] = useState(false);
  const [validating, setValidating] = useState(true);

  // Gate/redirect unauthenticated users to /auth
  useEffect(() => {
    // guard for SSR safety (though 'use client' already ensures client)
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('authToken');
    apiValidateSession(token).then((valid) => {
      if (!valid) {
        router.replace('/auth'); // ✅ next/navigation
        router.refresh();
      }
    });
  }, [router]);

  // On mount, load token from localStorage & validate to set local state
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('authToken');
    const username = localStorage.getItem('username');
    const userIdStr = localStorage.getItem('userId');

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
    localStorage.setItem('authToken', r.token);
    localStorage.setItem('username', r.username);
    localStorage.setItem('userId', String(r.user_id));
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
    router.replace('/auth'); // optional: send to auth page on logout
    router.refresh();
  };

  const topBar = useMemo(
    () => (
      <header>
        <Navbar />
      </header>
    ),
    [] // Navbar reads from localStorage/useEffect; no need to dep on auth here
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
          {topBar}
        </section>
      </main>
    );
  }

  // Authenticated shell — we’ll build the real app pages in later parts
  return <main className="min-h-dvh">{topBar}</main>;
}
