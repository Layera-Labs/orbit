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
  async create(user: UserRecord) {
    this.byEmail.set(user.email, user);
  }
  async updatePassword(id: string, passwordHash: string) {
    for (const [email, rec] of this.byEmail) {
      if (rec.id === id) this.byEmail.set(email, { ...rec, passwordHash });
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
