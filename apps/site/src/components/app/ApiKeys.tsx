'use client';

/**
 * API keys — PLATE 06.
 *
 * The whole screen turns on one property of the service: `POST /v1/keys`
 * returns the raw secret exactly once, and only a SHA-256 hash is stored. Every
 * later read gives back `last4` and nothing more. So the reveal is not a nicety
 * — it is the single opportunity, and losing it means the developer has to
 * revoke and start again.
 *
 * That drives three decisions here:
 *
 *   1. The reveal cannot be dismissed by clicking away or pressing Escape. It
 *      takes a deliberate "I've saved it". A modal that closes on a stray click
 *      would destroy a credential.
 *   2. It says plainly that it will not be shown again, before the copy button
 *      rather than after it.
 *   3. The new key is NOT quietly merged into the list behind the reveal. The
 *      list refreshes when the reveal is acknowledged, so nothing competes with
 *      it for attention while it is up.
 *
 * Revoking is irreversible and immediate (the row is tombstoned server-side),
 * so it confirms inline — inline rather than a second modal, because a confirm
 * dialog stacked on a list is where people click "yes" on the wrong row.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createKey,
  listKeys,
  revokeKey,
  type ApiKey,
  type CreatedApiKey,
  type Failure,
} from '@/lib/orbit';
import styles from './ApiKeys.module.css';

type Load =
  | { s: 'loading' }
  | { s: 'ready'; keys: ApiKey[] }
  | { s: 'failed'; why: Failure };

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function ApiKeys() {
  const [load, setLoad] = useState<Load>({ s: 'loading' });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const r = await listKeys();
    setLoad(r.ok ? { s: 'ready', keys: r.value.keys } : { s: 'failed', why: r });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Focus the reveal when it appears, so a keyboard user lands on the thing
  // they have exactly one chance to read.
  useEffect(() => {
    if (created) revealRef.current?.focus();
  }, [created]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const label = name.trim();
    if (!label || busy) return;
    setBusy(true);
    setProblem(null);
    const r = await createKey(label);
    setBusy(false);
    if (r.ok) {
      setCreated(r.value);
      setCopied(false);
      setName('');
    } else {
      setProblem(message(r));
    }
  }

  function acknowledge() {
    setCreated(null);
    void refresh();
  }

  async function copy(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). Saying
      // so is better than a button that silently does nothing — the secret is
      // on screen and selectable either way.
      setProblem('Could not copy automatically. Select the key and copy it.');
    }
  }

  async function revoke(id: string) {
    setProblem(null);
    const r = await revokeKey(id);
    setConfirming(null);
    if (r.ok) void refresh();
    else setProblem(message(r));
  }

  const live = load.s === 'ready' ? load.keys.filter((k) => !k.revokedAt) : [];

  return (
    <div className={styles.wrap}>
      {/*
        The reveal owns the top of the screen while it is up. Not an overlay
        floating over the list: an overlay invites a click-away, and a
        click-away here loses the key.
      */}
      {created && (
        <div
          className={styles.reveal}
          ref={revealRef}
          tabIndex={-1}
          role="alertdialog"
          aria-labelledby="reveal-title"
        >
          <h2 id="reveal-title" className={styles.revealTitle}>
            Copy {created.name} now
          </h2>
          <p className={styles.revealWarn}>
            This is the only time the key is shown. Only a hash of it is stored,
            so it cannot be recovered — if you lose it, revoke it and make
            another.
          </p>
          <div className={styles.secretRow}>
            <code className={styles.secret}>{created.key}</code>
            <button type="button" className={styles.copy} onClick={() => void copy(created.key)}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" className={styles.done} onClick={acknowledge}>
            I&rsquo;ve saved it
          </button>
        </div>
      )}

      <form className={styles.create} onSubmit={submit}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="production"
            maxLength={64}
            disabled={busy || load.s === 'failed'}
          />
        </label>
        <button
          type="submit"
          className={styles.primary}
          disabled={busy || !name.trim() || load.s === 'failed'}
        >
          {busy ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {problem && (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      )}

      {load.s === 'loading' && (
        /* Reserves the height a row occupies, so the list does not jump when it
           lands. Not a spinner sitting where content will be. */
        <div className={styles.skeleton} aria-hidden="true">
          <span />
          <span />
        </div>
      )}

      {load.s === 'failed' && <Trouble why={load.why} retry={refresh} />}

      {load.s === 'ready' && live.length === 0 && (
        <div className={styles.empty}>
          <h3>No keys yet</h3>
          <p>
            A key authenticates your own server, unattended. Name it for where it
            runs, so revoking the right one later is obvious.
          </p>
        </div>
      )}

      {live.length > 0 && (
        <ul className={styles.list}>
          {live.map((k) => (
            <li key={k.id} className={styles.row}>
              <span className={styles.name}>{k.name}</span>
              <code className={styles.masked}>orbit_sk_…{k.last4}</code>
              <span className={styles.meta}>Created {fmt(k.createdAt)}</span>
              <span className={styles.meta}>
                {k.lastUsedAt ? `Last used ${fmt(k.lastUsedAt)}` : 'Never used'}
              </span>
              {confirming === k.id ? (
                <span className={styles.confirm}>
                  <button type="button" className={styles.ghost} onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                  <button type="button" className={styles.danger} onClick={() => void revoke(k.id)}>
                    Revoke for good
                  </button>
                </span>
              ) : (
                <button type="button" className={styles.ghost} onClick={() => setConfirming(k.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What went wrong, and what to do about it — never "something went wrong". */
function Trouble({ why, retry }: { why: Failure; retry: () => void }) {
  if (why.kind === 'unauthenticated') {
    return (
      <div className={styles.empty}>
        <h3>Sign in to manage keys</h3>
        <p>Keys belong to an account and bill to its credits, so this page needs a session.</p>
        <a className={styles.signin} href="/signin?returnTo=/app/keys">
          Sign in
        </a>
      </div>
    );
  }
  if (why.kind === 'upstream_down') {
    return (
      <div className={styles.empty}>
        <h3>The render service is not reachable</h3>
        <p>Your keys are unaffected — this page cannot read them right now.</p>
        <button type="button" className={styles.ghost} onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className={styles.empty}>
      <h3>Could not load your keys</h3>
      <p>{why.message}</p>
      <button type="button" className={styles.ghost} onClick={retry}>
        Try again
      </button>
    </div>
  );
}

function message(f: Failure): string {
  if (f.kind === 'unauthenticated') return 'Your session has expired. Sign in again.';
  if (f.kind === 'upstream_down') return 'The render service is not reachable. Nothing was changed.';
  return f.message;
}
