import { JobStateStore } from "../../store/job-state-store.js";
import { stderrWrite } from "../../logger/stdout.js";

/**
 * Returns a handler that can be called multiple times but only executes once (fired guard).
 * On first call, scans running jobs and transitions them to awaiting-resume.
 * All I/O is best-effort — errors are swallowed to avoid masking original exit cause.
 */
export function createExitGuardHandler(repoRoot: string): () => void {
  let fired = false;
  return () => {
    if (fired) return;
    fired = true;
    void (async () => {
      try {
        const states = await JobStateStore.list(repoRoot);
        for (const state of states) {
          if (state.status !== "running") continue;
          try {
            stderrWrite(`[specrunner] warn: process exiting with running job ${state.jobId}, transitioning to awaiting-resume`);
            const store = new JobStateStore(state.jobId, repoRoot);
            await store.persist({
              ...state,
              status: "awaiting-resume",
              updatedAt: new Date().toISOString(),
            });
          } catch {
            // best-effort — ignore per-job errors
          }
        }
      } catch {
        // best-effort — ignore scan errors
      }
    })();
  };
}

/**
 * Register a beforeExit handler that transitions any running jobs to awaiting-resume.
 * Call once per process, early in the CLI entry point.
 */
export function registerExitGuard(repoRoot: string): void {
  process.on("beforeExit", createExitGuardHandler(repoRoot));
}
