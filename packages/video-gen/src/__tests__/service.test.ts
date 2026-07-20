import { describe, expect, it } from 'vitest';
import { DEFAULT_COSTS, InMemoryLedgerStore, InsufficientCreditsError, Ledger } from '@orbit/billing';
import { GenerationService } from '../service';
import { MockMediaProvider } from '../mock';

function setup() {
  const ledger = new Ledger(new InMemoryLedgerStore());
  const provider = new MockMediaProvider();
  return { ledger, provider, svc: new GenerationService(provider, ledger) };
}

describe('GenerationService', () => {
  it('debits the operation cost on a successful generation', async () => {
    const { ledger, provider, svc } = setup();
    await ledger.credit('acct', 1000);
    const res = await svc.generateImage('acct', { prompt: 'a cat' });
    expect(res.url).toContain('mock://image');
    expect(provider.calls).toHaveLength(1);
    expect(await ledger.balance('acct')).toBe(1000 - DEFAULT_COSTS.generate_image);
  });

  it('refuses and never calls the provider when credits are insufficient', async () => {
    const { ledger, provider, svc } = setup();
    await ledger.credit('acct', 1);
    await expect(svc.generateImage('acct', { prompt: 'x' })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(provider.calls).toHaveLength(0);
    expect(await ledger.balance('acct')).toBe(1);
  });

  it('charges the muted rate for a silent video and the full rate with audio', async () => {
    const a = setup();
    await a.ledger.credit('acct', 1000);
    await a.svc.generateVideo('acct', { prompt: 'a' });
    expect(await a.ledger.balance('acct')).toBe(1000 - DEFAULT_COSTS.generate_video_muted); // 60

    const b = setup();
    await b.ledger.credit('acct', 1000);
    await b.svc.generateVideo('acct', { prompt: 'a', audio: true });
    expect(await b.ledger.balance('acct')).toBe(1000 - DEFAULT_COSTS.generate_video); // 100
  });

  it('does not debit when the provider call fails', async () => {
    const ledger = new Ledger(new InMemoryLedgerStore());
    await ledger.credit('acct', 1000);
    const svc = new GenerationService(
      { generateImage: async () => { throw new Error('provider down'); } },
      ledger,
    );
    await expect(svc.generateImage('acct', { prompt: 'x' })).rejects.toThrow(/provider down/);
    expect(await ledger.balance('acct')).toBe(1000); // unchanged
  });

  it('throws when the provider does not support the operation', async () => {
    const ledger = new Ledger(new InMemoryLedgerStore());
    await ledger.credit('acct', 1000);
    const svc = new GenerationService({}, ledger);
    await expect(svc.generateVideo('acct', { prompt: 'x' })).rejects.toThrow(/does not support/);
  });
});
