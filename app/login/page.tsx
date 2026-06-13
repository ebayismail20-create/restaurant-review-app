'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createClient } from '../lib/supabase/client';

/**
 * Manager login. Email + password against Supabase Auth. On success the
 * session cookie is set by the browser client and the proxy keeps it fresh;
 * we route to the dashboard, which is server-protected independently.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Wrong email or password.');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <span className="auth-logo" aria-hidden="true">L</span>
        <h1 className="auth-title">Loop</h1>
        <p className="auth-sub">Manager sign in</p>
      </div>

      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          className="auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="auth-label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          className="auth-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? (
          <p role="alert" className="auth-error">{error}</p>
        ) : null}

        <button type="submit" className="btn-primary btn-full" disabled={busy} aria-busy={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
