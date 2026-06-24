import type { ProviderMap } from './types';

/**
 * Resolves providers by kind. Sections in the UI read from this and hide
 * themselves when their provider is absent (Polotno behavior).
 */
export class ProviderRegistry {
  private providers: ProviderMap;

  constructor(providers: ProviderMap = {}) {
    this.providers = { ...providers };
  }

  get<K extends keyof ProviderMap>(kind: K): ProviderMap[K] | undefined {
    return this.providers[kind];
  }

  has(kind: keyof ProviderMap): boolean {
    return this.providers[kind] != null;
  }

  set<K extends keyof ProviderMap>(kind: K, provider: ProviderMap[K]): void {
    this.providers[kind] = provider;
  }

  all(): ProviderMap {
    return { ...this.providers };
  }
}
