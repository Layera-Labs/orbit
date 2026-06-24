import { describe, expect, it } from 'vitest';
import { InMemoryLedgerStore } from '../store';
import { Ledger, InsufficientCreditsError } from '../ledger';
import { meter, DEFAULT_COSTS } from '../metering';
import { InMemoryLicenseRegistry, isLicenseKeyFormat, makeAccountId } from '../license';

function ledger() {
  let n = 0;
  return new Ledger(new InMemoryLedgerStore({ clock: () => '2026-06-25T00:00:00Z', idgen: () => `le_${++n}` }));
}

describe('Ledger', () => {
  it('credits, debits, and tracks running balance + history', async () => {
    const l = ledger();
    await l.credit('acct', 100);
    expect(await l.balance('acct')).toBe(100);
    await l.debit('acct', 30, 'generate_image');
    expect(await l.balance('acct')).toBe(70);
    const hist = await l.history('acct');
    expect(hist).toHaveLength(2);
    expect(hist[1].delta).toBe(-30);
    expect(hist[1].balanceAfter).toBe(70);
    expect(hist[1].at).toBe('2026-06-25T00:00:00Z');
  });

  it('rejects an overdraft and leaves the balance unchanged', async () => {
    const l = ledger();
    await l.credit('acct', 5);
    await expect(l.debit('acct', 10, 'generate_video')).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(await l.balance('acct')).toBe(5);
    expect(await l.canAfford('acct', 5)).toBe(true);
    expect(await l.canAfford('acct', 6)).toBe(false);
  });

  it('rejects non-positive amounts', async () => {
    const l = ledger();
    await expect(l.credit('a', 0)).rejects.toThrow(/positive/);
    await expect(l.debit('a', -1, 'x')).rejects.toThrow(/positive/);
  });
});

describe('meter', () => {
  it('debits the configured cost for an operation', async () => {
    const l = ledger();
    await l.credit('acct', 1000);
    await meter(l, 'acct', 'generate_video');
    expect(await l.balance('acct')).toBe(1000 - DEFAULT_COSTS.generate_video);
    const last = (await l.history('acct')).at(-1)!;
    expect(last.reason).toBe('generate_video');
    expect(last.meta?.op).toBe('generate_video');
  });

  it('throws on an unpriced operation and blocks free generation', async () => {
    const l = ledger();
    await l.credit('acct', 1000);
    await expect(meter(l, 'acct', 'mystery_op')).rejects.toThrow(/No cost/);
    // can't afford → metering refuses
    const broke = ledger();
    await broke.credit('x', 1);
    await expect(meter(broke, 'x', 'generate_image')).rejects.toBeInstanceOf(InsufficientCreditsError);
  });
});

describe('license', () => {
  it('builds account ids and validates key format', () => {
    expect(makeAccountId('orbit_sk_abc', 'user-7')).toBe('orbit_sk_abc:user-7');
    expect(isLicenseKeyFormat('orbit_sk_abcdef0123456789')).toBe(true);
    expect(isLicenseKeyFormat('nope')).toBe(false);
  });

  it('validates only registered, active keys', async () => {
    const reg = new InMemoryLicenseRegistry();
    reg.add({ key: 'orbit_sk_live', tier: 'pro', active: true });
    reg.add({ key: 'orbit_sk_dead', tier: 'pro', active: false });
    expect((await reg.validate('orbit_sk_live'))?.tier).toBe('pro');
    expect(await reg.validate('orbit_sk_dead')).toBeNull();
    expect(await reg.validate('orbit_sk_unknown')).toBeNull();
  });
});
