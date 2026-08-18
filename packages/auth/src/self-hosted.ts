/**
 * Self-hosted auth: issues and verifies its own HS256 JWTs (via `jose`) and
 * stores users in an injectable `UserStore`. Passwords are hashed with Node's
 * built-in scrypt (no native dependency), stored as `scrypt$<salt>$<hash>`.
 */
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { AuthError, type AuthAdapter, type AuthUser, type UserStore } from './types';

const SCRYPT_KEYLEN = 64;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SelfHostedAuthOptions {
  /** Signing secret for the HS256 JWTs (keep server-side). */
  secret: string;
  store: UserStore;
  /** Token issuer/audience claim (default `orbit`). */
  issuer?: string;
  /** Token lifetime (default `30d`). */
  tokenTtl?: string;
  /**
   * Guest token lifetime (default `365d`).
   *
   * Longer than a session on purpose. A guest token IS the device's only handle
   * on its own credits and renders — there is no password to sign back in with
   * — so expiring it at thirty days would silently orphan someone's account.
   */
  guestTtl?: string;
  /** Id generator for new users (default `randomUUID`). */
  idgen?: () => string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
  /** True when this call created the account (drives the signup bonus). */
  isNew: boolean;
}

/** Hash a password with a fresh random salt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** A short, non-reversible fingerprint of a stored password hash. */
const passwordVersion = (passwordHash: string): string =>
  createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);

/**
 * Was this token issued at or after the account's current password?
 *
 * `iat` is whole seconds, so the comparison is made in seconds too. The reset
 * flow updates the password and issues a session in the same breath, and with
 * millisecond precision that fresh token would be rejected as older than the
 * change it just caused. Rounding down means a token minted in the same second
 * as a password change survives — a one-second window, against the alternative
 * of signing people out of the session they are in the middle of creating.
 */
export function withinPasswordEpoch(
  iat: number | undefined,
  passwordChangedAt: string | undefined,
): boolean {
  if (!passwordChangedAt) return true; // never changed
  const changed = Date.parse(passwordChangedAt);
  if (Number.isNaN(changed)) return true; // unreadable stamp is not a reason to lock someone out
  if (iat === undefined) return false; // no issue time: cannot prove it is current
  return iat >= Math.floor(changed / 1000);
}

/** Constant-time verify of a password against a stored `scrypt$salt$hash`. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class SelfHostedAuth implements AuthAdapter {
  readonly provider = 'selfhosted';
  private key: Uint8Array;
  private store: UserStore;
  private issuer: string;
  private tokenTtl: string;
  private guestTtl: string;
  private idgen: () => string;

  constructor(opts: SelfHostedAuthOptions) {
    if (!opts.secret) throw new Error('SelfHostedAuth: missing secret');
    // Derive a fixed 32-byte HS256 key from the secret, so any-length secret is
    // accepted (jose requires >= 256-bit keys for HS256).
    this.key = new Uint8Array(createHash('sha256').update(opts.secret).digest());
    this.store = opts.store;
    this.issuer = opts.issuer ?? 'orbit';
    this.tokenTtl = opts.tokenTtl ?? '30d';
    this.guestTtl = opts.guestTtl ?? '365d';
    this.idgen = opts.idgen ?? (() => randomUUID());
  }

  async register(email: string, password: string): Promise<AuthResult> {
    const addr = normalizeEmail(email);
    if (!EMAIL_RE.test(addr)) throw new AuthError('bad-email');
    if (password.length < 8) throw new AuthError('weak-password', 'Password must be at least 8 characters.');
    if (await this.store.findByEmail(addr)) throw new AuthError('email-taken', 'That email is already registered.');
    const id = this.idgen();
    await this.store.create({ id, email: addr, passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
    return { token: await this.issue(id, addr), user: { endUserId: id, email: addr }, isNew: true };
  }

  /**
   * Mint a token for a device that has not signed in.
   *
   * There is no record behind it and deliberately so — a guest supplies no
   * email and no password, so there is nothing to store and nothing to leak.
   * The subject is the identity: it names a billing account, it is signed, and
   * the client cannot invent one. That is the whole difference from the header
   * this replaces, where "who are you" was answered by the caller.
   *
   * `guest: true` travels in the token so a route can tell a guest from a
   * member without a lookup — anything that must not be done anonymously
   * (changing a password, reading an email) can refuse on the claim alone.
   */
  async issueGuest(): Promise<AuthResult> {
    const id = `guest_${this.idgen()}`;
    const token = await new SignJWT({ guest: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(id)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setExpirationTime(this.guestTtl)
      .sign(this.key);
    return { token, user: { endUserId: id, guest: true }, isNew: true };
  }

  /**
   * Sign in (or sign up) through an external provider.
   *
   * `register` cannot be reused for this and that is the whole reason this
   * exists: it demands a password of 8+ characters, which an OAuth user does
   * not have, and it throws `email-taken` on a duplicate email — which is
   * exactly what a RETURNING GitHub user looks like.
   *
   * Three lookups, in this order, and the order is the point:
   *
   *   1. By provider id. The immutable key. A user who renamed their GitHub
   *      account or changed their primary email is still this account.
   *   2. By email, to LINK. Someone who registered with a password and later
   *      clicks "continue with GitHub" is the same person; creating a second
   *      account would split their credits and their keys in half.
   *   3. Create.
   *
   * The linking step is a deliberate trust decision, not an oversight. It is
   * safe only because the provider is asserting a VERIFIED email — GitHub is
   * asked for `/user/emails` and the caller must pass a primary, verified one.
   * Link on an unverified address and anyone who can register that email at
   * the provider takes over the local account.
   */
  async upsertOAuthUser(
    provider: string,
    providerId: string,
    email: string,
  ): Promise<AuthResult> {
    const addr = normalizeEmail(email);
    if (!EMAIL_RE.test(addr)) throw new AuthError('bad-email');

    const existing = await this.store.findByProviderId(provider, providerId);
    if (existing) {
      return {
        token: await this.issue(existing.id, existing.email),
        user: { endUserId: existing.id, email: existing.email },
        isNew: false,
      };
    }

    const byEmail = await this.store.findByEmail(addr);
    if (byEmail) {
      /*
       * Refuse to REPOINT an account that already belongs to a different
       * external identity. Reaching here means some other providerId already
       * owns this address, so linking would hand one person another person's
       * account, their credits and their API keys.
       *
       * Enforced HERE rather than in each store, which is what the first
       * version did — the Postgres implementation guarded on `provider IS
       * NULL` and both in-memory ones did not, so the same call had different
       * security depending on which store was configured. Policy belongs in
       * one place; stores just write what they are told.
       */
      if (byEmail.provider && byEmail.providerId !== providerId) {
        throw new AuthError(
          'email-taken',
          'That email is already linked to a different account.',
        );
      }
      await this.store.linkProvider(byEmail.id, provider, providerId);
      return {
        token: await this.issue(byEmail.id, byEmail.email),
        user: { endUserId: byEmail.id, email: byEmail.email },
        isNew: false,
      };
    }

    const id = this.idgen();
    await this.store.create({
      id,
      email: addr,
      // No password, and none can be guessed into existence: `verifyPassword`
      // rejects any stored value that is not a well-formed scrypt string, so
      // an empty hash cannot be matched by an empty password.
      passwordHash: '',
      createdAt: new Date().toISOString(),
      provider,
      providerId,
    });
    return {
      token: await this.issue(id, addr),
      user: { endUserId: id, email: addr },
      isNew: true,
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const addr = normalizeEmail(email);
    const rec = await this.store.findByEmail(addr);
    // Verify against a dummy hash even when the user is missing, to avoid leaking
    // account existence via response timing.
    const ok = rec ? verifyPassword(password, rec.passwordHash) : verifyPassword(password, DUMMY_HASH) && false;
    if (!rec || !ok) throw new AuthError('invalid-credentials', 'Wrong email or password.');
    return { token: await this.issue(rec.id, rec.email), user: { endUserId: rec.id, email: rec.email }, isNew: false };
  }

  /** Issue a password-reset token for an email (null if no such account). */
  async requestReset(email: string): Promise<{ user: AuthUser; token: string } | null> {
    const addr = normalizeEmail(email);
    const rec = await this.store.findByEmail(addr);
    if (!rec) return null;
    /*
     * `pv` binds the link to the password it was issued against.
     *
     * Time cannot do this job. A session token issued BY a reset must survive
     * that reset, which forces a whole-second tolerance — and inside that same
     * second the reset link would still verify, so it would not be single-use.
     * A fingerprint of the password hash has no such tension: the moment the
     * password changes the fingerprint changes, and every link issued for the
     * old one is dead. It is a hash of a hash, so it reveals nothing.
     */
    const token = await new SignJWT({ email: rec.email, type: 'reset', pv: passwordVersion(rec.passwordHash) })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(rec.id)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setExpirationTime('1h')
      .sign(this.key);
    return { user: { endUserId: rec.id, email: rec.email }, token };
  }

  /** Verify a reset token and set a new password; returns a fresh session (auto-login). */
  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    if (newPassword.length < 8) throw new AuthError('weak-password', 'Password must be at least 8 characters.');
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(token, this.key, { issuer: this.issuer }));
    } catch {
      throw new AuthError('invalid-token', 'This reset link is invalid or has expired.');
    }
    const email = (payload as { email?: string }).email;
    const rec = (payload as { type?: string }).type === 'reset' && payload.sub && email
      ? await this.store.findByEmail(normalizeEmail(email))
      : null;
    if (!rec || rec.id !== payload.sub) throw new AuthError('invalid-token', 'This reset link is invalid or has expired.');
    // Single use: the link names the password it was issued for, and that
    // password no longer exists once it has been spent.
    if ((payload as { pv?: string }).pv !== passwordVersion(rec.passwordHash))
      throw new AuthError('invalid-token', 'This reset link has already been used.');
    await this.store.updatePassword(rec.id, hashPassword(newPassword));
    return { token: await this.issue(rec.id, rec.email), user: { endUserId: rec.id, email: rec.email }, isNew: false };
  }

  async verify(token: string): Promise<AuthUser | null> {
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(token, this.key, { issuer: this.issuer }));
    } catch {
      return null;
    }
    {
      // Reset tokens are single-purpose — never accept one as a session bearer.
      if (!payload.sub || (payload as { type?: string }).type === 'reset') return null;
      /*
       * A guest has no record, so there is nothing to look up and nothing that
       * could have been revoked. The signature IS the whole check: we minted
       * this subject, and only we could have. Falling through to the store
       * would reject every guest as a "deleted account".
       */
      if ((payload as { guest?: boolean }).guest === true)
        return { endUserId: payload.sub, guest: true };
      /*
       * A signature is not enough. The token also has to be one this account
       * still honours: a password change must kill every session issued before
       * it, or "change your password" does nothing to an attacker already
       * holding a token, and a reset link stays replayable for its full hour.
       *
       * The cost is one indexed read per authenticated request. That is not a
       * new round trip in practice — every route that calls this goes on to
       * touch the ledger in the same database.
       */
      const rec = await this.store.findById(payload.sub);
      if (!rec) return null; // deleted account, live token
      if (!withinPasswordEpoch(payload.iat, rec.passwordChangedAt)) return null;
      return { endUserId: payload.sub, email: (payload as { email?: string }).email };
    }
    /*
     * Note what is NOT caught here. A signature failure means the token is bad,
     * so it returns null; a store failure means the DATABASE is unreachable,
     * and swallowing that would tell every signed-in user their session had
     * expired during an outage they had nothing to do with. It propagates, and
     * the route answers 500 — an honest "we are broken" instead of a false
     * "you are logged out".
     */
  }

  private issue(sub: string, email: string): Promise<string> {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sub)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setExpirationTime(this.tokenTtl)
      .sign(this.key);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// A fixed hash so `login` for a missing account still does the scrypt work.
const DUMMY_HASH = hashPassword('orbit-dummy-password-placeholder');
