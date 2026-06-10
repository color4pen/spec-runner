/**
 * Integration tests for the path-mask writer seam in writeVerificationResult.
 *
 * Verifies that verification-result.md written to disk does not contain the
 * absolute cwd path or any $HOME-absolute path from command output, while the
 * returned VerificationResult object retains the original (unmasked) values.
 *
 * TC-PM-01: cwd-absolute path in command stdout → relativized in result file, raw in object
 * TC-PM-02: homeDir-absolute path (outside cwd) in stderr → ~-ified in result file
 * TC-PM-03: verdict and phase status are unaffected by masking
 * TC-PM-04: commands path also applies masking (writeVerificationResult called from runVerificationCommands)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { verificationResultPath } from "../../../../src/util/paths.js";

// Mock child_process.spawn
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock runTestCoveragePhase
vi.mock("../../../../src/core/verification/test-coverage.js", () => ({
  runTestCoveragePhase: vi.fn(),
}));

import { runTestCoveragePhase } from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;
const HOME = os.homedir();

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-path-mask-test-"));
  vi.clearAllMocks();

  vi.mocked(runTestCoveragePhase).mockResolvedValue({
    status: "skipped",
    missingTcIds: [],
    assertionlessTcIds: [],
    totalMustTcs: 0,
    foundTcIds: [],
    stdout: "test-cases.md not found",
  });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

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

async function writePackageJson(scripts: Record<string, string>) {
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "test-pkg", scripts }),
    "utf-8",
  );
}

// TC-PM-01: cwd-absolute path in stdout → relativized in file, raw in returned object
describe("TC-PM-01: cwd-absolute path in stdout → relativized in result file", () => {
  it("verification-result.md has no cwd-absolute path; PhaseResult.stdout retains raw value", async () => {
    await writePackageJson({ build: "tsc" });

    const cwdAbsPath = `${tempDir}/src/index.ts`;
    const stdoutWithAbsPath = `error TS2345: Argument at ${cwdAbsPath}:10`;

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() =>
      makeMockChild(1, stdoutWithAbsPath) as ReturnType<typeof childProcess.spawn>,
    );

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    // Returned object retains raw stdout (no masking on the object)
    const buildPhase = result.phases.find((p) => p.phase === "build");
    expect(buildPhase?.stdout).toContain(cwdAbsPath);

    // Written file must NOT contain the absolute path
    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).not.toContain(tempDir);
    // The relative portion should appear instead
    expect(content).toContain("src/index.ts");
  });
});

// TC-PM-02: homeDir-absolute path (outside cwd) in stderr → ~-ified in file
describe("TC-PM-02: homeDir path in stderr → replaced with ~ in result file", () => {
  it("verification-result.md has no $HOME-absolute path; uses ~ prefix instead", async () => {
    await writePackageJson({ build: "tsc" });

    const homeDirPath = `${HOME}/.bun/install/cache/some-pkg`;
    const stderrWithHomePath = `resolved from ${homeDirPath}`;

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() =>
      makeMockChild(0, "", stderrWithHomePath) as ReturnType<typeof childProcess.spawn>,
    );

    vi.mocked(runTestCoveragePhase).mockResolvedValue({
      status: "passed",
      missingTcIds: [],
      assertionlessTcIds: [],
      totalMustTcs: 0,
      foundTcIds: [],
      stdout: "",
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir);

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");

    // HOME-absolute path must not appear in the file
    expect(content).not.toContain(HOME + "/");
    // ~ prefix should appear instead
    expect(content).toContain("~/.bun/install/cache/some-pkg");
  });
});

// TC-PM-03: verdict and phase status are unaffected by masking
describe("TC-PM-03: masking does not affect verdict or phase status", () => {
  it("verdict and phase status match expected values even when output contains absolute paths", async () => {
    await writePackageJson({ build: "tsc", test: "vitest" });

    const cwdAbsPath = `${tempDir}/src/foo.ts`;
    const failOutput = `FAIL ${cwdAbsPath}`;

    const spawnMock = vi.mocked(childProcess.spawn);
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      // build passes, test fails
      const code = callCount++ === 0 ? 0 : 1;
      return makeMockChild(code, failOutput) as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir);

    expect(result.verdict).toBe("failed");
    expect(result.phases.find((p) => p.phase === "build")?.status).toBe("passed");
    expect(result.phases.find((p) => p.phase === "test")?.status).toBe("failed");
  });
});

// TC-PM-04: commands path also masks paths
describe("TC-PM-04: commands path also applies path masking", () => {
  it("verification-result.md written from runVerificationCommands has no cwd-absolute paths", async () => {
    const cwdAbsPath = `${tempDir}/src/main.ts`;
    const stdoutWithAbsPath = `Building ${cwdAbsPath}...`;

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation(() =>
      makeMockChild(0, stdoutWithAbsPath) as ReturnType<typeof childProcess.spawn>,
    );

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir, { commands: ["bun run build"] });

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");

    expect(content).not.toContain(tempDir);
    expect(content).toContain("src/main.ts");
  });
});
