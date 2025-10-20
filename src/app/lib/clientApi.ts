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
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
  } catch {}
}

export async function apiSignup(username: string, email: string, password: string) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Signup failed');
  return data;
}

export async function apiLogin(usernameOrEmail: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Login failed');
  return data as { ok: true; token: string; user: { id: number; username: string; email: string } };
}
