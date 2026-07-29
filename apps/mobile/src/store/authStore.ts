/**
 * Auth state (zustand). Who this device is signed in AS — which is a different
 * question from whether it is authenticated.
 *
 * Signing in is optional and stays optional: the editor, export and generation
 * all work without an account, because a device that has not signed in still
 * holds a guest token (see `net/session`). What this store adds is becoming a
 * named account — one that survives reinstalling, and that can be topped up.
 *
 * Token custody lives in `net/session`, not here. There is one token at a time
 * and several callers that need it (generation, credits, upload, export); a
 * second copy in this store was a second thing to keep in sync. Signing in
 * SWAPS the subject the token names rather than turning authentication on.
 */
import { create } from 'zustand';
import { loginUser, registerUser, requestPasswordReset, resetPassword as resetPasswordReq, type AuthUser } from '../net/authClient';
import { restoreSession, setSession } from '../net/session';
import { identifyPurchaser, resetPurchaser } from '../net/purchases';
import { useEditor } from './editorStore';

type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  requestReset: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/** Apply a successful auth result to the app: token, user, credits, purchaser id. */
function applyAuth(set: (p: Partial<AuthState>) => void, token: string, user: AuthUser, balance?: number) {
  void setSession(token, user);
  set({ status: 'authed', user });
  // Purchases are tied to the end user, so the RevenueCat webhook credits the
  // same account the app meters against.
  void identifyPurchaser(user.endUserId);
  if (typeof balance === 'number') useEditor.setState({ credits: balance });
  void useEditor.getState().refreshCredits();
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  user: null,

  /* A stored GUEST is not signed in — it is how signed-out works now — so it
     resolves to `anon` and the account screens still offer a real sign-in. */
  hydrate: async () => {
    const stored = await restoreSession();
    if (stored && !stored.guest) {
      set({ status: 'authed', user: stored });
      void identifyPurchaser(stored.endUserId);
      void useEditor.getState().refreshCredits();
      return;
    }
    set({ status: 'anon', user: null });
  },

  register: async (email, password) => {
    const base = useEditor.getState().serverUrl;
    const res = await registerUser(base, email, password);
    applyAuth(set, res.token, res.user, res.balance);
  },

  login: async (email, password) => {
    const base = useEditor.getState().serverUrl;
    const res = await loginUser(base, email, password);
    applyAuth(set, res.token, res.user, res.balance);
  },

  requestReset: async (email) => {
    const base = useEditor.getState().serverUrl;
    await requestPasswordReset(base, email);
  },

  resetPassword: async (token, password) => {
    const base = useEditor.getState().serverUrl;
    const res = await resetPasswordReq(base, token, password);
    applyAuth(set, res.token, res.user, res.balance);
  },

  /* Dropping the member token leaves NO token, and the next call mints a fresh
     guest — so signing out lands on a clean anonymous account rather than on a
     client that cannot reach anything. */
  logout: async () => {
    await setSession(null, null);
    void resetPurchaser();
    set({ status: 'anon', user: null });
    useEditor.setState({ credits: null });
  },
}));
