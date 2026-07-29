'use client';

/**
 * Who this browser is signed in as, when the render service meters.
 *
 * Signing in is optional and stays optional: stills, motion, export and every
 * panel work without an account, because a browser that has not signed in
 * still holds a GUEST token (see `net/session`). What this store adds is the
 * ability to become a named account — one that survives clearing this browser,
 * and that can be topped up.
 *
 * Token custody lives in `net/session`, not here. There is exactly one token
 * at a time and four callers that need it (generation, credits, upload,
 * render); a second copy in this store was a second thing to keep in sync.
 * Signing in therefore SWAPS the subject the token names — guest to member —
 * rather than turning authentication on.
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
import { currentUser, setSession } from '@/net/session';
import { useJobs } from './jobsStore';

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
    setSession(token, user);
    set({ status: 'authed', user });
    if (typeof balance === 'number') useJobs.setState({ balance, signedOut: false });
    useJobs.getState().refreshBalance();
  };

  return {
    status: 'loading',
    user: null,

    /* A stored GUEST is not signed in — it is how signed-out works now — so it
       resolves to `anon` and the sign-in panel still offers an account. */
    hydrate: () => {
      const stored = currentUser();
      set(
        stored && !stored.guest
          ? { status: 'authed', user: stored }
          : { status: 'anon', user: null },
      );
    },

    register: async (email, password) => {
      const res = await registerUser(email, password);
      apply(res.token, res.user, res.balance);
    },

    login: async (email, password) => {
      const res = await loginUser(email, password);
      apply(res.token, res.user, res.balance);
    },

    requestReset: (email) => requestPasswordReset(email),

    resetPassword: async (token, password) => {
      const res = await resetPasswordReq(token, password);
      apply(res.token, res.user, res.balance);
    },

    /* Dropping the member token leaves NO token, and the next call mints a
       fresh guest — so signing out lands on a clean anonymous account rather
       than on a broken client that cannot reach anything. */
    logout: () => {
      setSession(null, null);
      set({ status: 'anon', user: null });
      useJobs.setState({ balance: null });
      useJobs.getState().refreshBalance();
    },
  };
});

export { AuthError };
