/**
 * The library of archetypes.
 *
 * A format decides what shape a generated video takes, what the planner is told
 * to write, and what counts as a plan that obeyed. The `Format` interface lives
 * in `@orbit/pipeline`; the formats live here, and the dependency runs one way
 * only — the runner must stay indifferent to which archetypes exist, and a
 * package boundary is what makes that structural rather than a convention.
 */
import type { Format } from '@orbit/pipeline';
import { story } from './story';

export { story, storyBrief } from './story';

/** Every format, in the order a picker should offer them. */
export const FORMATS: readonly Format[] = [story];

/**
 * Look one up by the `format` field of a plan.
 *
 * Returns undefined rather than falling back to the default. A plan naming a
 * format that does not exist is a wiring error, and quietly composing it as a
 * story would produce a video that is fine on its own terms and not the one
 * that was asked for — the hardest kind of wrong to notice.
 */
export function formatById(id: string): Format | undefined {
  return FORMATS.find((f) => f.id === id);
}
