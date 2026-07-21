/**
 * Managed-provider adapters. Each verifies the provider's own token; the client
 * app signs in with the provider's SDK and forwards the resulting JWT as the
 * bearer token. No local user store — the provider owns identity.
 *
 * - Clerk / Firebase: asymmetric (RS/ES) tokens verified against the provider's
 *   published JWKS (`createRemoteJWKSet`, cached + auto-rotated by `jose`).
 * - Supabase: legacy project tokens are HS256 signed with the project JWT secret.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthAdapter, AuthUser } from './types';

const emailOf = (p: JWTPayload): string | undefined => (p as { email?: string }).email;

export interface ClerkAuthOptions {
  /** Clerk Frontend API / issuer, e.g. `https://your-app.clerk.accounts.dev`. */
  issuer: string;
  /** JWKS endpoint (defaults to `<issuer>/.well-known/jwks.json`). */
  jwksUrl?: string;
}

export class ClerkAuth implements AuthAdapter {
  readonly provider = 'clerk';
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private issuer: string;

  constructor(opts: ClerkAuthOptions) {
    if (!opts.issuer) throw new Error('ClerkAuth: missing issuer');
    this.issuer = opts.issuer;
    this.jwks = createRemoteJWKSet(new URL(opts.jwksUrl ?? `${opts.issuer.replace(/\/$/, '')}/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
      if (!payload.sub) return null;
      return { endUserId: payload.sub, email: emailOf(payload) };
    } catch {
      return null;
    }
  }
}

export interface SupabaseAuthOptions {
  /** The project's JWT secret (Settings → API → JWT Secret). */
  jwtSecret: string;
}

export class SupabaseAuth implements AuthAdapter {
  readonly provider = 'supabase';
  private key: Uint8Array;

  constructor(opts: SupabaseAuthOptions) {
    if (!opts.jwtSecret) throw new Error('SupabaseAuth: missing jwtSecret');
    this.key = new TextEncoder().encode(opts.jwtSecret);
  }

  async verify(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key);
      if (!payload.sub) return null;
      return { endUserId: payload.sub, email: emailOf(payload) };
    } catch {
      return null;
    }
  }
}

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface FirebaseAuthOptions {
  /** Firebase project id — used as the token audience and part of the issuer. */
  projectId: string;
}

export class FirebaseAuth implements AuthAdapter {
  readonly provider = 'firebase';
  private jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  private projectId: string;

  constructor(opts: FirebaseAuthOptions) {
    if (!opts.projectId) throw new Error('FirebaseAuth: missing projectId');
    this.projectId = opts.projectId;
  }

  async verify(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `https://securetoken.google.com/${this.projectId}`,
        audience: this.projectId,
      });
      if (!payload.sub) return null;
      return { endUserId: payload.sub, email: emailOf(payload) };
    } catch {
      return null;
    }
  }
}
