/**
 * Tests for bin/specrunner.ts `job resume` dispatch — argument parsing
 *
 * TC-DISPATCH-001: job resume with valid slug → calls runResume with slug
 * TC-DISPATCH-002: job resume without slug → exit 2
 * TC-DISPATCH-003: job resume with --from=critic (legacy alias) → exit 2 (invalid value)
 * TC-DISPATCH-004: job resume with --from=fixer (legacy alias) → exit 2 (invalid value)
 * TC-DISPATCH-005: job resume with --from=creator (legacy alias) → exit 2 (invalid value)
 * TC-DISPATCH-006: job resume with invalid --from value → exit 2
 * TC-DISPATCH-007: job resume with --force → passes force: true
 * TC-DISPATCH-008: job resume with unknown flag → exit 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Must mock runResume BEFORE importing main, since vitest hoists vi.mock
vi.mock("../../../src/cli/resume.js", () => ({
  runResume: vi.fn().mockResolvedValue(undefined),
}));

// Mock detectWorktree so worktree guard does not block dispatch tests
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));

// Mock all other CLI commands to avoid side effects
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn() }));
vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn() }));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn() }));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn() }));

let originalArgv: string[];
let _exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

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

async function runMain(args: string[]) {
  process.argv = ["node", "specrunner", ...args];
  // Reset module to pick up fresh mocks
  const mod = await import("../../../bin/specrunner.js");
  try {
    await mod.main();
  } catch (err) {
    // process.exit throws
    return (err as Error).message;
  }
}

// TC-DISPATCH-001: job resume with valid slug → calls runResume
describe("TC-DISPATCH-001: job resume with valid slug", () => {
  it("calls runResume with the slug argument", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-feature-slug"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-feature-slug",
      expect.objectContaining({ from: undefined, force: false, logLevel: "default" }),
    );
  });
});

// TC-DISPATCH-002: job resume without slug → exit 2
describe("TC-DISPATCH-002: job resume without slug", () => {
  it("exits with code 2 when no slug is provided", async () => {
    const error = await runMain(["job", "resume"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("requires a <slug>"));
  });
});

// TC-DISPATCH-003: job resume with --from=critic (legacy alias, now invalid)
describe("TC-DISPATCH-003: --from=critic (legacy alias rejected)", () => {
  it("exits with code 2 for legacy alias 'critic'", async () => {
    const error = await runMain(["job", "resume", "my-slug", "--from=critic"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --from value"));
  });
});

// TC-DISPATCH-004: job resume with --from=fixer (legacy alias, now invalid)
describe("TC-DISPATCH-004: --from=fixer (legacy alias rejected)", () => {
  it("exits with code 2 for legacy alias 'fixer'", async () => {
    const error = await runMain(["job", "resume", "my-slug", "--from=fixer"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --from value"));
  });
});

// TC-DISPATCH-005: job resume with --from=creator (legacy alias, now invalid)
describe("TC-DISPATCH-005: --from=creator (legacy alias rejected)", () => {
  it("exits with code 2 for legacy alias 'creator'", async () => {
    const error = await runMain(["job", "resume", "my-slug", "--from=creator"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --from value"));
  });
});

// TC-DISPATCH-005b: job resume with --from=code-fixer (valid step name)
describe("TC-DISPATCH-005b: --from=code-fixer (valid step name accepted)", () => {
  it("passes from: 'code-fixer' to runResume", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-slug", "--from=code-fixer"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ from: "code-fixer" }),
    );
  });
});

// TC-DISPATCH-006: job resume with invalid --from value → exit 2
describe("TC-DISPATCH-006: invalid --from value", () => {
  it("exits with code 2 for invalid --from value", async () => {
    const error = await runMain(["job", "resume", "my-slug", "--from=invalid"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --from value"));
  });
});

// TC-DISPATCH-007: job resume with --force → passes force: true
describe("TC-DISPATCH-007: --force flag", () => {
  it("passes force: true to runResume", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-slug", "--force"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ force: true }),
    );
  });
});

// TC-DISPATCH-008: job resume with unknown flag → exit 2
describe("TC-DISPATCH-008: unknown flag", () => {
  it("exits with code 2 for unknown flags", async () => {
    const error = await runMain(["job", "resume", "my-slug", "--unknown-flag"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown flag(s)"));
  });
});

// TC-DISPATCH-009: job resume with --prompt → passes prompt to runResume
describe("TC-DISPATCH-009: --prompt flag passes prompt to runResume", () => {
  it("passes prompt: 'extra context' to runResume", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-slug", "--prompt=extra context"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ prompt: "extra context" }),
    );
  });
});

// TC-DISPATCH-010: job resume with both --prompt and --prompt-file → exit 2
describe("TC-DISPATCH-010: --prompt and --prompt-file are mutually exclusive", () => {
  it("exits with code 2 and writes error message when both flags are specified", async () => {
    const error = await runMain([
      "job", "resume", "my-slug",
      "--prompt=inline text",
      "--prompt-file=./some-file.md",
    ]);
    expect(error).toBe("process.exit(2)");
    // main() writes FlagParseError.message when caught — no "Error: " prefix
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("--prompt and --prompt-file are mutually exclusive"),
    );
  });
});

// TC-DISPATCH-011: job resume with --prompt-file reads file content and passes to runResume
describe("TC-DISPATCH-011: --prompt-file reads file content and passes to runResume", () => {
  it("passes file content as prompt", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");
    const tmpFile = path.join(os.tmpdir(), `tc-dispatch-011-${Date.now()}.md`);
    await fs.writeFile(tmpFile, "fix content");
    try {
      await runMain(["job", "resume", "my-slug", `--prompt-file=${tmpFile}`]);
      expect(runResume).toHaveBeenCalledWith(
        "my-slug",
        expect.objectContaining({ prompt: "fix content" }),
      );
    } finally {
      await fs.rm(tmpFile, { force: true });
    }
  });
});

// TC-DISPATCH-012: job resume with --prompt-file pointing to nonexistent path → exit 1
describe("TC-DISPATCH-012: --prompt-file with nonexistent path → exit 1", () => {
  it("exits with code 1 and writes error to stderr", async () => {
    const error = await runMain([
      "job", "resume", "my-slug",
      "--prompt-file=./nonexistent-file-99999.md",
    ]);
    expect(error).toBe("process.exit(1)");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cannot read prompt file"),
    );
  });
});
