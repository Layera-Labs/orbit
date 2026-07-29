'use client';

/**
 * Who this browser is signed in as, when the render service meters.
 *
 * The editor never reads this — stills, motion, export and every panel but AI
 * Studio work signed out, and that stays true. This exists because generation
 * is the one surface a metered deployment refuses, and until now the web app
 * had no way to satisfy it: the panel could only report "Sign in to generate"
 * with nowhere to go.
 *
 * The token lives in localStorage. That is readable by any script on the origin,
 * which is the standard trade for a bearer token a client must attach itself;
 * the httpOnly cookie the proxy sets is a different thing (the ANONYMOUS account
 * id, which exists so a signed-out browser cannot mint itself free credits).
 */
import { create } from 'zustand';
import {
  AuthError,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword as resetPasswordReq,
  type AuthUser,
} from '@/net/authClient';
import { setAuthToken } from '@/net/genClient';
import { useJobs } from './jobsStore';

const KEY = 'orbit.auth';

interface Persisted {
  token: string;
  user: AuthUser;
}

interface AuthState {
  /** `loading` until `hydrate` has run, so nothing flashes a signed-out state. */
  status: 'loading' | 'authed' | 'anon';
  user: AuthUser | null;
  hydrate(): void;
  register(email: string, password: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  requestReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  logout(): void;
}

export const useAuth = create<AuthState>((set) => {
  /** Token into the gen client, balance into the panel — in that order, since
   *  `refreshBalance` sends the token it was just given. */
  const apply = (token: string, user: AuthUser, balance?: number) => {
    setAuthToken(token);
    set({ status: 'authed', user });
    if (typeof balance === 'number') useJobs.setState({ balance, signedOut: false });
    useJobs.getState().refreshBalance();
  };

  const persist = (token: string, user: AuthUser) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ token, user } satisfies Persisted));
    } catch {
      // Private mode, or a full quota. Staying signed in for this tab is still
      // better than refusing the sign-in outright.
    }
  };

  return {
    status: 'loading',
    user: null,

    hydrate: () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const { token, user } = JSON.parse(raw) as Persisted;
          if (token && user) {
            apply(token, user);
            return;
          }
        }
      } catch {
        // Corrupt or unreadable — fall through to signed out rather than
        // leaving the app stuck on `loading` forever.
      }
      set({ status: 'anon', user: null });
    },

    register: async (email, password) => {
      const res = await registerUser(email, password);
      persist(res.token, res.user);
      apply(res.token, res.user, res.balance);
    },

    login: async (email, password) => {
      const res = await loginUser(email, password);
      persist(res.token, res.user);
      apply(res.token, res.user, res.balance);
    },

    requestReset: (email) => requestPasswordReset(email),

    resetPassword: async (token, password) => {
      const res = await resetPasswordReq(token, password);
      persist(res.token, res.user);
      apply(res.token, res.user, res.balance);
    },

    logout: () => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* nothing to do */
      }
      setAuthToken(null);
      set({ status: 'anon', user: null });
      useJobs.setState({ balance: null });
      useJobs.getState().refreshBalance();
    },
  };
});

export { AuthError };
