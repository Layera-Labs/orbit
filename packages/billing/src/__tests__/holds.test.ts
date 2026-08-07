/**
 * Reserving credits before spending them.
 *
 * `debit` alone checks the ceiling as each charge lands. That is fine for one
 * charge and wrong for a generation, which is five or more provider calls over
 * several minutes — and hopeless for a batch, which starts twenty of those at
 * once. By the time the debits arrive the money is spent at the provider, and
 * refusing then refunds nothing.
 *
 * A hold is an ORDINARY LEDGER ROW with a negative delta. That is what makes it
 * cheap: `balance()` already sums the rows, so held credits stop being spendable
 * with no change to `balance`, `canAfford`, or any existing caller. Settling
 * writes the difference back; releasing writes all of it back.
 *
 * The two properties worth the most here are idempotency (a retried job must not
 * re-hold) and single-close (a hold refunded twice is money invented).
 */
import { describe, expect, it } from 'vitest';
import { InMemoryLedgerStore } from '../store';
import { InsufficientCreditsError, Ledger, UnknownHoldError } from '../ledger';

const ACC = 'lic:user';

async function ledgerWith(credits: number): Promise<Ledger> {
  const l = new Ledger(new InMemoryLedgerStore());
  if (credits > 0) await l.credit(ACC, credits, 'seed');
  return l;
}

describe('hold', () => {
  it('takes the credits out of reach immediately', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    expect(await l.balance(ACC)).toBe(40);
    // And that is the whole trick: `canAfford` needed no changes to respect it.
    expect(await l.canAfford(ACC, 60)).toBe(false);
    expect(await l.canAfford(ACC, 40)).toBe(true);
  });

  it('refuses a hold the account cannot cover', async () => {
    const l = await ledgerWith(50);
    await expect(l.hold(ACC, 'job1', 60)).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(await l.balance(ACC)).toBe(50);
  });

  /*
   * The reason the caller supplies the id. A generation job already has one, so
   * keying the hold to it makes a retry safe by construction — which is exactly
   * what a step runner needs, and what generating an id inside `hold` would
   * have made impossible.
   */
  it('is idempotent: re-holding under the same id reserves nothing further', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.hold(ACC, 'job1', 60);
    await l.hold(ACC, 'job1', 60);
    expect(await l.balance(ACC)).toBe(40);
  });

  it('keeps separate holds separate', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 30);
    await l.hold(ACC, 'job2', 30);
    expect(await l.balance(ACC)).toBe(40);
  });

  it('can be read back', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60, { kind: 'generation' });
    expect(await l.holdOf(ACC, 'job1')).toMatchObject({ id: 'job1', amount: 60 });
    expect(await l.holdOf(ACC, 'nope')).toBeUndefined();
  });
});

describe('settle', () => {
  it('returns the difference when the job cost less than reserved', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.settle(ACC, 'job1', 25);
    expect(await l.balance(ACC)).toBe(75); // 100 - 25
  });

  it('costs exactly the hold when it used all of it', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.settle(ACC, 'job1', 60);
    expect(await l.balance(ACC)).toBe(40);
  });

  /*
   * By the time settle runs the providers have been paid. Refusing the excess
   * would only mean the ledger disagreeing with reality — a balance that goes
   * negative is visible and recoverable, a silent shortfall is not.
   */
  it('charges an overspend rather than refusing it', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.settle(ACC, 'job1', 90);
    expect(await l.balance(ACC)).toBe(10);
  });

  it('lets the balance go negative rather than losing the charge', async () => {
    const l = await ledgerWith(60);
    await l.hold(ACC, 'job1', 60);
    await l.settle(ACC, 'job1', 100);
    expect(await l.balance(ACC)).toBe(-40);
  });

  it('is idempotent', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.settle(ACC, 'job1', 25);
    await l.settle(ACC, 'job1', 25);
    expect(await l.balance(ACC)).toBe(75);
  });

  it('refuses a hold that does not exist', async () => {
    const l = await ledgerWith(100);
    await expect(l.settle(ACC, 'nope', 10)).rejects.toBeInstanceOf(UnknownHoldError);
  });

  it('records what was held and what was spent', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    const entry = await l.settle(ACC, 'job1', 25, { step: 'tts' });
    expect(entry.meta).toMatchObject({ closesHold: 'job1', held: 60, actual: 25, step: 'tts' });
  });
});

describe('release', () => {
  it('gives all of it back', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.release(ACC, 'job1');
    expect(await l.balance(ACC)).toBe(100);
  });

  it('is idempotent', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.release(ACC, 'job1');
    await l.release(ACC, 'job1');
    expect(await l.balance(ACC)).toBe(100);
  });
});

describe('a hold closes exactly once, however it is closed', () => {
  /*
   * The one that matters most. Settle and release both write a `closesHold`
   * key, and the guard matches on that key across ANY reason — so the second
   * close finds the first and does nothing. Guarding per-reason instead would
   * let a release and a settle both fire and hand the credits back twice, which
   * is money invented rather than money lost.
   */
  /*
   * The settled amount is deliberately LESS than the hold, so the second close
   * would write a non-zero refund if it fired. Settling at exactly the held
   * amount makes the refund zero, which passes whether or not the guard works —
   * a test that cannot fail is worse than no test, and this one silently could
   * not until a mutation run said so.
   */
  it('a settle after a release does not hand the credits back twice', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.release(ACC, 'job1'); // back to 100
    await l.settle(ACC, 'job1', 20); // would add another +40 if it fired
    expect(await l.balance(ACC)).toBe(100);
  });

  it('a release after a settle does not hand the credits back twice', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.settle(ACC, 'job1', 20); // 100 - 20 = 80
    await l.release(ACC, 'job1'); // would add another +60 if it fired
    expect(await l.balance(ACC)).toBe(80);
  });

  /* And a second settle at a DIFFERENT amount is refused too, not re-applied. */
  it('ignores a second settle claiming a different cost', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.settle(ACC, 'job1', 50);
    await l.settle(ACC, 'job1', 10);
    expect(await l.balance(ACC)).toBe(50);
  });

  it('writes exactly one closing row', async () => {
    const l = await ledgerWith(100);
    await l.hold(ACC, 'job1', 60);
    await l.settle(ACC, 'job1', 20);
    await l.release(ACC, 'job1');
    await l.settle(ACC, 'job1', 5);
    const closes = (await l.history(ACC)).filter(
      (e) => (e.meta as Record<string, unknown> | undefined)?.closesHold === 'job1',
    );
    expect(closes).toHaveLength(1);
  });
});

describe('the whole shape of a generation', () => {
  it('reserves, spends across steps, and returns what was not used', async () => {
    const l = await ledgerWith(500);
    // Estimate high: the hold is a ceiling, not a price.
    await l.hold(ACC, 'gen_7', 200, { kind: 'generation' });
    expect(await l.balance(ACC)).toBe(300);

    // Steps run; each one's real cost is accumulated by the caller.
    const spent = 5 /* tts */ + 10 /* image */ + 60 /* video */;
    await l.settle(ACC, 'gen_7', spent);

    expect(await l.balance(ACC)).toBe(425);
    const reasons = (await l.history(ACC)).map((e) => e.reason);
    expect(reasons).toEqual(['seed', 'hold', 'settle']);
  });

  /*
   * The case the whole feature exists for. Twenty generations at a 200 ceiling
   * against 1000 credits: five can run, the sixth is refused BEFORE it spends
   * anything at a provider. With debit alone all twenty would start.
   */
  it('stops a batch before it overspends, rather than after', async () => {
    const l = await ledgerWith(1000);
    let started = 0;
    let refused = 0;
    for (let i = 0; i < 20; i += 1) {
      try {
        await l.hold(ACC, `batch_${i}`, 200);
        started += 1;
      } catch (e) {
        if (e instanceof InsufficientCreditsError) refused += 1;
        else throw e;
      }
    }
    expect(started).toBe(5);
    expect(refused).toBe(15);
    expect(await l.balance(ACC)).toBe(0);
  });
});

describe('debit no longer checks and then acts', () => {
  /*
   * `debit` read the balance and THEN recorded, with no lock between. Two
   * charges starting at the same instant on an account with exactly enough for
   * one both read the old balance, both passed, and both charged. The floor is
   * enforced by the store now, inside the same transaction as the write.
   *
   * This store is single-threaded so it cannot reproduce the race; what it can
   * prove is that the floor is enforced at all, and that it is the STORE
   * enforcing it — see `pg-store.test.ts` for the same assertion against a real
   * Postgres, where concurrency is real.
   */
  it('refuses a debit past the balance', async () => {
    const l = await ledgerWith(50);
    await expect(l.debit(ACC, 60, 'render')).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(await l.balance(ACC)).toBe(50);
  });

  it('reports what was needed and what was there', async () => {
    const l = await ledgerWith(50);
    await l.debit(ACC, 60, 'render').catch((e: InsufficientCreditsError) => {
      expect(e.required).toBe(60);
      expect(e.available).toBe(50);
    });
    expect.assertions(2);
  });
});
