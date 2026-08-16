/**
 * TC-009 integration: runInit stdout contains buildClaudeMdSnippet() content.
 *
 * Builder unit test (buildClaudeMdSnippet alone) lives in guide.test.ts.
 * This file pins that runInit → stdout actually emits the snippet.
 *
 * Mock strategy: simulate config already exists (fs.access resolves) to bypass
 * the readline/provider prompt. All fs, logger, and util side effects are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Simulate config already exists — bypasses readline / provider prompt.
// Use importOriginal to preserve unneeded exports (readFile etc.) so that
// any transitive caller that isn't mocked at module level still works.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined), // config exists → skip write
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

// Paths below are relative to THIS test file (src/cli/__tests__/).
// init.ts lives one level up (src/cli/), so its "../util/" → src/util/,
// which from here is "../../util/".
vi.mock("../../util/xdg.js", () => ({
  getConfigPath: vi.fn().mockReturnValue("/mock/.config/specrunner/config.json"),
}));

vi.mock("../../util/gitignore.js", () => ({
  ensureDotSpecrunnerGitignore: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../logger/stdout.js", () => ({
  stdoutWrite: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  logResult: vi.fn(),
  stderrWrite: vi.fn(),
}));

import { runInit } from "../init.js";
import { buildClaudeMdSnippet } from "../../core/command/guide.js";
import { stdoutWrite } from "../../logger/stdout.js";

describe("TC-009 integration: runInit stdout contains buildClaudeMdSnippet()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runInit returns exit code 0", async () => {
    const exitCode = await runInit({ repoRoot: "/mock/repo" });
    expect(exitCode).toBe(0);
  });

  it("runInit writes buildClaudeMdSnippet() content to stdout", async () => {
    await runInit({ repoRoot: "/mock/repo" });
    const snippet = buildClaudeMdSnippet();
    const allWritten = vi.mocked(stdoutWrite).mock.calls.map((c) => c[0]).join("");
    expect(allWritten).toContain(snippet);
  });

  it("runInit stdout snippet contains 'specrunner guide'", async () => {
    await runInit({ repoRoot: "/mock/repo" });
    const allWritten = vi.mocked(stdoutWrite).mock.calls.map((c) => c[0]).join("");
    expect(allWritten).toContain("specrunner guide");
  });
});
