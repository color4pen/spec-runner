/**
 * Unit tests for src/core/verification/changed-line-coverage.ts
 *
 * T-04: evaluateChangedLineCoverage pure function
 * T-05: runChangedLineCoverageGate orchestrator
 *
 * TC-CLG-01: All changed DA lines unexecuted → failed + file listed
 * TC-CLG-02: At least 1 changed DA line executed → passed
 * TC-CLG-03: Changed lines have no DA records → passed (non-executable lines)
 * TC-CLG-04: File absent from lcov → failed (fail-closed)
 * TC-CLG-05: exclude-declared file → skipped (not fail)
 * TC-CLG-06: include-outside file → skipped (not fail)
 * TC-CLG-07: minChangedLineCoverage threshold met → passed
 * TC-CLG-08: minChangedLineCoverage threshold not met → failed
 * TC-CLG-09: default threshold — 1 line executed out of many unexecuted → passed
 * TC-CLG-GATE-01: coverage command exit non-0 → gate returns failed
 * TC-CLG-GATE-02: lcov file absent → gate returns failed
 * TC-CLG-GATE-03: lcov present + evaluation passed → gate returns passed
 * TC-CLG-GATE-04: lcov present + evaluation failed → gate returns failed
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import {
  evaluateChangedLineCoverage,
  runChangedLineCoverageGate,
  CHANGED_LINE_COVERAGE_PHASE,
} from "../../../../src/core/verification/changed-line-coverage.js";

// ---------------------------------------------------------------------------
// Helpers for building test fixtures
// ---------------------------------------------------------------------------

/** Build a minimal lcov Map: file → {line → count}. */
function makeLcov(
  entries: Array<{ file: string; lines: Record<number, number> }>,
): Map<string, Map<number, number>> {
  const m = new Map<string, Map<number, number>>();
  for (const { file, lines } of entries) {
    const lm = new Map<number, number>();
    for (const [ln, count] of Object.entries(lines)) {
      lm.set(Number(ln), count);
    }
    m.set(file, lm);
  }
  return m;
}

/** Build a changedLinesByFile Map: file → Set<line>. */
function makeChanged(
  entries: Array<{ file: string; lines: number[] }>,
): Map<string, Set<number>> {
  const m = new Map<string, Set<number>>();
  for (const { file, lines } of entries) {
    m.set(file, new Set(lines));
  }
  return m;
}

// ---------------------------------------------------------------------------
// T-04: evaluateChangedLineCoverage pure function tests
// ---------------------------------------------------------------------------

describe("TC-CLG-01: All changed DA lines unexecuted → failed + file listed", () => {
  it("src/foo.ts has DA lines 1,2 both with count=0 → failed", () => {
    const lcov = makeLcov([{ file: "src/foo.ts", lines: { 1: 0, 2: 0, 5: 1 } }]);
    const changed = makeChanged([{ file: "src/foo.ts", lines: [1, 2] }]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("failed");
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]?.file).toBe("src/foo.ts");
    expect(result.failedFiles[0]?.reason).toBe("unexecuted");
    expect(result.stdout).toContain("src/foo.ts");
  });
});

describe("TC-CLG-02: At least 1 changed DA line executed → passed", () => {
  it("src/foo.ts has DA line 1 with count=0 and line 2 with count=3 → passed", () => {
    const lcov = makeLcov([{ file: "src/foo.ts", lines: { 1: 0, 2: 3 } }]);
    const changed = makeChanged([{ file: "src/foo.ts", lines: [1, 2] }]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("passed");
    expect(result.failedFiles).toHaveLength(0);
  });
});

describe("TC-CLG-03: Changed lines have no DA records → passed", () => {
  it("src/types.ts changed lines 10,11 not in lcov DA records → passed", () => {
    // Lines 10 and 11 are NOT present as DA records (type definitions / comments)
    const lcov = makeLcov([{ file: "src/types.ts", lines: { 5: 1, 8: 2 } }]);
    const changed = makeChanged([{ file: "src/types.ts", lines: [10, 11] }]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("passed");
    expect(result.failedFiles).toHaveLength(0);
  });
});

describe("TC-CLG-04: File absent from lcov → failed (fail-closed)", () => {
  it("src/bar.ts not in lcov at all → failed with reason not-loaded", () => {
    const lcov = makeLcov([]); // no files
    const changed = makeChanged([{ file: "src/bar.ts", lines: [1, 2, 3] }]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("failed");
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]?.file).toBe("src/bar.ts");
    expect(result.failedFiles[0]?.reason).toBe("not-loaded");
  });
});

describe("TC-CLG-05: exclude-declared file → skipped", () => {
  it("src/generated/api.ts excluded → not counted as failure even if absent from lcov", () => {
    const lcov = makeLcov([]); // no files in lcov
    const changed = makeChanged([{ file: "src/generated/api.ts", lines: [1, 2] }]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      exclude: ["src/generated/**"],
    });

    expect(result.status).toBe("passed");
    expect(result.failedFiles).toHaveLength(0);
    expect(result.skippedFiles).toContain("src/generated/api.ts");
  });
});

describe("TC-CLG-06: include-outside file → skipped", () => {
  it("docs/readme.md not in include → skipped even if absent from lcov", () => {
    const lcov = makeLcov([]); // no files in lcov
    const changed = makeChanged([{ file: "docs/readme.md", lines: [1, 5] }]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("passed");
    expect(result.failedFiles).toHaveLength(0);
    expect(result.skippedFiles).toContain("docs/readme.md");
  });
});

describe("TC-CLG-07: minChangedLineCoverage threshold met → passed", () => {
  it("2/3 changed DA lines executed, threshold 0.5 → passed", () => {
    const lcov = makeLcov([{ file: "src/foo.ts", lines: { 1: 2, 2: 0, 3: 1 } }]);
    const changed = makeChanged([{ file: "src/foo.ts", lines: [1, 2, 3] }]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      minChangedLineCoverage: 0.5,
    });

    expect(result.status).toBe("passed");
    expect(result.failedFiles).toHaveLength(0);
  });
});

describe("TC-CLG-08: minChangedLineCoverage threshold not met → failed", () => {
  it("1/3 changed DA lines executed, threshold 0.8 → failed", () => {
    const lcov = makeLcov([{ file: "src/foo.ts", lines: { 1: 0, 2: 0, 3: 5 } }]);
    const changed = makeChanged([{ file: "src/foo.ts", lines: [1, 2, 3] }]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      minChangedLineCoverage: 0.8,
    });

    expect(result.status).toBe("failed");
    expect(result.failedFiles[0]?.file).toBe("src/foo.ts");
    expect(result.failedFiles[0]?.reason).toBe("unexecuted");
  });
});

describe("TC-CLG-09: Default threshold — 1 line executed out of many unexecuted → passed", () => {
  it("lines 1..9 unexecuted, line 10 executed (count=1) → passed (default: >= 1)", () => {
    const lineMap: Record<number, number> = {};
    for (let i = 1; i <= 10; i++) {
      lineMap[i] = i === 10 ? 1 : 0;
    }
    const lcov = makeLcov([{ file: "src/foo.ts", lines: lineMap }]);
    const changed = makeChanged([
      { file: "src/foo.ts", lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    ]);

    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// T-05: runChangedLineCoverageGate orchestrator tests
// ---------------------------------------------------------------------------

/** Create a fake spawn function that behaves like a successful or failed process. */
function makeFakeSpawn(options: {
  gitNameOnlyFiles?: string[];
  gitDiffOutput?: Record<string, string>;
  exitCode?: number;
  /** When set, `git diff --name-only` exits with this non-zero code. */
  gitNameOnlyExitCode?: number;
  /** When set, `git diff --unified=0` exits with this non-zero code. */
  gitUnifiedExitCode?: number;
}) {
  return function fakeSpawn(
    cmd: string,
    args: string[],
    _opts?: object,
  ) {
    const emitter = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();

    setImmediate(() => {
      if (cmd === "git") {
        const subCommand = args[0];
        if (subCommand === "diff" && args.includes("--name-only")) {
          if (options.gitNameOnlyExitCode !== undefined) {
            emitter.stderr.emit("data", Buffer.from("fatal: bad revision"));
            emitter.emit("close", options.gitNameOnlyExitCode);
            return;
          }
          const output = (options.gitNameOnlyFiles ?? []).join("\n") + "\n";
          emitter.stdout.emit("data", Buffer.from(output));
          emitter.emit("close", 0);
        } else if (subCommand === "diff" && args.includes("--unified=0")) {
          if (options.gitUnifiedExitCode !== undefined) {
            emitter.stderr.emit("data", Buffer.from("fatal: ambiguous argument"));
            emitter.emit("close", options.gitUnifiedExitCode);
            return;
          }
          // Last arg that's a file path
          const fileArg = args[args.length - 1] as string;
          const output = options.gitDiffOutput?.[fileArg] ?? "";
          emitter.stdout.emit("data", Buffer.from(output));
          emitter.emit("close", 0);
        } else {
          emitter.emit("close", options.exitCode ?? 0);
        }
      } else {
        emitter.emit("close", options.exitCode ?? 0);
      }
    });

    return emitter;
  } as unknown as typeof import("node:child_process").spawn;
}

describe("TC-CLG-GATE-01: coverage command exit non-0 → gate returns failed", async () => {
  it("command exits with code 1 → PhaseResult status failed", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lcov-gate-test-"));

    try {
      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "false", // always fails
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
      });

      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("TC-CLG-GATE-02: lcov file absent → gate returns failed", async () => {
  it("command succeeds but lcovPath does not exist → failed", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lcov-gate-test-"));

    try {
      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true", // always succeeds
          lcovPath: "coverage/lcov.info", // file does not exist
          include: ["src/**"],
        },
        baseBranch: "main",
      });

      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("failed");
      expect(result.stdout).toMatch(/lcov file not found/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("TC-CLG-GATE-03: lcov present + no changed files → passed", async () => {
  it("command succeeds, lcov present, no changed files from git → passed", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lcov-gate-test-"));

    try {
      // Create a minimal lcov file
      const lcovDir = path.join(tmpDir, "coverage");
      await fs.mkdir(lcovDir, { recursive: true });
      const lcovContent = `SF:src/foo.ts\nDA:1,5\nend_of_record\n`;
      await fs.writeFile(path.join(lcovDir, "lcov.info"), lcovContent, "utf-8");

      // Fake spawn: no changed files
      const fakeSpawn = makeFakeSpawn({ gitNameOnlyFiles: [] });

      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
        spawn: fakeSpawn,
      });

      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("passed");
      expect(result.exitCode).toBe(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("TC-CLG-GATE-04: lcov present + evaluation failed → gate returns failed", async () => {
  it("changed file absent from lcov → failed PhaseResult", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lcov-gate-test-"));

    try {
      // Create lcov WITHOUT the changed file
      const lcovDir = path.join(tmpDir, "coverage");
      await fs.mkdir(lcovDir, { recursive: true });
      const lcovContent = `SF:src/other.ts\nDA:1,5\nend_of_record\n`;
      await fs.writeFile(path.join(lcovDir, "lcov.info"), lcovContent, "utf-8");

      // Fake spawn: src/bar.ts was changed
      const fakeSpawn = makeFakeSpawn({
        gitNameOnlyFiles: ["src/bar.ts"],
        gitDiffOutput: {
          "src/bar.ts": "@@ -0,0 +1,3 @@\n",
        },
      });

      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
        spawn: fakeSpawn,
      });

      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("src/bar.ts");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("TC-CLG-GATE-05: git diff (file list) failure → gate fails closed", async () => {
  it("git diff --name-only exits non-zero → failed PhaseResult, not vacuous pass", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lcov-gate-test-"));

    try {
      const lcovDir = path.join(tmpDir, "coverage");
      await fs.mkdir(lcovDir, { recursive: true });
      const lcovContent = `SF:src/foo.ts\nDA:1,5\nend_of_record\n`;
      await fs.writeFile(path.join(lcovDir, "lcov.info"), lcovContent, "utf-8");

      const fakeSpawn = makeFakeSpawn({ gitNameOnlyExitCode: 128 });

      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
        spawn: fakeSpawn,
      });

      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("failing closed");
      expect(result.stdout).toContain("failed to derive changed lines");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("TC-CLG-GATE-06: git diff (per-file) failure → gate fails closed", async () => {
  it("git diff --unified=0 exits non-zero → failed PhaseResult, file not silently passed", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lcov-gate-test-"));

    try {
      const lcovDir = path.join(tmpDir, "coverage");
      await fs.mkdir(lcovDir, { recursive: true });
      const lcovContent = `SF:src/bar.ts\nDA:1,5\nend_of_record\n`;
      await fs.writeFile(path.join(lcovDir, "lcov.info"), lcovContent, "utf-8");

      const fakeSpawn = makeFakeSpawn({
        gitNameOnlyFiles: ["src/bar.ts"],
        gitUnifiedExitCode: 128,
      });

      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
        spawn: fakeSpawn,
      });

      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("failing closed");
      expect(result.stdout).toContain("src/bar.ts");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
