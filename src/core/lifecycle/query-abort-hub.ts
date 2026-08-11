/**
 * QueryAbortHub: concrete implementation of QueryAbortRegistration.
 *
 * Maintains a set of in-flight agent query AbortControllers.
 * Called by LocalRuntime's signal handler to abort all active queries before exit.
 *
 * D4 (design.md): pure, no I/O — fully unit-testable.
 */

import type { QueryAbortRegistration } from "../port/query-abort.js";

export class QueryAbortHub implements QueryAbortRegistration {
  private readonly controllers = new Set<AbortController>();

  /**
   * Register `controller` with the hub.
   * Returns a deregister function; caller MUST call it on every exit path.
   */
  register(controller: AbortController): () => void {
    this.controllers.add(controller);
    return () => {
      this.controllers.delete(controller);
    };
  }

  /**
   * Abort all currently registered controllers.
   * Idempotent; safe to call with an empty set.
   */
  abortActive(): void {
    for (const ctrl of this.controllers) {
      ctrl.abort();
    }
  }

  /**
   * Resolve when the registered set is empty, or when `timeoutMs` elapses.
   * Polls on a short interval using the injected `sleep` function.
   *
   * Does NOT deregister controllers on timeout — callers are responsible for cleanup.
   * ponytail: poll interval fixed at 50ms; upgrade to event-driven if throughput demands it.
   */
  async drain(timeoutMs: number, sleep: (ms: number) => Promise<void>): Promise<void> {
    const interval = 50;
    let elapsed = 0;
    while (this.controllers.size > 0 && elapsed < timeoutMs) {
      await sleep(interval);
      elapsed += interval;
    }
  }
}
