// @vitest-environment node
//
// `upsertOAuthUser` decides whether a returning person is the SAME account.
// Getting it wrong does not throw — it silently splits someone's credits and
// API keys across two accounts, or worse, hands one person another's. So the
// identity rules are pinned here.
import { describe, expect, it } from 'vitest';
import { SelfHostedAuth, hashPassword, verifyPassword } from '../self-hosted';
import { type UserRecord, type UserStore } from '../types';

class MemUserStore implements UserStore {
  byEmail = new Map<string, UserRecord>();
  async findByEmail(email: string) {
    return this.byEmail.get(email) ?? null;
  }
  async findById(id: string) {
    for (const r of this.byEmail.values()) if (r.id === id) return r;
    return null;
  }
  async findByProviderId(provider: string, providerId: string) {
    for (const r of this.byEmail.values()) {
      if (r.provider === provider && r.providerId === providerId) return r;
    }
    return null;
  }
  async create(user: UserRecord) {
    this.byEmail.set(user.email, user);
  }
  async linkProvider(id: string, provider: string, providerId: string) {
    for (const [email, r] of this.byEmail) {
      if (r.id === id) this.byEmail.set(email, { ...r, provider, providerId });
    }
  }
  async updatePassword(id: string, passwordHash: string) {
    for (const [email, r] of this.byEmail) {
      if (r.id === id) this.byEmail.set(email, { ...r, passwordHash });
    }
  }
}

const make = () => {
  const store = new MemUserStore();
  return { store, auth: new SelfHostedAuth({ secret: 'test-secret-please-change', store }) };
};

describe('upsertOAuthUser', () => {
  it('creates an account on first sign-in', async () => {
    const { auth } = make();
    const r = await auth.upsertOAuthUser('github', '4212', 'me@example.com');
    expect(r.isNew).toBe(true);
    expect(r.user.email).toBe('me@example.com');
    expect(r.token).toBeTruthy();
  });

  it('returns the SAME account on the second sign-in', async () => {
    const { auth, store } = make();
    const first = await auth.upsertOAuthUser('github', '4212', 'me@example.com');
    const second = await auth.upsertOAuthUser('github', '4212', 'me@example.com');
    expect(second.isNew).toBe(false);
    expect(second.user.endUserId).toBe(first.user.endUserId);
    expect(store.byEmail.size).toBe(1);
  });

  it('follows the provider id when the email changes', async () => {
    // A person changing their primary GitHub address must not become a
    // stranger with none of their credits.
    const { auth } = make();
    const first = await auth.upsertOAuthUser('github', '4212', 'old@example.com');
    const later = await auth.upsertOAuthUser('github', '4212', 'new@example.com');
    expect(later.isNew).toBe(false);
    expect(later.user.endUserId).toBe(first.user.endUserId);
  });

  it('links to an existing password account with the same email', async () => {
    // Otherwise "continue with GitHub" splits an existing customer in two.
    const { auth, store } = make();
    const registered = await auth.register('me@example.com', 'a-long-password');
    const viaGitHub = await auth.upsertOAuthUser('github', '4212', 'me@example.com');
    expect(viaGitHub.isNew).toBe(false);
    expect(viaGitHub.user.endUserId).toBe(registered.user.endUserId);
    expect(store.byEmail.size).toBe(1);
  });

  it('does not repoint an account already linked to another identity', async () => {
    const { auth, store } = make();
    await auth.upsertOAuthUser('github', '1111', 'me@example.com');
    // A second GitHub identity claiming the same verified address must not
    // take the account over. It is refused outright rather than quietly
    // creating a duplicate, because `email` is UNIQUE and a duplicate is not
    // possible — the only two outcomes are "take it over" and "refuse".
    await expect(
      auth.upsertOAuthUser('github', '2222', 'me@example.com'),
    ).rejects.toThrow(/already linked/);
    const rec = store.byEmail.get('me@example.com')!;
    expect(rec.providerId).toBe('1111');
  });

  it('keeps two different people apart', async () => {
    const { auth, store } = make();
    await auth.upsertOAuthUser('github', '1', 'a@example.com');
    await auth.upsertOAuthUser('github', '2', 'b@example.com');
    expect(store.byEmail.size).toBe(2);
  });

  it('rejects a malformed email', async () => {
    const { auth } = make();
    await expect(auth.upsertOAuthUser('github', '4212', 'not-an-email')).rejects.toThrow();
  });

  it('normalizes the address, so case cannot fork an account', async () => {
    const { auth, store } = make();
    await auth.upsertOAuthUser('github', '4212', 'Me@Example.com');
    await auth.upsertOAuthUser('github', '4212', 'me@example.com');
    expect(store.byEmail.size).toBe(1);
  });

  it('stores no password, and none can be guessed into existence', async () => {
    const { auth, store } = make();
    await auth.upsertOAuthUser('github', '4212', 'me@example.com');
    const rec = store.byEmail.get('me@example.com')!;
    expect(rec.passwordHash).toBe('');
    // The property that matters: an empty stored hash must not verify against
    // an empty password, or every OAuth account is signable-into by anyone.
    expect(verifyPassword('', rec.passwordHash)).toBe(false);
    expect(verifyPassword('anything', rec.passwordHash)).toBe(false);
    await expect(auth.login('me@example.com', '')).rejects.toThrow();
  });

  it('leaves a linked account able to use its original password', async () => {
    const { auth } = make();
    await auth.register('me@example.com', 'a-long-password');
    await auth.upsertOAuthUser('github', '4212', 'me@example.com');
    const back = await auth.login('me@example.com', 'a-long-password');
    expect(back.user.email).toBe('me@example.com');
  });

  it('does not confuse the same id from two providers', async () => {
    const { auth, store } = make();
    await auth.upsertOAuthUser('github', '4212', 'gh@example.com');
    await auth.upsertOAuthUser('gitlab', '4212', 'gl@example.com');
    expect(store.byEmail.size).toBe(2);
  });
});

describe('password hashing, for OAuth accounts', () => {
  it('still rejects a malformed stored hash', () => {
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'not$a$hash')).toBe(false);
    expect(verifyPassword('x', hashPassword('x'))).toBe(true);
  });
});
