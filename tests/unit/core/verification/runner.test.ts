/**
 * Unit tests for runVerification
 *
 * TC-005: 全 phase passed シナリオ
 * TC-006: 1 phase failed の fail-fast (typecheck 失敗例)
 * TC-007: 複数 phase failed（最初の失敗でのみ break）
 * TC-008: 全 phase skipped → verdict failed
 * TC-009: bun:* / Bun.* import 禁止 — grep テスト (移動: grep.test.ts)
 * TC-041 (partial): verification-result.md の構造検証
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { verificationResultPath } from "../../../../src/util/paths.js";

// We mock child_process.spawn so no actual processes are spawned.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "verification-runner-test-"));
  vi.clearAllMocks();
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

// TC-005: 全 phase passed シナリオ
describe("TC-005: runVerification — 全 phase passed", () => {
  it("全 phase exit 0 → verdict='passed', all status='passed'", async () => {
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
    expect(result.phases.length).toBe(5);
    for (const phase of result.phases) {
      expect(phase.status).toBe("passed");
    }
  });
});

// TC-006: 1 phase failed の fail-fast (typecheck 失敗例)
describe("TC-006: runVerification — typecheck failed → 後続 skipped", () => {
  it("build passed, typecheck exit 2 → verdict='failed', test/lint/security skipped", async () => {
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

    expect(build?.status).toBe("passed");
    expect(typecheck?.status).toBe("failed");
    expect(test?.status).toBe("skipped");
    expect(lint?.status).toBe("skipped");
    expect(security?.status).toBe("skipped");
  });
});

// TC-007: 複数 phase failed（最初の失敗でのみ break）
describe("TC-007: runVerification — build failed → 後続 4 phase skipped", () => {
  it("build exit 1 → typecheck/test/lint/security の spawn は呼ばれない", async () => {
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

    expect(build?.status).toBe("failed");
    expect(typecheck?.status).toBe("skipped");
    expect(test?.status).toBe("skipped");
    expect(lint?.status).toBe("skipped");
    expect(security?.status).toBe("skipped");

    // Only 1 spawn call (build), subsequent phases are skipped without spawning
    expect(spawnMock.mock.calls.length).toBe(1);
  });
});

// TC-008: 全 phase skipped → verdict failed
describe("TC-008: runVerification — 全 phase skipped → verdict failed", () => {
  it("package.json にスクリプトがない場合 all skipped + verdict='failed' + errorCode='VERIFICATION_NO_RUNNABLE_PHASES'", async () => {
    // Write package.json with NO scripts
    await writePackageJson({});

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

// TC-041 (partial): verification-result.md の構造検証
describe("TC-041: verification-result.md 構造検証", () => {
  it("1行目が '# Verification Result — <slug> — iter' で始まる", async () => {
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
    // 5 phase sections
    const phaseMatches = content.match(/^## Phase: /mg);
    expect(phaseMatches?.length).toBe(5);
  });
});
