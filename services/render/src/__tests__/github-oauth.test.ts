// @vitest-environment node
//
// The two things that make this flow safe are the signed state and the refusal
// to trust an unverified email. Both are tested here against a fake GitHub, so
// no network and no OAuth app are needed.
import { describe, expect, it, vi } from 'vitest';
import {
  authorizeUrl,
  exchange,
  githubFromEnv,
  signState,
  verifyState,
  type GitHubConfig,
} from '../github-oauth';

const SECRET = new TextEncoder().encode('test-secret');
const CFG: GitHubConfig = {
  clientId: 'cid',
  clientSecret: 'csecret',
  callbackUrl: 'https://api.example/v1/auth/github/callback',
  appUrl: 'https://portal.example',
};

describe('state', () => {
  it('round-trips the return address', () => {
    expect(verifyState(SECRET, signState(SECRET, '/app/keys'))?.returnTo).toBe('/app/keys');
  });

  it('rejects a forged state', () => {
    const good = signState(SECRET, '/app');
    const [body] = good.split('.');
    expect(verifyState(SECRET, `${body}.deadbeef`)).toBeNull();
  });

  it('rejects a state signed with a different secret', () => {
    const other = new TextEncoder().encode('not-the-secret');
    expect(verifyState(SECRET, signState(other, '/app'))).toBeNull();
  });

  it('rejects a tampered payload', () => {
    // Re-encode a payload pointing somewhere else, keeping the original mac.
    const [, mac] = signState(SECRET, '/app').split('.');
    const evil = Buffer.from(JSON.stringify({ returnTo: '//evil.example', exp: Date.now() + 1000 })).toString('base64url');
    expect(verifyState(SECRET, `${evil}.${mac}`)).toBeNull();
  });

  it('expires', () => {
    const s = signState(SECRET, '/app', 1_000);
    expect(verifyState(SECRET, s, 1_000 + 9 * 60_000)).not.toBeNull();
    expect(verifyState(SECRET, s, 1_000 + 11 * 60_000)).toBeNull();
  });

  it('rejects nothing at all', () => {
    expect(verifyState(SECRET, undefined)).toBeNull();
    expect(verifyState(SECRET, '')).toBeNull();
    expect(verifyState(SECRET, 'no-dot')).toBeNull();
  });
});

describe('authorizeUrl', () => {
  it('asks for the scope that exposes verified emails', () => {
    const u = new URL(authorizeUrl(CFG, 'st'));
    expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(u.searchParams.get('scope')).toBe('read:user user:email');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('redirect_uri')).toBe(CFG.callbackUrl);
  });
});

/** A fake GitHub that answers the three calls `exchange` makes. */
function fakeGitHub(opts: {
  token?: unknown;
  user?: unknown;
  emails?: unknown;
  emailsOk?: boolean;
}) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('login/oauth/access_token')) {
      return new Response(JSON.stringify(opts.token ?? { access_token: 'tok' }), { status: 200 });
    }
    if (u.endsWith('/user')) {
      return new Response(JSON.stringify(opts.user ?? { id: 4212, login: 'octocat' }), { status: 200 });
    }
    if (u.endsWith('/user/emails')) {
      return new Response(JSON.stringify(opts.emails ?? []), {
        status: opts.emailsOk === false ? 403 : 200,
      });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('exchange', () => {
  it('prefers the primary verified address', async () => {
    const id = await exchange(CFG, 'code', fakeGitHub({
      emails: [
        { email: 'old@example.com', primary: false, verified: true },
        { email: 'me@example.com', primary: true, verified: true },
      ],
    }));
    expect(id).toEqual({ id: '4212', login: 'octocat', email: 'me@example.com' });
  });

  it('NEVER takes an unverified address', async () => {
    // The whole reason emails are fetched separately. Linking on an unverified
    // address would let anyone who can set it at GitHub take over the local
    // account that already owns it.
    const id = await exchange(CFG, 'code', fakeGitHub({
      emails: [{ email: 'victim@example.com', primary: true, verified: false }],
    }));
    expect(id.email).toBe('octocat@users.noreply.github.com');
  });

  it('falls back to the noreply address when the scope is refused', async () => {
    const id = await exchange(CFG, 'code', fakeGitHub({ emailsOk: false }));
    expect(id.email).toBe('octocat@users.noreply.github.com');
  });

  it('fails loudly when GitHub returns no token', async () => {
    await expect(
      exchange(CFG, 'code', fakeGitHub({ token: { error: 'bad_verification_code' } })),
    ).rejects.toThrow(/no access token/);
  });

  it('fails when the profile has no id', async () => {
    await expect(
      exchange(CFG, 'code', fakeGitHub({ user: { login: 'octocat' } })),
    ).rejects.toThrow(/missing an id/);
  });
});

describe('githubFromEnv', () => {
  const full = {
    GITHUB_CLIENT_ID: 'a',
    GITHUB_CLIENT_SECRET: 'b',
    ORBIT_PUBLIC_URL: 'https://api.example/',
    ORBIT_APP_URL: 'https://portal.example/',
  };

  it('builds the callback from the STATED public url', () => {
    const cfg = githubFromEnv(full as NodeJS.ProcessEnv);
    expect(cfg?.callbackUrl).toBe('https://api.example/v1/auth/github/callback');
    expect(cfg?.appUrl).toBe('https://portal.example');
  });

  it('is null when any part is missing', () => {
    for (const k of Object.keys(full)) {
      const partial = { ...full, [k]: '' };
      expect(githubFromEnv(partial as NodeJS.ProcessEnv), `missing ${k}`).toBeNull();
    }
  });

  it('treats an empty string as unset', () => {
    // Compose passes "" for an unset variable, and `??` does not fire on it —
    // the mistake that left the email sender null on a correctly configured box.
    expect(githubFromEnv({ ...full, GITHUB_CLIENT_ID: '   ' } as NodeJS.ProcessEnv)).toBeNull();
  });
});
