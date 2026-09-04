/**
 * Dispatch boundary secret masking (TC-012, spec scenario
 * "境界の stderr 出力が secret をマスクする").
 *
 * The error boundary in bin/specrunner.ts applies maskSensitive() in place
 * on each stderr write.  These tests feed an error whose message contains a
 * token-shaped value through each boundary path (FlagParseError,
 * SpecRunnerError, unexpected Error) and assert that:
 *   - the token body is hidden while the identifying prefix remains, and
 *   - the write units / line structure are unchanged (masking must not alter
 *     the byte layout the exit contract fixture pins).
 *
 * The vi.mock set mirrors cli-exit-contract.test.ts so the harness can be
 * reused as-is.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { runCase } from "./exit-contract-harness.js";
import { resetMockDefaults } from "./exit-contract-setup.js";

// Token-shaped values that must never reach stderr in full.
const ANT_TOKEN = "sk-ant-api03-abcdefghijklmnop";
const GH_TOKEN = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// ---------------------------------------------------------------------------
// Mock declarations (hoisted by vitest) — keep in sync with
// cli-exit-contract.test.ts.
// ---------------------------------------------------------------------------

vi.mock("../archive.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../archive.js")>();
  return {
    ...actual,
    runArchive: vi.fn().mockResolvedValue(0),
  };
});

vi.mock("../archive-from-issue.js", () => ({
  runArchiveFromIssue: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));

vi.mock("../command-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../command-context.js")>();
  return {
    ...actual,
    buildCommandContext: vi.fn().mockResolvedValue({
      repoRoot: process.cwd(),
      invokerCwd: process.cwd(),
    }),
  };
});

vi.mock("../run.js", () => ({
  runRunCore: vi.fn().mockResolvedValue(0),
  handlePostPipelineState: vi.fn(),
  handleJobStart: vi.fn().mockResolvedValue(0),
}));

vi.mock("../resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resume.js")>();
  return {
    ...actual,
    runResumeCore: vi.fn().mockResolvedValue(0),
  };
});

vi.mock("../resume-from-issue.js", () => ({
  runResumeFromIssue: vi.fn().mockResolvedValue(0),
}));

vi.mock("../init.js", () => ({ runInit: vi.fn().mockResolvedValue(0), handleInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0), handleLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../doctor.js", () => ({
  runDoctor: vi.fn().mockResolvedValue(0),
  handleDoctor: vi.fn().mockResolvedValue(0),
  handleDoctorRepair: vi.fn().mockResolvedValue(0),
  buildExecFile: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function expectNoTokenBody(lines: string[]): void {
  for (const line of lines) {
    expect(line).not.toContain(ANT_TOKEN);
    expect(line).not.toContain(GH_TOKEN);
  }
}

describe("dispatch boundary masks secrets in stderr (TC-012)", () => {
  it("SpecRunnerError path: message and hint are masked, layout unchanged", async () => {
    const result = await runCase(["job", "archive", "my-slug"], async () => {
      await resetMockDefaults();
      const { runArchive } = await import("../archive.js");
      const { SpecRunnerError } = await import("../../errors.js");
      vi.mocked(runArchive).mockRejectedValue(
        new SpecRunnerError(
          "ARCHIVE_FAILED",
          `retry with token ${GH_TOKEN}`,
          `auth rejected for key ${ANT_TOKEN}`,
          1,
        ),
      );
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    // Same two write units as the unmasked base boundary: "Error: …\n", "Hint: …\n"
    expect(result.stderr).toEqual([
      "Error: auth rejected for key sk-ant-...\n",
      "Hint: retry with token ghp_...\n",
    ]);
    expectNoTokenBody(result.stderr);
  });

  it("FlagParseError path: parse message is masked, usage write is intact", async () => {
    const result = await runCase(["run", "--issue", ANT_TOKEN, "my-slug"], async () => {
      await resetMockDefaults();
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toEqual([]);
    // Two write units: parse message + "\n", then usage (no extra newline).
    expect(result.stderr).toHaveLength(2);
    expect(result.stderr[0]).toBe("--issue requires an integer (got: sk-ant-...)\n");
    expect(result.stderr[1]).toMatch(/^Usage: specrunner/);
    expect(result.stderr[1].endsWith("\n\n")).toBe(false);
    expectNoTokenBody(result.stderr);
  });

  it("unexpected Error path: Fatal line is masked", async () => {
    const result = await runCase(["job", "archive", "my-slug"], async () => {
      await resetMockDefaults();
      const { runArchive } = await import("../archive.js");
      vi.mocked(runArchive).mockRejectedValue(new Error(`boom ${ANT_TOKEN}`));
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual(["Fatal: boom sk-ant-...\n"]);
    expectNoTokenBody(result.stderr);
  });
});
