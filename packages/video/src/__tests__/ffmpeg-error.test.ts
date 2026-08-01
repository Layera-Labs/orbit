import { describe, expect, it } from 'vitest';
import { ffmpegErrorTail } from '../render';

/** A realistic banner — the shape that reached a user as the whole error. */
const BANNER = [
  'ffmpeg version 5.1.6-0+deb12u1 Copyright (c) 2000-2024 the FFmpeg developers',
  '  built with gcc 12 (Debian 12.2.0-14+deb12u1)',
  '  configuration: --prefix=/usr --extra-version=0+deb12u1 --toolchain=hardened' +
    ' --enable-libspeex --enable-libsnappy --enable-libsoxr --enable-librubberband',
  '  libavutil      57. 28.100 / 57. 28.100',
  '  libavcodec     59. 37.100 / 59. 37.100',
  '  libavformat    59. 27.100 / 59. 27.100',
].join('\n');

describe('ffmpegErrorTail', () => {
  it('drops the banner and keeps the actual error', () => {
    const out = ffmpegErrorTail(`${BANNER}\n[in#0] No such file or directory\n`);
    expect(out).toBe('[in#0] No such file or directory');
    expect(out).not.toContain('libspeex');
    expect(out).not.toContain('ffmpeg version');
  });

  it('puts the real error FIRST, which is the whole point', () => {
    // An iOS Alert renders from the top and does not scroll, so a message whose
    // first line is build trivia shows the user nothing at all.
    const out = ffmpegErrorTail(`${BANNER}\nInvalid argument\n`);
    expect(out.split('\n')[0]).toBe('Invalid argument');
  });

  it('only strips a LEADING banner, never matching text further down', () => {
    const out = ffmpegErrorTail(`${BANNER}\nError: bad\n  configuration: xyz`);
    expect(out).toContain('Error: bad');
    expect(out).toContain('  configuration: xyz');
  });

  it('falls back to the raw text when the banner is all there is', () => {
    // Better to show build trivia than an error with no body at all.
    expect(ffmpegErrorTail(BANNER)).toContain('ffmpeg version');
  });

  it('tails rather than heads when the body is longer than max', () => {
    const body = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
    const out = ffmpegErrorTail(`${BANNER}\n${body}`, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).toContain('line 299');
    expect(out).not.toContain('line 0\n');
  });

  it('handles empty stderr without throwing', () => {
    expect(ffmpegErrorTail('')).toBe('');
  });
});
