'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  function switchMode() {
    setMode(isRegister ? 'login' : 'register');
    setErr('');
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const body = Object.fromEntries(new FormData(e.currentTarget));

    if (isRegister) {
      if (body.password !== body.confirm) return setErr('Passwords do not match');
      if (body.password.length < 8) return setErr('Password must be at least 8 characters');
      delete body.confirm;
    }

    setBusy(true);
    const { ok, data } = await api(isRegister ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body });
    setBusy(false);
    if (ok) router.push('/');
    else setErr(data.error || (isRegister ? 'Sign up failed' : 'Login failed'));
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">✈ AeroSync</h1>
        <p className="text-sm text-slate-500 mb-5">
          {isRegister ? 'Create a new account' : 'Airport resource allocation console'}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input name="username" placeholder="Username" className="input w-full" required autoComplete="username" />
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="input w-full"
            required
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
          {isRegister && (
            <input
              name="confirm"
              type="password"
              placeholder="Confirm password"
              className="input w-full"
              required
              autoComplete="new-password"
            />
          )}
          {isRegister && (
            <p className="text-xs text-slate-500">
              Username can be an email (letters, numbers or _ . @ + -). Password at least 8 characters.
            </p>
          )}
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Sign up' : 'Sign in'}
          </button>
        </form>
        <p className="text-sm text-slate-600 mt-4 text-center">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={switchMode} className="text-sky-700 hover:underline font-medium">
            {isRegister ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </main>
  );
}