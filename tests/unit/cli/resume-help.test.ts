/**
 * TC-007: job resume --help の出力が詳細ヘルプを含む
 *
 * Source:
 *   spec.md > job resume の詳細ヘルプ > Scenario: 詳細ヘルプの内容
 *   test-cases.md > TC-007
 *
 * 実装前は RED:
 *   - resume エントリに usage フィールドが無いため bin/specrunner.ts が
 *     NO_DETAILED_HELP_USAGE = "No detailed help available." を表示する
 *   - 出力に --from, --prompt, --apply-canon 等が含まれない → fail
 *   - 出力に "No detailed help available." が含まれる → fail
 *
 * 実装後は GREEN:
 *   - JOB_RESUME_USAGE 定数が command-registry.ts に追加され resume エントリに配線される
 *   - job resume --help は詳細ヘルプを表示し、11 flag すべてを列挙する
 *
 * doctor-help.test.ts と同型の実装パターンを使用する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock heavy dependencies not needed for help dispatch
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
let _stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  _stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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
// TC-007: job resume --help が exit 0 で詳細ヘルプを表示する
// ---------------------------------------------------------------------------

describe("TC-007: job resume --help が exit 0 で詳細ヘルプを表示する", () => {
  it("TC-007: job resume --help で exit 0", async () => {
    const result = await runMain(["job", "resume", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("TC-007: job resume -h で exit 0（短縮形）", async () => {
    const result = await runMain(["job", "resume", "-h"]);
    expect(result).toBe("process.exit(0)");
  });

  it("TC-007: runResume は --help 時に呼ばれない", async () => {
    // runResume が呼ばれていないことで、ヘルプ dispatch が正常に機能していることを確認
    const { runResume } = await import("../../../src/cli/resume.js");
    await runMain(["job", "resume", "--help"]);
    expect(runResume).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-007: 出力が "No detailed help available." を含まない
// ---------------------------------------------------------------------------

describe("TC-007: job resume --help の出力が 'No detailed help available.' を含まない", () => {
  it("TC-007: --help の標準出力に 'No detailed help available.' が含まれない", async () => {
    // TC-007: In RED state, usage field is absent → NO_DETAILED_HELP_USAGE is shown → test fails
    // In GREEN state, JOB_RESUME_USAGE is configured → detailed help shown → test passes
    await runMain(["job", "resume", "--help"]);
    const output = getStdoutOutput();
    expect(output).not.toContain("No detailed help available.");
  });

  it("TC-007: -h の標準出力に 'No detailed help available.' が含まれない", async () => {
    await runMain(["job", "resume", "-h"]);
    const output = getStdoutOutput();
    expect(output).not.toContain("No detailed help available.");
  });
});

// ---------------------------------------------------------------------------
// TC-007: 出力が重要な flag を含む
// ---------------------------------------------------------------------------

describe("TC-007: job resume --help の出力が重要な flag を含む", () => {
  it("TC-007: 出力に --from が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("--from");
  });

  it("TC-007: 出力に --prompt が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("--prompt");
  });

  it("TC-007: 出力に --prompt-file が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("--prompt-file");
  });

  it("TC-007: 出力に --apply-canon が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("--apply-canon");
  });

  it("TC-007: 出力に --adopt-commits が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("--adopt-commits");
  });

  it("TC-007: 出力に --detach が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("--detach");
  });

  it("TC-007: 出力に --force が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("--force");
  });

  it("TC-007: 出力に --json が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("--json");
  });

  it("TC-007: 出力が 'No detailed help' より実質的に長い（詳細 usage が存在する）", async () => {
    await runMain(["job", "resume", "--help"]);
    const output = getStdoutOutput();
    // "No detailed help available." is 30 chars; real usage should be much longer
    expect(output.length).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// TC-016: ヘルプに相互排他 2 組と --from 有効値が明記される
// Source: test-cases.md > TC-016
// ---------------------------------------------------------------------------

describe("TC-016: job resume --help の出力に相互排他対と --from 有効値が含まれる", () => {
  it("TC-016: 出力に 'Mutually exclusive' が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(getStdoutOutput()).toContain("Mutually exclusive");
  });

  it("TC-016: 出力に --detach と --json の相互排他が明記される", async () => {
    await runMain(["job", "resume", "--help"]);
    const output = getStdoutOutput();
    // JOB_RESUME_USAGE contains "--detach  /  --json"
    expect(output).toContain("--detach");
    expect(output).toContain("--json");
    // Verify they appear together in a mutually-exclusive context
    expect(output).toMatch(/--detach\s*\/\s*--json|--detach.*--json.*exclusive|--json.*--detach.*exclusive/);
  });

  it("TC-016: 出力に --prompt と --prompt-file の相互排他が明記される", async () => {
    await runMain(["job", "resume", "--help"]);
    const output = getStdoutOutput();
    expect(output).toMatch(/--prompt\s*\/\s*--prompt-file|Mutually exclusive with --prompt/);
  });

  it("TC-016: 出力に --from の有効値（step 名列挙）が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    const output = getStdoutOutput();
    // JOB_RESUME_USAGE lists valid steps after "Valid steps:"
    expect(output).toContain("Valid steps:");
  });

  it("TC-016: 出力に複合 step が --from 対象外である注記が含まれる", async () => {
    await runMain(["job", "resume", "--help"]);
    const output = getStdoutOutput();
    // JOB_RESUME_USAGE notes composite steps are not valid --from targets
    expect(output).toContain("composite step");
  });
});

// ---------------------------------------------------------------------------
// TC-007: JOB_RESUME_USAGE 定数が command-registry.ts に定義されているかを確認
// ---------------------------------------------------------------------------

describe("TC-007: JOB_RESUME_USAGE 定数の存在確認", () => {
  it("TC-007: command-registry.ts に JOB_RESUME_USAGE 定数または resume usage エントリが存在する", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/cli/command-registry.ts"),
      "utf-8",
    );
    // Either JOB_RESUME_USAGE constant or usage: field in resume entry
    const hasResumeUsage =
      src.includes("JOB_RESUME_USAGE") ||
      /resume\s*:\s*\{[^}]*usage\s*:/s.test(src);
    expect(
      hasResumeUsage,
      "command-registry.ts must define JOB_RESUME_USAGE or wire usage into the resume entry",
    ).toBe(true);
  });
});
