/**
 * Build the configured auth adapter from environment. Returns null when
 * `ORBIT_AUTH_PROVIDER` is unset (auth disabled — the render service then falls
 * back to its anonymous account for local/dev). The self-hosted provider needs a
 * `UserStore` supplied by the host.
 */
import { SelfHostedAuth } from './self-hosted';
import { ClerkAuth, FirebaseAuth, SupabaseAuth } from './managed';
import type { AuthAdapter, UserStore } from './types';

export interface AuthFromEnv {
  provider: string;
  adapter: AuthAdapter;
  /** Present only for the self-hosted provider — exposes register/login. */
  selfHosted?: SelfHostedAuth;
}

type Env = Record<string, string | undefined>;

export function authFromEnv(env: Env, deps: { userStore?: UserStore } = {}): AuthFromEnv | null {
  const provider = env.ORBIT_AUTH_PROVIDER?.trim().toLowerCase();
  if (!provider) return null; // auth disabled

  switch (provider) {
    case 'selfhosted': {
      if (!deps.userStore) throw new Error('authFromEnv: selfhosted provider requires a userStore');
      const adapter = new SelfHostedAuth({
        secret: required(env, 'ORBIT_JWT_SECRET'),
        store: deps.userStore,
        issuer: env.ORBIT_JWT_ISSUER,
        tokenTtl: env.ORBIT_JWT_TTL,
      });
      return { provider, adapter, selfHosted: adapter };
    }
    case 'clerk':
      return { provider, adapter: new ClerkAuth({ issuer: required(env, 'CLERK_ISSUER'), jwksUrl: env.CLERK_JWKS_URL }) };
    case 'supabase':
      return { provider, adapter: new SupabaseAuth({ jwtSecret: required(env, 'SUPABASE_JWT_SECRET') }) };
    case 'firebase':
      return { provider, adapter: new FirebaseAuth({ projectId: required(env, 'FIREBASE_PROJECT_ID') }) };
    default:
      throw new Error(`authFromEnv: unknown ORBIT_AUTH_PROVIDER "${provider}"`);
  }
}

function required(env: Env, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(`authFromEnv: missing ${key} (required for the selected auth provider)`);
  return v;
}
