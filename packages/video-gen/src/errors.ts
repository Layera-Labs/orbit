/**
 * Error thrown by a provider when the upstream API rejects a request. Carries the
 * upstream HTTP status so the caller can distinguish a provider billing/quota
 * problem (402) from a transient failure and respond appropriately.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    /** The upstream provider's HTTP status, when the failure came from its API. */
    public upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
