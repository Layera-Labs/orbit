'use client';

import { useEffect, useState } from 'react';
import { GraduatedRule } from '@/features/shell/GraduatedRule';
import { listMedia } from '@/db/media';
import { listProjects } from '@/db/projects';
import { SignIn } from '@/features/auth/SignIn';
import { useAuth } from '@/store/authStore';
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
            Orbit web keeps your work in this browser, and nothing leaves the machine
            until you export to a render service. An account is only needed when that
            service meters generation.
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
 * Sign in, sign out, or nothing at all.
 *
 * Nothing at all is the common case and the right one: a service with
 * ORBIT_AUTH_PROVIDER unset has no accounts, and offering a form that could only
 * ever 404 is worse than offering none. `signedOut` is what distinguishes the
 * two — it is set only when the service answered 401, which means it does meter.
 */
function AccountSection() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const signedOut = useJobs((s) => s.signedOut);

  if (status === 'loading') return null;

  if (status === 'authed')
    return (
      <div style={{ display: 'grid', gap: 'var(--w-3)', maxWidth: '56ch' }}>
        <Row label="Signed in as" value={user?.email ?? user?.endUserId ?? '—'} />
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

  if (!signedOut) return null;
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
