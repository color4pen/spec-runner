/**
 * Unit tests for src/cli/command-context.ts
 *
 * TC-001: single resolution passed to handler
 *         (spec.md > Requirement: Repo root is resolved once at dispatch and injected as context > Scenario: single resolution passed to handler)
 * TC-002: resolution outside a repository yields null without throwing
 *         (spec.md > Requirement: Repo root is resolved once at dispatch and injected as context > Scenario: resolution outside a repository yields null without throwing)
 * TC-011: command inside a job worktree receives the enclosing worktree root
 *         (spec.md > Requirement: worktree semantics are preserved > Scenario: command inside a job worktree uses the enclosing worktree root)
 * TC-012: buildCommandContext returns correct repoRoot and invokerCwd
 *         (tasks.md > T-01: Introduce CommandContext + dispatch-time single repo-root resolution)
 * TC-013: requiresRepo: false command proceeds outside a repository
 *         (tasks.md > T-01: Introduce CommandContext + dispatch-time single repo-root resolution)
 * TC-021: CommandContext module exports the correct interface shape
 *         (tasks.md > T-07: Full verification)
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Import the module under test — RED until src/cli/command-context.ts exists
// ---------------------------------------------------------------------------

type BuildCommandContextFn = (
  invokerCwd: string,
  resolveFn?: (cwd: string) => Promise<string | null>,
) => Promise<{ repoRoot: string | null; invokerCwd: string }>;

// We import dynamically so failures are per-test rather than file-level
// (allows partial GREEN/RED breakdown that's easier to diagnose).
async function importCommandContext(): Promise<{ buildCommandContext: BuildCommandContextFn }> {
  return import("../../../src/cli/command-context.js") as Promise<{
    buildCommandContext: BuildCommandContextFn;
  }>;
}

// ---------------------------------------------------------------------------
// TC-001: single resolution passed to handler
// ---------------------------------------------------------------------------

describe("TC-001: buildCommandContext — resolver is called exactly once per invocation", () => {
  it("calls the resolver once and returns repoRoot equal to the resolved value", async () => {
    const { buildCommandContext } = await importCommandContext();

    const mockResolver = vi.fn().mockResolvedValue("/repo/root");

    const ctx = await buildCommandContext("/repo/root/src", mockResolver);

    // Resolver called exactly once
    expect(mockResolver).toHaveBeenCalledTimes(1);
    // invokerCwd is passed as the first arg to the resolver
    expect(mockResolver).toHaveBeenCalledWith("/repo/root/src");
    // repoRoot is the resolved value
    expect(ctx.repoRoot).toBe("/repo/root");
  });
});

// ---------------------------------------------------------------------------
// TC-002: resolution outside a repository yields null without throwing
// ---------------------------------------------------------------------------

describe("TC-002: buildCommandContext — outside a repository resolves to null without throwing", () => {
  it("returns null repoRoot when resolver returns null, and does not throw", async () => {
    const { buildCommandContext } = await importCommandContext();

    const nullResolver = vi.fn().mockResolvedValue(null);

    let ctx: Awaited<ReturnType<BuildCommandContextFn>> | undefined;
    await expect(async () => {
      ctx = await buildCommandContext("/tmp/not-a-repo", nullResolver);
    }).not.toThrow();

    expect(ctx).toBeDefined();
    expect(ctx!.repoRoot).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-012: buildCommandContext returns correct repoRoot and invokerCwd
// ---------------------------------------------------------------------------

describe("TC-012: buildCommandContext returns correct repoRoot and invokerCwd", () => {
  it("GIVEN resolver returning '/repo' WHEN invoked with '/repo/src' THEN ctx has repoRoot='/repo' and invokerCwd='/repo/src'", async () => {
    const { buildCommandContext } = await importCommandContext();

    const injectedResolver = vi.fn().mockResolvedValue("/repo");

    const ctx = await buildCommandContext("/repo/src", injectedResolver);

    expect(ctx.repoRoot).toBe("/repo");
    expect(ctx.invokerCwd).toBe("/repo/src");
  });

  it("invokerCwd is preserved as-is even when it differs from repoRoot", async () => {
    const { buildCommandContext } = await importCommandContext();

    const injectedResolver = vi.fn().mockResolvedValue("/workspace/my-project");
    const subdir = "/workspace/my-project/packages/cli";

    const ctx = await buildCommandContext(subdir, injectedResolver);

    expect(ctx.repoRoot).toBe("/workspace/my-project");
    expect(ctx.invokerCwd).toBe(subdir);
  });
});

// ---------------------------------------------------------------------------
// TC-011: command inside a job worktree receives the enclosing worktree root
// ---------------------------------------------------------------------------

describe("TC-011: worktree semantics — enclosing worktree root is the resolved root", () => {
  it("GIVEN cwd is inside a job worktree WHEN resolver returns the enclosing worktree root THEN ctx.repoRoot equals the worktree root", async () => {
    const { buildCommandContext } = await importCommandContext();

    // Simulate being inside a specrunner job worktree:
    // the cwd is a linked worktree directory, but resolveRepoRoot returns
    // the MAIN worktree root (via git rev-parse --show-toplevel).
    const worktreeCwd = "/home/user/project/.git/specrunner-worktrees/my-slug-abc123";
    const enclosingRoot = "/home/user/project";

    const worktreeResolver = vi.fn().mockResolvedValue(enclosingRoot);

    const ctx = await buildCommandContext(worktreeCwd, worktreeResolver);

    // The enclosing worktree root is returned, not the worktree cwd itself
    expect(ctx.repoRoot).toBe(enclosingRoot);
    // The invokerCwd is preserved as the actual cwd
    expect(ctx.invokerCwd).toBe(worktreeCwd);
  });
});

// ---------------------------------------------------------------------------
// TC-013: requiresRepo: false command proceeds outside a repository
// ---------------------------------------------------------------------------

describe("TC-013: requiresRepo false — command proceeds even when repoRoot is null", () => {
  it("GIVEN requiresRepo: false command AND resolver returns null THEN dispatch invokes the handler without error", async () => {
    // This test verifies that a command registered without requiresRepo (or with
    // requiresRepo: false) is NOT blocked when ctx.repoRoot is null.
    //
    // We test this by checking that buildCommandContext returns a valid context
    // (ctx.repoRoot === null) and that nothing in the context construction itself
    // prevents handler invocation for non-repo commands.

    const { buildCommandContext } = await importCommandContext();

    const nullResolver = vi.fn().mockResolvedValue(null);

    const ctx = await buildCommandContext("/tmp/anywhere", nullResolver);

    // The context is built successfully — handlers that do NOT require repo
    // may proceed; ctx.repoRoot is null but not an error by itself.
    expect(ctx.repoRoot).toBeNull();
    expect(ctx.invokerCwd).toBe("/tmp/anywhere");
  });
});

// ---------------------------------------------------------------------------
// TC-021: CommandContext module exports the expected interface
// ---------------------------------------------------------------------------

describe("TC-021: CommandContext module exports CommandContext interface and buildCommandContext function", () => {
  it("exports buildCommandContext as a function", async () => {
    const mod = await importCommandContext();
    expect(typeof mod.buildCommandContext).toBe("function");
  });

  it("buildCommandContext returns an object with repoRoot and invokerCwd properties", async () => {
    const { buildCommandContext } = await importCommandContext();
    const ctx = await buildCommandContext("/fake", vi.fn().mockResolvedValue(null));
    expect(Object.keys(ctx)).toContain("repoRoot");
    expect(Object.keys(ctx)).toContain("invokerCwd");
  });
});
