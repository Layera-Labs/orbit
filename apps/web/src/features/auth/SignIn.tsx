'use client';

import { useState, type FormEvent } from 'react';
import { AuthError, useAuth } from '@/store/authStore';
import styles from './SignIn.module.css';

type Mode = 'login' | 'register' | 'forgot';

const TITLE: Record<Mode, string> = {
  login: 'Sign in',
  register: 'Create an account',
  forgot: 'Reset your password',
};

/**
 * The account form, for the one surface that needs an account.
 *
 * Deliberately small and deliberately in TWO places — inside AI Studio, where
 * the refusal happens, and on the account page, where you would go looking for
 * it. A sign-in you can only reach by navigating away from the thing that asked
 * for it is how the panel became a dead end in the first place.
 *
 * Everything but generation stays open: no route is gated on this, and the
 * editor never reads the auth store.
 */
export function SignIn({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const requestReset = useAuth((s) => s.requestReset);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'forgot') {
        await requestReset(email.trim());
        setSent(true);
      } else if (mode === 'register') {
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      // The server's own message, not a generic one: it is the difference
      // between "that email is taken" and "password must be 8 characters".
      setError(
        err instanceof AuthError ? err.message : (err as Error).message || 'Something went wrong.',
      );
    } finally {
      setBusy(false);
    }
  };

  const swap = (next: Mode) => {
    setMode(next);
    setError(null);
    setSent(false);
  };

  if (sent)
    return (
      <div className={styles.form} data-compact={compact}>
        <p className={styles.note}>
          If an account exists for {email.trim()}, a reset link is on its way. The link
          works once and expires.
        </p>
        <button type="button" className={styles.link} onClick={() => swap('login')}>
          Back to sign in
        </button>
      </div>
    );

  return (
    <form className={styles.form} data-compact={compact} onSubmit={go}>
      {!compact && <h2 className={styles.title}>{TITLE[mode]}</h2>}

      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          className={styles.input}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      {mode !== 'forgot' && (
        <label className={styles.field}>
          <span className={styles.label}>Password</span>
          <input
            className={styles.input}
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.submit} type="submit" disabled={busy}>
        {busy ? 'Working…' : TITLE[mode]}
      </button>

      {/* Plain text, one per line — not a row of ghost buttons pretending each
          alternative is an equal action. */}
      <div className={styles.alts}>
        {mode !== 'login' && (
          <button type="button" className={styles.link} onClick={() => swap('login')}>
            I already have an account
          </button>
        )}
        {mode !== 'register' && (
          <button type="button" className={styles.link} onClick={() => swap('register')}>
            Create an account
          </button>
        )}
        {mode === 'login' && (
          <button type="button" className={styles.link} onClick={() => swap('forgot')}>
            Forgot your password
          </button>
        )}
      </div>
    </form>
  );
}
