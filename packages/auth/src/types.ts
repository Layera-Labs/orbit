/**
 * Auth is a verification seam, mirroring the `MediaProvider` / `LedgerStore`
 * adapter pattern. An `AuthAdapter` turns a client-supplied bearer token into an
 * `endUserId`; the render service composes the billing account as
 * `makeAccountId(licenseKey, endUserId)`. Managed adapters (Clerk/Supabase/
 * Firebase) verify the provider's token; the self-hosted adapter additionally
 * issues its own tokens (register/login).
 */

/** The verified identity behind a bearer token. */
export interface AuthUser {
  /** Stable per-user id — the `endUserId` half of the billing account. */
  endUserId: string;
  email?: string;
}

/** Verifies a bearer token to a user, or null when the token is invalid/expired. */
export interface AuthAdapter {
  /** Which provider this adapter speaks to (for diagnostics/routing). */
  readonly provider: string;
  verify(token: string): Promise<AuthUser | null>;
}

/** A stored self-hosted user (the self-hosted adapter's `UserStore` records). */
export interface UserRecord {
  id: string;
  email: string;
  /** Opaque hash string, e.g. `scrypt$<saltHex>$<hashHex>`. */
  passwordHash: string;
  createdAt: string;
  /**
   * When the password last changed. Every token issued before it is dead.
   *
   * Without this, changing a password revoked NOTHING: a stolen session token
   * stayed valid for its full 30 days, so the one action a user takes when they
   * think they have been compromised did not lock the attacker out. It also
   * made reset links reusable — the token stayed valid for its whole hour, so
   * an old email could be replayed to take the account again.
   *
   * Absent on records written before this existed, which correctly means "has
   * never changed" rather than "revoke everything".
   */
  passwordChangedAt?: string;
}

/** Persistence seam for self-hosted users (the render service backs this with Postgres). */
export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | null>;
  /** Look one up by subject, which is what a bearer token carries. */
  findById(id: string): Promise<UserRecord | null>;
  create(user: UserRecord): Promise<void>;
  /** Replace a user's password hash, and stamp `passwordChangedAt`. */
  updatePassword(id: string, passwordHash: string): Promise<void>;
}

export type AuthErrorKind = 'email-taken' | 'invalid-credentials' | 'weak-password' | 'bad-email' | 'invalid-token';

export class AuthError extends Error {
  constructor(
    public kind: AuthErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'AuthError';
  }
}
