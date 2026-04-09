'use client';

import React, { useEffect, useState } from 'react';
import Navbar from './components/navbar/Navbar';
import { useRouter } from 'next/navigation';

async function apiValidateSession(token: string | null): Promise<boolean> {
  return Boolean(token);
}

export default function Page() {
  const router = useRouter();
  const [validating, setValidating] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    apiValidateSession(token).then((valid) => {
      if (!valid) {
        router.replace('/auth');
        router.refresh();
      } else {
        setAuthenticated(true);
        setValidating(false);
      }
    });
  }, [router]);

  if (validating) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-950">
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
          <p className="text-sm text-gray-400">Validating session…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  return <Navbar />;
}
