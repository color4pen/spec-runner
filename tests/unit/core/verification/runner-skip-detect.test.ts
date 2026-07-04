/**
 * Integration tests for skip detection in runVerification (phase fallback path).
 *
 * TC-SK-01: test phase exit 0, stdout contains "2 skipped" → verdict passed,
 *           test phase skippedCount===2, verification-result.md has annotation with "2"
 * TC-SK-02: test phase exit 0, no skip keyword → verdict passed,
 *           test phase skippedCount undefined, no annotation in verification-result.md
 * TC-SK-03: test phase exit non-zero, stdout contains "2 skipped" → verdict failed,
 *           skippedCount===2 still recorded, NO annotation (gated on passed verdict)
 * TC-SK-04: skip keyword in stderr (not stdout) is also detected (combined output)
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

// Mock runTestCoveragePhase to avoid filesystem dependency.
vi.mock("../../../../src/core/verification/test-coverage.js", () => ({
  runTestCoveragePhase: vi.fn(),
}));

import { runTestCoveragePhase } from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "runner-skip-detect-test-"));
  vi.clearAllMocks();

  // Default: test-coverage returns "passed"
  vi.mocked(runTestCoveragePhase).mockResolvedValue({
    status: "passed",
    missingTcIds: [],
    assertionlessTcIds: [],
    totalMustTcs: 0,
    foundTcIds: [],
    stdout: "test-coverage: ok",
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

// TC-SK-01: test exit 0 with "2 skipped" → passed + annotation + skippedCount
describe("TC-SK-01: test phase exit 0 with '2 skipped' → passed-with-skips annotation", () => {
  it("verdict is passed, test phase skippedCount===2, result.md contains annotation with '2'", async () => {
    await writePackageJson({ test: "echo test" });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() =>
      makeMockChild(0, "5 passed | 2 skipped (7)") as ReturnType<typeof childProcess.spawn>,
    );

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("passed");

    const testPhase = result.phases.find((p) => p.phase === "test");
    expect(testPhase?.skippedCount).toBe(2);

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");

    // Annotation must be present and reference the count
    expect(content).toContain("passed with skips: 2 test(s)");
    // Annotation must be a blockquote
    expect(content).toMatch(/^> Note — passed with skips:/m);
  });
});

// TC-SK-02: test exit 0, no skip keyword → clean pass, no annotation
describe("TC-SK-02: test phase exit 0, no skip keyword → clean pass", () => {
  it("verdict is passed, test phase skippedCount is undefined, no annotation in result.md", async () => {
    await writePackageJson({ test: "echo test" });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() =>
      makeMockChild(0, "5 passed (5)") as ReturnType<typeof childProcess.spawn>,
    );

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("passed");

    const testPhase = result.phases.find((p) => p.phase === "test");
    expect(testPhase?.skippedCount).toBeUndefined();

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");

    // No annotation must appear
    expect(content).not.toContain("passed with skips");
    // Structure must be unchanged — these must still be present
    expect(content).toMatch(/^## Verdict: passed$/m);
    expect(content).toContain("| # | Phase | Status | Duration | Exit Code |");
  });
});

// TC-SK-03: test exit non-zero with "2 skipped" → verdict failed, skippedCount recorded, NO annotation
describe("TC-SK-03: test phase exit non-zero with '2 skipped' → failed, skippedCount recorded, no annotation", () => {
  it("verdict is failed (exit-code decided), skippedCount===2 still on test phase, NO annotation", async () => {
    await writePackageJson({ test: "echo test" });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() =>
      makeMockChild(1, "3 passed | 2 skipped (5)") as ReturnType<typeof childProcess.spawn>,
    );

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    // Verdict is determined by exit code, not skip count
    expect(result.verdict).toBe("failed");

    // Skip count is still recorded even when test phase fails
    const testPhase = result.phases.find((p) => p.phase === "test");
    expect(testPhase?.skippedCount).toBe(2);

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");

    // No annotation because verdict is failed
    expect(content).not.toContain("passed with skips");
    expect(content).toMatch(/^## Verdict: failed$/m);
  });
});

// TC-SK-04: skip keyword in stderr (not stdout) is detected via combined output
describe("TC-SK-04: skip keyword in stderr is detected (combined stdout+stderr)", () => {
  it("stderr contains '3 pending' → test phase skippedCount===3", async () => {
    await writePackageJson({ test: "echo test" });

    const spawnMock = vi.mocked(childProcess.spawn);
    // stdout has no skip keyword; stderr has "3 pending"
    spawnMock.mockImplementation(() =>
      makeMockChild(0, "5 passing", "3 pending") as ReturnType<typeof childProcess.spawn>,
    );

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("passed");

    const testPhase = result.phases.find((p) => p.phase === "test");
    expect(testPhase?.skippedCount).toBe(3);

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("passed with skips: 3 test(s)");
  });
});
