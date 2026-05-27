import type { JobState } from "../../state/schema.js";

/**
 * All domain events emitted by the pipeline and step executor.
 * Design D6: EventBus reservation seat for v2 learning layer.
 */
export type DomainEvent =
  | "pipeline:start"
  | "pipeline:complete"
  | "pipeline:fail"
  | "pipeline:iteration:start"
  | "pipeline:iteration:verdict"
  | "pipeline:iteration:exhausted"
  | "pipeline:summary"
  | "pipeline:cli-step"
  | "step:start"
  | "step:complete"
  | "step:error"
  | "step:progress"
  | "verdict:parsed"
  | "commit:push";

/**
 * Payload types for each DomainEvent.
 * Uses a mapped type so emit/on calls are typed to the event key.
 */
export type EventPayloadMap = {
  "pipeline:start": { state: JobState };
  "pipeline:complete": { state: JobState };
  "pipeline:fail": { state: JobState; reason: string };
  "pipeline:iteration:start": { step: string; iteration: number; maxIterations: number };
  "pipeline:iteration:verdict": { step: string; iteration: number; verdict: string; action: "done" | "halt" | "fixer" };
  "pipeline:iteration:exhausted": { step: string; iteration: number; maxIterations: number };
  "pipeline:summary": { step: string; iterations: number; finalVerdict: string };
  "pipeline:cli-step": { step: string; verdict?: string };
  "step:start": { step: string; state: JobState };
  "step:complete": { step: string; state: JobState };
  "step:error": { step: string; error: Error; state: JobState };
  "step:progress": { step: string; tool: string; target?: string };
  "verdict:parsed": { step: string; outcome: { verdict: string | null } };
  "commit:push": { step: string; branch: string };
};

/**
 * Payload<E> resolves to the correct payload type for a given DomainEvent.
 */
export type Payload<E extends DomainEvent> = EventPayloadMap[E];
