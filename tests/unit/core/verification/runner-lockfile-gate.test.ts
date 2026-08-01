/**
 * Unit tests for lockfile-sync gate wiring in runner.ts (T-05).
 *
 * TC-007: phases 経路で gate が実行される
 * TC-008: commands 経路で gate が実行される
 * TC-009: baseBranch 未指定なら gate は走らない
 * TC-024: 先行 phase が failed の場合 lockfile-sync は fail-fast で skipped になる
 *
 * Pattern: same as runner-coverage-gate.test.ts — mock runLockfileSyncGate and
 * verify it is (or isn't) called, and that its result appears in phases / verdict.
 *
 * Note: lockfile-sync.ts does not exist yet (intentionally red).
 * vi.hoisted() is used for the mock fn to avoid static import of a non-existent module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";

// The phase name constant: mirrors what lockfile-sync.ts will export.
const LOCKFILE_SYNC_PHASE = "lockfile-sync";

// ---------------------------------------------------------------------------
// Mock setup — must be at the top level (hoisted by vitest before imports).
// vi.hoisted() creates the mock fn before vi.mock() runs, allowing a non-existent
// module to be mocked without triggering a module-not-found resolution error.
// ---------------------------------------------------------------------------

const { mockRunLockfileSyncGate } = vi.hoisted(() => ({
  mockRunLockfileSyncGate: vi.fn(),
}));

// Mock the not-yet-existing lockfile-sync module with a factory.
vi.mock("../../../../src/core/verification/lockfile-sync.js", () => ({
  runLockfileSyncGate: mockRunLockfileSyncGate,
  LOCKFILE_SYNC_PHASE,
}));

// Mock child_process.spawn to avoid real process execution.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock runTestCoveragePhase so phases path doesn't need real test-cases.md.
vi.mock("../../../../src/core/verification/test-coverage.js", () => ({
  runTestCoveragePhase: vi.fn(),
}));

// Mock runChangedLineCoverageGate — not under test here; always return passed.
vi.mock("../../../../src/core/verification/changed-line-coverage.js", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../../src/core/verification/changed-line-coverage.js")
    >();
  return {
    ...original,
    runChangedLineCoverageGate: vi.fn(),
  };
});

import { runVerification } from "../../../../src/core/verification/runner.js";
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

function makeLockfileGatePassedResult() {
  return {
    phase: LOCKFILE_SYNC_PHASE,
    status: "passed" as const,
    stdout: "lockfile-sync: passed",
    stderr: "",
    exitCode: 0,
    durationMs: 1,
  };
}

function makeLockfileGateFailedResult() {
  return {
    phase: LOCKFILE_SYNC_PHASE,
    status: "failed" as const,
    stdout: "bun install を実行して lockfile を commit してください",
    stderr: "",
    exitCode: 1,
    durationMs: 1,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "runner-lockfile-gate-test-"));
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

  // Default: coverage gate returns passed (not under test here)
  vi.mocked(runChangedLineCoverageGate).mockResolvedValue({
    phase: "changed-line-coverage",
    status: "passed",
    stdout: "coverage: passed",
    stderr: "",
    exitCode: 0,
    durationMs: 1,
  });

  // Default: lockfile-sync gate returns passed
  mockRunLockfileSyncGate.mockResolvedValue(makeLockfileGatePassedResult());

  // Default spawn: git show fails (no baseline → integrity check skips); scripts exit 0
  vi.mocked(childProcess.spawn).mockImplementation(
    (cmd: string, _args: readonly string[]) => {
      if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
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

// ---------------------------------------------------------------------------
// TC-007: phases 経路で gate が実行される
// ---------------------------------------------------------------------------

describe("TC-007: phases 経路で gate が実行される", () => {
  it("baseBranch 指定 + 先行 script phase がすべて passed → runLockfileSyncGate が呼ばれ phase が verdict に反映される", async () => {
    await writePackageJson({ build: "echo build" });

    vi.mocked(childProcess.spawn).mockImplementation(
      (cmd: string, _args: readonly string[]) => {
        // git show for integrity check → exit 1 (no baseline → skip)
        if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
        // bun run build → passed
        return makeMockChild(0, "build ok") as ReturnType<typeof childProcess.spawn>;
      },
    );

    const result = await runVerification(TEST_SLUG, tmpDir, undefined, "main");

    expect(mockRunLockfileSyncGate).toHaveBeenCalledOnce();
    const gatePhase = result.phases.find((p) => p.phase === LOCKFILE_SYNC_PHASE);
    expect(gatePhase).toBeDefined();
    expect(gatePhase?.status).toBe("passed");
    expect(result.verdict).toBe("passed");
  });

  it("gate が failed を返す場合、verdict は failed になる", async () => {
    await writePackageJson({ build: "echo build" });

    vi.mocked(childProcess.spawn).mockImplementation(
      (cmd: string, _args: readonly string[]) => {
        if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
        return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
      },
    );
    mockRunLockfileSyncGate.mockResolvedValue(makeLockfileGateFailedResult());

    const result = await runVerification(TEST_SLUG, tmpDir, undefined, "main");

    expect(result.verdict).toBe("failed");
    const gatePhase = result.phases.find((p) => p.phase === LOCKFILE_SYNC_PHASE);
    expect(gatePhase?.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// TC-008: commands 経路で gate が実行される
// ---------------------------------------------------------------------------

describe("TC-008: commands 経路で gate が実行される", () => {
  it("commands 定義 + baseBranch 指定 + 先行 command が passed → runLockfileSyncGate が呼ばれる", async () => {
    // commands path: spawn sh -c "true" → exit 0
    vi.mocked(childProcess.spawn).mockImplementation(
      (_cmd: string, _args: readonly string[]) =>
        makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>,
    );

    const result = await runVerification(
      TEST_SLUG,
      tmpDir,
      { commands: ["true"] },
      "main",
    );

    expect(mockRunLockfileSyncGate).toHaveBeenCalledOnce();
    const gatePhase = result.phases.find((p) => p.phase === LOCKFILE_SYNC_PHASE);
    expect(gatePhase).toBeDefined();
    expect(gatePhase?.status).toBe("passed");
    expect(result.verdict).toBe("passed");
  });

  it("commands 経路で gate が failed → verdict failed", async () => {
    vi.mocked(childProcess.spawn).mockImplementation(
      (_cmd: string, _args: readonly string[]) =>
        makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>,
    );
    mockRunLockfileSyncGate.mockResolvedValue(makeLockfileGateFailedResult());

    const result = await runVerification(
      TEST_SLUG,
      tmpDir,
      { commands: ["true"] },
      "main",
    );

    expect(result.verdict).toBe("failed");
    const gatePhase = result.phases.find((p) => p.phase === LOCKFILE_SYNC_PHASE);
    expect(gatePhase?.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// TC-009: baseBranch 未指定なら gate は走らない
// ---------------------------------------------------------------------------

describe("TC-009: baseBranch 未指定なら gate は走らない", () => {
  it("phases 経路 + baseBranch なし → lockfile-sync phase は結果に現れない", async () => {
    await writePackageJson({ build: "echo build" });

    vi.mocked(childProcess.spawn).mockImplementation(
      (cmd: string, _args: readonly string[]) => {
        if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
        return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
      },
    );

    // No baseBranch argument
    const result = await runVerification(TEST_SLUG, tmpDir, undefined, undefined);

    expect(mockRunLockfileSyncGate).not.toHaveBeenCalled();
    const gatePhase = result.phases.find((p) => p.phase === LOCKFILE_SYNC_PHASE);
    expect(gatePhase).toBeUndefined();
  });

  it("commands 経路 + baseBranch なし → lockfile-sync phase は結果に現れない", async () => {
    vi.mocked(childProcess.spawn).mockImplementation(
      (_cmd: string, _args: readonly string[]) =>
        makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>,
    );

    const result = await runVerification(
      TEST_SLUG,
      tmpDir,
      { commands: ["true"] },
      undefined,
    );

    expect(mockRunLockfileSyncGate).not.toHaveBeenCalled();
    const gatePhase = result.phases.find((p) => p.phase === LOCKFILE_SYNC_PHASE);
    expect(gatePhase).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-024: 先行 phase が failed の場合 lockfile-sync は fail-fast で skipped になる
// ---------------------------------------------------------------------------

describe("TC-024: 先行 phase が failed の場合 lockfile-sync は fail-fast で skipped になる", () => {
  it("commands 経路で先行 command が failed → runLockfileSyncGate は呼ばれず phase は skipped", async () => {
    // sh -c "false" → exit 1 (command fails)
    vi.mocked(childProcess.spawn).mockImplementation(
      (_cmd: string, _args: readonly string[]) =>
        makeMockChild(1) as ReturnType<typeof childProcess.spawn>,
    );

    const result = await runVerification(
      TEST_SLUG,
      tmpDir,
      { commands: ["false"] },
      "main",
    );

    // Gate should NOT be called (fail-fast)
    expect(mockRunLockfileSyncGate).not.toHaveBeenCalled();

    // lockfile-sync phase should be present but skipped
    const gatePhase = result.phases.find((p) => p.phase === LOCKFILE_SYNC_PHASE);
    expect(gatePhase?.status).toBe("skipped");

    // Overall verdict should be failed
    expect(result.verdict).toBe("failed");
  });

  it("phases 経路で先行 script phase が failed → lockfile-sync は skipped", async () => {
    await writePackageJson({ build: "echo build" });

    let callCount = 0;
    vi.mocked(childProcess.spawn).mockImplementation(
      (cmd: string, _args: readonly string[]) => {
        // git show → exit 1 (integrity check skips)
        if (cmd === "git") return makeMockChild(1) as ReturnType<typeof childProcess.spawn>;
        // First bun run call (build) → fail; subsequent are skipped by fail-fast
        callCount++;
        return makeMockChild(callCount === 1 ? 1 : 0) as ReturnType<typeof childProcess.spawn>;
      },
    );

    const result = await runVerification(TEST_SLUG, tmpDir, undefined, "main");

    expect(mockRunLockfileSyncGate).not.toHaveBeenCalled();

    const gatePhase = result.phases.find((p) => p.phase === LOCKFILE_SYNC_PHASE);
    expect(gatePhase?.status).toBe("skipped");

    expect(result.verdict).toBe("failed");
  });
});
