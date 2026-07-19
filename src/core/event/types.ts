import type { JobState } from "../../state/schema.js";
import type { BaseReportResult } from "../../kernel/report-result.js";

export type { DomainEvent } from "../../kernel/event-types.js";
import type { DomainEvent } from "../../kernel/event-types.js";

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
  /**
   * Emitted when an approved reviewer's paired fixer budget is exhausted and
   * fixable (optional) findings are skipped instead of being applied.
   * step = the reviewer that approved, fixer = the paired fixer that was skipped.
   */
  "pipeline:fixer:budget-skipped": { step: string; fixer: string; omittedFixableFindings: number; maxIterations: number };
  "step:start": { step: string; state: JobState };
  "step:complete": { step: string; state: JobState };
  "step:error": { step: string; error: Error; state: JobState };
  "step:progress": { step: string; tool: string; target?: string };
  "step:retry": { step: string; attempt: number; maxRetries: number; delayMs: number };
  "verdict:parsed": { step: string; outcome: { verdict: string | null; toolResult?: BaseReportResult | null; followUpAttempts?: number } };
  "commit:push": { step: string; branch: string };
};

/**
 * Payload<E> resolves to the correct payload type for a given DomainEvent.
 */
export type Payload<E extends DomainEvent> = EventPayloadMap[E];
