/**
 * Generate the bundled starter sound-effects pack (mono 16-bit PCM WAV, 44.1kHz).
 *
 * These are ORIGINAL, synthesized in-repo from scratch (sine/harmonic/noise
 * shaping) — there is no third-party audio here, so no licensing constraint.
 * Released as public-domain (CC0). Run: `node scripts/generate-sfx.mjs`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'content', 'sfx');
const SR = 44100;
const TAU = Math.PI * 2;

const sine = (f, t) => Math.sin(TAU * f * t);
const square = (f, t) => sine(f, t) + sine(3 * f, t) / 3 + sine(5 * f, t) / 5 + sine(7 * f, t) / 7;
const expDecay = (t, k) => Math.exp(-k * t);
const hann = (t, dur) => 0.5 - 0.5 * Math.cos((TAU * t) / dur);

/** Build a float sample array for `dur` seconds using sample fn (t)→[-1,1]. */
function build(dur, fn) {
  const n = Math.round(dur * SR);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = fn(i / SR, i, n);
  // 3ms attack + 4ms release to kill edge clicks.
  const atk = Math.round(0.003 * SR);
  const rel = Math.round(0.004 * SR);
  for (let i = 0; i < atk && i < n; i++) buf[i] *= i / atk;
  for (let i = 0; i < rel && i < n; i++) buf[n - 1 - i] *= i / rel;
  // Peak-normalise to 0.9.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0) { const g = 0.9 / peak; for (let i = 0; i < n; i++) buf[i] *= g; }
  return buf;
}

/** One-pole low-pass with a per-sample cutoff (0..1 of Nyquist). */
function lowpass(buf, cutoffAt) {
  const out = new Float32Array(buf.length);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.min(1, Math.max(0.001, cutoffAt(i / buf.length)));
    y += a * (buf[i] - y);
    out[i] = y;
  }
  return out;
}

const noise = () => Math.random() * 2 - 1;

// ---- the pack -------------------------------------------------------------
const SOUNDS = {
  pop: () => build(0.14, (t) => sine(520, t) * expDecay(t, 26)),
  click: () => build(0.05, (t) => sine(1400, t) * expDecay(t, 80)),
  tick: () => build(0.03, (t) => (sine(2200, t) * 0.6 + noise() * 0.4) * expDecay(t, 120)),
  ding: () => build(0.6, (t) => (sine(987, t) + 0.5 * sine(1974, t) + 0.25 * sine(2765, t)) * expDecay(t, 6)),
  beep: () => build(0.16, (t) => square(720, t) * expDecay(t, 5) * 0.6),
  chime: () => build(0.55, (t) => {
    const notes = [523.25, 659.25, 783.99];
    let s = 0;
    notes.forEach((f, k) => { const lt = t - k * 0.11; if (lt >= 0) s += sine(f, lt) * expDecay(lt, 7); });
    return s * 0.5;
  }),
  success: () => build(0.6, (t) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    let s = 0;
    notes.forEach((f, k) => { const lt = t - k * 0.1; if (lt >= 0) s += sine(f, lt) * expDecay(lt, 9); });
    return s * 0.5;
  }),
  impact: () => build(0.4, (t) => (sine(80, t) * 0.9 + noise() * expDecay(t, 60) * 0.5) * expDecay(t, 11)),
  whoosh: () => {
    const raw = build(0.5, (_t, i, n) => noise() * hann(i / SR, n / SR));
    // cutoff rises then falls → the classic "whoosh" sweep.
    return lowpass(raw, (p) => 0.02 + 0.5 * Math.sin(Math.PI * p));
  },
  swoosh: () => {
    const raw = build(0.22, (_t, i, n) => noise() * hann(i / SR, n / SR));
    return lowpass(raw, (p) => 0.05 + 0.6 * p);
  },
  riser: () => build(0.7, (t, _i, n) => {
    const dur = n / SR;
    const f = 200 + (1400 - 200) * (t / dur); // linear sweep up
    return sine(f, t) * (t / dur); // amplitude rises
  }),
};

/** Encode a Float32 [-1,1] buffer as a mono 16-bit PCM WAV. */
function wav(buf) {
  const n = buf.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]));
    b.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return b;
}

mkdirSync(OUT, { recursive: true });
for (const [id, gen] of Object.entries(SOUNDS)) {
  const data = wav(gen());
  writeFileSync(join(OUT, `${id}.wav`), data);
  console.log(`${id}.wav  ${(data.length / 1024).toFixed(1)} KB`);
}
console.log(`\n${Object.keys(SOUNDS).length} sounds → ${OUT}`);
