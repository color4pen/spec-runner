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

// T-20: Mock resume.js with only the primitive runResume.
// The real handleJobResume is in job-resume-handler.ts and imported by command-registry.ts.
// Mocking only runResume lets us assert on warning output from the real handler.
vi.mock("../resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resume.js")>();
  return {
    ...actual,
    runResume: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock resume-from-issue.js so the real handler's from-issue path doesn't fire
vi.mock("../resume-from-issue.js", () => ({
  runResumeFromIssue: vi.fn().mockResolvedValue(0),
}));

// Mock logger to capture stderrWrite calls
vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  stdoutWrite: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
  setLogLevel: vi.fn(),
}));

vi.mock("../../core/command/detach.js", () => ({
  DETACH_MARKER_ENV: "SPECRUNNER_DETACHED",
  isDetachedChild: vi.fn().mockReturnValue(false),
  stripDetachFlag: vi.fn((args: string[]) => args.filter((a) => a !== "--detach")),
  detachSelf: vi.fn().mockResolvedValue(0),
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
