/**
 * In-memory `UserStore` for the self-hosted auth adapter — used only when no
 * DATABASE_URL is configured (ephemeral dev/test runs). The durable store is
 * `PgUserStore` (see `pg-store.ts`); accounts live in Postgres, never on disk.
 */
import type { UserRecord, UserStore } from '@orbit/auth';

export class InMemoryUserStore implements UserStore {
  private byEmail = new Map<string, UserRecord>();
  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.byEmail.get(email) ?? null;
  }
  async create(user: UserRecord): Promise<void> {
    this.byEmail.set(user.email, user);
  }
}
