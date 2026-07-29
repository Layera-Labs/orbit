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
  private idgen: () => string;

  constructor(opts: SelfHostedAuthOptions) {
    if (!opts.secret) throw new Error('SelfHostedAuth: missing secret');
    // Derive a fixed 32-byte HS256 key from the secret, so any-length secret is
    // accepted (jose requires >= 256-bit keys for HS256).
    this.key = new Uint8Array(createHash('sha256').update(opts.secret).digest());
    this.store = opts.store;
    this.issuer = opts.issuer ?? 'orbit';
    this.tokenTtl = opts.tokenTtl ?? '30d';
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
