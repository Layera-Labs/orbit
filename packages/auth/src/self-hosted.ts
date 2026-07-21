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

  async verify(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: this.issuer });
      if (!payload.sub) return null;
      return { endUserId: payload.sub, email: (payload as { email?: string }).email };
    } catch {
      return null;
    }
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
