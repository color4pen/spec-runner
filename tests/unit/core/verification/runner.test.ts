/**
 * Unit tests for runVerification
 *
 * TC-005: 全 phase passed シナリオ (updated: now 6 phases)
 * TC-006: 1 phase failed の fail-fast (typecheck 失敗例)
 * TC-007: 複数 phase failed（最初の失敗でのみ break）
 * TC-008: 全 phase skipped → verdict failed
 * TC-016: 全6 phase passed → verdict "passed", 6 phase 記録
 * TC-017: 全5 phase passed + test-coverage failed → verdict "failed"
 * TC-018: test phase failed → test-coverage は fail-fast でスキップ
 * TC-019: test-cases.md 不在 → test-coverage skipped, verdict passed
 * TC-020: test-coverage skipped + stdout 非空 → verification-result.md に stdout を出力
 * TC-021: test-coverage failed → verification-result.md に missing TC リスト記録
 * TC-041 (partial): verification-result.md の構造検証 (updated: now 6 phase sections)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { verificationResultPath } from "../../../../src/util/paths.js";

// Mock child_process.spawn so no actual processes are spawned.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock runTestCoveragePhase to control test-coverage phase behaviour.
vi.mock("../../../../src/core/verification/test-coverage.js", () => ({
  runTestCoveragePhase: vi.fn(),
}));

// Import after mocks are set up.
import { runTestCoveragePhase } from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "verification-runner-test-"));
  vi.clearAllMocks();

  // Default: test-coverage returns "passed"
  vi.mocked(runTestCoveragePhase).mockResolvedValue({
    status: "passed",
    missingTcIds: [],
    assertionlessTcIds: [],
    totalMustTcs: 3,
    foundTcIds: ["TC-001", "TC-002", "TC-003"],
    stdout: "test-coverage: 3/3 must TCs covered",
  });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Create a mock child process that emits stdout/stderr and closes with the given exit code.
 */
function makeMockChild(exitCode: number, stdout = "", stderr = "") {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  // Schedule emissions after next tick so spawn() returns first
  setImmediate(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", exitCode);
  });

  return child;
}

/**
 * Write a package.json with the given scripts to tempDir.
 */
async function writePackageJson(scripts: Record<string, string>) {
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "test-pkg", scripts }),
    "utf-8",
  );
}

// TC-005: 全 phase passed シナリオ (6 phases now)
describe("TC-005: runVerification — 全 phase passed", () => {
  it("全 phase exit 0 → verdict='passed', all status='passed', 6 phases total", async () => {
    // Write package.json with all 5 scripts
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() => makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>);

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("passed");
    // 5 script phases + 1 test-coverage phase
    expect(result.phases.length).toBe(6);
    // All script phases passed
    const scriptPhases = result.phases.filter((p) => p.phase !== "test-coverage");
    for (const phase of scriptPhases) {
      expect(phase.status).toBe("passed");
    }
    // test-coverage phase passed (mocked)
    const tcPhase = result.phases.find((p) => p.phase === "test-coverage");
    expect(tcPhase?.status).toBe("passed");
  });
});

// TC-006: 1 phase failed の fail-fast (typecheck 失敗例)
describe("TC-006: runVerification — typecheck failed → 後続 skipped", () => {
  it("build passed, typecheck exit 2 → verdict='failed', test/lint/security/test-coverage skipped", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      const exitCode = callCount === 0 ? 0 : 2; // build=0, typecheck=2
      callCount++;
      return makeMockChild(exitCode) as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("failed");

    const phases = result.phases;
    const build = phases.find((p) => p.phase === "build");
    const typecheck = phases.find((p) => p.phase === "typecheck");
    const test = phases.find((p) => p.phase === "test");
    const lint = phases.find((p) => p.phase === "lint");
    const security = phases.find((p) => p.phase === "security");
    const testCoverage = phases.find((p) => p.phase === "test-coverage");

    expect(build?.status).toBe("passed");
    expect(typecheck?.status).toBe("failed");
    expect(test?.status).toBe("skipped");
    expect(lint?.status).toBe("skipped");
    expect(security?.status).toBe("skipped");
    expect(testCoverage?.status).toBe("skipped");

    // runTestCoveragePhase should NOT be called (fail-fast)
    expect(runTestCoveragePhase).not.toHaveBeenCalled();
  });
});

// TC-007: 複数 phase failed（最初の失敗でのみ break）
describe("TC-007: runVerification — build failed → 後続 5 phase skipped", () => {
  it("build exit 1 → typecheck/test/lint/security/test-coverage の spawn は呼ばれない", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    // Only build is spawned (exit code 1), rest are skipped
    spawnMock.mockImplementation(() => makeMockChild(1) as ReturnType<typeof childProcess.spawn>);

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("failed");

    const phases = result.phases;
    const build = phases.find((p) => p.phase === "build");
    const typecheck = phases.find((p) => p.phase === "typecheck");
    const test = phases.find((p) => p.phase === "test");
    const lint = phases.find((p) => p.phase === "lint");
    const security = phases.find((p) => p.phase === "security");
    const testCoverage = phases.find((p) => p.phase === "test-coverage");

    expect(build?.status).toBe("failed");
    expect(typecheck?.status).toBe("skipped");
    expect(test?.status).toBe("skipped");
    expect(lint?.status).toBe("skipped");
    expect(security?.status).toBe("skipped");
    expect(testCoverage?.status).toBe("skipped");

    // Only 1 spawn call (build), subsequent phases are skipped without spawning
    expect(spawnMock.mock.calls.length).toBe(1);
    // runTestCoveragePhase should NOT be called (fail-fast)
    expect(runTestCoveragePhase).not.toHaveBeenCalled();
  });
});

// TC-008: 全 phase skipped → verdict failed
describe("TC-008: runVerification — 全 phase skipped → verdict failed", () => {
  it("package.json にスクリプトがない場合 all skipped + verdict='failed' + errorCode='VERIFICATION_NO_RUNNABLE_PHASES'", async () => {
    // Write package.json with NO scripts
    await writePackageJson({});

    // Override test-coverage mock to return skipped (test-cases.md absent)
    vi.mocked(runTestCoveragePhase).mockResolvedValue({
      status: "skipped",
      missingTcIds: [],
      assertionlessTcIds: [],
      totalMustTcs: 0,
      foundTcIds: [],
      stdout: "test-cases.md not found at specrunner/changes/my-change/test-cases.md",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    // spawn should not be called at all
    spawnMock.mockImplementation(() => {
      throw new Error("spawn should not be called when all phases are skipped");
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("failed");
    expect(result.errorCode).toBe("VERIFICATION_NO_RUNNABLE_PHASES");

    for (const phase of result.phases) {
      expect(phase.status).toBe("skipped");
    }

    // spawn was never called
    expect(spawnMock.mock.calls.length).toBe(0);
  });
});

// TC-016: 全6 phase passed → verdict "passed", 6 phase 記録
describe("TC-016: runVerification — 全6 phase passed → verdict 'passed', 6 phase 記録", () => {
  it("5 script phase + test-coverage passed → verdict 'passed', phases.length = 6", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() => makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>);

    // test-coverage passed (default mock)

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("passed");
    expect(result.phases.length).toBe(6);

    // Verify Phase Results in written file — count ## Phase: sections
    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");
    const phaseSections = content.match(/^## Phase: /mg);
    expect(phaseSections?.length).toBe(6);
  });
});

// TC-017: 全5 phase passed + test-coverage failed → verdict "failed"
describe("TC-017: runVerification — test-coverage failed → verdict 'failed'", () => {
  it("5 script phase passed, test-coverage failed → verdict 'failed'", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() => makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>);

    vi.mocked(runTestCoveragePhase).mockResolvedValue({
      status: "failed",
      missingTcIds: ["TC-003", "TC-004"],
      assertionlessTcIds: [],
      totalMustTcs: 4,
      foundTcIds: ["TC-001", "TC-002"],
      stdout: "test-coverage: 2/4 must TCs covered\nMissing: TC-003, TC-004",
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("failed");
    const tcPhase = result.phases.find((p) => p.phase === "test-coverage");
    expect(tcPhase?.status).toBe("failed");
  });
});

// TC-018: test phase failed → test-coverage は fail-fast でスキップ
describe("TC-018: runVerification — test phase failed → test-coverage skipped", () => {
  it("build/typecheck passed, test failed → test-coverage phase is skipped", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      // build=0, typecheck=0, test=1 (fail), subsequent are skipped
      const exitCode = callCount < 2 ? 0 : 1;
      callCount++;
      return makeMockChild(exitCode) as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("failed");

    const tcPhase = result.phases.find((p) => p.phase === "test-coverage");
    expect(tcPhase?.status).toBe("skipped");

    // runTestCoveragePhase should NOT have been called (fail-fast after test phase)
    expect(runTestCoveragePhase).not.toHaveBeenCalled();
  });
});

// TC-019: test-cases.md 不在 → test-coverage skipped, verdict は他 phase 次第
describe("TC-019: runVerification — test-cases.md 不在 → test-coverage skipped, verdict passed", () => {
  it("全5 phase passed + test-coverage skipped (no test-cases.md) → verdict 'passed'", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() => makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>);

    vi.mocked(runTestCoveragePhase).mockResolvedValue({
      status: "skipped",
      missingTcIds: [],
      assertionlessTcIds: [],
      totalMustTcs: 0,
      foundTcIds: [],
      stdout: "test-cases.md not found at specrunner/changes/my-change/test-cases.md",
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("passed");
    const tcPhase = result.phases.find((p) => p.phase === "test-coverage");
    expect(tcPhase?.status).toBe("skipped");
  });
});

// TC-020: test-coverage skipped + stdout 非空 → verification-result.md に stdout を出力
describe("TC-020: test-coverage skipped + stdout non-empty → verification-result.md に stdout 出力", () => {
  it("test-coverage skipped with skip reason → result.md に skip 理由が表示される（generic 文言ではない）", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() => makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>);

    const skipReason = "test-cases.md not found at specrunner/changes/my-change/test-cases.md";
    vi.mocked(runTestCoveragePhase).mockResolvedValue({
      status: "skipped",
      missingTcIds: [],
      assertionlessTcIds: [],
      totalMustTcs: 0,
      foundTcIds: [],
      stdout: skipReason,
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir);

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");

    // Skip reason should appear in the test-coverage section
    expect(content).toContain(skipReason);
    // Generic "script not found" message should NOT appear in test-coverage section
    // (It may appear in other phase sections, but test-coverage should show the real reason)
    const tcSection = content.split("## Phase: test-coverage")[1] ?? "";
    expect(tcSection).not.toContain("_(skipped — script not found in package.json)_");
    expect(tcSection).toContain(skipReason);
  });
});

// TC-021: test-coverage failed → verification-result.md に missing TC リスト記録
describe("TC-021: test-coverage failed → verification-result.md に missing TC リスト記録", () => {
  it("test-coverage failed with missing TCs → result.md の Phase テーブルに 'failed' 行 + stdout に missing TC リスト", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() => makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>);

    vi.mocked(runTestCoveragePhase).mockResolvedValue({
      status: "failed",
      missingTcIds: ["TC-003", "TC-012", "TC-017"],
      assertionlessTcIds: [],
      totalMustTcs: 5,
      foundTcIds: ["TC-001", "TC-002"],
      stdout: "test-coverage: 2/5 must TCs covered\nMissing: TC-003, TC-012, TC-017",
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("failed");

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");

    // Phase Results table must contain "test-coverage | failed"
    expect(content).toMatch(/test-coverage.*failed/);
    // Phase: test-coverage section must contain the missing TC list
    expect(content).toContain("test-coverage: 2/5 must TCs covered");
    expect(content).toContain("Missing: TC-003, TC-012, TC-017");
  });
});

// TC-041 (partial): verification-result.md の構造検証 (6 phases)
describe("TC-041: verification-result.md 構造検証", () => {
  it("1行目が '# Verification Result — <slug> — iter' で始まり、6 phase セクションが存在する", async () => {
    await writePackageJson({
      build: "echo build",
      typecheck: "echo typecheck",
      test: "echo test",
      lint: "echo lint",
      security: "echo security",
    });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() => makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>);

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir);

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");
    const lines = content.split("\n");

    expect(lines[0]).toMatch(/^# Verification Result — my-change — iter /);
    expect(content).toMatch(/^## Verdict: (passed|failed)$/m);
    expect(content).toContain("## Phase Results");
    expect(content).toContain("| # | Phase | Status | Duration | Exit Code |");
    // 6 phase sections (5 script + 1 test-coverage)
    const phaseMatches = content.match(/^## Phase: /mg);
    expect(phaseMatches?.length).toBe(6);
    expect(content).toContain("## Phase: test-coverage");
  });
});
