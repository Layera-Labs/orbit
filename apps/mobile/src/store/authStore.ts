/**
 * Auth state (zustand). Holds the signed-in end user + token, persisted in the
 * device keychain (SecureStore). AI generation and credits require an account
 * (see `AUTH_ENABLED`); the editor itself stays open to everyone.
 *
 * On any successful auth the token is pushed into `genClient` (so generation
 * calls carry it) and the credit balance is seeded into the editor store.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { loginUser, registerUser, requestPasswordReset, resetPassword as resetPasswordReq, type AuthUser } from '../net/authClient';
import { setAuthToken } from '../net/genClient';
import { identifyPurchaser, resetPurchaser } from '../net/purchases';
import { useEditor } from './editorStore';

const AUTH_KEY = 'orbit.auth';

type AuthStatus = 'loading' | 'authed' | 'anon';

interface Persisted {
  token: string;
  user: AuthUser;
}

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
  setAuthToken(token);
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

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(AUTH_KEY);
      if (raw) {
        const { token, user } = JSON.parse(raw) as Persisted;
        if (token && user) {
          applyAuth(set, token, user);
          return;
        }
      }
    } catch {
      // fall through to anon
    }
    set({ status: 'anon', user: null });
  },

  register: async (email, password) => {
    const base = useEditor.getState().serverUrl;
    const res = await registerUser(base, email, password);
    await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ token: res.token, user: res.user }));
    applyAuth(set, res.token, res.user, res.balance);
  },

  login: async (email, password) => {
    const base = useEditor.getState().serverUrl;
    const res = await loginUser(base, email, password);
    await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ token: res.token, user: res.user }));
    applyAuth(set, res.token, res.user, res.balance);
  },

  requestReset: async (email) => {
    const base = useEditor.getState().serverUrl;
    await requestPasswordReset(base, email);
  },

  resetPassword: async (token, password) => {
    const base = useEditor.getState().serverUrl;
    const res = await resetPasswordReq(base, token, password);
    await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ token: res.token, user: res.user }));
    applyAuth(set, res.token, res.user, res.balance);
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(AUTH_KEY).catch(() => {});
    setAuthToken(null);
    void resetPurchaser();
    set({ status: 'anon', user: null });
    useEditor.setState({ credits: null });
  },
}));
