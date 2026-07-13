/**
 * ConvergenceBudget — immutable convergence state for pipeline loop tracking.
 *
 * Tracks per-loop and per-fixer iteration counters and the previous loop step
 * name. All mutation methods return new instances; no in-place mutation occurs.
 *
 * This design enables:
 * - Resume reconstruction from journal (before/after snapshots are comparable)
 * - Parallel isolation (each branch holds its own budget)
 * - Testability without side effects
 */

interface ConvergenceBudgetState {
  readonly loopIterations: ReadonlyMap<string, number>;
  readonly fixerIterations: ReadonlyMap<string, number>;
  readonly previousLoopStep: string;
}

export class ConvergenceBudget {
  private constructor(private readonly state: ConvergenceBudgetState) {}

  /** Returns a fresh budget with empty counters and no previous loop step. */
  static initial(): ConvergenceBudget {
    return new ConvergenceBudget({
      loopIterations: new Map(),
      fixerIterations: new Map(),
      previousLoopStep: "",
    });
  }

  /** Returns the current loop iteration count for the given step (0 if never entered). */
  getLoopIter(stepName: string): number {
    return this.state.loopIterations.get(stepName) ?? 0;
  }

  /** Returns the current fixer iteration count for the given fixer (0 if never entered). */
  getFixerIter(fixerName: string): number {
    return this.state.fixerIterations.get(fixerName) ?? 0;
  }

  /** Returns the name of the previous loop step (empty string if none). */
  getPreviousLoopStep(): string {
    return this.state.previousLoopStep;
  }

  /**
   * Increments the loop iteration counter for the given step and returns a new
   * budget along with the resulting iteration number.
   */
  enterLoopStep(stepName: string): { budget: ConvergenceBudget; iteration: number } {
    const prev = this.state.loopIterations.get(stepName) ?? 0;
    const iteration = prev + 1;
    const loopIterations = new Map(this.state.loopIterations);
    loopIterations.set(stepName, iteration);
    return {
      budget: new ConvergenceBudget({ ...this.state, loopIterations }),
      iteration,
    };
  }

  /**
   * Increments the fixer iteration counter for the given fixer step and returns
   * a new budget instance.
   */
  enterFixerStep(fixerName: string): ConvergenceBudget {
    const prev = this.state.fixerIterations.get(fixerName) ?? 0;
    const fixerIterations = new Map(this.state.fixerIterations);
    fixerIterations.set(fixerName, prev + 1);
    return new ConvergenceBudget({ ...this.state, fixerIterations });
  }

  /**
   * Resets the loop iteration counter for the given step to 0 (new episode).
   * Returns a new budget instance.
   */
  resetLoopStep(stepName: string): ConvergenceBudget {
    const loopIterations = new Map(this.state.loopIterations);
    loopIterations.set(stepName, 0);
    return new ConvergenceBudget({ ...this.state, loopIterations });
  }

  /**
   * Resets the fixer iteration counter for the given fixer to 0 (new episode).
   * Returns a new budget instance.
   */
  resetFixerStep(fixerName: string): ConvergenceBudget {
    const fixerIterations = new Map(this.state.fixerIterations);
    fixerIterations.set(fixerName, 0);
    return new ConvergenceBudget({ ...this.state, fixerIterations });
  }

  /**
   * Returns a new budget instance with `previousLoopStep` set to the given
   * step name.
   */
  withPreviousLoopStep(step: string): ConvergenceBudget {
    return new ConvergenceBudget({ ...this.state, previousLoopStep: step });
  }
}
