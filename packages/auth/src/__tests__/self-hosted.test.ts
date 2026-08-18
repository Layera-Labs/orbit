// @vitest-environment node
// Server-side auth (jose + node:crypto). The repo default is jsdom, whose
// separate Uint8Array realm breaks jose's `instanceof` checks — force Node here.
import { describe, expect, it } from 'vitest';
import { SelfHostedAuth, hashPassword, verifyPassword } from '../self-hosted';
import { AuthError, type UserRecord, type UserStore } from '../types';

/** Trivial in-memory user store for tests. */
class MemUserStore implements UserStore {
  private byEmail = new Map<string, UserRecord>();
  async findByEmail(email: string) {
    return this.byEmail.get(email) ?? null;
  }
  async findById(id: string) {
    for (const rec of this.byEmail.values()) if (rec.id === id) return rec;
    return null;
  }
  async findByProviderId(provider: string, providerId: string) {
    for (const rec of this.byEmail.values()) {
      if (rec.provider === provider && rec.providerId === providerId) return rec;
    }
    return null;
  }
  async create(user: UserRecord) {
    this.byEmail.set(user.email, user);
  }
  async linkProvider(id: string, provider: string, providerId: string) {
    for (const [email, rec] of this.byEmail) {
      if (rec.id === id) this.byEmail.set(email, { ...rec, provider, providerId });
    }
  }
  async updatePassword(id: string, passwordHash: string) {
    for (const [email, rec] of this.byEmail) {
      if (rec.id === id)
        this.byEmail.set(email, {
          ...rec,
          passwordHash,
          passwordChangedAt: new Date().toISOString(),
        });
    }
  }
}

const make = () => new SelfHostedAuth({ secret: 'test-secret-please-change', store: new MemUserStore() });

describe('password hashing', () => {
  it('round-trips and rejects wrong passwords', () => {
    const h = hashPassword('correct horse battery');
    expect(verifyPassword('correct horse battery', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
  });
  it('produces a distinct salt each time', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });
  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});

describe('SelfHostedAuth', () => {
  it('registers, issues a verifiable token, and marks the account new', async () => {
    const auth = make();
    const res = await auth.register('User@Example.com', 'hunter2secret');
    expect(res.isNew).toBe(true);
    expect(res.user.email).toBe('user@example.com'); // normalized
    const verified = await auth.verify(res.token);
    expect(verified?.endUserId).toBe(res.user.endUserId);
    expect(verified?.email).toBe('user@example.com');
  });

  it('logs in an existing user (isNew=false) and rejects the wrong password', async () => {
    const auth = make();
    await auth.register('a@b.com', 'password123');
    const login = await auth.login('A@B.com', 'password123');
    expect(login.isNew).toBe(false);
    await expect(auth.login('a@b.com', 'nope')).rejects.toMatchObject({ kind: 'invalid-credentials' });
  });

  it('rejects duplicate email, weak password, and bad email', async () => {
    const auth = make();
    await auth.register('dupe@x.com', 'password123');
    await expect(auth.register('dupe@x.com', 'password123')).rejects.toMatchObject({ kind: 'email-taken' });
    await expect(auth.register('new@x.com', 'short')).rejects.toMatchObject({ kind: 'weak-password' });
    await expect(auth.register('not-an-email', 'password123')).rejects.toBeInstanceOf(AuthError);
  });

  it('returns null for a garbage or foreign token', async () => {
    const auth = make();
    expect(await auth.verify('garbage.token.here')).toBeNull();
    const other = new SelfHostedAuth({ secret: 'a-different-secret-entirely', store: new MemUserStore() });
    const res = await other.register('x@y.com', 'password123');
    expect(await auth.verify(res.token)).toBeNull(); // signed by a different key
  });

  it('resets a password via a reset token and logs the user in with the new one', async () => {
    const auth = make();
    await auth.register('reset@x.com', 'oldpassword1');
    const req = await auth.requestReset('Reset@X.com'); // case-insensitive
    expect(req?.token).toBeTruthy();
    const reset = await auth.resetPassword(req!.token, 'newpassword2');
    expect(reset.isNew).toBe(false);
    expect(reset.user.email).toBe('reset@x.com');
    // The session token from a reset is a normal, verifiable session token.
    expect((await auth.verify(reset.token))?.email).toBe('reset@x.com');
    // Old password no longer works; new one does.
    await expect(auth.login('reset@x.com', 'oldpassword1')).rejects.toMatchObject({ kind: 'invalid-credentials' });
    expect((await auth.login('reset@x.com', 'newpassword2')).isNew).toBe(false);
  });

  it('returns null requesting a reset for an unknown email', async () => {
    const auth = make();
    expect(await auth.requestReset('nobody@x.com')).toBeNull();
  });

  it('rejects a reset token as a session bearer, and rejects a session token for reset', async () => {
    const auth = make();
    await auth.register('dual@x.com', 'password123');
    const req = await auth.requestReset('dual@x.com');
    // A reset token must never authenticate a normal request.
    expect(await auth.verify(req!.token)).toBeNull();
    // A normal session token must never be accepted as a reset token.
    const session = await auth.login('dual@x.com', 'password123');
    await expect(auth.resetPassword(session.token, 'password456')).rejects.toMatchObject({ kind: 'invalid-token' });
  });

  it('rejects a weak new password and a garbage reset token', async () => {
    const auth = make();
    await auth.register('weak@x.com', 'password123');
    const req = await auth.requestReset('weak@x.com');
    await expect(auth.resetPassword(req!.token, 'short')).rejects.toMatchObject({ kind: 'weak-password' });
    await expect(auth.resetPassword('garbage.token', 'password456')).rejects.toMatchObject({ kind: 'invalid-token' });
  });
});

/*
 * Guest tokens.
 *
 * "Signed out" used to mean "unauthenticated", and the account was whatever
 * string the client put in a header — so anyone could name anyone else's
 * account and spend their credits. A guest now holds a token this server
 * signed, with a subject only this server could have issued.
 */
describe('guest tokens', () => {
  it('verifies, and says it is a guest', async () => {
    const auth = make();
    const { token, user } = await auth.issueGuest();
    expect(user.guest).toBe(true);
    expect(user.endUserId).toMatch(/^guest_/);
    const verified = await auth.verify(token);
    expect(verified?.endUserId).toBe(user.endUserId);
    expect(verified?.guest).toBe(true);
    expect(verified?.email).toBeUndefined();
  });

  it('gives every guest a distinct subject', async () => {
    const auth = make();
    const a = await auth.issueGuest();
    const b = await auth.issueGuest();
    expect(a.user.endUserId).not.toBe(b.user.endUserId);
  });

  /* The store is never consulted for a guest — there is no record to find, and
     falling through to the lookup would reject every guest as "deleted". */
  it('verifies without touching the user store', async () => {
    const store = new MemUserStore();
    const auth = new SelfHostedAuth({ secret: 'test-secret-please-change', store });
    store.findById = async () => {
      throw new Error('the store must not be consulted for a guest');
    };
    const { token } = await auth.issueGuest();
    expect((await auth.verify(token))?.guest).toBe(true);
  });

  it('is not signed by anyone else', async () => {
    const mine = make();
    const theirs = new SelfHostedAuth({
      secret: 'a-different-secret-entirely',
      store: new MemUserStore(),
    });
    const { token } = await theirs.issueGuest();
    expect(await mine.verify(token)).toBeNull();
  });

  /* A guest has no email and no password, so it must not be usable to take
     over an account through the reset flow. */
  it('cannot be spent as a reset token', async () => {
    const auth = make();
    await auth.register('victim@x.com', 'oldpassword1');
    const { token } = await auth.issueGuest();
    await expect(auth.resetPassword(token, 'newpassword1')).rejects.toMatchObject({
      kind: 'invalid-token',
    });
  });
});

/*
 * Revocation.
 *
 * Changing a password used to revoke NOTHING — a stolen 30-day session stayed
 * valid, so the one thing a user does when they think they have been
 * compromised did not lock the attacker out. And a reset link stayed usable for
 * its full hour, so an old email could be replayed to take the account again.
 */
describe('a password change revokes what came before it', () => {
  const wait = () => new Promise((r) => setTimeout(r, 1100)); // iat is whole seconds

  it('kills a session token issued before the change', async () => {
    const auth = make();
    const { token } = await auth.register('revoke@x.com', 'oldpassword1');
    expect(await auth.verify(token)).not.toBeNull();

    await wait();
    const reset = await auth.requestReset('revoke@x.com');
    await auth.resetPassword(reset!.token, 'newpassword1');

    expect(await auth.verify(token)).toBeNull();
  });

  it('still honours the session the reset itself just issued', async () => {
    // The reset updates the password and issues a session in the same breath;
    // a naive comparison signs the user out of the session they just created.
    const auth = make();
    await auth.register('fresh@x.com', 'oldpassword1');
    const reset = await auth.requestReset('fresh@x.com');
    const after = await auth.resetPassword(reset!.token, 'newpassword1');
    expect((await auth.verify(after.token))?.email).toBe('fresh@x.com');
  });

  it('refuses to spend the same reset link twice', async () => {
    const auth = make();
    await auth.register('replay@x.com', 'oldpassword1');
    const reset = await auth.requestReset('replay@x.com');
    await auth.resetPassword(reset!.token, 'newpassword1');
    await expect(auth.resetPassword(reset!.token, 'thirdpassword1')).rejects.toThrow(
      /already been used/,
    );
  });

  it('refuses a token whose account is gone', async () => {
    const store = new MemUserStore();
    const auth = new SelfHostedAuth({ secret: 'test-secret-please-change', store });
    const { token } = await auth.register('ghost@x.com', 'oldpassword1');
    // Simulate a deleted account: the signature is still perfectly valid.
    (store as unknown as { byEmail: Map<string, unknown> }).byEmail.clear();
    expect(await auth.verify(token)).toBeNull();
  });

  /*
   * A database blip must not read as "your session expired". Signing every
   * user out during an outage they had nothing to do with is its own incident.
   */
  it('propagates a store failure rather than reporting a bad token', async () => {
    const store = new MemUserStore();
    const auth = new SelfHostedAuth({ secret: 'test-secret-please-change', store });
    const { token } = await auth.register('outage@x.com', 'oldpassword1');
    store.findById = async () => {
      throw new Error('connection terminated');
    };
    await expect(auth.verify(token)).rejects.toThrow(/connection terminated/);
  });
});
