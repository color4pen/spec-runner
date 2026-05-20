import type { EventBus } from "../core/event/event-bus.js";

/**
 * ProgressDisplay: subscribes to EventBus domain events and prints
 * step transitions, elapsed times, and next-action hints to stdout.
 *
 * Design D1: CLI presentation layer. Does not belong in core pipeline.
 * Design D4: Line-append format (no ANSI cursor movement) for pipe/redirect safety.
 */
export class ProgressDisplay {
  private readonly stepStartTimes = new Map<string, number>();

  constructor(
    private readonly events: EventBus,
    private readonly options: { verbose: boolean; slug: string },
  ) {
    this.subscribe();
  }

  private subscribe(): void {
    this.events.on("step:start", (p) => this.onStepStart(p));
    this.events.on("step:complete", (p) => this.onStepComplete(p));
    this.events.on("step:error", (p) => this.onStepError(p));
    this.events.on("verdict:parsed", (p) => this.onVerdictParsed(p));
    this.events.on("pipeline:complete", (p) => this.onPipelineComplete(p));
    this.events.on("pipeline:fail", (p) => this.onPipelineFail(p));
  }

  private onStepStart(p: { step: string }): void {
    this.stepStartTimes.set(p.step, Date.now());
    process.stdout.write(`[${p.step}] running...\n`);
  }

  private onStepComplete(p: { step: string }): void {
    const elapsed = this.elapsedSeconds(p.step);
    process.stdout.write(`[${p.step}] ✓ (${elapsed}s)\n`);
  }

  private onStepError(p: { step: string; error: Error }): void {
    const elapsed = this.elapsedSeconds(p.step);
    process.stdout.write(`[${p.step}] ✗ error (${elapsed}s)\n`);
  }

  private onVerdictParsed(p: { step: string; outcome: { verdict: string | null } }): void {
    if (p.outcome.verdict === null) return;
    process.stdout.write(`[${p.step}] verdict: ${p.outcome.verdict}\n`);
  }

  private onPipelineComplete(_p: unknown): void {
    process.stdout.write(`\nNext: specrunner job finish ${this.options.slug}\n`);
  }

  private onPipelineFail(p: { reason: string }): void {
    process.stdout.write(`Pipeline failed: ${p.reason}\n`);
  }

  private elapsedSeconds(step: string): number {
    const start = this.stepStartTimes.get(step);
    if (start === undefined) return 0;
    return Math.round((Date.now() - start) / 1000);
  }
}
