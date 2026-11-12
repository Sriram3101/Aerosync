'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function LoginPage() {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const { ok, data } = await api('/api/auth/login', { method: 'POST', body });
    setBusy(false);
    if (ok) router.push('/');
    else setErr(data.error || 'Login failed');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">✈ AeroSync</h1>
        <p className="text-sm text-slate-500 mb-5">Airport resource allocation console</p>
        <form onSubmit={submit} className="space-y-3">
          <input name="username" placeholder="Username" className="input w-full" required autoComplete="username" />
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="input w-full"
            required
            autoComplete="current-password"
          />
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
