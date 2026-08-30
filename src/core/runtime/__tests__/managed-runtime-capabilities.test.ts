/**
 * T-14: Capability contract tests for ManagedRuntime (R2b).
 *
 * Proves that ManagedRuntime satisfies each capability interface introduced by
 * the R2b mutation/lifecycle split and that its no-op semantics are preserved.
 *
 * Strategy: use structural fakes that mirror the no-op methods implemented by
 * ManagedRuntime, then run them through the derive helpers. This avoids
 * instantiating the real ManagedRuntime (which requires live HTTP clients)
 * while still proving that the wiring is correct.
 *
 * TC-028: ManagedRuntime.buildDeps injects all R2b capability fields
 * Uses a real ManagedRuntime instance (with mock HTTP clients) to verify that
 * the changed DA lines in buildDeps() are executed and produce correct output.
 */

import { describe, it, expect, vi } from "vitest";
import type { StepArtifactLifecycleCapability, StepIoValidationCapability } from "../../step/step-capability.js";
import type { TerminalStateCapability, RoundGitEffectsCapability } from "../../pipeline/pipeline-capability.js";
import { deriveStepArtifactLifecycleCapability, deriveStepIoValidationCapability } from "../../step/step-capability.js";
import { deriveTerminalStateCapability, deriveRoundGitEffectsCapability } from "../../pipeline/pipeline-capability.js";
import { ManagedRuntime } from "../managed.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";

// ---------------------------------------------------------------------------
// Managed-runtime no-op source objects (mirror ManagedRuntime semantics).
// ---------------------------------------------------------------------------

function makeManagedStepArtifactSource() {
  return {
    // no-op: returns null (managed has no local worktree HEAD)
    async captureHeadSha(_cwd: string): Promise<string | null> { return null; },
    // no-op: managed has no local worktree artifacts
    async prepareStepArtifacts(_cwd: string, _slug: string, _stepName: string, _state: never): Promise<void> {},
    // no-op: managed does not commit/push from the CLI
    async finalizeStepArtifacts(): Promise<void> {},
    // optional — no-op
    async snapshotMainCheckoutGuard(): Promise<null> { return null; },
    // managed: returns hash:null for each ref (no local git worktree)
    async digestArtifacts(refs: { path: string }[]): Promise<{ path: string; hash: null }[]> {
      return refs.map((r) => ({ path: r.path, hash: null as null }));
    },
  };
}

function makeManagedStepIoSource() {
  return {
    async validateStepInputs(): Promise<void> {},
    async validateStepOutputs(): Promise<{ violations: [] }> { return { violations: [] }; },
    async verifyFindingRefs(refs: { file: string }[]): Promise<{ file: string }[]> { return refs; },
  };
}

function makeManagedTerminalStateSource() {
  return {
    // no-op: cloud agent manages branch state independently (D5)
    async commitFinalState(_cwd: string, _slug: string): Promise<void> {},
  };
}

function makeManagedRoundGitEffectsSource() {
  return {
    async captureHeadSha(_cwd: string): Promise<string | null> { return null; },
    // listWorktreeChanges: managed no-op returns { kind:"success", paths:[] }
    async listWorktreeChanges(_cwd: string): Promise<{ kind: "success"; paths: string[] }> {
      return { kind: "success" as const, paths: [] };
    },
    async commitRoundArtifacts(): Promise<void> {},
    async listChangedFiles(): Promise<{ kind: "success"; files: string[] }> {
      return { kind: "success" as const, files: [] };
    },
  };
}

// ---------------------------------------------------------------------------
// TC-T14-M01: StepArtifactLifecycleCapability — managed no-op source
// ---------------------------------------------------------------------------

describe("T-14: ManagedRuntime capability contracts — StepArtifactLifecycleCapability", () => {
  it("TC-T14-M01: deriveStepArtifactLifecycleCapability wires managed no-op source", () => {
    const source = makeManagedStepArtifactSource();
    const cap: StepArtifactLifecycleCapability = deriveStepArtifactLifecycleCapability(source);

    expect(typeof cap.captureHeadSha).toBe("function");
    expect(typeof cap.prepareStepArtifacts).toBe("function");
    expect(typeof cap.finalizeStepArtifacts).toBe("function");
  });

  it("TC-T14-M02: captureHeadSha returns null (managed no-op semantics)", async () => {
    const source = makeManagedStepArtifactSource();
    const cap = deriveStepArtifactLifecycleCapability(source);
    const result = await cap.captureHeadSha("/tmp");
    expect(result).toBeNull();
  });

  it("TC-T14-M03: prepareStepArtifacts resolves without side effects (no-op)", async () => {
    const source = makeManagedStepArtifactSource();
    const prepSpy = vi.spyOn(source, "prepareStepArtifacts");
    const cap = deriveStepArtifactLifecycleCapability(source);
    await cap.prepareStepArtifacts("/tmp", "my-slug", "implementer", {} as never);
    expect(prepSpy).toHaveBeenCalledOnce();
    expect(prepSpy).toHaveBeenCalledWith("/tmp", "my-slug", "implementer", {} as never);
  });

  it("TC-T14-M04: finalizeStepArtifacts resolves without side effects (no-op)", async () => {
    const source = makeManagedStepArtifactSource();
    const finalizeSpy = vi.spyOn(source, "finalizeStepArtifacts");
    const cap = deriveStepArtifactLifecycleCapability(source);
    await cap.finalizeStepArtifacts({} as never, {} as never, "/tmp", "my-slug", null, {} as never);
    expect(finalizeSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TC-T14-M05: StepIoValidationCapability
// ---------------------------------------------------------------------------

describe("T-14: ManagedRuntime capability contracts — StepIoValidationCapability", () => {
  it("TC-T14-M05: deriveStepIoValidationCapability wires managed source", () => {
    const source = makeManagedStepIoSource();
    const cap: StepIoValidationCapability = deriveStepIoValidationCapability(source);

    expect(typeof cap.validateStepInputs).toBe("function");
    expect(typeof cap.validateStepOutputs).toBe("function");
    expect(typeof cap.verifyFindingRefs).toBe("function");
  });

  it("TC-T14-M06: validateStepOutputs returns empty violations (no-op)", async () => {
    const source = makeManagedStepIoSource();
    const cap = deriveStepIoValidationCapability(source);
    const result = await cap.validateStepOutputs([], "/tmp", null);
    expect(result).toEqual({ violations: [] });
  });
});

// ---------------------------------------------------------------------------
// TC-T14-M07: TerminalStateCapability — managed no-op
// ---------------------------------------------------------------------------

describe("T-14: ManagedRuntime capability contracts — TerminalStateCapability", () => {
  it("TC-T14-M07: deriveTerminalStateCapability wires managed no-op commitFinalState", () => {
    const source = makeManagedTerminalStateSource();
    const cap: TerminalStateCapability = deriveTerminalStateCapability(source);

    expect(typeof cap.commitFinalState).toBe("function");
  });

  it("TC-T14-M08: commitFinalState is a no-op — resolves without side effects", async () => {
    const source = makeManagedTerminalStateSource();
    const spy = vi.spyOn(source, "commitFinalState");
    const cap = deriveTerminalStateCapability(source);
    await cap.commitFinalState("/tmp", "my-slug", {} as never);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("/tmp", "my-slug", {} as never);
  });
});

// ---------------------------------------------------------------------------
// TC-T14-M09: RoundGitEffectsCapability — managed no-op
// ---------------------------------------------------------------------------

describe("T-14: ManagedRuntime capability contracts — RoundGitEffectsCapability", () => {
  it("TC-T14-M09: deriveRoundGitEffectsCapability wires managed source with optional methods", () => {
    const source = makeManagedRoundGitEffectsSource();
    const cap: RoundGitEffectsCapability = deriveRoundGitEffectsCapability(source);

    expect(typeof cap.captureHeadSha).toBe("function");
    expect(typeof cap.listChangedFiles).toBe("function");
    // Optional methods provided by this source → present in result.
    expect(typeof cap.listWorktreeChanges).toBe("function");
    expect(typeof cap.commitRoundArtifacts).toBe("function");
  });

  it("TC-T14-M10: listWorktreeChanges returns { kind:'success', paths:[] } (managed no-op)", async () => {
    const source = makeManagedRoundGitEffectsSource();
    const cap = deriveRoundGitEffectsCapability(source);
    const result = await cap.listWorktreeChanges!("/tmp");
    expect(result).toEqual({ kind: "success", paths: [] });
  });

  it("TC-T14-M11: commitRoundArtifacts is a no-op — resolves without side effects", async () => {
    const source = makeManagedRoundGitEffectsSource();
    const spy = vi.spyOn(source, "commitRoundArtifacts");
    const cap = deriveRoundGitEffectsCapability(source);
    await cap.commitRoundArtifacts!([], "/tmp", "main", "coordinator", "slug", {} as never, undefined);
    expect(spy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TC-028: ManagedRuntime.buildDeps injects all R2b capability fields
//
// Uses a real ManagedRuntime instance (mock HTTP clients only — no network I/O)
// to verify that the changed DA lines in buildDeps() execute and produce the
// correct capability-shaped objects.
// ---------------------------------------------------------------------------

function makeMockManagedRuntime(): ManagedRuntime {
  const mockGithubClient: GitHubClient = {
    verifyBranch: vi.fn(),
    verifyPath: vi.fn(),
    getRawFile: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
  } as unknown as GitHubClient;

  const mockSessionClient: SessionClient = {
    createSession: vi.fn(),
    sendUserMessage: vi.fn(),
    pollUntilComplete: vi.fn(),
    streamEvents: vi.fn(),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionClient;

  return new ManagedRuntime(
    "/repo",
    mockSessionClient,
    mockGithubClient,
    { owner: "testowner", name: "testrepo" },
    undefined,
    "fake-token",
  );
}

describe("TC-028: ManagedRuntime.buildDeps injects all R2b capability fields", () => {
  it("buildDeps returns PipelineDeps with all four R2b capability fields present", () => {
    const runtime = makeMockManagedRuntime();
    const config = { version: 1 as const, agents: {} };
    const request = { type: "new-feature" as const, title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false };

    const deps = runtime.buildDeps(config, request, "test-slug", { cwd: "/repo" });

    // Verify all four R2b capability fields are present and have correct shape.
    expect(typeof deps.stepArtifact?.captureHeadSha).toBe("function");
    expect(typeof deps.stepArtifact?.prepareStepArtifacts).toBe("function");
    expect(typeof deps.stepArtifact?.finalizeStepArtifacts).toBe("function");
    expect(typeof deps.stepIo?.validateStepInputs).toBe("function");
    expect(typeof deps.stepIo?.validateStepOutputs).toBe("function");
    expect(typeof deps.stepIo?.verifyFindingRefs).toBe("function");
    expect(typeof deps.terminalState?.commitFinalState).toBe("function");
    expect(typeof deps.roundGitEffects?.captureHeadSha).toBe("function");
    expect(typeof deps.roundGitEffects?.listChangedFiles).toBe("function");
    // changedFiles adapter
    expect(typeof deps.changedFiles?.canDeriveChangedFiles).toBe("function");
    expect(typeof deps.changedFiles?.listChangedFiles).toBe("function");
    // commit inspection + revision content
    expect(typeof deps.commitInspection?.listCommitChangedFiles).toBe("function");
    expect(typeof deps.revisionContent?.readRevisionContent).toBe("function");
  });

  it("buildDeps no-op: captureHeadSha returns null (managed has no local worktree)", async () => {
    const runtime = makeMockManagedRuntime();
    const config = { version: 1 as const, agents: {} };
    const request = { type: "new-feature" as const, title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false };

    const deps = runtime.buildDeps(config, request, "test-slug", { cwd: "/repo" });
    const sha = await deps.stepArtifact?.captureHeadSha("/repo");
    expect(sha).toBeNull();
  });

  it("buildDeps no-op: changedFiles.canDeriveChangedFiles returns false (no local worktree)", () => {
    const runtime = makeMockManagedRuntime();
    const config = { version: 1 as const, agents: {} };
    const request = { type: "new-feature" as const, title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false };

    const deps = runtime.buildDeps(config, request, "test-slug", { cwd: "/repo" });
    expect(deps.changedFiles?.canDeriveChangedFiles?.()).toBe(false);
  });
});
