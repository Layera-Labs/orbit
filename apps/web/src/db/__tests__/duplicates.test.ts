import { describe, expect, it } from 'vitest';
import { baseName, contentKey, isCopyName, redundantCopies, type Candidate } from '../duplicates';

/**
 * These decide which of someone's projects get deleted, so the tests are
 * mostly about what must NOT be deleted.
 */

const row = (id: string, name: string, data: unknown, createdAt = 1000): Candidate => ({
  id,
  name,
  data,
  createdAt,
});

const doc = (clips: string[]) => ({ id: 'p', schemaVersion: 2, width: 1080, clips });

describe('isCopyName / baseName', () => {
  it('recognises the suffix the sync writes', () => {
    expect(isCopyName('Trip (this browser)')).toBe(true);
    expect(isCopyName('Trip (this phone)')).toBe(true);
    expect(isCopyName('Trip')).toBe(false);
    expect(isCopyName('Trip (my edit)')).toBe(false);
  });

  /* The bug stacked them: a copy was itself copied on the next pass. */
  it('strips a stack of suffixes', () => {
    expect(baseName('Trip (this browser) (this browser)')).toBe('Trip');
    expect(baseName('Trip (this browser) (this phone)')).toBe('Trip');
    expect(baseName('Trip')).toBe('Trip');
  });
});

describe('contentKey', () => {
  /*
   * The point of the whole function. A project that has been to the server and
   * back was stored as `jsonb`, and Postgres does not preserve key order — so
   * the surviving original and its local copy differ byte for byte while being
   * the same document. A naive comparison cleans up nothing.
   */
  it('ignores key order, at every level', () => {
    const a = { schemaVersion: 2, width: 1080, background: { type: 'color', color: '#111' } };
    const b = { background: { color: '#111', type: 'color' }, width: 1080, schemaVersion: 2 };
    expect(contentKey(a)).toBe(contentKey(b));
  });

  it('ignores the document id, which a copy need not share', () => {
    expect(contentKey({ id: 'one', width: 5 })).toBe(contentKey({ id: 'two', width: 5 }));
  });

  it('still sees a real difference', () => {
    expect(contentKey(doc(['a']))).not.toBe(contentKey(doc(['a', 'b'])));
    // Array ORDER is content, not incidental.
    expect(contentKey(doc(['a', 'b']))).not.toBe(contentKey(doc(['b', 'a'])));
  });

  it('survives nulls and arrays without throwing', () => {
    expect(() => contentKey(null)).not.toThrow();
    expect(() => contentKey([1, 2])).not.toThrow();
    expect(contentKey(undefined)).toBe(contentKey(undefined));
  });
});

describe('redundantCopies', () => {
  it('removes a copy when the original survives', () => {
    expect(
      redundantCopies([row('a', 'Trip', doc(['x'])), row('b', 'Trip (this browser)', doc(['x']))]),
    ).toEqual(['b']);
  });

  it('removes a whole stack of them', () => {
    const dup = redundantCopies([
      row('a', 'Trip', doc(['x'])),
      row('b', 'Trip (this browser)', doc(['x'])),
      row('c', 'Trip (this browser) (this browser)', doc(['x'])),
      row('d', 'Trip (this phone)', doc(['x'])),
    ]);
    expect(dup.sort()).toEqual(['b', 'c', 'd']);
  });

  /*
   * THE case that matters. A conflict copy whose contents actually differ is a
   * real divergence — two devices that both did work — and deleting it is
   * exactly the data loss the conflict handler exists to prevent.
   */
  it('never removes a copy whose contents differ', () => {
    expect(
      redundantCopies([
        row('a', 'Trip', doc(['x'])),
        row('b', 'Trip (this browser)', doc(['x', 'an afternoon of edits'])),
      ]),
    ).toEqual([]);
  });

  it('never removes a project without the machine suffix', () => {
    // Someone duplicated a project themselves. Identical, and none of our business.
    expect(
      redundantCopies([row('a', 'Trip', doc(['x'])), row('b', 'Trip copy', doc(['x']))]),
    ).toEqual([]);
  });

  it('leaves a lone copy alone when nothing identical survives', () => {
    expect(redundantCopies([row('b', 'Trip (this browser)', doc(['x']))])).toEqual([]);
  });

  /*
   * All that is left are copies, so the thing they were copied from is gone.
   * The content still has to survive somewhere.
   */
  it('keeps the oldest when every twin is a copy', () => {
    const dup = redundantCopies([
      row('young', 'Trip (this browser)', doc(['x']), 3000),
      row('old', 'Trip (this phone)', doc(['x']), 1000),
      row('middle', 'Trip (this browser)', doc(['x']), 2000),
    ]);
    expect(dup.sort()).toEqual(['middle', 'young']);
    expect(dup).not.toContain('old');
  });

  it('does not confuse two different projects that happen to share a name', () => {
    expect(
      redundantCopies([
        row('a', 'Video Jul 29', doc(['x'])),
        row('b', 'Video Jul 29', doc(['y'])),
        row('c', 'Video Jul 29 (this browser)', doc(['y'])),
      ]),
    ).toEqual(['c']);
  });

  /*
   * Found by running the detector over a real library. Three projects started
   * from the same preset are byte-identical while being three different things
   * to whoever made them — their names are all that tells them apart, so
   * content alone must not be enough to call one a copy of another.
   */
  it('does not treat same-content projects with different names as copies', () => {
    expect(
      redundantCopies([
        row('a', 'Draft one', doc([])),
        row('b', 'Draft two', doc([])),
        row('c', 'Draft three (this browser)', doc([])),
      ]),
    ).toEqual([]);
  });

  it('still matches through a stack of suffixes', () => {
    expect(
      redundantCopies([
        row('a', 'Draft one', doc([])),
        row('b', 'Draft one (this browser) (this phone)', doc([])),
      ]),
    ).toEqual(['b']);
  });

  it('is empty for a library with nothing wrong with it', () => {
    expect(
      redundantCopies([row('a', 'One', doc(['x'])), row('b', 'Two', doc(['y']))]),
    ).toEqual([]);
  });
});
