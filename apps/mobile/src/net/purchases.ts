/**
 * Thin wrapper over RevenueCat (`react-native-purchases`) for buying credit packs.
 *
 * The SDK is loaded LAZILY and only when a key is configured (`REVENUECAT_API_KEY`),
 * so a build without the native module (or before RevenueCat is set up) is never
 * touched — every call is a no-op until the app is rebuilt with the key. Purchases
 * grant credits server-side via the RevenueCat webhook; the client just runs the
 * store flow and then refreshes the balance.
 */
import { Platform } from 'react-native';
import { REVENUECAT_API_KEY } from '../constants';

/** Minimal shape of the RevenueCat API we use (keeps us decoupled from its types). */
interface RCPackage {
  identifier: string;
  product: { identifier: string; title: string; priceString: string };
}
interface RCApi {
  configure(opts: { apiKey: string; appUserID?: string | null }): void;
  logIn(userId: string): Promise<unknown>;
  logOut(): Promise<unknown>;
  getOfferings(): Promise<{ current: { availablePackages: RCPackage[] } | null }>;
  purchasePackage(pkg: RCPackage): Promise<unknown>;
}

export interface CreditPack {
  id: string;
  productId: string;
  title: string;
  price: string;
  /** Opaque RevenueCat package, passed back to `buyPack`. */
  pkg: unknown;
}

function apiKey(): string {
  return Platform.select(REVENUECAT_API_KEY) ?? '';
}

let cached: RCApi | null | undefined; // undefined = not tried, null = unavailable
function sdk(): RCApi | null {
  if (!apiKey()) return null; // don't even load the native module until configured
  if (cached !== undefined) return cached;
  try {
    // Lazy require: only runs once a key exists (i.e. after a rebuild with the SDK).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    cached = (mod.default ?? mod) as RCApi;
  } catch {
    cached = null;
  }
  return cached;
}

/** Whether purchasing is set up (key present + SDK loadable). */
export function purchasesAvailable(): boolean {
  return !!sdk();
}

/** Configure RevenueCat once at app start (no-op until a key is set). */
export function configurePurchases(): void {
  const p = sdk();
  if (!p) return;
  try {
    p.configure({ apiKey: apiKey() });
  } catch {
    // ignore — degrades to "not available"
  }
}

/** Tie purchases to the signed-in end user (so the webhook credits the right account). */
export async function identifyPurchaser(userId: string): Promise<void> {
  const p = sdk();
  if (!p) return;
  try {
    await p.logIn(userId);
  } catch {
    // ignore
  }
}

export async function resetPurchaser(): Promise<void> {
  const p = sdk();
  if (!p) return;
  try {
    await p.logOut();
  } catch {
    // ignore
  }
}

/** The credit packs offered by RevenueCat's current offering (empty if unavailable). */
export async function getCreditPacks(): Promise<CreditPack[]> {
  const p = sdk();
  if (!p) return [];
  const offerings = await p.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return packages.map((pk) => ({
    id: pk.identifier,
    productId: pk.product.identifier,
    title: pk.product.title,
    price: pk.product.priceString,
    pkg: pk,
  }));
}

/** Run the store purchase flow for a pack. Credits are granted by the webhook. */
export async function buyPack(pack: CreditPack): Promise<void> {
  const p = sdk();
  if (!p) throw new Error('Purchasing is not available.');
  await p.purchasePackage(pack.pkg as RCPackage);
}
