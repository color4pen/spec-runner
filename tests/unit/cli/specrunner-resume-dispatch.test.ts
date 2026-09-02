/**
 * Tests for bin/specrunner.ts `job resume` dispatch — argument parsing
 *
 * TC-DISPATCH-001: job resume with valid slug → calls runResume with slug
 * TC-DISPATCH-002: job resume without slug → exit 2
 * TC-DISPATCH-003: job resume with --from=critic → passes from: 'critic' to runResume (no CLI enum)
 * TC-DISPATCH-004: job resume with --from=fixer → passes from: 'fixer' to runResume (no CLI enum)
 * TC-DISPATCH-005: job resume with --from=creator → passes from: 'creator' to runResume (no CLI enum)
 * TC-DISPATCH-006: job resume with arbitrary --from value → passes to runResume (core validates)
 * TC-DISPATCH-007: job resume with --force → passes force: true
 * TC-DISPATCH-008: job resume with unknown flag → exit 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Must mock runResume BEFORE importing main, since vitest hoists vi.mock
// handleJobResume delegates to runResume so tests can still assert on runResume calls.
// FlagParseError is lazily imported at call time (not captured in factory closure) to ensure
// class identity matches the instance that bin/specrunner.ts checks via instanceof.
vi.mock("../../../src/cli/resume.js", async () => {
  const nodeFs = await import("node:fs");
  const nodePath = await import("node:path");

  const runResume = vi.fn().mockResolvedValue(undefined);

  const handleJobResume = vi.fn(async (parsed: any, ctx?: any) => {
    // Lazy import at call time ensures same FlagParseError instance as bin/specrunner.ts
    const { FlagParseError } = await import("../../../src/cli/flag-parser.js");

    if (parsed.flags?.["detach"] && parsed.flags?.["json"]) {
      throw new FlagParseError("--detach and --json are mutually exclusive");
    }
    const fromIssue = typeof parsed.flags?.["from-issue"] === "number" ? parsed.flags["from-issue"] : undefined;
    if (fromIssue !== undefined && parsed.positional !== undefined) {
      throw new FlagParseError("Usage error: --from-issue and positional <slug> are mutually exclusive");
    }
    const promptText = parsed.flags?.["prompt"] as string | undefined;
    const promptFile = parsed.flags?.["prompt-file"] as string | undefined;
    if (promptText !== undefined && promptFile !== undefined) {
      throw new FlagParseError("--prompt and --prompt-file are mutually exclusive.");
    }
    let resolvedPrompt = promptText;
    if (promptFile !== undefined) {
      try {
        resolvedPrompt = nodeFs.default.readFileSync(
          nodePath.default.resolve(process.cwd(), promptFile),
          "utf-8",
        );
      } catch (err) {
        process.stderr.write(`Cannot read prompt file '${promptFile}': ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    }
    if (!parsed.positional && fromIssue === undefined) {
      throw new FlagParseError("Usage error: 'job resume' requires a <slug> argument or --from-issue <n>");
    }
    if (parsed.positional) {
      await runResume(parsed.positional, {
        from: parsed.flags?.["from"] as string | undefined,
        force: !!parsed.flags?.["force"],
        logLevel: "default",
        cwd: process.cwd(),
        repoRoot: ctx?.repoRoot,
        prompt: resolvedPrompt,
        json: !!parsed.flags?.["json"],
        noWorktree: !!parsed.flags?.["no-worktree"],
        applyCanon: !!parsed.flags?.["apply-canon"],
        adoptCommits: !!parsed.flags?.["adopt-commits"],
        wontfix: parsed.flags?.["wontfix"] as string | undefined,
        wontfixReason: parsed.flags?.["wontfix-reason"] as string | undefined,
      });
    }
  });

  return { runResume, handleJobResume };
});

// Mock detectWorktree so worktree guard does not block dispatch tests
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));

// Mock all other CLI commands to avoid side effects
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn(), handleInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn(), handleLogin: vi.fn() }));
vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn(), handleJobStart: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn(), handleJobLs: vi.fn(), handleJobStats: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn(), handleDoctor: vi.fn(), handleDoctorRepair: vi.fn(), buildExecFile: vi.fn() }));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0), handleJobCancel: vi.fn(), VALID_JOB_ID_CHARS: /^[a-zA-Z0-9_-]+$/ }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn(), handleJobShow: vi.fn() }));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn() }));

let originalArgv: string[];
let _exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
// Preserve and clear env vars that affect resolveLogLevel so tests are environment-agnostic
let originalDebug: string | undefined;
let originalSpecrunnerLogLevel: string | undefined;

beforeEach(() => {
  originalArgv = process.argv;
  originalDebug = process.env["DEBUG"];
  originalSpecrunnerLogLevel = process.env["SPECRUNNER_LOG_LEVEL"];
  // Clear env vars that would override the default log level
  delete process.env["DEBUG"];
  delete process.env["SPECRUNNER_LOG_LEVEL"];
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  _exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  process.argv = originalArgv;
  // Restore env vars
  if (originalDebug !== undefined) {
    process.env["DEBUG"] = originalDebug;
  } else {
    delete process.env["DEBUG"];
  }
  if (originalSpecrunnerLogLevel !== undefined) {
    process.env["SPECRUNNER_LOG_LEVEL"] = originalSpecrunnerLogLevel;
  } else {
    delete process.env["SPECRUNNER_LOG_LEVEL"];
  }
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

// TC-DISPATCH-003: job resume with --from=critic → passed to runResume (CLI no longer rejects)
describe("TC-DISPATCH-003: --from=critic passes through to runResume", () => {
  it("passes from: 'critic' to runResume without CLI-level rejection", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-slug", "--from=critic"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ from: "critic" }),
    );
  });
});

// TC-DISPATCH-004: job resume with --from=fixer → passed to runResume (CLI no longer rejects)
describe("TC-DISPATCH-004: --from=fixer passes through to runResume", () => {
  it("passes from: 'fixer' to runResume without CLI-level rejection", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-slug", "--from=fixer"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ from: "fixer" }),
    );
  });
});

// TC-DISPATCH-005: job resume with --from=creator → passed to runResume (CLI no longer rejects)
describe("TC-DISPATCH-005: --from=creator passes through to runResume", () => {
  it("passes from: 'creator' to runResume without CLI-level rejection", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-slug", "--from=creator"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ from: "creator" }),
    );
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

// TC-DISPATCH-006: job resume with arbitrary --from value → CLI accepts, passes to core
// (Validation moved to core: buildAllowedStepSet → resolveResumeStep)
describe("TC-DISPATCH-006: arbitrary --from value passes through CLI to runResume", () => {
  it("passes from: 'nonexistent-step' to runResume (CLI no longer rejects; core validates)", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-slug", "--from=nonexistent-step"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ from: "nonexistent-step" }),
    );
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
