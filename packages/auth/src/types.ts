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
}

/** Persistence seam for self-hosted users (the render service backs this with SQLite). */
export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(user: UserRecord): Promise<void>;
}

export type AuthErrorKind = 'email-taken' | 'invalid-credentials' | 'weak-password' | 'bad-email';

export class AuthError extends Error {
  constructor(
    public kind: AuthErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'AuthError';
  }
}
