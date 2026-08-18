'use client';

/**
 * Sign in — PLATE 03.
 *
 * One screen, two modes. GitHub first because the audience already has an
 * account and it removes a password from our liability; email is the fallback,
 * not the headline.
 *
 * ## Why the GitHub control is not always rendered
 *
 * The render service only mounts its OAuth routes when all four variables are
 * configured, so on an unconfigured deployment `/v1/auth/github` does not
 * exist. Rendering the button anyway would give someone a control that leads
 * to a 404 — a dead control, which is worse than an absent one. The page asks
 * once, on load, and shows what is actually available.
 */
import { useEffect, useState } from 'react';
import styles from './SignIn.module.css';

type Mode = 'signin' | 'signup';

/** Failures the callback can redirect back with, in words a person can act on. */
const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'You cancelled the GitHub sign-in. Nothing was changed.',
  bad_state: 'That sign-in link expired. Start again.',
  no_code: 'GitHub did not complete the sign-in. Try again.',
  github_unavailable: 'GitHub could not be reached. Try again in a moment.',
};

export function SignIn({ githubEnabled, initialError }: { githubEnabled: boolean; initialError?: string }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(
    initialError ? (OAUTH_ERRORS[initialError] ?? 'That sign-in did not complete. Try again.') : null,
  );

  useEffect(() => {
    // Take the error out of the address bar once it has been read, so a reload
    // or a shared link does not show a stale failure.
    if (initialError && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [initialError]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);

    let res: Response;
    try {
      res = await fetch(`/api/auth/${mode === 'signin' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      setBusy(false);
      setProblem('The service is not reachable. Nothing was changed.');
      return;
    }

    if (res.ok) {
      // A full navigation, not a router push: the session is a cookie the
      // server sets, and every portal screen reads it server-side on the next
      // request. A client-side transition would carry stale state across.
      window.location.href = '/app';
      return;
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string; kind?: string };
    setBusy(false);
    setProblem(body.error ?? 'Could not sign you in.');
  }

  const isSignup = mode === 'signup';

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{isSignup ? 'Create an account' : 'Sign in'}</h1>
      <p className={styles.sub}>
        {isSignup
          ? 'An account holds your API keys and your credits.'
          : 'To manage your API keys and credits.'}
      </p>

      {githubEnabled && (
        <>
          {/*
            A link, not a button with a handler: this is a browser redirect to
            another origin, and an anchor is what a browser already does well —
            it works with middle-click, with keyboard, and without JavaScript.
          */}
          <a className={styles.github} href="/api/orbit-auth/github">
            Continue with GitHub
          </a>
          <div className={styles.or}>
            <span>or</span>
          </div>
        </>
      )}

      <form onSubmit={submit} className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Password</span>
          <input
            className={styles.input}
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isSignup ? 8 : undefined}
          />
          {isSignup && <span className={styles.hint}>At least 8 characters.</span>}
        </label>

        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {/*
        Reserved, so the card does not resize when a failure appears — a form
        that grows under the pointer moves the button you were about to press.
      */}
      <p className={styles.problem} role="alert">
        {problem ?? ''}
      </p>

      <p className={styles.switch}>
        {isSignup ? 'Already have an account?' : 'No account yet?'}{' '}
        <button
          type="button"
          className={styles.switchBtn}
          onClick={() => {
            setMode(isSignup ? 'signin' : 'signup');
            setProblem(null);
          }}
        >
          {isSignup ? 'Sign in' : 'Create one'}
        </button>
      </p>
    </div>
  );
}
