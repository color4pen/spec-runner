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

// Mock runResume to prevent actual job execution
vi.mock("../resume.js", () => ({
  runResume: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger to capture stderrWrite calls
vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  stdoutWrite: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
}));

import { COMMANDS } from "../command-registry.js";
import type { ParentCommandDef } from "../command-registry.js";
import type { ParsedArgs } from "../flag-parser.js";
import { stderrWrite } from "../../logger/stdout.js";
import { runResume } from "../resume.js";

const WARNING_SUBSTRING = "--prompt の内容は agent prompt に直接注入";

function getResumeHandler(): (parsed: ParsedArgs) => Promise<void> {
  const jobCmd = COMMANDS["job"] as ParentCommandDef;
  return jobCmd.subcommands["resume"]!.handler;
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
