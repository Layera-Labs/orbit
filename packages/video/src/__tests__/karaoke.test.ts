/**
 * Word-by-word captions, and the invariant that the two surfaces light the
 * SAME word at the same instant.
 *
 * The failure this is written against is quiet and specific: a highlight one
 * word ahead in the exported file and correct in the preview, because two
 * places each worked out "which word is lit at 3.2s" and rounded a boundary
 * differently. Nothing crashes, nothing looks broken in isolation, and it is
 * only visible with the preview and the file side by side.
 *
 * So the agreement test does not check that both drew *a* highlight. It walks
 * every segment boundary the export slices at, asks the preview for its markup
 * at that instant, and requires the two strings to be identical.
 */
import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { frameStateAt } from '../frame';
import { overlayToSVG } from '../overlay-svg';
import {
  MAX_WORD_SEGMENTS,
  NO_WORD,
  activeWordAt,
  karaokeWords,
  plateSegmentsOf,
  segmentsOf,
} from '../karaoke';
import type { Overlay, TextOverlay, VideoProject, WordTiming } from '../types';

const W = 1080;
const H = 1920;

const WORDS: WordTiming[] = [
  { text: 'never', start: 1, end: 1.4 },
  { text: 'gonna', start: 1.5, end: 1.9 },
  { text: 'give', start: 2.2, end: 2.5 },
  { text: 'you', start: 2.6, end: 2.8 },
  { text: 'up', start: 3, end: 3.4 },
];

const cap = (over: Partial<TextOverlay> = {}): TextOverlay => ({
  id: 'cap',
  type: 'text',
  text: 'never gonna give you up',
  words: WORDS,
  highlight: { color: '#ffd400' },
  start: 0.5,
  end: 4,
  x: 0.5,
  y: 0.8,
  fontSize: 64,
  color: '#ffffff',
  ...over,
});

function project(overlays: Overlay[]): VideoProject {
  return {
    id: 'p',
    schemaVersion: 3,
    width: W,
    height: H,
    fps: 30,
    background: { type: 'color', color: '#000000' },
    clips: [],
    overlays,
    audio: [],
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 5 }],
      },
    ],
  };
}

describe('karaokeWords — what opts in', () => {
  it('takes a caption with timings and a highlight', () => {
    expect(karaokeWords(cap())).toHaveLength(5);
  });

  it('refuses one with no highlight, however good its timings', () => {
    /*
     * The single most important negative here. Auto-captions carry `words`
     * whether or not anyone asked for the effect, so keying off the array would
     * silently turn karaoke on for every transcribed project ever saved — and
     * multiply its render cost by the word count.
     */
    expect(karaokeWords(cap({ highlight: undefined }))).toBeNull();
  });

  it('refuses one whose words no longer spell the text', () => {
    // Someone retyped the caption. The array now describes something nobody is
    // saying, and a stale array is worse than an absent one because it lights
    // the wrong word confidently.
    expect(karaokeWords(cap({ text: 'never gonna let you down' }))).toBeNull();
  });

  it('refuses a shape, which has no words at all', () => {
    const shape: Overlay = {
      id: 's',
      type: 'shape',
      shape: 'rect',
      start: 0,
      end: 1,
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 0.1,
    };
    expect(karaokeWords(shape)).toBeNull();
  });

  it('degrades rather than exploding on an absurd word count', () => {
    // Each segment is a full-frame PNG and a separate ffmpeg input with its own
    // decoder. A render that dies having opened four hundred of them is a worse
    // answer than one that draws the caption without the highlight.
    const many = Array.from({ length: MAX_WORD_SEGMENTS + 1 }, (_, i) => ({
      text: `w${i}`,
      start: i * 0.01,
      end: i * 0.01 + 0.005,
    }));
    const huge = cap({ words: many, text: many.map((w) => w.text).join(' ') });
    expect(karaokeWords(huge)).toBeNull();
    expect(segmentsOf(huge)).toHaveLength(1);
  });
});

describe('segmentsOf — the slicing', () => {
  it('tiles the caption window with no gaps and no overlaps', () => {
    const segs = segmentsOf(cap());
    expect(segs[0].start).toBe(0.5);
    expect(segs.at(-1)!.end).toBe(4);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].start).toBe(segs[i - 1].end);
    }
  });

  it('lights nothing before the first word is spoken', () => {
    // The caption is on screen from 0.5s and the voice reaches it at 1s.
    const first = segmentsOf(cap())[0];
    expect(first).toMatchObject({ start: 0.5, end: 1, activeWord: NO_WORD });
  });

  it('holds a word until the NEXT one begins, not until its own end', () => {
    /*
     * The pause between "gonna" (ends 1.9) and "give" (starts 2.2) belongs to
     * "gonna". Honouring `end` literally would blank the highlight in every gap
     * between words — several times a second, which reads as a flicker rather
     * than as karaoke.
     */
    const gonna = segmentsOf(cap()).find((s) => s.activeWord === 1)!;
    expect(gonna.start).toBe(1.5);
    expect(gonna.end).toBe(2.2);
  });

  it('holds the last word to the end of the caption', () => {
    const last = segmentsOf(cap()).at(-1)!;
    expect(last.activeWord).toBe(4);
    expect(last.end).toBe(4);
  });

  it('clamps a word that starts before the caption does', () => {
    const early = cap({ start: 2 });
    const segs = segmentsOf(early);
    expect(segs[0].start).toBe(2);
    // "never", "gonna" and "give" all start at or before 2.2; none may produce
    // a slice that begins before the caption is on screen.
    expect(segs.every((s) => s.start >= 2 && s.end <= 4)).toBe(true);
  });

  it('drops a word that starts after the caption ends', () => {
    const short = cap({ end: 2 });
    const segs = segmentsOf(short);
    expect(segs.every((s) => s.end <= 2)).toBe(true);
    expect(segs.map((s) => s.activeWord)).not.toContain(4);
  });

  it('emits no zero-length slice when two words share a start', () => {
    const tied = cap({
      text: 'a b c',
      words: [
        { text: 'a', start: 1, end: 1.1 },
        { text: 'b', start: 1, end: 1.2 },
        { text: 'c', start: 2, end: 2.5 },
      ],
    });
    expect(segmentsOf(tied).every((s) => s.end > s.start)).toBe(true);
  });

  it('keeps the ORIGINAL word index, which is what addresses the text', () => {
    // `captionWordsValid` guarantees `words[i]` is the i-th space-separated
    // token. A slice that renumbered after sorting or filtering would light a
    // different word than the one being spoken.
    expect(segmentsOf(cap()).map((s) => s.activeWord)).toEqual([NO_WORD, 0, 1, 2, 3, 4]);
  });

  it('gives a plain caption exactly one segment under its own id', () => {
    /*
     * The backward-compatibility guarantee. Every existing caller builds
     * `overlayImages` keyed by overlay id, so a project without a highlight has
     * to keep producing one plate under exactly that key.
     */
    const plain = segmentsOf(cap({ highlight: undefined }));
    expect(plain).toHaveLength(1);
    expect(plain[0]).toMatchObject({ key: 'cap', activeWord: NO_WORD, start: 0.5, end: 4 });
  });
});

describe('activeWordAt — the preview reads the same boundaries', () => {
  it.each([
    [0.6, NO_WORD],
    [0.99, NO_WORD],
    [1, 0],
    [1.49, 0],
    [1.5, 1],
    [2.1, 1],
    [2.2, 2],
    [3.9, 4],
  ])('at %ss lights word %s', (t, want) => {
    expect(activeWordAt(cap(), t)).toBe(want);
  });

  it('holds the last word at the caption\'s final instant', () => {
    // `segmentsOf` tiles a half-open range, so `t === end` falls outside every
    // slice. It belongs to the last one, not to nothing.
    expect(activeWordAt(cap(), 4)).toBe(4);
  });

  it('lights nothing on a caption that does not karaoke', () => {
    expect(activeWordAt(cap({ highlight: undefined }), 2)).toBe(NO_WORD);
  });
});

describe('the SVG', () => {
  const svgAt = (t: number, o = cap()) =>
    overlayToSVG(o, W, H, { activeWord: activeWordAt(o, t) });

  it('colours only the word being spoken', () => {
    const svg = svgAt(2.3); // "give"
    expect(svg).toContain('#ffd400');
    expect(svg).toContain('>give</tspan>');
    // And the rest of the line is still in the caption's own ink.
    expect(svg).toContain('never gonna ');
    expect(svg).toContain(' you up');
  });

  it('keeps the line as ONE anchored chunk, so it stays centred', () => {
    /*
     * Only the first tspan of a line carries `x`; the rest continue it. Giving
     * each fragment its own `x` would centre each one separately under
     * `text-anchor: middle` and tear the line into three overlapping pieces.
     */
    const svg = svgAt(2.3);
    expect(svg.match(/<tspan x=/g)).toHaveLength(1);
  });

  it('preserves the spaces either side of the lit word', () => {
    // They live at the end of one fragment and the start of the next, which is
    // exactly where SVG's default collapsing throws them away — closing the gap
    // around the one word anybody is looking at.
    expect(svgAt(2.3)).toContain('xml:space="preserve"');
  });

  it('puts `x` on the lit word itself when it is first on the line', () => {
    // Rather than on an empty leading tspan, which is not something every
    // renderer positions the same way.
    const svg = svgAt(1.2); // "never", the first word
    expect(svg).not.toContain('<tspan x="540" y="1536"></tspan>');
    expect(svg).toMatch(/<tspan x="[\d.]+" y="[\d.]+" fill="#ffd400">never<\/tspan>/);
  });

  it('draws a plate behind the word only when one is asked for', () => {
    const noPlate = overlayToSVG(cap(), W, H, { activeWord: 2 });
    expect(noPlate).not.toContain('<rect');
    const withPlate = overlayToSVG(
      cap({ highlight: { color: '#000000', background: '#ffd400', radius: 8 } }),
      W,
      H,
      { activeWord: 2 },
    );
    expect(withPlate).toContain('<rect');
    expect(withPlate).toContain('fill="#ffd400"');
  });

  it('renders byte-identically to the old path when nothing is lit', () => {
    /*
     * The regression guarantee, stated as strongly as it can be. Every caption
     * ever saved renders through this function; if lighting nothing produced
     * even slightly different markup, this change would silently re-render the
     * entire back catalogue.
     */
    const o = cap();
    expect(overlayToSVG(o, W, H, { activeWord: NO_WORD })).toBe(overlayToSVG(o, W, H));
    expect(overlayToSVG(o, W, H)).not.toContain('xml:space');
  });

  it('refuses a hostile highlight colour rather than escaping it', () => {
    const evil = cap({ highlight: { color: "url('/etc/passwd')" } });
    const svg = overlayToSVG(evil, W, H, { activeWord: 1 });
    expect(svg).not.toContain('/etc/passwd');
    expect(svg).not.toContain('url(');
  });
});

describe('preview and export agree, word for word', () => {
  it('builds the identical SVG at every boundary the export slices at', () => {
    /*
     * The invariant. `render.ts` rasterizes `overlayToSVG(overlay, W, H, {
     * activeWord: seg.activeWord })` for each segment; the preview builds its
     * markup from `activeWordAt(o, t)`. Walking the segments and comparing the
     * two strings at the start, middle and last instant of each is the closest
     * this can get to comparing the pixels.
     */
    const o = cap();
    for (const seg of segmentsOf(o)) {
      const exported = overlayToSVG(o, W, H, { activeWord: seg.activeWord });
      for (const t of [seg.start, (seg.start + seg.end) / 2, seg.end - 1e-6]) {
        expect(overlayToSVG(o, W, H, { activeWord: activeWordAt(o, t) })).toBe(exported);
      }
    }
  });

  it('the preview op carries that same SVG', () => {
    const o = cap();
    const op = frameStateAt(project([o]), 2.3).find((d) => d.kind === 'overlay');
    expect(op?.svg).toBe(overlayToSVG(o, W, H, { activeWord: 2 }));
  });

  it('wires one enabled input per segment, over the segment window', () => {
    const o = cap();
    const segs = segmentsOf(o);
    const images = Object.fromEntries(segs.map((s) => [s.key, `/tmp/${s.key}.png`]));
    const args = buildFFmpegArgs(project([o]), {
      overlayImages: images,
      baseImage: '/tmp/bg.png',
      outputPath: '/tmp/out.mp4',
    });
    const graph = args[args.indexOf('-filter_complex') + 1];

    for (const s of segs) {
      expect(args).toContain(`/tmp/${s.key}.png`);
      expect(graph).toContain(`enable='between(t,${s.start},${s.end})'`);
    }
  });

  it('fades over the CAPTION window, not once per word', () => {
    // A fade re-anchored to each slice would restart five times and strobe.
    const o = cap({ animateIn: { type: 'fade', duration: 0.5 } });
    const segs = segmentsOf(o);
    const images = Object.fromEntries(segs.map((s) => [s.key, `/tmp/${s.key}.png`]));
    const graph = buildFFmpegArgs(project([o]), {
      overlayImages: images,
      baseImage: '/tmp/bg.png',
      outputPath: '/tmp/out.mp4',
    })[
      buildFFmpegArgs(project([o]), {
        overlayImages: images,
        baseImage: '/tmp/bg.png',
        outputPath: '/tmp/out.mp4',
      }).indexOf('-filter_complex') + 1
    ];
    // Every slice fades from the caption's own start.
    expect(graph.match(/fade=t=in:st=0\.5:d=0\.5/g)).toHaveLength(segs.length);
    expect(graph).not.toContain('fade=t=in:st=1:');
  });

  it('leaves a project with no highlight byte-identical in the argv', () => {
    const plain = project([cap({ highlight: undefined })]);
    const args = buildFFmpegArgs(plain, {
      overlayImages: { cap: '/tmp/cap.png' },
      baseImage: '/tmp/bg.png',
      outputPath: '/tmp/out.mp4',
    });
    expect(args).toContain('/tmp/cap.png');
    // One plate, under the overlay's own id, and no sliced key anywhere. (The
    // argv carries a second `-loop` for the multi-track base image, which is
    // not a plate — counting those instead measures the wrong thing.)
    expect(args.filter((a) => a.startsWith('/tmp/cap'))).toEqual(['/tmp/cap.png']);
    expect(args.some((a) => a.includes('cap#'))).toBe(false);
  });
});

describe('plateSegmentsOf', () => {
  it('slices every plate and keeps them grouped by overlay', () => {
    const other = cap({ id: 'two', highlight: undefined });
    const keys = plateSegmentsOf([cap(), other]).map((s) => s.key);
    expect(keys).toEqual(['cap#0', 'cap#1', 'cap#2', 'cap#3', 'cap#4', 'cap#5', 'two']);
  });
});
