// @vitest-environment node
//
// What a provider call took, and what it cost.
//
// Neither was answerable before: a provider call produced no log of its own, so
// the only timing was the whole request — which for a long-poll to Runway is
// mostly waiting — and nothing recorded how much of anything the call consumed.
// "Why is generation slow" and "what did that cost" had no data behind them.
//
// The split that matters: `packages/video-gen` reports MEASURED FACTS (which
// vendor, which model, how long, how many units of what) and carries no prices
// at all. Rates belong to the operator's contract — they differ per plan and
// change without notice — so the service multiplies by what the operator states
// and simply omits the money when they have not.
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Every JSON line written while `fn` ran. */
async function captured(fn: () => void | Promise<void>): Promise<Record<string, unknown>[]> {
  const lines: Record<string, unknown>[] = [];
  const take = (...args: unknown[]) => {
    try {
      lines.push(JSON.parse(String(args[0])) as Record<string, unknown>);
    } catch {
      /* not our line */
    }
  };
  const spies = (['log', 'warn', 'error'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(take as never),
  );
  try {
    await fn();
  } finally {
    for (const s of spies) s.mockRestore();
  }
  return lines;
}

const RUNWAY = { provider: 'runway', model: 'gen4_turbo', ms: 8_000, units: 5, unit: 'video-seconds' };

afterEach(() => {
  delete process.env.ORBIT_PROVIDER_RATES;
  vi.resetModules();
});

async function logging() {
  vi.resetModules();
  return import('../logging.js');
}

describe('a provider call is logged', () => {
  it('records the vendor, the model, the time and the units', async () => {
    const { logProviderCall } = await logging();
    const [line] = await captured(() => logProviderCall('generate_video', RUNWAY, 'abc123'));
    expect(line).toMatchObject({
      event: 'provider-call',
      op: 'generate_video',
      rid: 'abc123',
      provider: 'runway',
      model: 'gen4_turbo',
      ms: 8_000,
      units: 5,
      unit: 'video-seconds',
    });
  });

  /*
   * The rid is what connects a slow provider call to the request the user is
   * complaining about. Without it this is a pile of durations with nothing to
   * attribute them to.
   */
  it('carries the request id', async () => {
    const { logProviderCall } = await logging();
    const [line] = await captured(() => logProviderCall('tts', RUNWAY, 'r1'));
    expect(line.rid).toBe('r1');
  });
});

describe('cost is the operator\'s number, not ours', () => {
  /*
   * The important one. A price invented here would look authoritative in a log
   * and someone would build a margin calculation on it. Absent is honest;
   * confidently wrong is not.
   */
  it('reports no cost when no rates are configured', async () => {
    const { logProviderCall } = await logging();
    const [line] = await captured(() => logProviderCall('generate_video', RUNWAY));
    expect(line.costCents).toBeUndefined();
    // The measurement still lands, so an invoice can be reconciled afterwards.
    expect(line.units).toBe(5);
  });

  it('multiplies by a rate the operator states', async () => {
    process.env.ORBIT_PROVIDER_RATES = JSON.stringify({ 'runway:video-seconds': 5 });
    const { logProviderCall } = await logging();
    const [line] = await captured(() => logProviderCall('generate_video', RUNWAY));
    expect(line.costCents).toBe(25); // 5 seconds at 5c
  });

  it('matches on provider AND unit, so one vendor\'s rate is not applied to another', async () => {
    process.env.ORBIT_PROVIDER_RATES = JSON.stringify({ 'elevenlabs:characters': 0.003 });
    const { logProviderCall } = await logging();
    const [line] = await captured(() => logProviderCall('generate_video', RUNWAY));
    expect(line.costCents).toBeUndefined();
  });

  /*
   * A malformed env var must not take the logging with it. The rates are a
   * convenience; the timing is the thing that had to work.
   */
  it('survives an unparseable rate table, and says so once', async () => {
    process.env.ORBIT_PROVIDER_RATES = '{not json';
    const { logProviderCall } = await logging();
    const lines = await captured(() => logProviderCall('generate_video', RUNWAY));
    expect(lines.some((l) => l.event === 'provider-rates-invalid')).toBe(true);
    const call = lines.find((l) => l.event === 'provider-call');
    expect(call).toBeTruthy();
    expect(call!.costCents).toBeUndefined();
  });

  it('ignores a non-numeric rate rather than producing NaN', async () => {
    process.env.ORBIT_PROVIDER_RATES = JSON.stringify({ 'runway:video-seconds': 'five' });
    const { logProviderCall } = await logging();
    const [line] = await captured(() => logProviderCall('generate_video', RUNWAY));
    expect(line.costCents).toBeUndefined();
  });
});

describe('the providers report their own usage', () => {
  /*
   * Asserted against the real provider classes, with fetch faked — the point is
   * that the shape is filled in at the source, not that the service can build
   * one.
   */
  it('ElevenLabs counts characters of INPUT, which is what it bills for', async () => {
    const { ElevenLabsProvider } = await import('@layera-labs/video-gen');
    const provider = new ElevenLabsProvider({
      apiKey: 'k',
      fetchImpl: (async () =>
        new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as unknown as typeof fetch,
    });
    const out = await provider.tts({ text: 'hello there' });
    expect(out.usage).toMatchObject({
      provider: 'elevenlabs',
      units: 'hello there'.length,
      unit: 'characters',
    });
    expect(out.usage!.ms).toBeGreaterThanOrEqual(0);
  });
});
