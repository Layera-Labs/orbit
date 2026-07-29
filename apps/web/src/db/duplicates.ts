/**
 * The copies an earlier sync bug left behind.
 *
 * A first sync used to push back the very projects it had just pulled, at the
 * timestamp they arrived with. The server refuses an equal timestamp, the
 * client read that refusal as "both sides changed", and it dutifully kept both
 * — so every project on the account grew a twin named "(this browser)" or
 * "(this phone)", and the twin grew its own twin on the next pass.
 *
 * The bug is fixed. The copies it made are still sitting in people's accounts,
 * and only the user can be sure they are unwanted — so this identifies them and
 * nothing more. Deleting is a separate, explicit act.
 *
 * The rule is deliberately narrow, because the alternative to being narrow is
 * deleting someone's work: a project may be removed only when it carries the
 * machine-written suffix AND another project it is byte-identical to survives.
 * A conflict copy whose contents actually differ is a real divergence someone
 * has to look at, and it is never touched.
 */

/** The suffix the sync's conflict handler appends. Stacks, so it may repeat. */
const COPY_SUFFIX = /\s*\((?:this browser|this phone)\)\s*$/;

export function isCopyName(name: string): boolean {
  return COPY_SUFFIX.test(name);
}

/** The name without any stacked copy suffixes, for display. */
export function baseName(name: string): string {
  let out = name;
  while (COPY_SUFFIX.test(out)) out = out.replace(COPY_SUFFIX, '');
  return out.trim();
}

/**
 * A fingerprint of what a project CONTAINS, ignoring what it is called.
 *
 * Keys are sorted at every level, which is not fussiness: a project that has
 * been to the server and back was stored as `jsonb`, and Postgres does not
 * preserve key order. The surviving original is usually the round-tripped one
 * and the copy is the local pre-sync object, so a plain `JSON.stringify`
 * comparison would call two identical documents different and clean up
 * nothing.
 */
export function contentKey(data: unknown): string {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) out[key] = walk(src[key]);
      return out;
    }
    return value;
  };
  // The document's own id travels inside `data` too, and a copy may or may not
  // carry the original's — it says nothing about whether the contents match.
  const stripped =
    data && typeof data === 'object' && !Array.isArray(data)
      ? Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([k]) => k !== 'id'))
      : data;
  return JSON.stringify(walk(stripped));
}

export interface Candidate {
  id: string;
  name: string;
  data: unknown;
  createdAt: number;
}

/**
 * Which projects are provably redundant copies.
 *
 * Returns ids only, in no particular order. Nothing here deletes anything.
 */
export function redundantCopies(rows: readonly Candidate[]): string[] {
  /*
   * Grouped by content AND by base name, not content alone.
   *
   * Content alone is too loose: three projects started from the same preset are
   * byte-identical while being three different things to the person who made
   * them, and their names are the only thing telling them apart. A copy the bug
   * made is always `<the original's name> (this browser)`, so requiring the base
   * names to match costs nothing and makes the match precise instead of merely
   * plausible.
   */
  const groups = new Map<string, Candidate[]>();
  for (const row of rows) {
    const key = `${contentKey(row.data)}\u0000${baseName(row.name)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const doomed: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const copies = group.filter((r) => isCopyName(r.name));
    if (!copies.length) continue;

    if (copies.length === group.length) {
      /*
       * Every member is a copy, so whatever they were copied FROM is already
       * gone. Keep the oldest rather than removing them all — the content has
       * to survive somewhere, and the oldest is the closest thing to an
       * original that still exists.
       */
      const oldest = [...group].sort((a, b) => a.createdAt - b.createdAt)[0];
      doomed.push(...group.filter((r) => r.id !== oldest.id).map((r) => r.id));
      continue;
    }

    // Something un-suffixed survives, so every suffixed twin is redundant.
    doomed.push(...copies.map((r) => r.id));
  }
  return doomed;
}
