/**
 * Brief → ScenePlan → VideoProject.
 *
 * The split this package exists to keep clean: anything that RENDERS lives in
 * `@orbit/video`; anything that DECIDES lives here. Shortspilot's needs will
 * pull on both, and the engine is shared with an editor and an SDK, so the line
 * matters more than it usually would.
 *
 * Phase 0 scope, deliberately. The LLM planner, the step runner, per-step
 * idempotency and the `generation_jobs` queue are Phase 1 — what is here is the
 * CONTRACT and one composition, so the seam is real and measurable before any
 * of that is built on top of it.
 *
 * NOTE: relative imports here carry a `.ts` extension, unlike the rest of the
 * repo. This is the one package that is also RUN from source — the Phase 0
 * spike executes under Node's type stripping, and Node ESM requires an
 * explicit extension. `allowImportingTsExtensions` is on for the same reason,
 * and vite resolves them away at build time.
 */
export {
  parseScenePlan,
  ScenePlanError,
  frameSize,
  captionTextOf,
} from './scene-plan.ts';
export type { ScenePlan, Scene, Aspect } from './scene-plan.ts';
export { composeStory } from './compose.ts';
export {
  InMemoryStepLog,
  runSequence,
  runStep,
} from './steps.ts';
export type { Step, StepLog, StepRecord } from './steps.ts';
export { InMemoryGenerationQueue, startGenerationWorker } from './queue.ts';
export type {
  GenerationJob,
  GenerationQueue,
  GenerationStatus,
  GenerationWorker,
  WorkerOptions,
} from './queue.ts';
export type { ComposeInput, SpokenScene, SceneVisual } from './compose.ts';
