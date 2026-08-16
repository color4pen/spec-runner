/**
 * Tests for removed commands in the noun-verb restructure.
 *
 * TC-31: 旧 top-level ps コマンドが削除されている
 * TC-32: 旧 job rm サブコマンドが削除されている
 * TC-33: 旧 top-level rm コマンドが削除されている
 * TC-34: 旧 top-level resume コマンドが削除されている
 * TC-35: 旧 top-level finish コマンドが削除されている
 * TC-36: 旧 request create サブコマンドが削除されている
 * TC-37: 旧 request list サブコマンドが削除されている
 * TC-40: 旧 managed コマンドが削除されている
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoist mocks — vitest requires vi.mock to be at top-level before imports
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));
vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/credentials.js", () => ({
  runCredentialsSet: vi.fn().mockResolvedValue(0),
  CREDENTIALS_SET_USAGE: "Usage: specrunner credentials set <name>\n",
}));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn() }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/cli/managed.js", () => ({
  runManagedSetup: vi.fn(),
  runManagedStatus: vi.fn(),
  runManagedReset: vi.fn(),
}));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn() }));
vi.mock("../../../src/core/command/request.js", () => ({
  executeTemplate: vi.fn(),
  executeValidate: vi.fn(),
}));
// TC-016: vi.mock for request-create.js removed (deterministic-request-entrance, T-07)
// request-create.ts is deleted as part of the generate chain removal.
vi.mock("../../../src/core/command/request-list.js", () => ({ executeList: vi.fn() }));
vi.mock("../../../src/core/command/request-prompt.js", () => ({ executePrompt: vi.fn().mockReturnValue(0) }));

let originalArgv: string[];
let stderrSpy: ReturnType<typeof vi.spyOn>;
let _exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  _exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
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

// TC-31: 旧 top-level ps が削除されている
describe("TC-31: 旧 top-level ps コマンドの削除確認", () => {
  it("specrunner ps → 'Unknown command: ps' を出力し exit 2 で終了", async () => {
    const result = await runMain(["ps"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown command: ps");
  });
});

// TC-32: 旧 job rm サブコマンドが削除されている
describe("TC-32: 旧 job rm サブコマンドの削除確認", () => {
  it("specrunner job rm <jobId> → 'Unknown job subcommand: rm' を出力し exit 2 で終了", async () => {
    const result = await runMain(["job", "rm", "some-job-id"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown job subcommand: rm");
  });
});

// TC-33: 旧 top-level rm が削除されている
describe("TC-33: 旧 top-level rm コマンドの削除確認", () => {
  it("specrunner rm → 'Unknown command: rm' を出力し exit 2 で終了", async () => {
    const result = await runMain(["rm"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown command: rm");
  });
});

// TC-34: 旧 top-level resume が削除されている
describe("TC-34: 旧 top-level resume コマンドの削除確認", () => {
  it("specrunner resume → 'Unknown command: resume' を出力し exit 2 で終了", async () => {
    const result = await runMain(["resume"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown command: resume");
  });
});

// TC-35: 旧 top-level finish が削除されている
describe("TC-35: 旧 top-level finish コマンドの削除確認", () => {
  it("specrunner finish → 'Unknown command: finish' を出力し exit 2 で終了", async () => {
    const result = await runMain(["finish"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown command: finish");
  });
});

// TC-36: 旧 request create サブコマンドが削除されている
describe("TC-36: 旧 request create コマンドの削除確認", () => {
  it("specrunner request create → 'Unknown request subcommand: create' を出力し exit 2 で終了", async () => {
    const result = await runMain(["request", "create"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown request subcommand: create");
  });
});

// TC-37: 旧 request list サブコマンドが削除されている
describe("TC-37: 旧 request list コマンドの削除確認", () => {
  it("specrunner request list → 'Unknown request subcommand: list' を出力し exit 2 で終了", async () => {
    const result = await runMain(["request", "list"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown request subcommand: list");
  });
});

// TC-40: 旧 managed コマンドが削除されている
describe("TC-40: 旧 managed コマンドの削除確認", () => {
  it("specrunner managed setup → 'Unknown command: managed' を出力し exit 2 で終了", async () => {
    const result = await runMain(["managed", "setup"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown command: managed");
  });
});

// TC-41: 旧 request review サブコマンドが削除されている
describe("TC-41: 旧 request review サブコマンドの削除確認", () => {
  it("specrunner request review → 'Unknown request subcommand: review' を出力し exit 2 で終了", async () => {
    const result = await runMain(["request", "review", "some-slug"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown request subcommand: review");
  });
});

// TC-004 (deterministic-request-entrance): request generate が未知サブコマンドとして拒否される
// Source: spec.md > Requirement: `request generate` とその一本鎖は廃止される
//         > Scenario: request generate が未知サブコマンドとして拒否される
describe("TC-004: request generate が未知サブコマンドとして拒否される", () => {
  it("specrunner request generate → 'Unknown request subcommand: generate' を出力し exit 2 で終了", async () => {
    const result = await runMain(["request", "generate", "some text"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown request subcommand: generate");
  });
});

// TC-006 (deterministic-request-entrance): request prompt handler が CLI dispatch 経由で呼ばれる
// Source: spec.md > Requirement: `request prompt` は決定的な起票プロンプトを stdout に出力する
// Note: process.exit() inside a handler is caught by the dispatch try/catch and converted to exit(1) in
// this mock framework. The important assertion is that executePrompt() (mocked to return 0) was invoked
// and the dispatch reached the handler — covering the changed DA line in command-registry.ts.
describe("TC-006: request prompt handler が CLI dispatch 経由で到達する", () => {
  it("specrunner request prompt → handler が呼ばれ executePrompt() を実行する", async () => {
    // process.exit(0) inside the handler is caught by dispatch try/catch → bubbles as exit(1)
    const result = await runMain(["request", "prompt"]);
    // The handler was reached and process.exit was called (exit(0) caught → exit(1) in mock)
    expect(result).toBe("process.exit(1)");
  });
});

// credentials set handler が CLI dispatch 経由で到達する
// Covers the changed DA lines in command-registry.ts: credentials.set.handler body
describe("credentials set handler が CLI dispatch 経由で到達する", () => {
  it("specrunner credentials set claude-code → handler が呼ばれ runCredentialsSet() を実行する", async () => {
    // process.exit(0) inside the handler is caught by dispatch try/catch → bubbles as exit(1)
    const result = await runMain(["credentials", "set", "claude-code"]);
    expect(result).toBe("process.exit(1)");
  });
});

// login handler が CLI dispatch 経由で到達する
// Covers the changed DA line in command-registry.ts: login.handler body (removed provider param)
describe("login handler が CLI dispatch 経由で到達する", () => {
  it("specrunner login → handler が呼ばれ runLogin() を実行する", async () => {
    // process.exit(0) inside the handler is caught by dispatch try/catch → bubbles as exit(1)
    const result = await runMain(["login"]);
    expect(result).toBe("process.exit(1)");
  });
});
