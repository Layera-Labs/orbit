/**
 * The graph on the front page must be the real graph.
 *
 * A dependency diagram is only worth showing because it is checkable, so this
 * checks it: every node's manifest is read off disk and its `@layera-labs/*`
 * dependencies are compared to the edges the page draws. Without this the
 * picture degrades into an illustration the moment anyone adds an import, and
 * an out-of-date architecture diagram is worse than none — it is a confident
 * wrong answer.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDGES, PACKAGES } from '../packages';

const REPO = join(__dirname, '../../../../..');
const PREFIX = '@layera-labs/orbit-';

/** Directory names differ from package names: the rename moved manifests, not folders. */
function manifestOf(id: string): Record<string, unknown> {
  const raw = readFileSync(join(REPO, 'packages', id, 'package.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function declaredDeps(id: string): string[] {
  const m = manifestOf(id);
  const deps = {
    ...((m.dependencies as Record<string, string>) ?? {}),
    ...((m.peerDependencies as Record<string, string>) ?? {}),
  };
  return Object.keys(deps)
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length))
    .sort();
}

describe('the published package graph', () => {
  it('names a real package at every node', () => {
    for (const pkg of PACKAGES) {
      expect(manifestOf(pkg.id).name).toBe(`${PREFIX}${pkg.id}`);
    }
  });

  it('publishes every package it draws', () => {
    // A private package on a page telling developers to install it is a 404
    // with extra steps.
    for (const pkg of PACKAGES) {
      expect(manifestOf(pkg.id).private, `${pkg.id} is private`).not.toBe(true);
    }
  });

  it('draws exactly the dependencies the manifests declare', () => {
    for (const pkg of PACKAGES) {
      const drawn = EDGES.filter(([from]) => from === pkg.id)
        .map(([, to]) => to)
        .sort();
      expect(drawn, `edges out of ${pkg.id}`).toEqual(declaredDeps(pkg.id));
    }
  });

  it('points every edge at a node that exists', () => {
    const ids = new Set(PACKAGES.map((p) => p.id));
    for (const [from, to] of EDGES) {
      expect(ids.has(from), `${from} is not a node`).toBe(true);
      expect(ids.has(to), `${to} is not a node`).toBe(true);
    }
  });

  it('places a package to the right of everything it depends on', () => {
    // What the columns MEAN. If this ever fails the picture has stopped being
    // a dependency graph and become an arrangement.
    const col = new Map(PACKAGES.map((p) => [p.id, p.col]));
    for (const [from, to] of EDGES) {
      expect(col.get(from)!, `${from} → ${to}`).toBeGreaterThan(col.get(to)!);
    }
  });
});
