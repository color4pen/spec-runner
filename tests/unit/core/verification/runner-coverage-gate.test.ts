/**
 * Unit tests for the coverage gate wiring in runner.ts (T-06).
 *
 * TC-RCG-01: phases path + coverage declared + all phases passed → gate runs, verdict reflects it
 * TC-RCG-02: commands path + coverage declared + all commands passed → gate runs, verdict reflects it
 * TC-RCG-03: phases path + coverage declared + prior phase failed → gate skipped
 * TC-RCG-04: commands path + coverage declared + prior command failed → gate skipped
 * TC-RCG-05: phases path + coverage NOT declared → skip note in verification-result.md, phase count unchanged
 * TC-RCG-06: commands path + coverage NOT declared → skip note in verification-result.md
 * TC-RCG-07: gate passes → overall verdict passed
 * TC-RCG-08: gate fails → overall verdict failed
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import { runVerification } from "../../../../src/core/verification/runner.js";

// Mock child_process.spawn to avoid real process execution.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock runTestCoveragePhase so phases path doesn't need real test-cases.md.
vi.mock("../../../../src/core/verification/test-coverage.js", () => ({
  runTestCoveragePhase: vi.fn(),
}));

// Mock runChangedLineCoverageGate to control its behaviour without real git/coverage.
vi.mock("../../../../src/core/verification/changed-line-coverage.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../src/core/verification/changed-line-coverage.js")>();
  return {
    ...original,
    runChangedLineCoverageGate: vi.fn(),
  };
});

import { runTestCoveragePhase } from "../../../../src/core/verification/test-coverage.js";
import { runChangedLineCoverageGate } from "../../../../src/core/verification/changed-line-coverage.js";
import * as childProcess from "node:child_process";

const TEST_SLUG = "test-slug";

let tmpDir: string;

function makeMockChild(exitCode: number, stdout = "", stderr = "") {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", exitCode);
  });
  return child;
}

function makePassedGateResult() {
  return {
    phase: "changed-line-coverage" as const,
    status: "passed" as const,
    stdout: "changed-line-coverage: passed",
    stderr: "",
    exitCode: 0,
    durationMs: 1,
  };
}

function makeFailedGateResult() {
  return {
    phase: "changed-line-coverage" as const,
    status: "failed" as const,
    stdout: "changed-line-coverage: failed",
    stderr: "",
    exitCode: 1,
    durationMs: 1,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "runner-cov-gate-test-"));
  await fs.mkdir(path.join(tmpDir, "specrunner", "changes", TEST_SLUG), { recursive: true });
  vi.clearAllMocks();

  // Default: test-coverage returns passed
  vi.mocked(runTestCoveragePhase).mockResolvedValue({
    status: "passed",
    missingTcIds: [],
    assertionlessTcIds: [],
    totalMustTcs: 0,
    foundTcIds: [],
    stdout: "test-coverage: passed",
  });

  // Default: gate returns passed
  vi.mocked(runChangedLineCoverageGate).mockResolvedValue(makePassedGateResult());

  // Default spawn: all scripts exit 0 (git show exits non-0 → integrity check skips)
  vi.mocked(childProcess.spawn).mockImplementation(
    (cmd: string, _args: readonly string[]) => {
      // git show for integrity check → exit 1 (no baseline, skip integrity)
      if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
      return makeMockChild(0) as ReturnType<typeof childProcess.spawn>;
    },
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function writePackageJson(scripts: Record<string, string>) {
  await fs.writeFile(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "pkg", scripts }),
    "utf-8",
  );
}

const COVERAGE_CONFIG = {
  command: "true",
  lcovPath: "coverage/lcov.info",
  include: ["src/**"],
};

// ---------------------------------------------------------------------------
// TC-RCG-01: phases path + coverage declared + all phases passed → gate runs
// ---------------------------------------------------------------------------

describe("TC-RCG-01: phases path + coverage declared + all phases passed → gate runs", () => {
  it("gate called once, result included in phases, verdict reflects gate", async () => {
    await writePackageJson({ build: "echo build", test: "echo test" });

    // Spawn: all scripts pass
    vi.mocked(childProcess.spawn).mockImplementation(
      (cmd: string, _args: readonly string[]) => {
        if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
        return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
      },
    );

    const result = await runVerification(TEST_SLUG, tmpDir, {
      coverage: COVERAGE_CONFIG,
    });

    expect(vi.mocked(runChangedLineCoverageGate)).toHaveBeenCalledOnce();
    const gatePhase = result.phases.find((p) => p.phase === "changed-line-coverage");
    expect(gatePhase).toBeDefined();
    expect(gatePhase?.status).toBe("passed");
    expect(result.verdict).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// TC-RCG-02: commands path + coverage declared + all commands passed → gate runs
// ---------------------------------------------------------------------------

describe("TC-RCG-02: commands path + coverage declared + all commands passed → gate runs", () => {
  it("gate called once after commands, result in phases, verdict reflects gate", async () => {
    vi.mocked(runChangedLineCoverageGate).mockResolvedValue(makePassedGateResult());

    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["true"],
      coverage: COVERAGE_CONFIG,
    });

    expect(vi.mocked(runChangedLineCoverageGate)).toHaveBeenCalledOnce();
    const gatePhase = result.phases.find((p) => p.phase === "changed-line-coverage");
    expect(gatePhase).toBeDefined();
    expect(gatePhase?.status).toBe("passed");
    expect(result.verdict).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// TC-RCG-03: phases path + prior phase failed → gate skipped (fail-fast)
// ---------------------------------------------------------------------------

describe("TC-RCG-03: phases path + prior phase failed → gate skipped", () => {
  it("gate not called, changed-line-coverage phase status is skipped", async () => {
    await writePackageJson({ build: "echo build", test: "echo test" });

    // build fails
    let callCount = 0;
    vi.mocked(childProcess.spawn).mockImplementation(
      (cmd: string, _args: readonly string[]) => {
        if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
        callCount++;
        // First sh -c call = build → fail; rest skip
        return makeMockChild(callCount === 1 ? 1 : 0) as ReturnType<typeof childProcess.spawn>;
      },
    );

    const result = await runVerification(TEST_SLUG, tmpDir, {
      coverage: COVERAGE_CONFIG,
    });

    expect(vi.mocked(runChangedLineCoverageGate)).not.toHaveBeenCalled();
    const gatePhase = result.phases.find((p) => p.phase === "changed-line-coverage");
    expect(gatePhase?.status).toBe("skipped");
    expect(result.verdict).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// TC-RCG-04: commands path + prior command failed → gate skipped
// ---------------------------------------------------------------------------

describe("TC-RCG-04: commands path + prior command failed → gate skipped", () => {
  it("gate not called, changed-line-coverage phase status is skipped", async () => {
    // Override spawn to make sh -c commands return exit 1 (simulating command failure).
    // The default beforeEach mock returns exit 0 for all non-git commands;
    // we need exit 1 here to simulate the "false" command failing.
    vi.mocked(childProcess.spawn).mockImplementation(
      (cmd: string, _args: readonly string[]) => {
        // sh -c commands → fail (simulates "false")
        if (cmd === "sh") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
        return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
      },
    );

    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["false"], // fails (sh -c false)
      coverage: COVERAGE_CONFIG,
    });

    expect(vi.mocked(runChangedLineCoverageGate)).not.toHaveBeenCalled();
    const gatePhase = result.phases.find((p) => p.phase === "changed-line-coverage");
    expect(gatePhase?.status).toBe("skipped");
    expect(result.verdict).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// TC-RCG-05: phases path + coverage NOT declared → skip note in result.md
// ---------------------------------------------------------------------------

describe("TC-RCG-05: phases path + coverage NOT declared → skip note in result.md, no extra phase", () => {
  it("skip note present, gate not called, phase count unchanged from before coverage feature", async () => {
    await writePackageJson({ build: "echo build" });

    vi.mocked(childProcess.spawn).mockImplementation(
      (cmd: string, _args: readonly string[]) => {
        if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
        return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
      },
    );

    const result = await runVerification(TEST_SLUG, tmpDir, undefined);

    // Gate should not be called
    expect(vi.mocked(runChangedLineCoverageGate)).not.toHaveBeenCalled();

    // No changed-line-coverage phase
    const gatePhase = result.phases.find((p) => p.phase === "changed-line-coverage");
    expect(gatePhase).toBeUndefined();

    // Skip note should appear in verification-result.md
    const resultPath = path.join(tmpDir, "specrunner", "changes", TEST_SLUG, "verification-result.md");
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("changed-line coverage gate: skipped");
    expect(content).toContain("verification.coverage");
  });
});

// ---------------------------------------------------------------------------
// TC-RCG-06: commands path + coverage NOT declared → skip note in result.md
// ---------------------------------------------------------------------------

describe("TC-RCG-06: commands path + coverage NOT declared → skip note in result.md", () => {
  it("skip note in verification-result.md when coverage not set", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["true"],
    });

    expect(vi.mocked(runChangedLineCoverageGate)).not.toHaveBeenCalled();

    const gatePhase = result.phases.find((p) => p.phase === "changed-line-coverage");
    expect(gatePhase).toBeUndefined();

    const resultPath = path.join(tmpDir, "specrunner", "changes", TEST_SLUG, "verification-result.md");
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("changed-line coverage gate: skipped");
  });
});

// ---------------------------------------------------------------------------
// TC-RCG-07: gate passes → overall verdict passed
// ---------------------------------------------------------------------------

describe("TC-RCG-07: gate passes → overall verdict passed", () => {
  it("commands path: single command passed, gate passed → verdict passed", async () => {
    vi.mocked(runChangedLineCoverageGate).mockResolvedValue(makePassedGateResult());

    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["true"],
      coverage: COVERAGE_CONFIG,
    });

    expect(result.verdict).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// TC-RCG-08: gate fails → overall verdict failed
// ---------------------------------------------------------------------------

describe("TC-RCG-08: gate fails → overall verdict failed", () => {
  it("commands path: command passed but gate failed → verdict failed", async () => {
    vi.mocked(runChangedLineCoverageGate).mockResolvedValue(makeFailedGateResult());

    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["true"],
      coverage: COVERAGE_CONFIG,
    });

    expect(result.verdict).toBe("failed");
    const gatePhase = result.phases.find((p) => p.phase === "changed-line-coverage");
    expect(gatePhase?.status).toBe("failed");
  });
});
