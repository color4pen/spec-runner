/**
 * Unit tests for DeltaSpecValidationStep
 *
 * TC-DSV-01: validator returns ok: true → step verdict "approved"
 * TC-DSV-02: validator returns violations → step verdict "needs-fix", result file written
 * TC-DSV-03: result file format is parseable as delta-spec-fixer input
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { DeltaSpecValidationStep } from "../../../src/core/step/delta-spec-validation.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { deltaSpecValidationResultPath, changeFolderPath } from "../../../src/util/paths.js";

// Mock the validator module so we can control its output
vi.mock("../../../src/core/spec/delta-spec-validator.js", () => ({
  validateDeltaSpecPaths: vi.fn(),
}));

import { validateDeltaSpecPaths } from "../../../src/core/spec/delta-spec-validator.js";
const mockValidate = validateDeltaSpecPaths as ReturnType<typeof vi.fn>;

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "delta-spec-validation-test-"));
  // Pre-create the change folder in tempDir so the step can write there
  await fs.mkdir(path.join(tempDir, changeFolderPath("test-slug")), { recursive: true });
  vi.clearAllMocks();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "delta-spec-validation",
    status: "running",
    branch: "feat/test-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(slug: string = "test-slug"): StepDeps & { spawn: SpawnFn; cwd: string } {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug, baseBranch: "main", content: "content", enabled: [] },
    slug,
    cwd: tempDir,
    spawn: (async () => ({ exitCode: 0, stdout: "", stderr: "" })) as SpawnFn,
  };
}

// ---------------------------------------------------------------------------
// TC-DSV-01: validator → ok: true → verdict "approved"
// ---------------------------------------------------------------------------
describe("TC-DSV-01: validator returns ok: true → verdict 'approved'", () => {
  it("step kind is 'cli' and name is 'delta-spec-validation'", () => {
    expect(DeltaSpecValidationStep.kind).toBe("cli");
    expect(DeltaSpecValidationStep.name).toBe("delta-spec-validation");
  });

  it("run() writes result file with 'approved' verdict when validator returns ok: true", async () => {
    mockValidate.mockResolvedValue({ ok: true });

    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    await DeltaSpecValidationStep.run(state, deps);

    const resultAbsPath = path.join(tempDir, deltaSpecValidationResultPath("test-slug"));
    const content = await fs.readFile(resultAbsPath, "utf-8");
    expect(content).toContain("## Verdict: approved");
    expect(content).not.toContain("needs-fix");
  });

  it("parseResult returns verdict 'approved' for approved content", () => {
    const content = "# Delta Spec Validation Result\n\n## Verdict: approved\n\nAll files conform.\n";
    const deps = makeMinimalDeps();
    const result = DeltaSpecValidationStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
    expect(result.findingsPath).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-DSV-02: validator → violations → verdict "needs-fix", result file has violations
// ---------------------------------------------------------------------------
describe("TC-DSV-02: validator returns violations → verdict 'needs-fix' + result file written", () => {
  it("run() writes result file with violations table when validator returns violations", async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      violations: [
        {
          path: "/work/specrunner/changes/test-slug/delta-spec.md",
          reason: "legacy-flat-file",
          suggested: "Move to specs/<capability>/spec.md",
        },
      ],
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    await DeltaSpecValidationStep.run(state, deps);

    const resultAbsPath = path.join(tempDir, deltaSpecValidationResultPath("test-slug"));
    const content = await fs.readFile(resultAbsPath, "utf-8");
    expect(content).toContain("## Verdict: needs-fix");
    expect(content).toContain("legacy-flat-file");
  });

  it("parseResult returns verdict 'needs-fix' for needs-fix content", () => {
    const content = "# Delta Spec Validation Result\n\n## Verdict: needs-fix\n\n## Violations\n\n...";
    const deps = makeMinimalDeps();
    const result = DeltaSpecValidationStep.parseResult(content, deps);
    expect(result.verdict).toBe("needs-fix");
    expect(result.findingsPath).toBe(deltaSpecValidationResultPath("test-slug"));
  });

  it("parseResult sets findingsPath to result file path on needs-fix", () => {
    const content = "# Delta Spec Validation Result\n\n## Verdict: needs-fix\n\n## Violations\n\n...";
    const deps = makeMinimalDeps("my-change");
    const result = DeltaSpecValidationStep.parseResult(content, deps);
    expect(result.findingsPath).toBe(deltaSpecValidationResultPath("my-change"));
  });
});

// ---------------------------------------------------------------------------
// TC-DSV-03: result file format is parseable for delta-spec-fixer input
// ---------------------------------------------------------------------------
describe("TC-DSV-03: result file format is parseable as delta-spec-fixer input", () => {
  it("result file contains Violations table with path, reason, and suggested fix columns", async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      violations: [
        {
          path: "/work/specrunner/changes/test-slug/delta-spec/cap.md",
          reason: "legacy-flat-dir",
          suggested: "Move to specs/cap/spec.md",
        },
        {
          path: "/work/specrunner/changes/test-slug/specs/cap/spec.md",
          reason: "missing-requirements-section",
          suggested: "Add ## ADDED Requirements section",
        },
      ],
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    await DeltaSpecValidationStep.run(state, deps);

    const resultAbsPath = path.join(tempDir, deltaSpecValidationResultPath("test-slug"));
    const content = await fs.readFile(resultAbsPath, "utf-8");

    // Should have the table header
    expect(content).toContain("| Path | Reason | Suggested Fix |");
    // Should have both violations
    expect(content).toContain("legacy-flat-dir");
    expect(content).toContain("missing-requirements-section");
    // Should have how-to-fix section
    expect(content).toContain("## How to Fix");
  });

  it("resultFilePath returns correct path", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const filePath = DeltaSpecValidationStep.resultFilePath(state, deps);
    expect(filePath).toBe(deltaSpecValidationResultPath("my-change"));
  });
});
