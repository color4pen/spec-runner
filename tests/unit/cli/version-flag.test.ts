/**
 * Integration tests for --version flag and unknown-command regression.
 *
 * TC-VERSION-FLAG-01: specrunner --version → stdout contains package.json version, exit 0
 * TC-VERSION-FLAG-02: specrunner foobar  → stderr contains "Unknown command:", exit 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Mock all CLI command handlers to avoid side-effects during dispatch tests.
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));
vi.mock("../../../src/cli/run.js", () => ({
  runRun: vi.fn().mockResolvedValue(undefined),
  handlePostPipelineState: vi.fn(),
}));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/archive.js", () => ({ runArchive: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/managed.js", () => ({
  runManagedSetup: vi.fn().mockResolvedValue(0),
  runManagedStatus: vi.fn().mockResolvedValue(0),
  runManagedReset: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request.js", () => ({
  executeTemplate: vi.fn().mockReturnValue(0),
  executeValidate: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request-create.js", () => ({
  executeCreate: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request-list.js", () => ({
  executeList: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request-new.js", () => ({
  executeNew: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/usage-show.js", () => ({
  showUsage: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/usage-summary.js", () => ({
  showUsageSummary: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/rules-new.js", () => ({
  executeRulesNew: vi.fn().mockResolvedValue(0),
}));

/** Read the actual package.json version so we can assert against it. */
function readPackageVersion(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // tests/unit/cli/ → repo root is 3 levels up
  const pkgPath = path.join(thisDir, "..", "..", "..", "package.json");
  const raw = fs.readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}

let originalArgv: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runMain(args: string[]): Promise<string | undefined> {
  process.argv = ["node", "specrunner", ...args];
  const mod = await import("../../../bin/specrunner.js");
  try {
    await mod.main();
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

// TC-VERSION-FLAG-01: --version → stdout contains package version, exit 0
describe("TC-VERSION-FLAG-01: specrunner --version", () => {
  it("exits with code 0", async () => {
    const result = await runMain(["--version"]);
    expect(result).toBe("process.exit(0)");
  });

  it("writes the package.json version to stdout", async () => {
    const expected = readPackageVersion();
    await runMain(["--version"]);
    const combined = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(combined).toContain(expected);
  });

  it("does not dispatch to any registered command", async () => {
    await runMain(["--version"]);
    // If dispatch had happened for an unknown command it would write to stderr and exit 2.
    // Confirm stderr has no "Unknown command" output.
    const stderrOut = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(stderrOut).not.toContain("Unknown command");
  });
});

// TC-VERSION-FLAG-02: unknown command → stderr "Unknown command:", exit 2 (regression)
describe("TC-VERSION-FLAG-02: unknown command regression", () => {
  it("exits with code 2 for an unknown command", async () => {
    const result = await runMain(["foobar"]);
    expect(result).toBe("process.exit(2)");
  });

  it("writes 'Unknown command: foobar' to stderr", async () => {
    await runMain(["foobar"]);
    const combined = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(combined).toContain("Unknown command: foobar");
  });
});
