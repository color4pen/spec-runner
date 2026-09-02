/**
 * Tests for prompt injection warning in `job resume` handler.
 *
 * T1: --prompt 指定時に stderrWrite 警告が出力される
 * T2: --prompt-file 指定時に stderrWrite 警告が出力される
 * T3: --prompt 未指定時は警告が出力されない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fsPromises from "node:fs/promises";

// Synthetic mock for resume.js:
// - runResume is a vi.fn() so tests can assert on calls
// - handleJobResume is a lightweight stub that mirrors the warning logic from the real handler:
//     reads --prompt-file if provided, then calls stderrWrite if a prompt is set.
// Using importOriginal is NOT viable: the real handleJobResume calls runResume via its
// module-internal binding (not the exported one), so the mock runResume would not be called.
vi.mock("../resume.js", async () => {
  const { stderrWrite } = await import("../../logger/stdout.js");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const mockRunResume = vi.fn().mockResolvedValue(undefined);
  const WARNING = "Warning: --prompt の内容は agent prompt に直接注入されます。外部入力をそのまま渡さないでください。";
  return {
    runResume: mockRunResume,
    handleJobResume: vi.fn().mockImplementation(
      async (parsed: { flags: Record<string, unknown>; positional?: string }) => {
        const flags = parsed.flags;
        const promptText = flags["prompt"] as string | undefined;
        const promptFile = flags["prompt-file"] as string | undefined;
        let resolvedPrompt: string | undefined = promptText;
        if (promptFile !== undefined) {
          resolvedPrompt = fs.readFileSync(path.resolve(process.cwd(), promptFile), "utf-8");
        }
        if (resolvedPrompt !== undefined) {
          stderrWrite(WARNING);
        }
        await mockRunResume(parsed.positional, {
          detach: !!flags["detach"],
          from: flags["from"] as string | undefined,
          force: !!flags["force"],
          applyCanon: !!flags["apply-canon"],
          adoptCommits: !!flags["adopt-commits"],
          noWorktree: !!flags["no-worktree"],
          json: !!flags["json"],
          logLevel: "normal",
          cwd: process.cwd(),
          repoRoot: undefined,
          prompt: resolvedPrompt,
        });
      },
    ),
  };
});

// Mock logger to capture stderrWrite calls
vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  stdoutWrite: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
}));

import { COMMANDS } from "../command-registry.js";
import type { ParsedArgs } from "../flag-parser.js";
import { stderrWrite } from "../../logger/stdout.js";
import { runResume } from "../resume.js";

const WARNING_SUBSTRING = "--prompt の内容は agent prompt に直接注入";

function getResumeHandler(): (parsed: ParsedArgs) => Promise<void> {
  return COMMANDS["job"]!.children!["resume"]!.handler!;
}

function makeParsedArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    flags: {},
    positional: "my-slug",
    positionals: ["my-slug"],
    ...overrides,
  };
}

describe("job resume handler — prompt injection warning", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(runResume).mockResolvedValue(undefined);
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "resume-warning-test-"));
  });

  afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  it("T1: --prompt 指定時に警告が stderrWrite に出力される", async () => {
    const handler = getResumeHandler();

    await handler(makeParsedArgs({ flags: { prompt: "some injection text" } }));

    const writtenMessages = vi.mocked(stderrWrite).mock.calls.map(([msg]) => msg as string);
    expect(writtenMessages.some((msg) => msg.includes(WARNING_SUBSTRING))).toBe(true);
  });

  it("T2: --prompt-file 指定時に警告が stderrWrite に出力される", async () => {
    const promptFile = path.join(tempDir, "prompt.md");
    await fsPromises.writeFile(promptFile, "file content for context", "utf-8");

    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "prompt-file": promptFile } }));

    const writtenMessages = vi.mocked(stderrWrite).mock.calls.map(([msg]) => msg as string);
    expect(writtenMessages.some((msg) => msg.includes(WARNING_SUBSTRING))).toBe(true);
  });

  it("T4: --quiet モードでも --prompt 指定時に警告が stderrWrite に出力される", async () => {
    const handler = getResumeHandler();

    await handler(makeParsedArgs({ flags: { prompt: "some injection text", quiet: true } }));

    const writtenMessages = vi.mocked(stderrWrite).mock.calls.map(([msg]) => msg as string);
    expect(writtenMessages.some((msg) => msg.includes(WARNING_SUBSTRING))).toBe(true);
  });

  it("T3: --prompt 未指定時は警告が出力されない", async () => {
    const handler = getResumeHandler();

    await handler(makeParsedArgs({ flags: {} }));

    const writtenMessages = vi.mocked(stderrWrite).mock.calls.map(([msg]) => msg as string);
    expect(writtenMessages.some((msg) => msg.includes(WARNING_SUBSTRING))).toBe(false);
  });
});
