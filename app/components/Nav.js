'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

// Returns the logged-in user ({ username, role }) or redirects to /login.
export function useMe() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  useEffect(() => {
    api('/api/auth/me').then(({ ok, data }) => {
      if (!ok) router.push('/login');
      else setMe(data);
    });
  }, [router]);
  return me;
}

const links = [
  { href: '/', label: 'Operations' },
  { href: '/crew', label: 'Ground crew' },
  { href: '/logs', label: 'Log search' },
];

export default function Nav({ me }) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <header className="bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
        <span className="font-bold text-lg tracking-wide">✈ AeroSync</span>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded text-sm ${path === l.href ? 'bg-sky-600' : 'hover:bg-slate-700'}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {me && (
            <span className="px-2 py-1 rounded bg-slate-700">
              {me.username} · <b>{me.role}</b>
            </span>
          )}
          <button onClick={logout} className="underline hover:text-sky-300">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

// Coloured message bar used by every page
export function Notice({ msg, onClose }) {
  if (!msg) return null;
  const style = msg.ok ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-red-50 border-red-300 text-red-800';
  return (
    <div className={`border rounded p-3 flex justify-between gap-4 ${style}`}>
      <span>{msg.text}</span>
      <button onClick={onClose} className="font-bold">
        ×
      </button>
    </div>
  );
}
