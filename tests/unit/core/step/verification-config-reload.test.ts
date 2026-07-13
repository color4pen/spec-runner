/**
 * Acceptance integration test for in-job coverage config re-resolution (T-05).
 *
 * Verifies that build-fixer's disk edit to .specrunner/config.json (adding a
 * coverage.exclude entry) is reflected in subsequent VerificationStep.run calls
 * within the same job — without changing the in-memory deps.config object.
 *
 * TC-RELOAD-01: exclude 無しの verification は failed (not-loaded)
 * TC-RELOAD-02: disk config に exclude 追加後、同一 deps で再実行すると passed
 * TC-RELOAD-03: pass の要因が in-memory config 変更ではなく disk 再解決に由来する
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import type { CliStepDeps } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports of the modules under test
// ---------------------------------------------------------------------------

// Mock resolveRepoRoot to return tmpDir (avoids need for a real git repo).
// reloadCoverageConfig calls resolveRepoRoot then fs.access then loadConfig.
vi.mock("../../../../src/util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn(),
  resolveRepoRootOrFail: vi.fn(),
}));

// Mock getChangedFilesAndLines so the gate receives a fixed changed-file set
// (src/types.ts with two changed lines) without running git diff.
vi.mock("../../../../src/core/verification/changed-lines.js", () => ({
  getChangedFilesAndLines: vi.fn(),
}));

// Mock child_process.spawn so no real processes are spawned.
// All sh invocations (verification commands, coverage command) exit 0.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock propagateVerificationResult — not relevant to coverage logic.
vi.mock("../../../../src/core/verification/propagate.js", () => ({
  propagateVerificationResult: vi.fn().mockResolvedValue({ ok: true }),
}));

// Mock runTestCoveragePhase — not relevant here.
vi.mock("../../../../src/core/verification/test-coverage.js", () => ({
  runTestCoveragePhase: vi.fn().mockResolvedValue({
    status: "passed",
    missingTcIds: [],
    assertionlessTcIds: [],
    totalMustTcs: 0,
    foundTcIds: [],
    stdout: "test-coverage: passed",
  }),
}));

import { resolveRepoRoot } from "../../../../src/util/repo-root.js";
import { getChangedFilesAndLines } from "../../../../src/core/verification/changed-lines.js";
import * as childProcess from "node:child_process";
import { VerificationStep } from "../../../../src/core/step/verification.js";
import { verificationResultPath } from "../../../../src/util/paths.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SLUG = "reload-test";

/** Create a mock EventEmitter child process that exits with the given code. */
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

/** Minimal lcov that includes src/impl.ts but NOT src/types.ts. */
const LCOV_WITHOUT_TYPES_TS = [
  "SF:src/impl.ts",
  "DA:1,5",
  "DA:2,3",
  "end_of_record",
].join("\n");

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "reload-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Reload Test", type: "spec-change" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "verification",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "verification-reload-test-"));

  // Create .specrunner directory
  await fs.mkdir(path.join(tmpDir, ".specrunner"), { recursive: true });

  // Create coverage directory for the lcov file
  await fs.mkdir(path.join(tmpDir, "coverage"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "coverage", "lcov.info"), LCOV_WITHOUT_TYPES_TS, "utf-8");

  // Create specrunner output directory for verification-result.md
  const resultDir = path.dirname(path.join(tmpDir, verificationResultPath(TEST_SLUG)));
  await fs.mkdir(resultDir, { recursive: true });

  vi.clearAllMocks();

  // resolveRepoRoot → tmpDir (deterministic, avoids git init requirement)
  vi.mocked(resolveRepoRoot).mockResolvedValue(tmpDir);

  // getChangedFilesAndLines → src/types.ts with changed lines (type-only file scenario)
  vi.mocked(getChangedFilesAndLines).mockResolvedValue(
    new Map([["src/types.ts", new Set([1, 2])]]),
  );

  // child_process.spawn: all sh -c commands exit 0 (verification commands + coverage command)
  vi.mocked(childProcess.spawn).mockImplementation(
    (_cmd: string, _args: readonly string[]) =>
      makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>,
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Write the project-local .specrunner/config.json.
 * Both the initial state (no exclude) and the updated state (with exclude) are written here.
 */
async function writeProjectConfig(excludeList?: string[]) {
  const coverage: Record<string, unknown> = {
    command: "echo coverage-done",
    lcovPath: "coverage/lcov.info",
    include: ["src/**"],
  };
  if (excludeList !== undefined) {
    coverage["exclude"] = excludeList;
  }

  const config = {
    version: 1,
    verification: {
      commands: ["echo build-ok"],
      coverage,
    },
  };
  await fs.writeFile(
    path.join(tmpDir, ".specrunner", "config.json"),
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

/**
 * Build CliStepDeps with coverage declared (no exclude) in the in-memory config.
 * This object is intentionally NOT updated between calls — it represents the job-start
 * in-memory snapshot that build-fixer would NOT modify.
 */
function makeJobStartDeps(): CliStepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      verification: {
        commands: ["echo build-ok"],
        coverage: {
          command: "echo coverage-done",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
          // No exclude — this is the job-start state
        },
      },
    },
    request: {
      type: "spec-change",
      title: "Reload Test",
      slug: TEST_SLUG,
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: TEST_SLUG,
    cwd: tmpDir,
    spawn: vi.fn(),
  };
}

/** Read the verdict from verification-result.md written by VerificationStep.run. */
async function readVerdict(): Promise<"passed" | "failed" | null> {
  const resultPath = path.join(tmpDir, verificationResultPath(TEST_SLUG));
  let content: string;
  try {
    content = await fs.readFile(resultPath, "utf-8");
  } catch {
    return null;
  }
  const match = /^## Verdict: (passed|failed)$/m.exec(content);
  return (match?.[1] as "passed" | "failed") ?? null;
}

// ---------------------------------------------------------------------------
// TC-RELOAD-01/02/03: main acceptance scenario
// ---------------------------------------------------------------------------

describe("in-job coverage config re-resolution", () => {
  it("TC-RELOAD-01: exclude 無し → src/types.ts not-loaded → verdict failed", async () => {
    // Write project-local config WITHOUT exclude
    await writeProjectConfig();

    const state = makeMinimalState();
    const deps = makeJobStartDeps();

    await VerificationStep.run(state, deps);

    const verdict = await readVerdict();
    expect(verdict).toBe("failed");
  });

  it("TC-RELOAD-02: disk に exclude 追加後、同一 deps で再実行 → verdict passed", async () => {
    // First run: no exclude → failed
    await writeProjectConfig();
    const state = makeMinimalState();
    const deps = makeJobStartDeps(); // job-start in-memory config

    await VerificationStep.run(state, deps);
    expect(await readVerdict()).toBe("failed");

    // Simulate build-fixer: update disk config to add exclude — in-memory deps unchanged
    await writeProjectConfig(["src/types.ts"]);

    // Second run: same deps object (in-memory config has NO exclude)
    await VerificationStep.run(state, deps);
    expect(await readVerdict()).toBe("passed");
  });

  it("TC-RELOAD-03: pass が in-memory ではなく disk 再解決に由来することを確認", async () => {
    // Write disk config WITH exclude from the start,
    // but use deps whose in-memory config has NO exclude.
    await writeProjectConfig(["src/types.ts"]);

    const state = makeMinimalState();
    const deps = makeJobStartDeps(); // in-memory: no exclude

    // Confirm in-memory config has no exclude before running
    expect(deps.config.verification?.coverage?.exclude).toBeUndefined();

    await VerificationStep.run(state, deps);

    // Verdict is passed even though in-memory config has no exclude
    expect(await readVerdict()).toBe("passed");

    // In-memory config is still unmodified (no exclude)
    expect(deps.config.verification?.coverage?.exclude).toBeUndefined();
  });
});
