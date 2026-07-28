'use client';

import { useEffect, useState } from 'react';
import { GraduatedRule } from '@/features/shell/GraduatedRule';
import { listMedia } from '@/db/media';
import { listProjects } from '@/db/projects';
import { credits } from '@/net/genClient';
import styles from '@/features/shell/Index.module.css';

/**
 * What this browser is holding, and where it is pointed.
 *
 * Deliberately not a sign-in page: the render service only mounts `/v1/auth/*`
 * when ORBIT_AUTH_PROVIDER is set, and the editors work fully logged out. When
 * auth is off, `credits()` returns null and the balance line simply is not shown
 * rather than presenting a broken account UI.
 */
export function AccountClient() {
  const [stats, setStats] = useState<{ projects: number; media: number; bytes: number } | null>(
    null,
  );
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    void Promise.all([listProjects(), listMedia()]).then(([projects, media]) =>
      setStats({
        projects: projects.length,
        media: media.length,
        bytes: media.reduce((n, m) => n + (m.blob?.size ?? 0), 0),
      }),
    );
    void credits().then(setBalance);
  }, []);

  const server = process.env.NEXT_PUBLIC_ORBIT_RENDER_URL ?? 'http://localhost:8787';

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Account</h1>
          <p className={styles.blurb}>
            Orbit web keeps your work in this browser. There is no sign-up, and nothing
            leaves the machine until you export to a render service.
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
