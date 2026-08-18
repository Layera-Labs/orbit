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
  /**
   * A device that has never signed in.
   *
   * Orbit is guest-first, but "guest" must not mean "unauthenticated": an
   * anonymous account used to be whatever string the client put in a header,
   * which anyone could set to anyone else's and spend their credits. A guest
   * gets a real signed token with a real subject instead, so every request is
   * verified and the identity is one the server issued.
   */
  guest?: boolean;
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
  /**
   * Opaque hash string, e.g. `scrypt$<saltHex>$<hashHex>`.
   *
   * EMPTY for an account created through an OAuth provider, which has no
   * password by construction. `verifyPassword` must therefore refuse an empty
   * hash outright rather than comparing against it — otherwise signing in with
   * an empty password would work on every OAuth account.
   */
  passwordHash: string;
  /** The external provider this account signs in with, if any ('github'). */
  provider?: string;
  /** That provider's own immutable id for the user. */
  providerId?: string;
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
  /**
   * Look one up by an external identity, e.g. ('github', '4212').
   *
   * Keyed on the provider's numeric id rather than the login or the email,
   * because both of those are things a person can change. A GitHub user who
   * renames their account, or swaps their primary email, must come back as the
   * SAME account and not as a stranger with none of their credits.
   */
  findByProviderId(provider: string, providerId: string): Promise<UserRecord | null>;
  /**
   * Attach an external identity to an EXISTING account.
   *
   * Separate from `create` because linking is the case where someone who
   * registered with a password later signs in through a provider. Merging that
   * into create would either fail on the duplicate email or silently make a
   * second account holding none of their credits.
   */
  linkProvider(id: string, provider: string, providerId: string): Promise<void>;
  /** Look one up by subject, which is what a bearer token carries. */
  findById(id: string): Promise<UserRecord | null>;
  create(user: UserRecord): Promise<void>;
  /** Replace a user's password hash, and stamp `passwordChangedAt`. */
  updatePassword(id: string, passwordHash: string): Promise<void>;
}

export type AuthErrorKind =
  | 'email-taken'
  | 'invalid-credentials'
  | 'weak-password'
  | 'bad-email'
  | 'invalid-token'
  /** The account exists but signs in through a provider, so has no password. */
  | 'oauth-account';

export class AuthError extends Error {
  constructor(
    public kind: AuthErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'AuthError';
  }
}
