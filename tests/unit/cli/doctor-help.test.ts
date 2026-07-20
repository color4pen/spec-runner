/**
 * TC-013: doctor --help が usage と --json の記載を表示する
 * TC-020: doctor --help が "No detailed help available." を表示しない
 *
 * Source:
 *   spec.md > doctor --help は usage を表示する > Scenario: doctor --help
 *   tasks.md > T-08: doctor --help の usage を追加
 *
 * 実装前は RED:
 *   - doctor エントリに usage フィールドが無いため bin/specrunner.ts が
 *     NO_DETAILED_HELP_USAGE = "No detailed help available." を表示する
 *   - TC-013: --json が含まれない → fail
 *   - TC-020: "No detailed help available." が含まれる → fail
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock heavy dependencies that doctor --help doesn't need
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
vi.mock("../../../src/core/command/reviewers-new.js", () => ({
  executeReviewersNew: vi.fn().mockResolvedValue(0),
}));

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

function getStdoutOutput(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

// ---------------------------------------------------------------------------
// TC-013: doctor --help が usage と --json の記載を表示する
// ---------------------------------------------------------------------------
describe("TC-013: doctor --help が usage と --json を表示する", () => {
  it("doctor --help で exit 0", async () => {
    const result = await runMain(["doctor", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("doctor --help の出力に 'doctor' が含まれる", async () => {
    await runMain(["doctor", "--help"]);
    const output = getStdoutOutput();
    expect(output).toContain("doctor");
  });

  it("doctor --help の出力に '--json' が含まれる", async () => {
    await runMain(["doctor", "--help"]);
    const output = getStdoutOutput();
    expect(output).toContain("--json");
  });

  it("doctor --help の出力が 'Usage:' または usage 文字列を含む（詳細な説明あり）", async () => {
    await runMain(["doctor", "--help"]);
    const output = getStdoutOutput();
    // Should contain some form of usage description, not just a bare "doctor"
    expect(output.length).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// TC-020: doctor --help が "No detailed help available." を表示しない
// ---------------------------------------------------------------------------
describe("TC-020: doctor --help が 'No detailed help available.' を表示しない", () => {
  it("doctor --help の標準出力に 'No detailed help available.' が含まれない", async () => {
    await runMain(["doctor", "--help"]);
    const output = getStdoutOutput();
    expect(output).not.toContain("No detailed help available.");
  });

  it("doctor -h の標準出力に 'No detailed help available.' が含まれない", async () => {
    await runMain(["doctor", "-h"]);
    const output = getStdoutOutput();
    expect(output).not.toContain("No detailed help available.");
  });
});

// ---------------------------------------------------------------------------
// 追加: DOCTOR_USAGE 定数が command-registry.ts に定義されているかを静的確認
// ---------------------------------------------------------------------------
describe("doctor --help: DOCTOR_USAGE 定数の存在確認", () => {
  it("command-registry.ts に DOCTOR_USAGE 定数または doctor usage エントリが存在する", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/cli/command-registry.ts"),
      "utf-8",
    );
    // Either DOCTOR_USAGE constant or usage: field in doctor entry
    const hasDocorUsage =
      src.includes("DOCTOR_USAGE") || /doctor\s*:\s*\{[^}]*usage\s*:/s.test(src);
    expect(hasDocorUsage).toBe(true);
  });
});
