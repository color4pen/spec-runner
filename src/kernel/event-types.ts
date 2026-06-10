/**
 * All domain events emitted by the pipeline and step executor.
 * Design D6: EventBus reservation seat for v2 learning layer.
 *
 * Kernel principle: zero imports. DomainEvent is a pure string union.
 * EventPayloadMap (which needs JobState) remains in core/event/types.ts.
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
  | "step:retry"
  | "verdict:parsed"
  | "commit:push";
