import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectClientSrcs, isClientSrc, makeResolveSrc } from '../resolve';

describe('isClientSrc', () => {
  it('accepts upload tokens and http(s) URLs', () => {
    expect(isClientSrc('upload:u_1_123.mp4')).toBe(true);
    expect(isClientSrc('https://cdn.example.com/a.mp4')).toBe(true);
    expect(isClientSrc('http://x/y.mp3')).toBe(true);
  });

  it('rejects raw filesystem paths (so a client cannot point ffmpeg at server files)', () => {
    expect(isClientSrc('/etc/passwd')).toBe(false);
    expect(isClientSrc('file:///etc/passwd')).toBe(false);
    expect(isClientSrc('../secret.key')).toBe(false);
    expect(isClientSrc('upload:../escape')).toBe(false); // slash/dot-dot not in token charset
  });
});

describe('collectClientSrcs', () => {
  // Regression: /v1/render used to validate only `clips` and `audio`, while the
  // mobile app renders exclusively through `tracks` — so the guarded fields were
  // the legacy ones and the live path was wide open.
  it('collects srcs from multi-track clips', () => {
    const srcs = collectClientSrcs({
      clips: [],
      audio: [],
      tracks: [
        { clips: [{ src: 'upload:ok.mp4' }, { src: '/Users/me/private.mov' }] },
        { clips: [{ src: 'upload:music.mp3' }] },
      ],
    });
    expect(srcs).toContain('/Users/me/private.mov');
    expect(srcs.filter((s) => !isClientSrc(s as string))).toEqual(['/Users/me/private.mov']);
  });

  it('collects an image background src', () => {
    expect(collectClientSrcs({ background: { type: 'image', src: '/etc/passwd' } })).toEqual([
      '/etc/passwd',
    ]);
  });

  it('ignores backgrounds that carry no src', () => {
    expect(collectClientSrcs({ background: { type: 'color' } })).toEqual([]);
  });

  it('still collects the legacy clips and audio srcs', () => {
    expect(
      collectClientSrcs({ clips: [{ src: 'upload:a.mp4' }], audio: [{ src: 'upload:b.mp3' }] }),
    ).toEqual(['upload:a.mp4', 'upload:b.mp3']);
  });

  it('surfaces non-string srcs so the caller can reject them', () => {
    expect(collectClientSrcs({ tracks: [{ clips: [{ src: 42 }] }] })).toEqual([42]);
  });
});

describe('makeResolveSrc', () => {
  const mediaDir = '/tmp/orbit-test-media';
  const resolve = makeResolveSrc(mediaDir);

  it('maps a valid upload token to a path inside the media dir', () => {
    expect(resolve('upload:u_1_123.mp4')).toBe(join(mediaDir, 'u_1_123.mp4'));
  });

  it('passes non-token srcs (server templates / URLs) through unchanged', () => {
    expect(resolve('https://example.com/a.mp4')).toBe('https://example.com/a.mp4');
    expect(resolve('/server/assets/music.mp3')).toBe('/server/assets/music.mp3');
  });

  it('throws if a token would escape the media dir', () => {
    // ".." is within the token charset but must not resolve outside mediaDir.
    expect(() => resolve('upload:..')).toThrow(/invalid media reference/);
  });
});
