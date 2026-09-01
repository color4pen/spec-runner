/**
 * Command lifecycle contract tests for LocalRuntime and ManagedRuntime (T-12).
 *
 * TC-027: assertProviderReadiness の Local / Managed 差異を検証する
 * TC-028: assertNoDuplicateLiveJob の Local / Managed 差異を検証する
 * TC-029: reloadJobState の Local / Managed 差異を検証する
 * TC-030: canDeriveChangedFiles の Local / Managed 差異を検証する
 * TC-013: LocalRuntime が RuntimeFacade を構造的に満たす (compile-time)
 * TC-014: ManagedRuntime が RuntimeFacade を構造的に満たす (compile-time)
 */

import { describe, it, expect } from "vitest";
import { LocalRuntime } from "../local.js";
import { ManagedRuntime } from "../managed.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";
import type { RuntimeFacade } from "../../port/command-runtime.js";
import type { WorkspaceContext } from "../../port/runtime-strategy.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeLocalRuntime(): LocalRuntime {
  return new LocalRuntime({
    cwd: "/tmp/fake-cwd",
    githubClient: {} as GitHubClient,
  });
}

function makeManagedRuntime(): ManagedRuntime {
  return new ManagedRuntime(
    "/tmp/fake-cwd",
    {} as SessionClient,
    {} as GitHubClient,
    { owner: "testowner", name: "testrepo" } as OriginInfo,
    undefined,
    "fake-token",
  );
}

// ---------------------------------------------------------------------------
// TC-013 / TC-014: Structural type assertions (compile-time)
//
// If LocalRuntime or ManagedRuntime does not satisfy RuntimeFacade, the
// variable assignment below is a TypeScript compile error (tsc --noEmit).
// These assignments serve as compile-time contract proofs.
// ---------------------------------------------------------------------------

describe("TC-013: LocalRuntime が RuntimeFacade を構造的に満たす", () => {
  it("TC-013: LocalRuntime インスタンスが RuntimeFacade として代入できる", () => {
    const runtime = makeLocalRuntime();
    // Compile-time type assertion: if LocalRuntime does not satisfy RuntimeFacade,
    // this line causes a TypeScript type error.
    const _facade: RuntimeFacade = runtime;
    expect(typeof _facade.assertProviderReadiness).toBe("function");
    expect(typeof _facade.assertNoDuplicateLiveJob).toBe("function");
    expect(typeof _facade.bootstrapJob).toBe("function");
    expect(typeof _facade.setupWorkspace).toBe("function");
    expect(typeof _facade.reloadJobState).toBe("function");
    expect(typeof _facade.buildDeps).toBe("function");
    expect(typeof _facade.canDeriveChangedFiles).toBe("function");
  });
});

describe("TC-014: ManagedRuntime が RuntimeFacade を構造的に満たす", () => {
  it("TC-014: ManagedRuntime インスタンスが RuntimeFacade として代入できる", () => {
    const runtime = makeManagedRuntime();
    // Compile-time type assertion: if ManagedRuntime does not satisfy RuntimeFacade,
    // this line causes a TypeScript type error.
    const _facade: RuntimeFacade = runtime;
    expect(typeof _facade.assertProviderReadiness).toBe("function");
    expect(typeof _facade.assertNoDuplicateLiveJob).toBe("function");
    expect(typeof _facade.bootstrapJob).toBe("function");
    expect(typeof _facade.setupWorkspace).toBe("function");
    expect(typeof _facade.reloadJobState).toBe("function");
    expect(typeof _facade.buildDeps).toBe("function");
    expect(typeof _facade.canDeriveChangedFiles).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-027: assertProviderReadiness の Local / Managed 差異
// ---------------------------------------------------------------------------

describe("TC-027: assertProviderReadiness の Local / Managed 差異を検証する", () => {
  it("TC-027-local-ready: LocalRuntime は probe を呼び出し、ready のとき resolve する", async () => {
    const probeCallCount = { n: 0 };
    const readyProbe = async (_env: Record<string, string | undefined>) => {
      probeCallCount.n++;
      return { kind: "ready" as const };
    };
    const runtime = new LocalRuntime({
      cwd: "/tmp/fake-cwd",
      githubClient: {} as GitHubClient,
      providerReadinessProbe: readyProbe,
    });

    await expect(
      runtime.assertProviderReadiness({}),
    ).resolves.toBeUndefined();

    expect(probeCallCount.n).toBe(1);
  });

  it("TC-027-local-not-ready: LocalRuntime は probe が not-ready を返すとき throw する", async () => {
    const notReadyProbe = async (_env: Record<string, string | undefined>) => {
      return { kind: "auth-missing" as const, detail: "test" };
    };
    const runtime = new LocalRuntime({
      cwd: "/tmp/fake-cwd",
      githubClient: {} as GitHubClient,
      providerReadinessProbe: notReadyProbe,
    });

    await expect(
      runtime.assertProviderReadiness({}),
    ).rejects.toThrow();
  });

  it("TC-027-managed-noop: ManagedRuntime の assertProviderReadiness は no-op で resolve する", async () => {
    const runtime = makeManagedRuntime();

    await expect(
      runtime.assertProviderReadiness({}),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-028: assertNoDuplicateLiveJob の Local / Managed 差異
// ---------------------------------------------------------------------------

describe("TC-028: assertNoDuplicateLiveJob の Local / Managed 差異を検証する", () => {
  it("TC-028-local: LocalRuntime は既存 job がないとき resolve する", async () => {
    const runtime = makeLocalRuntime();

    // Fresh dir with no existing job state — should resolve without error.
    await expect(
      runtime.assertNoDuplicateLiveJob("/tmp/no-such-dir", "test-slug"),
    ).resolves.toBeUndefined();
  });

  it("TC-028-managed: ManagedRuntime は既存 job がないとき resolve する", async () => {
    const runtime = makeManagedRuntime();

    // Both LocalRuntime and ManagedRuntime call assertSlugUnoccupied.
    // With a fresh dir and no existing job state, both resolve without error.
    await expect(
      runtime.assertNoDuplicateLiveJob("/tmp/no-such-dir", "test-slug"),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-029: reloadJobState の Local / Managed 差異
// ---------------------------------------------------------------------------

describe("TC-029: reloadJobState の Local / Managed 差異を検証する", () => {
  it("TC-029-local: LocalRuntime は state store から読み込もうとする (store が存在しないとき throw)", async () => {
    const runtime = makeLocalRuntime();
    const workspace: WorkspaceContext = {
      cwd: "/tmp/no-such-dir",
    };

    // LocalRuntime.reloadJobState attempts to read from the store (JobStateStore.load()).
    // When the state file doesn't exist, it throws (fail-closed behavior).
    await expect(
      runtime.reloadJobState("fake-job-id", "test-slug", workspace),
    ).rejects.toThrow();
  });

  it("TC-029-managed: ManagedRuntime.reloadJobState は throw する", async () => {
    const runtime = makeManagedRuntime();
    const workspace: WorkspaceContext = {
      cwd: "/tmp/fake-cwd",
    };

    // ManagedRuntime new-run path: existingWorktreePath === undefined triggers reloadJobState,
    // which throws "not implemented for managed runtime". This is the expected behavior
    // (fail-closed) until managed runtime store topology is verified.
    // Note: managed resume path skips reloadJobState (existingWorktreePath !== undefined).
    await expect(
      runtime.reloadJobState("fake-job-id", "test-slug", workspace),
    ).rejects.toThrow("reloadJobState not implemented for managed runtime");
  });
});

// ---------------------------------------------------------------------------
// TC-030: canDeriveChangedFiles の Local / Managed 差異
// ---------------------------------------------------------------------------

describe("TC-030: canDeriveChangedFiles の Local / Managed 差異を検証する", () => {
  it("TC-030-local: LocalRuntime.canDeriveChangedFiles() は boolean を返す", () => {
    const runtime = makeLocalRuntime();
    const result = runtime.canDeriveChangedFiles();
    expect(typeof result).toBe("boolean");
    // LocalRuntime always has a local worktree — returns true.
    expect(result).toBe(true);
  });

  it("TC-030-managed: ManagedRuntime.canDeriveChangedFiles() は false を返す", () => {
    const runtime = makeManagedRuntime();
    const result = runtime.canDeriveChangedFiles();
    expect(result).toBe(false);
  });
});
