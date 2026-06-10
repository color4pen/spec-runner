import type { EventBus } from "../core/event/event-bus.js";
import { maskSensitive, type LogLevel } from "../logger/stdout.js";

/** Injectable timer function type (matches setInterval signature we use). */
type TimerSetFn = (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
/** Injectable clear function type. */
type TimerClearFn = (id: ReturnType<typeof setInterval>) => void;

export interface ProgressDisplayOptions {
  logLevel: LogLevel;
  slug: string;
  /** Heartbeat interval in seconds. 0 = disabled. */
  heartbeatIntervalSec: number;
  /** Injectable timer factory (default: setInterval). For testing. */
  timerFn?: TimerSetFn;
  /** Injectable timer clear (default: clearInterval). For testing. */
  clearTimerFn?: TimerClearFn;
  /** Injectable clock (default: Date.now). For testing. */
  nowFn?: () => number;
  /** Override TTY detection (default: process.stderr.isTTY === true). For testing. */
  isTTY?: boolean;
}

/**
 * Wire a ProgressDisplay to an EventBus.
 * Factory function for use at CLI composition points (run.ts, resume.ts).
 */
export function wireProgressDisplay(
  events: EventBus,
  opts: {
    logLevel: LogLevel;
    slug: string;
    heartbeatIntervalSec: number;
    timerFn?: TimerSetFn;
    clearTimerFn?: TimerClearFn;
    nowFn?: () => number;
    isTTY?: boolean;
  },
): ProgressDisplay {
  return new ProgressDisplay(events, opts);
}

/**
 * ProgressDisplay: subscribes to EventBus domain events and prints
 * step transitions, elapsed times, and next-action hints to stdout.
 *
 * Design D1: CLI presentation layer. Does not belong in core pipeline.
 * Design D4: Line-append format (no ANSI cursor movement) for pipe/redirect safety,
 *            EXCEPT in TTY default mode where \r overwrite is used for heartbeat.
 *
 * Quiet level behavior:
 * - step:start / step:complete / step:error: suppressed
 * - pipeline:complete / pipeline:fail: always output
 * - heartbeat: suppressed
 *
 * Heartbeat timer:
 * - Driven by setInterval inside ProgressDisplay (not core).
 * - Starts on step:start, stops on step:complete/step:error.
 * - Safety net stops on pipeline:complete/pipeline:fail.
 * - dispose() cleans up unconditionally (call from CLI after pipeline exits).
 */
export class ProgressDisplay {
  private readonly stepStartTimes = new Map<string, number>();

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentStep: string | null = null;
  private progressCount = 0;
  private lastTool: string | null = null;

  private readonly timerFn: TimerSetFn;
  private readonly clearTimerFn: TimerClearFn;
  private readonly nowFn: () => number;
  private readonly heartbeatIntervalMs: number;
  private readonly isTTY: boolean;

  constructor(
    private readonly events: EventBus,
    private readonly options: ProgressDisplayOptions,
  ) {
    this.timerFn = options.timerFn ?? (setInterval as unknown as TimerSetFn);
    this.clearTimerFn = options.clearTimerFn ?? (clearInterval as unknown as TimerClearFn);
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.heartbeatIntervalMs = (options.heartbeatIntervalSec ?? 0) * 1000;
    this.isTTY = options.isTTY !== undefined ? options.isTTY : process.stderr.isTTY === true;
    this.subscribe();
  }

  private get isQuiet(): boolean {
    return this.options.logLevel === "quiet";
  }

  /** True when TTY overwrite (\r) should be used for heartbeat. Only in default level TTY. */
  private get useCarriageReturn(): boolean {
    return this.isTTY && this.options.logLevel === "default";
  }

  private subscribe(): void {
    this.events.on("step:start", (p) => this.onStepStart(p));
    this.events.on("step:complete", (p) => this.onStepComplete(p));
    this.events.on("step:error", (p) => this.onStepError(p));
    this.events.on("step:progress", (p) => this.onStepProgress(p));
    this.events.on("step:retry", (p) => this.onStepRetry(p));
    this.events.on("verdict:parsed", (p) => this.onVerdictParsed(p));
    this.events.on("pipeline:complete", (p) => this.onPipelineComplete(p));
    this.events.on("pipeline:fail", (p) => this.onPipelineFail(p));
    this.events.on("pipeline:iteration:start", (p) => this.onIterationStart(p));
    this.events.on("pipeline:iteration:verdict", (p) => this.onIterationVerdict(p));
    this.events.on("pipeline:iteration:exhausted", (p) => this.onIterationExhausted(p));
    this.events.on("pipeline:summary", (p) => this.onPipelineSummary(p));
    this.events.on("pipeline:cli-step", (p) => this.onCliStep(p));
  }

  private onStepStart(p: { step: string }): void {
    this.stepStartTimes.set(p.step, this.nowFn());
    this.currentStep = p.step;
    this.progressCount = 0;
    this.lastTool = null;
    if (this.isQuiet) return;
    process.stderr.write(maskSensitive(`[${p.step}] running...\n`));
    this.startHeartbeat();
  }

  private onStepComplete(p: { step: string }): void {
    this.stopHeartbeat();
    if (this.isQuiet) return;
    if (this.useCarriageReturn) {
      process.stderr.write(maskSensitive("\r\x1b[K"));
    }
    const elapsed = this.elapsedSeconds(p.step);
    process.stderr.write(maskSensitive(`[${p.step}] ✓ (${elapsed}s)\n`));
    this.currentStep = null;
  }

  private onStepError(p: { step: string; error: Error }): void {
    this.stopHeartbeat();
    if (this.isQuiet) return;
    if (this.useCarriageReturn) {
      process.stderr.write(maskSensitive("\r\x1b[K"));
    }
    const elapsed = this.elapsedSeconds(p.step);
    process.stderr.write(maskSensitive(`[${p.step}] ✗ error (${elapsed}s)\n`));
    this.currentStep = null;
  }

  private onStepProgress(p: { step: string; tool: string; target?: string }): void {
    this.progressCount++;
    this.lastTool = p.target ? `${p.tool} ${p.target}` : p.tool;
  }

  private onStepRetry(p: { step: string; attempt: number; maxRetries: number; delayMs: number }): void {
    if (this.isQuiet) return;
    process.stderr.write(maskSensitive(`[${p.step}] transient error — retrying (${p.attempt}/${p.maxRetries})…\n`));
  }

  private onVerdictParsed(p: { step: string; outcome: { verdict: string | null } }): void {
    if (this.isQuiet) return;
    if (p.outcome.verdict === null) return;
    process.stderr.write(maskSensitive(`[${p.step}] verdict: ${p.outcome.verdict}\n`));
  }

  private onPipelineComplete(_p: unknown): void {
    this.stopHeartbeat();
    // Always output final result, even in quiet mode
    process.stderr.write(maskSensitive(`\nNext: specrunner job archive ${this.options.slug}\n`));
  }

  private onPipelineFail(p: { reason: string }): void {
    this.stopHeartbeat();
    // Always output final result, even in quiet mode
    process.stderr.write(maskSensitive(`Pipeline failed: ${p.reason}\n`));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat(); // prevent double-start
    if (this.heartbeatIntervalMs <= 0) return;
    if (this.isQuiet) return;
    this.heartbeatTimer = this.timerFn(() => {
      this.renderHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      this.clearTimerFn(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private renderHeartbeat(): void {
    if (this.currentStep === null) return;
    const elapsed = this.elapsedSeconds(this.currentStep);
    let line = `[${this.currentStep}] ${elapsed}s`;
    if (this.progressCount > 0) {
      line += ` | ${this.progressCount} actions`;
      if (this.lastTool) {
        line += `, last: ${this.lastTool}`;
      }
    }

    if (this.useCarriageReturn) {
      const padded = line.padEnd(process.stderr.columns || 80);
      process.stderr.write(maskSensitive(`\r${padded}`));
    } else {
      process.stderr.write(maskSensitive(`${line}\n`));
    }
  }

  private onIterationStart(p: { step: string; iteration: number; maxIterations: number }): void {
    if (this.isQuiet) return;
    process.stderr.write(maskSensitive(`[iter ${p.iteration}/${p.maxIterations}] starting ${p.step}\n`));
  }

  private onIterationVerdict(p: { step: string; iteration: number; verdict: string; action: "done" | "halt" | "fixer" }): void {
    if (this.isQuiet) return;
    const actionLabel = p.action === "done" ? "done" : p.action === "halt" ? "halt" : "spawning fixer";
    process.stderr.write(maskSensitive(`[iter ${p.iteration}] ${p.step} verdict: ${p.verdict} → ${actionLabel}\n`));
  }

  private onIterationExhausted(p: { step: string; iteration: number; maxIterations: number }): void {
    if (this.isQuiet) return;
    process.stderr.write(maskSensitive(`[iter ${p.iteration}/${p.maxIterations}] retries exhausted on ${p.step}, escalating\n`));
  }

  private onPipelineSummary(p: { step: string; iterations: number; finalVerdict: string }): void {
    if (this.isQuiet) return;
    process.stderr.write(maskSensitive(`Pipeline finished: ${p.step} iterations=${p.iterations}, final verdict=${p.finalVerdict}\n`));
  }

  private onCliStep(p: { step: string; verdict?: string }): void {
    if (this.isQuiet) return;
    if (p.verdict !== undefined) {
      process.stderr.write(maskSensitive(`[step] ${p.step}: ${p.verdict}\n`));
    } else {
      process.stderr.write(maskSensitive(`[step] ${p.step}\n`));
    }
  }

  private elapsedSeconds(step: string): number {
    const start = this.stepStartTimes.get(step);
    if (start === undefined) return 0;
    return Math.round((this.nowFn() - start) / 1000);
  }

  /**
   * Release the heartbeat timer. Call this from the CLI composition point
   * after the pipeline exits (normal or abnormal) as a safety net.
   */
  public dispose(): void {
    this.stopHeartbeat();
  }
}
