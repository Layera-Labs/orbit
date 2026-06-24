import type { AccountId, License } from './types';

/** Build the ledger account id for a given license + end user. */
export function makeAccountId(licenseKey: string, endUserId: string): AccountId {
  return `${licenseKey}:${endUserId}`;
}

const KEY_RE = /^orbit_sk_[A-Za-z0-9]{16,}$/;

/** Cheap format check (does not prove the key is registered/active). */
export function isLicenseKeyFormat(key: string): boolean {
  return KEY_RE.test(key);
}

/** Validates SDK customer keys; gates the editor like Polotno's key. */
export interface LicenseRegistry {
  validate(key: string): Promise<License | null>;
}

export class InMemoryLicenseRegistry implements LicenseRegistry {
  private byKey = new Map<string, License>();

  add(license: License): License {
    this.byKey.set(license.key, license);
    return license;
  }

  async validate(key: string): Promise<License | null> {
    const license = this.byKey.get(key);
    return license && license.active ? license : null;
  }
}
