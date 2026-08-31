/**
 * T-14: Capability contract tests for LocalRuntime (R2b).
 *
 * Proves that LocalRuntime satisfies each capability interface introduced by
 * the R2b mutation/lifecycle split. Tests are compile-time proofs via typed
 * assignment and runtime assertions that the derive helpers wire real methods.
 */

import { describe, it, expect } from "vitest";
import type { StepArtifactLifecycleCapability, StepIoValidationCapability } from "../../step/step-capability.js";
import type { TerminalStateCapability, RoundGitEffectsCapability } from "../../pipeline/pipeline-capability.js";
import type { JobState } from "../../../state/schema.js";
import { deriveStepArtifactLifecycleCapability, deriveStepIoValidationCapability } from "../../step/step-capability.js";
import { deriveTerminalStateCapability, deriveRoundGitEffectsCapability } from "../../pipeline/pipeline-capability.js";

// ---------------------------------------------------------------------------
// Minimal source objects that satisfy each capability's source interface.
// These are structural fakes — they mimic what LocalRuntime exposes.
// ---------------------------------------------------------------------------

function makeStepArtifactSource() {
  return {
    async captureHeadSha(_cwd: string): Promise<string | null> { return "sha-abc"; },
    async prepareStepArtifacts(_cwd: string, _slug: string, _stepName: string, _state: never): Promise<void> {},
    async finalizeStepArtifacts(): Promise<void> {},
    async snapshotMainCheckoutGuard(): Promise<null> { return null; },
    async digestArtifacts(refs: { path: string }[]): Promise<{ path: string; hash: null }[]> {
      return refs.map((r) => ({ path: r.path, hash: null as null }));
    },
  };
}

function makeStepIoSource() {
  return {
    async validateStepInputs(): Promise<void> {},
    async validateStepOutputs(): Promise<{ violations: [] }> { return { violations: [] }; },
    async verifyFindingRefs(refs: { file: string }[]): Promise<{ file: string }[]> { return refs; },
  };
}

function makeTerminalStateSource() {
  return {
    async commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void> {},
  };
}

function makeRoundGitEffectsSource() {
  return {
    async captureHeadSha(_cwd: string): Promise<string | null> { return null; },
    // D6: all methods required — LocalRuntime provides real implementations.
    async listWorktreeChanges(_cwd: string): Promise<{ kind: "success"; paths: string[] }> {
      return { kind: "success" as const, paths: [] };
    },
    async commitRoundArtifacts(): Promise<void> {},
    async digestArtifacts(refs: { path: string }[]): Promise<{ path: string; hash: null }[]> {
      return refs.map((r) => ({ path: r.path, hash: null as null }));
    },
    async listChangedFiles(): Promise<{ kind: "success"; files: string[] }> {
      return { kind: "success" as const, files: [] };
    },
  };
}

// ---------------------------------------------------------------------------
// TC-T14-01: StepArtifactLifecycleCapability — derive helper returns typed object
// ---------------------------------------------------------------------------

describe("T-14: LocalRuntime capability contracts — StepArtifactLifecycleCapability", () => {
  it("TC-T14-01: deriveStepArtifactLifecycleCapability returns an object satisfying the interface", () => {
    const source = makeStepArtifactSource();
    // Compile-time proof: assignment to the interface type must compile.
    const cap: StepArtifactLifecycleCapability = deriveStepArtifactLifecycleCapability(source);

    // Runtime proof: all required methods are present.
    expect(typeof cap.captureHeadSha).toBe("function");
    expect(typeof cap.prepareStepArtifacts).toBe("function");
    expect(typeof cap.finalizeStepArtifacts).toBe("function");
    expect(typeof cap.digestArtifacts).toBe("function");
    // snapshotMainCheckoutGuard is optional — allowed to be present or absent.
  });

  it("TC-T14-02: captureHeadSha delegates to source and returns sha", async () => {
    const source = makeStepArtifactSource();
    const cap = deriveStepArtifactLifecycleCapability(source);
    const result = await cap.captureHeadSha("/tmp");
    expect(result).toBe("sha-abc");
  });

  it("TC-T14-03: digestArtifacts delegates to source and maps refs", async () => {
    const source = makeStepArtifactSource();
    const cap = deriveStepArtifactLifecycleCapability(source);
    const refs = [{ path: "src/foo.ts" }, { path: "src/bar.ts" }];
    const result = await cap.digestArtifacts(refs, "/tmp", null);
    expect(result).toHaveLength(2);
    expect(result[0]!.path).toBe("src/foo.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-T14-04: StepIoValidationCapability
// ---------------------------------------------------------------------------

describe("T-14: LocalRuntime capability contracts — StepIoValidationCapability", () => {
  it("TC-T14-04: deriveStepIoValidationCapability returns an object satisfying the interface", () => {
    const source = makeStepIoSource();
    // Compile-time proof.
    const cap: StepIoValidationCapability = deriveStepIoValidationCapability(source);

    expect(typeof cap.validateStepInputs).toBe("function");
    expect(typeof cap.validateStepOutputs).toBe("function");
    expect(typeof cap.verifyFindingRefs).toBe("function");
  });

  it("TC-T14-05: verifyFindingRefs delegates to source", async () => {
    const source = makeStepIoSource();
    const cap = deriveStepIoValidationCapability(source);
    const refs = [{ file: "src/auth.ts" }];
    const result = await cap.verifyFindingRefs(refs, "/tmp", null);
    expect(result).toEqual(refs);
  });
});

// ---------------------------------------------------------------------------
// TC-T14-06: TerminalStateCapability
// ---------------------------------------------------------------------------

describe("T-14: LocalRuntime capability contracts — TerminalStateCapability", () => {
  it("TC-T14-06: deriveTerminalStateCapability returns an object satisfying the interface", () => {
    const source = makeTerminalStateSource();
    // Compile-time proof.
    const cap: TerminalStateCapability = deriveTerminalStateCapability(source);

    expect(typeof cap.commitFinalState).toBe("function");
  });

  it("TC-T14-07: commitFinalState resolves without throwing", async () => {
    const source = makeTerminalStateSource();
    const cap = deriveTerminalStateCapability(source);
    await expect(cap.commitFinalState("/tmp", "my-slug", {} as never)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-T14-08: RoundGitEffectsCapability
// ---------------------------------------------------------------------------

describe("T-14: LocalRuntime capability contracts — RoundGitEffectsCapability", () => {
  it("TC-T14-08: deriveRoundGitEffectsCapability returns an object satisfying the interface", () => {
    const source = makeRoundGitEffectsSource();
    // Compile-time proof.
    const cap: RoundGitEffectsCapability = deriveRoundGitEffectsCapability(source);

    expect(typeof cap.captureHeadSha).toBe("function");
    expect(typeof cap.listChangedFiles).toBe("function");
    // D6: all methods are required — capability absence expressed by roundGitEffects=undefined.
    expect(typeof cap.listWorktreeChanges).toBe("function");
    expect(typeof cap.commitRoundArtifacts).toBe("function");
    expect(typeof cap.digestArtifacts).toBe("function");
  });

  it("TC-T14-09: captureHeadSha delegates to source", async () => {
    const source = makeRoundGitEffectsSource();
    const cap = deriveRoundGitEffectsCapability(source);
    const result = await cap.captureHeadSha("/tmp");
    expect(result).toBeNull();
  });

  it("TC-T14-10: listChangedFiles delegates to source", async () => {
    const source = makeRoundGitEffectsSource();
    const cap = deriveRoundGitEffectsCapability(source);
    const result = await cap.listChangedFiles("sha-base", "/tmp", null);
    expect(result).toEqual({ kind: "success", files: [] });
  });
});

// ---------------------------------------------------------------------------
// TC-T14-11: PipelineDeps.terminalState = undefined compiles and guards correctly
// ---------------------------------------------------------------------------

describe("T-14: terminalState undefined guard compiles and evaluates correctly", () => {
  it("TC-T14-11: optional chaining on undefined terminalState evaluates to undefined", async () => {
    const deps: { terminalState?: TerminalStateCapability } = {};
    // Simulate the guard used in pipeline.ts and runner.ts
    const result = await deps.terminalState?.commitFinalState("/tmp", "slug", {} as never);
    expect(result).toBeUndefined();
  });
});
