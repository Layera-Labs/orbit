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
import { chat } from './chat';
import { listicle } from './listicle';
import { split } from './split';
import { story } from './story';

export { story, storyBrief } from './story';
export { listicle, listicleBrief, composeListicle, itemNumbers } from './listicle';
export { split, splitBrief, composeSplit, SPLIT_AT } from './split';
export { chat, chatBrief, composeChat, isOwn, VISIBLE_BUBBLES } from './chat';

/**
 * Every format, in the order a picker should offer them.
 *
 * Story first because it is the one that fits the most briefs, and the one a
 * caller that does not choose should get. The rest are ordered by how much they
 * constrain what can be written: a countdown needs a list, a split screen needs
 * a tall frame and a second video, and a thread needs a conversation.
 */
export const FORMATS: readonly Format[] = [story, listicle, split, chat];

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
