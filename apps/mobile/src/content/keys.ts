/**
 * BYOK stock-provider API keys. Orbit is a developer/SDK product: each user
 * brings their OWN Unsplash / Pexels key. Keys live in the OS keychain
 * (expo-secure-store), never in the app bundle and never sent to our server —
 * stock requests go directly from the device to the provider with the user's key.
 */
import * as SecureStore from 'expo-secure-store';

export type StockProvider = 'unsplash' | 'pexels';
const KEY_ID: Record<StockProvider, string> = { unsplash: 'orbit.stock.unsplash', pexels: 'orbit.stock.pexels' };

export async function getStockKey(provider: StockProvider): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_ID[provider]);
  } catch {
    return null;
  }
}

export async function setStockKey(provider: StockProvider, value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed) await SecureStore.setItemAsync(KEY_ID[provider], trimmed);
  else await SecureStore.deleteItemAsync(KEY_ID[provider]);
}

/** True if the given provider (or any, when unspecified) has a stored key. */
export async function hasStockKey(provider?: StockProvider): Promise<boolean> {
  if (provider) return !!(await getStockKey(provider));
  const [u, p] = await Promise.all([getStockKey('unsplash'), getStockKey('pexels')]);
  return !!u || !!p;
}
