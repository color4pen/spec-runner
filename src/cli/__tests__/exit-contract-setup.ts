/**
 * Shared mock setup for the exit contract harness.
 *
 * Both cli-exit-contract.test.ts (the snapshot test) and
 * exit-contract-generate.gen.ts (the fixture generator) declare the same
 * vi.mock() set and then use these helpers per case:
 *
 *   1. resetMockDefaults() — put EVERY mocked primitive back to its default
 *      implementation. Hoisted vi.mock() instances survive vi.resetModules()
 *      and vi.restoreAllMocks() does not touch vi.fn() implementations, so a
 *      per-case setup (e.g. `detectWorktree → isWorktree: true`) would
 *      otherwise leak into every later case.
 *   2. applySetup(setup) — apply the case-specific behaviour on top.
 *
 * Mocked modules are looked up with dynamic import so the same instance the
 * hoisted vi.mock() registered is returned regardless of module-cache resets.
 */

import { vi } from "vitest";
import type { SetupKind } from "./exit-contract-cases.js";

export async function resetMockDefaults(): Promise<void> {
  const { runArchive } = await import("../archive.js");
  vi.mocked(runArchive).mockReset().mockResolvedValue(0);

  const { detectWorktree } = await import("../../core/worktree/detection.js");
  vi.mocked(detectWorktree).mockReset().mockResolvedValue({ isWorktree: false });

  const { buildCommandContext } = await import("../command-context.js");
  vi.mocked(buildCommandContext).mockReset().mockResolvedValue({
    repoRoot: process.cwd(),
    invokerCwd: process.cwd(),
  });
}

export async function applySetup(setup: SetupKind): Promise<void> {
  if (setup.kind === "none") return;

  if (setup.kind === "archive-resolve") {
    const { runArchive } = await import("../archive.js");
    vi.mocked(runArchive).mockResolvedValue(setup.value);
    return;
  }

  if (setup.kind === "archive-reject-specrunner-error") {
    const { runArchive } = await import("../archive.js");
    // Dynamic import ensures errors.js is loaded before specrunner.ts, so instanceof works
    const { SpecRunnerError } = await import("../../errors.js");
    const err = new SpecRunnerError(setup.code, setup.hint, setup.message, setup.exitCode as 1 | 2);
    vi.mocked(runArchive).mockRejectedValue(err);
    return;
  }

  if (setup.kind === "archive-reject-plain") {
    const { runArchive } = await import("../archive.js");
    vi.mocked(runArchive).mockRejectedValue(new Error(setup.message));
    return;
  }

  if (setup.kind === "worktree") {
    const { detectWorktree } = await import("../../core/worktree/detection.js");
    vi.mocked(detectWorktree).mockResolvedValue({
      isWorktree: true,
      mainWorktreePath: setup.mainWorktreePath,
    });
    return;
  }

  if (setup.kind === "no-repo") {
    const { buildCommandContext } = await import("../command-context.js");
    vi.mocked(buildCommandContext).mockResolvedValue({
      repoRoot: null,
      invokerCwd: "/tmp/not-a-repo",
    });
    return;
  }
}
