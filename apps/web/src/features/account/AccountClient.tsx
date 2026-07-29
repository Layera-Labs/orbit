'use client';

import { useEffect, useState } from 'react';
import { GraduatedRule } from '@/features/shell/GraduatedRule';
import { listMedia } from '@/db/media';
import { listProjects } from '@/db/projects';
import { SignIn } from '@/features/auth/SignIn';
import { useAuth } from '@/store/authStore';
import { useSync } from '@/store/syncStore';
import { isGuest } from '@/net/session';
import { useJobs } from '@/store/jobsStore';
import styles from '@/features/shell/Index.module.css';

/**
 * What this browser is holding, and where it is pointed.
 *
 * The editors work fully logged out and always will. An account section appears
 * only when the render service actually meters — it mounts `/v1/auth/*` only
 * with ORBIT_AUTH_PROVIDER set, and a form that could only ever 404 is worse
 * than no form.
 */
export function AccountClient() {
  const [stats, setStats] = useState<{ projects: number; media: number; bytes: number } | null>(
    null,
  );
  const balance = useJobs((s) => s.balance);

  useEffect(() => {
    void Promise.all([listProjects(), listMedia()]).then(([projects, media]) =>
      setStats({
        projects: projects.length,
        media: media.length,
        bytes: media.reduce((n, m) => n + (m.blob?.size ?? 0), 0),
      }),
    );
    // Through the store, not `credits()` directly: it is what records whether
    // this service metered and refused, which is what decides below whether a
    // sign-in form belongs on this page at all.
    useJobs.getState().refreshBalance();
  }, []);

  const server = process.env.NEXT_PUBLIC_ORBIT_RENDER_URL ?? 'http://localhost:8787';

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Account</h1>
          <p className={styles.blurb}>
            Orbit web keeps your work in this browser. Sign in and your projects
            also sync to your account, so they follow you to another machine —
            the documents travel, the footage stays where it was uploaded.
          </p>
        </div>
      </header>

      <GraduatedRule className={styles.rule} />

      <dl style={{ display: 'grid', gap: 'var(--w-4)', maxWidth: '56ch', margin: 0 }}>
        <Row label="Projects" value={stats ? String(stats.projects) : '—'} />
        <Row label="Library assets" value={stats ? String(stats.media) : '—'} />
        <Row label="Stored locally" value={stats ? formatBytes(stats.bytes) : '—'} />
        <Row label="Render service" value={server} />
        {balance != null && <Row label="Credits" value={String(balance)} />}
      </dl>

      <AccountSection />
    </div>
  );
}

/**
 * Sync, said plainly.
 *
 * It reports the LAST PASS rather than a live spinner, because that is the
 * question people actually have ("did my work get up there?"), and it names a
 * conflict explicitly — a copy silently appearing in the project list with
 * "(this browser)" after its name would be baffling otherwise.
 */
function SyncRow() {
  const status = useSync((s) => s.status);
  const run = useSync((s) => s.run);

  const text =
    status.state === 'syncing'
      ? 'Syncing…'
      : status.state === 'ok'
        ? status.pulled || status.pushed
          ? `${status.pulled} in, ${status.pushed} out`
          : 'Up to date'
        : status.state === 'guest'
          ? 'Sign in to sync'
          : status.state === 'failed'
            ? `Could not sync — ${status.error}`
            : 'Not available on this server';

  return (
    <div style={{ display: 'grid', gap: 'var(--w-2)', maxWidth: '56ch' }}>
      <Row label="Sync" value={text} />
      {status.state === 'ok' && status.conflicts > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--w-muted)' }}>
          {status.conflicts === 1 ? 'One project was' : `${status.conflicts} projects were`}{' '}
          edited in two places. Nothing was discarded — this browser&rsquo;s version was
          kept alongside, named &ldquo;(this browser)&rdquo;.
        </p>
      )}
      <button
        type="button"
        onClick={() => void run()}
        disabled={status.state === 'syncing'}
        style={{ justifySelf: 'start', color: 'var(--w-muted)', fontSize: 12 }}
      >
        Sync now
      </button>
    </div>
  );
}

/**
 * Sign in, sign out, or nothing at all.
 *
 * The test used to be `signedOut` — set only when the service answered 401 —
 * and guest tokens quietly broke it. Nothing 401s any more, because a
 * signed-out browser now holds a real guest token, so the form never appeared
 * and there was NO WAY TO REACH SIGN-IN AT ALL. That also meant sync could
 * never be turned on, since sync requires an account.
 *
 * The right question was never "did something fail?" but "does this service
 * have accounts?", and holding a guest token is proof that it does: the guest
 * route only exists on the self-hosted provider. A service with no auth
 * configured issues no guest token, `isGuest()` is false, and the form
 * correctly stays away rather than offering something that could only 404.
 */
function AccountSection() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  /* Re-read on each render of this screen rather than subscribing: the token is
     module state, and this component only mounts when someone opens Account. */
  const hasAccounts = isGuest() || useJobs.getState().signedOut;

  if (status === 'loading') return null;

  if (status === 'authed')
    return (
      <div style={{ display: 'grid', gap: 'var(--w-3)', maxWidth: '56ch' }}>
        <Row label="Signed in as" value={user?.email ?? user?.endUserId ?? '—'} />
        <SyncRow />
        <button
          type="button"
          onClick={logout}
          style={{
            justifySelf: 'start',
            color: 'var(--w-muted)',
            fontSize: 12,
          }}
        >
          Sign out
        </button>
      </div>
    );

  if (!hasAccounts) return null;
  return (
    <div style={{ display: 'grid', gap: 'var(--w-3)', maxWidth: '56ch' }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--w-ink)' }}>
        Sign in
      </h2>
      <SignIn />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--w-4)',
        paddingBottom: 'var(--w-3)',
        borderBottom: '1px solid var(--w-edge)',
      }}
    >
      <dt style={{ color: 'var(--w-muted)' }}>{label}</dt>
      <dd className="w-data" style={{ margin: 0, color: 'var(--w-ink)' }}>
        {value}
      </dd>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
