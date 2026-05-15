/**
 * TC-043: all pass → returns 0
 * TC-044: warn only → returns 0
 * TC-045: 1 fail → returns 1
 * TC-046: required=false fail → returns 1
 * TC-047: runDoctor throws → catch in bin handles exit 2
 * TC-052: doctor case calls runDoctor({ json: false })
 * TC-053: doctor --json calls runDoctor({ json: true })
 * TC-054: USAGE string contains "doctor"
 * TC-062: empty-args → USAGE to stderr + exit 2 (spec: cli-commands/spec.md L9)
 * TC-063: --help/-h → USAGE to stdout + exit 0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/core/doctor/runner.js", () => ({
  runChecks: vi.fn(),
}));
vi.mock("../../../src/core/doctor/checks/index.js", () => ({
  allChecks: [],
  commonChecks: [],
  managedChecks: [],
  localChecks: [],
}));
vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    github: { accessToken: "ghp_test" },
    agents: {},
  }),
}));
vi.mock("../../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({
    verifyTokenScopes: vi.fn(),
  }),
}));

import { runChecks } from "../../../src/core/doctor/runner.js";

describe("runDoctor exit codes", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TC-043: all pass → returns 0
  it("returns 0 when all results are pass", async () => {
    vi.mocked(runChecks).mockResolvedValue([
      { name: "a", category: "runtime", required: true, status: "pass", message: "ok" },
    ]);
    const { runDoctor } = await import("../../../src/cli/doctor.js");
    const code = await runDoctor({ json: false });
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  // TC-044: warn only → returns 0
  it("returns 0 when results contain warn but no fail", async () => {
    vi.mocked(runChecks).mockResolvedValue([
      { name: "a", category: "env", required: false, status: "warn", message: "missing env" },
    ]);
    const { runDoctor } = await import("../../../src/cli/doctor.js");
    const code = await runDoctor({ json: false });
    expect(code).toBe(0);
  });

  // TC-045: 1 fail → returns 1
  it("returns 1 when at least one result is fail", async () => {
    vi.mocked(runChecks).mockResolvedValue([
      { name: "a", category: "config", required: true, status: "fail", message: "missing" },
    ]);
    const { runDoctor } = await import("../../../src/cli/doctor.js");
    const code = await runDoctor({ json: false });
    expect(code).toBe(1);
  });

  // TC-046: required=false fail → still returns 1
  it("returns 1 for required=false fail", async () => {
    vi.mocked(runChecks).mockResolvedValue([
      { name: "a", category: "env", required: false, status: "fail", message: "failed" },
    ]);
    const { runDoctor } = await import("../../../src/cli/doctor.js");
    const code = await runDoctor({ json: false });
    expect(code).toBe(1);
  });
});

describe("USAGE string (command-registry.ts)", () => {
  // TC-054: USAGE is now defined in src/cli/command-registry.ts
  it("USAGE string contains 'doctor' with description", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../../../src/cli/command-registry.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(src).toContain("doctor");
    expect(src).toContain("Diagnose environment");
  });
});

describe("bin/specrunner.ts empty-args and help routing", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let origArgv: string[];
  let main: () => Promise<void>;

  beforeEach(async () => {
    origArgv = process.argv;
    exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null) => {
      throw new Error(`process.exit:${_code}`);
    });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    // Import main() once — it is exported and not auto-invoked in test context
    const mod = await import("../../../bin/specrunner.js");
    main = mod.main;
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.restoreAllMocks();
  });

  // TC-062: empty-args → stderr + exit 2 (MODIFIED Requirement, cli-commands/spec.md L9)
  it("TC-062: writes USAGE to stderr and exits 2 when no command given", async () => {
    process.argv = ["node", "specrunner"];
    await expect(main()).rejects.toThrow("process.exit:2");
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderrSpy).toHaveBeenCalled();
    const stderrArg = stderrSpy.mock.calls[0]?.[0] as string;
    expect(stderrArg).toContain("doctor");
    // stdout must NOT have been called with USAGE
    const stdoutArgs = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join("");
    expect(stdoutArgs).not.toContain("Usage: specrunner");
  });

  // TC-063: --help/-h → stdout + exit 0
  it("TC-063: writes USAGE to stdout and exits 0 for --help", async () => {
    process.argv = ["node", "specrunner", "--help"];
    await expect(main()).rejects.toThrow("process.exit:0");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdoutSpy).toHaveBeenCalled();
    const stdoutArg = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(stdoutArg).toContain("Usage: specrunner");
    // stderr must NOT have been called with USAGE
    const stderrArgs = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join("");
    expect(stderrArgs).not.toContain("Usage: specrunner");
  });

  it("TC-063b: writes USAGE to stdout and exits 0 for -h", async () => {
    process.argv = ["node", "specrunner", "-h"];
    await expect(main()).rejects.toThrow("process.exit:0");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdoutSpy).toHaveBeenCalled();
    const stdoutArg = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(stdoutArg).toContain("Usage: specrunner");
  });
});
