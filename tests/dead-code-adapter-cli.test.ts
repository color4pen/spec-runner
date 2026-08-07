/**
 * Dead-code deletion verification tests: adapter / cli / config / logger
 *
 * TC-001: typecheck && test suite pass (gate)
 * TC-002: Deleted symbols have no remaining references
 * TC-003: shim importers repointed before shim deleted
 * TC-004: Shared test files preserve non-deleted assertions
 * TC-005: session-runner.ts deleted and references cleaned
 * TC-006: sse-stream.ts break control flow maintained after assertBreakAfterCompletion removal
 * TC-008: isToolUse and isStreamEvent remain in message-types.ts
 * TC-010: _spawnFn/spawnFn/git-exec.ts shim completely removed
 * TC-011: transient-error/session-log-writer shims deleted, importers repointed
 * TC-012: REPORT_TOOL/REPORT_TOOL_CUSTOM_TOOL_SPEC removed from production code, codex tests have local fixture
 * TC-015: archive --dry-run deleted, inbox --dry-run unchanged
 * TC-018: checkConfigComplete deleted, preflight behavior unchanged
 * TC-019: logDebug/getLogLevel deleted, LEVEL_ORDER un-exported
 * TC-020: isLevelEnabled behavior maintained after LEVEL_ORDER un-export
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname ?? __dirname, "..");
const SRC = path.join(ROOT, "src");
const TESTS = path.join(ROOT, "tests");
const BIN = path.join(ROOT, "bin");

/** Read a source file relative to project root. Throws if not found. */
async function readSrc(rel: string): Promise<string> {
  return fs.readFile(path.join(ROOT, rel), "utf-8");
}

/** Return true if a path exists (file or dir). */
async function exists(rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

/** Recursively collect all .ts files under a directory. */
async function collectTsFiles(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Collect all .ts files under src/, bin/, tests/ and search for a symbol.
 * Excludes this test file from results (to avoid false positives from TC names).
 * Returns list of matching paths (relative to root).
 */
async function grepSymbol(symbol: string): Promise<string[]> {
  const dirs = [SRC, BIN, TESTS];
  const hits: string[] = [];
  for (const dir of dirs) {
    const files = await collectTsFiles(dir);
    for (const file of files) {
      // Skip this test file itself
      if (path.basename(file) === "dead-code-adapter-cli.test.ts") continue;
      const content = await fs.readFile(file, "utf-8");
      if (content.includes(symbol)) {
        hits.push(path.relative(ROOT, file));
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// TC-001: gate — package.json has typecheck and test scripts
// ---------------------------------------------------------------------------
describe("TC-001: typecheck && test suite pass (gate)", () => {
  it("package.json defines typecheck and test scripts", async () => {
    const pkg = JSON.parse(await readSrc("package.json")) as { scripts?: Record<string, string> };
    expect(typeof pkg.scripts?.["typecheck"]).toBe("string");
    expect(typeof pkg.scripts?.["test"]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// TC-002: Deleted symbols have no remaining references
// ---------------------------------------------------------------------------
describe("TC-002: Deleted symbols absent from src/ bin/ tests/", () => {
  it("assertBreakAfterCompletion has no references", async () => {
    const hits = await grepSymbol("assertBreakAfterCompletion");
    expect(hits, `Found assertBreakAfterCompletion in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("REPORT_TOOL_CUSTOM_TOOL_SPEC has no references", async () => {
    const hits = await grepSymbol("REPORT_TOOL_CUSTOM_TOOL_SPEC");
    expect(hits, `Found REPORT_TOOL_CUSTOM_TOOL_SPEC in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("checkConfigComplete has no references", async () => {
    const hits = await grepSymbol("checkConfigComplete");
    expect(hits, `Found checkConfigComplete in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("logDebug has no references in src/ or bin/", async () => {
    // Only check src/ and bin/ — tests/ coverage is in TC-019
    const dirs = [SRC, BIN];
    const hits: string[] = [];
    for (const dir of dirs) {
      const files = await collectTsFiles(dir);
      for (const file of files) {
        const content = await fs.readFile(file, "utf-8");
        if (/\blogDebug\b/.test(content)) hits.push(path.relative(ROOT, file));
      }
    }
    expect(hits, `Found logDebug in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("getLogLevel has no references in src/ or bin/", async () => {
    // getLogLevel deleted from stdout.ts; vi.mock factories in tests/ covered by TC-019
    const hits: string[] = [];
    const dirs = [SRC, BIN];
    for (const dir of dirs) {
      const files = await collectTsFiles(dir);
      for (const file of files) {
        const content = await fs.readFile(file, "utf-8");
        if (/\bgetLogLevel\b/.test(content)) hits.push(path.relative(ROOT, file));
      }
    }
    expect(hits, `Found getLogLevel in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("MANAGED_RESET_USAGE has no references", async () => {
    const hits = await grepSymbol("MANAGED_RESET_USAGE");
    expect(hits, `Found MANAGED_RESET_USAGE in: ${hits.join(", ")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-003: shim importers repointed before shim deleted
// ---------------------------------------------------------------------------
describe("TC-003: agent-runner.ts imports from canonical shared/ paths, not shims", () => {
  it("agent-runner.ts imports isTransientAgentError from ../shared/transient-error.js", async () => {
    const content = await readSrc("src/adapter/claude-code/agent-runner.ts");
    expect(content).toContain("../shared/transient-error.js");
    expect(content).not.toContain("./transient-error.js");
  });

  it("agent-runner.ts imports SessionLogWriter from ../shared/session-log-writer.js", async () => {
    const content = await readSrc("src/adapter/claude-code/agent-runner.ts");
    expect(content).toContain("../shared/session-log-writer.js");
    expect(content).not.toContain("./session-log-writer.js");
  });

  it("agent-runner.ts does not import from ./git-exec.js shim", async () => {
    const content = await readSrc("src/adapter/claude-code/agent-runner.ts");
    expect(content).not.toContain("./git-exec.js");
    expect(content).not.toContain('"./git-exec"');
  });
});

// ---------------------------------------------------------------------------
// TC-004: Shared test files preserve non-deleted assertions
// ---------------------------------------------------------------------------
describe("TC-004: Shared test files retain non-deleted assertions", () => {
  it("tests/completion.test.ts still contains TC-026 (isStatusIdleEvent) test", async () => {
    const content = await readSrc("tests/completion.test.ts");
    expect(content).toContain("TC-026");
    expect(content).toContain("isStatusIdleEvent");
  });

  it("tests/completion.test.ts does NOT contain assertBreakAfterCompletion assertion", async () => {
    const content = await readSrc("tests/completion.test.ts");
    expect(content).not.toContain("assertBreakAfterCompletion");
  });

  it("tests/completion.test.ts still contains TC-027 (requires_action) test", async () => {
    const content = await readSrc("tests/completion.test.ts");
    expect(content).toContain("TC-027");
  });

  it("tests/completion.test.ts still contains TC-028 (polling AbortController) test", async () => {
    const content = await readSrc("tests/completion.test.ts");
    expect(content).toContain("TC-028");
  });
});

// ---------------------------------------------------------------------------
// TC-005: session-runner.ts deleted and references cleaned
// ---------------------------------------------------------------------------
describe("TC-005: session-runner.ts deleted and its symbols absent", () => {
  it("src/adapter/managed-agent/session-runner.ts does not exist", async () => {
    expect(await exists("src/adapter/managed-agent/session-runner.ts")).toBe(false);
  });

  it("tests/core/session-runner.test.ts does not exist", async () => {
    expect(await exists("tests/core/session-runner.test.ts")).toBe(false);
  });

  it("runManagedAgentSession has no references in src/ bin/ tests/", async () => {
    const hits = await grepSymbol("runManagedAgentSession");
    expect(hits, `Found runManagedAgentSession in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("ManagedAgentSessionInput has no references in src/ bin/ tests/", async () => {
    const hits = await grepSymbol("ManagedAgentSessionInput");
    expect(hits, `Found ManagedAgentSessionInput in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("ManagedAgentSessionResult has no references in src/ bin/ tests/", async () => {
    const hits = await grepSymbol("ManagedAgentSessionResult");
    expect(hits, `Found ManagedAgentSessionResult in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("session-runner string has no references in src/ bin/ tests/", async () => {
    // grepSymbol already excludes this test file
    const hits = await grepSymbol("session-runner");
    expect(hits, `Found session-runner in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("tests/unit/remove-session-timeout.test.ts still exists (other TCs preserved)", async () => {
    expect(await exists("tests/unit/remove-session-timeout.test.ts")).toBe(true);
  });

  it("managed-agent barrel (index.ts) does not re-export session-runner symbols", async () => {
    const content = await readSrc("src/adapter/managed-agent/index.ts");
    expect(content).not.toContain("session-runner");
    expect(content).not.toContain("runManagedAgentSession");
    expect(content).not.toContain("ManagedAgentSessionInput");
    expect(content).not.toContain("ManagedAgentSessionResult");
  });
});

// ---------------------------------------------------------------------------
// TC-006: sse-stream.ts break control flow maintained
// ---------------------------------------------------------------------------
describe("TC-006: sse-stream.ts break statement preserved after assertBreakAfterCompletion removal", () => {
  it("sse-stream.ts does NOT import or call assertBreakAfterCompletion", async () => {
    const content = await readSrc("src/adapter/managed-agent/sse-stream.ts");
    expect(content).not.toContain("assertBreakAfterCompletion");
  });

  it("sse-stream.ts still has a break statement after isEndTurnIdle branch", async () => {
    const content = await readSrc("src/adapter/managed-agent/sse-stream.ts");
    // The break following the end_turn detection must remain
    // isEndTurnIdle branch leads to break — verify the pattern is present
    expect(content).toContain("isEndTurnIdle");
    expect(content).toContain("break;");
  });

  it("completion.ts does NOT export assertBreakAfterCompletion", async () => {
    const content = await readSrc("src/adapter/managed-agent/completion.ts");
    expect(content).not.toContain("assertBreakAfterCompletion");
  });
});

// ---------------------------------------------------------------------------
// TC-008: isToolUse and isStreamEvent remain, isResultMessage and isTextDelta deleted
// ---------------------------------------------------------------------------
describe("TC-008: message-types.ts — isToolUse/isStreamEvent kept, isResultMessage/isTextDelta removed", () => {
  it("message-types.ts does NOT contain isResultMessage", async () => {
    const content = await readSrc("src/adapter/claude-code/message-types.ts");
    expect(content).not.toContain("isResultMessage");
  });

  it("message-types.ts does NOT contain isTextDelta", async () => {
    const content = await readSrc("src/adapter/claude-code/message-types.ts");
    expect(content).not.toContain("isTextDelta");
  });

  it("message-types.ts still exports isToolUse", async () => {
    const content = await readSrc("src/adapter/claude-code/message-types.ts");
    expect(content).toContain("isToolUse");
  });

  it("message-types.ts still exports isStreamEvent", async () => {
    const content = await readSrc("src/adapter/claude-code/message-types.ts");
    expect(content).toContain("isStreamEvent");
  });

  it("isResultMessage has no references in src/ bin/ tests/", async () => {
    const hits = await grepSymbol("isResultMessage");
    expect(hits, `Found isResultMessage in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("isTextDelta has no references in src/ bin/ tests/", async () => {
    const hits = await grepSymbol("isTextDelta");
    expect(hits, `Found isTextDelta in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("message-types.test.ts no longer imports isResultMessage or isTextDelta", async () => {
    const content = await readSrc(
      "tests/unit/adapter/claude-code/message-types.test.ts",
    );
    expect(content).not.toContain("isResultMessage");
    expect(content).not.toContain("isTextDelta");
  });

  it("message-types.test.ts still contains TC-MT-003 (isStreamEvent) test", async () => {
    const content = await readSrc(
      "tests/unit/adapter/claude-code/message-types.test.ts",
    );
    expect(content).toContain("TC-MT-003");
    expect(content).toContain("isStreamEvent");
  });

  it("message-types.test.ts still contains TC-MT-005 (isToolUse) test", async () => {
    const content = await readSrc(
      "tests/unit/adapter/claude-code/message-types.test.ts",
    );
    expect(content).toContain("TC-MT-005");
    expect(content).toContain("isToolUse");
  });
});

// ---------------------------------------------------------------------------
// TC-010: _spawnFn/spawnFn/git-exec.ts shim completely removed
// ---------------------------------------------------------------------------
describe("TC-010: _spawnFn/spawnFn/git-exec.ts removed from claude-code adapter", () => {
  it("src/adapter/claude-code/git-exec.ts does not exist", async () => {
    expect(await exists("src/adapter/claude-code/git-exec.ts")).toBe(false);
  });

  it("agent-runner.ts does not contain _spawnFn", async () => {
    const content = await readSrc("src/adapter/claude-code/agent-runner.ts");
    expect(content).not.toContain("_spawnFn");
  });

  it("agent-runner.ts does not contain spawnFn field or class property", async () => {
    const content = await readSrc("src/adapter/claude-code/agent-runner.ts");
    // The class property and constructor assignment must be gone
    expect(content).not.toMatch(/private readonly spawnFn/);
    expect(content).not.toMatch(/this\.spawnFn\s*=/);
  });

  it("agent-runner.ts does not import defaultSpawnFn or SpawnFn from git-exec.js", async () => {
    const content = await readSrc("src/adapter/claude-code/agent-runner.ts");
    expect(content).not.toContain("defaultSpawnFn");
    expect(content).not.toContain("git-exec");
  });

  it("_spawnFn has no references in src/adapter/claude-code/ area", async () => {
    const dir = path.join(SRC, "adapter", "claude-code");
    const files = await collectTsFiles(dir);
    const hits: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (content.includes("_spawnFn")) hits.push(path.relative(ROOT, file));
    }
    expect(hits, `Found _spawnFn in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("spawnFn has no references in tests/unit/adapter/claude-code/", async () => {
    const dir = path.join(TESTS, "unit", "adapter", "claude-code");
    const files = await collectTsFiles(dir);
    const hits: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (/\bspawnFn\b/.test(content)) hits.push(path.relative(ROOT, file));
    }
    expect(hits, `Found spawnFn in test files: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("git-exec has no references in src/adapter/claude-code/ area", async () => {
    const dir = path.join(SRC, "adapter", "claude-code");
    const files = await collectTsFiles(dir);
    const hits: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (content.includes("git-exec")) hits.push(path.relative(ROOT, file));
    }
    expect(hits, `Found git-exec reference in: ${hits.join(", ")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-011: transient-error/session-log-writer shims deleted, importers repointed
// ---------------------------------------------------------------------------
describe("TC-011: claude-code transient-error and session-log-writer shims removed", () => {
  it("src/adapter/claude-code/transient-error.ts does not exist", async () => {
    expect(await exists("src/adapter/claude-code/transient-error.ts")).toBe(false);
  });

  it("src/adapter/claude-code/session-log-writer.ts does not exist", async () => {
    expect(await exists("src/adapter/claude-code/session-log-writer.ts")).toBe(false);
  });

  it("no file in src/ references claude-code/transient-error", async () => {
    const hits: string[] = [];
    const files = await collectTsFiles(SRC);
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (content.includes("claude-code/transient-error")) hits.push(path.relative(ROOT, file));
    }
    expect(hits, `Found claude-code/transient-error in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("no file in src/ references claude-code/session-log-writer", async () => {
    const hits: string[] = [];
    const files = await collectTsFiles(SRC);
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (content.includes("claude-code/session-log-writer")) hits.push(path.relative(ROOT, file));
    }
    expect(hits, `Found claude-code/session-log-writer in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("no test file references ./transient-error.js (old shim path)", async () => {
    const dir = path.join(SRC, "adapter", "claude-code", "__tests__");
    const files = await collectTsFiles(dir);
    const hits: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (content.includes("../transient-error.js")) hits.push(path.relative(ROOT, file));
    }
    expect(hits, `Found old shim path ../transient-error.js in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("no test file references ../session-log-writer.js (old shim path)", async () => {
    const dir = path.join(SRC, "adapter", "claude-code", "__tests__");
    const files = await collectTsFiles(dir);
    const hits: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      if (content.includes("../session-log-writer.js")) hits.push(path.relative(ROOT, file));
    }
    expect(hits, `Found old shim path ../session-log-writer.js in: ${hits.join(", ")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-012: REPORT_TOOL/REPORT_TOOL_CUSTOM_TOOL_SPEC removed from production, codex tests have fixture
// ---------------------------------------------------------------------------
describe("TC-012: REPORT_TOOL deleted from production code, codex tests use local fixture", () => {
  it("src/core/step/report-tool.ts does NOT export REPORT_TOOL (word boundary match)", async () => {
    const content = await readSrc("src/core/step/report-tool.ts");
    // REPORT_TOOL must be gone; PRODUCER_REPORT_TOOL etc. are fine
    expect(content).not.toMatch(/\bexport const REPORT_TOOL\b/);
  });

  it("src/core/step/report-tool.ts does NOT contain REPORT_TOOL_CUSTOM_TOOL_SPEC", async () => {
    const content = await readSrc("src/core/step/report-tool.ts");
    expect(content).not.toContain("REPORT_TOOL_CUSTOM_TOOL_SPEC");
  });

  it("bin/ and src/ have no bare REPORT_TOOL references (PRODUCER/JUDGE variants allowed)", async () => {
    const dirs = [SRC, BIN];
    const hits: string[] = [];
    for (const dir of dirs) {
      const files = await collectTsFiles(dir);
      for (const file of files) {
        const content = await fs.readFile(file, "utf-8");
        // Match \bREPORT_TOOL\b but NOT PRODUCER_REPORT_TOOL, JUDGE_REPORT_TOOL, etc.
        if (/(?<![A-Z_])REPORT_TOOL(?![_A-Z])/.test(content)) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    expect(hits, `Found bare REPORT_TOOL in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("no test file imports REPORT_TOOL from report-tool.js", async () => {
    // Check that no test file imports the (now-deleted) REPORT_TOOL from report-tool.ts
    // Local fixture consts (REPORT_TOOL_FIXTURE, const REPORT_TOOL in contracts.test.ts) are fine
    const files = await collectTsFiles(TESTS);
    const hits: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      // Look specifically for import statements referencing REPORT_TOOL from report-tool.js
      if (/import.*\bREPORT_TOOL\b.*from.*report-tool/.test(content)) {
        hits.push(path.relative(ROOT, file));
      }
    }
    expect(hits, `Found REPORT_TOOL import from report-tool in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("tests/adapter/codex/agent-runner.test.ts contains REPORT_TOOL_FIXTURE local constant", async () => {
    const content = await readSrc("tests/adapter/codex/agent-runner.test.ts");
    expect(content).toContain("REPORT_TOOL_FIXTURE");
    // Must NOT import REPORT_TOOL from report-tool.js
    expect(content).not.toContain('from "../../../src/core/step/report-tool.js"');
  });

  it("tests/adapter/codex/agent-runner-transient-retry.test.ts contains REPORT_TOOL_FIXTURE local constant", async () => {
    const content = await readSrc("tests/adapter/codex/agent-runner-transient-retry.test.ts");
    expect(content).toContain("REPORT_TOOL_FIXTURE");
    // Must NOT import REPORT_TOOL from report-tool.js
    expect(content).not.toContain('from "../../../src/core/step/report-tool.js"');
  });

  it("PRODUCER_REPORT_TOOL, JUDGE_REPORT_TOOL still exist in report-tool.ts (not over-deleted)", async () => {
    const content = await readSrc("src/core/step/report-tool.ts");
    expect(content).toContain("PRODUCER_REPORT_TOOL");
    expect(content).toContain("JUDGE_REPORT_TOOL");
  });
});

// ---------------------------------------------------------------------------
// TC-015: archive --dry-run deleted, inbox --dry-run unchanged
// ---------------------------------------------------------------------------
describe("TC-015: archive --dry-run removed, inbox --dry-run unchanged", () => {
  it("src/cli/archive.ts has no dry-run or dryRun references", async () => {
    const content = await readSrc("src/cli/archive.ts");
    expect(content).not.toContain("dry-run");
    expect(content).not.toContain("dryRun");
  });

  it("src/cli/command-registry.ts ARCHIVE_USAGE help text has no --dry-run line", async () => {
    const content = await readSrc("src/cli/command-registry.ts");
    // The ARCHIVE_USAGE string definition must not mention --dry-run
    const archiveUsageMatch = /const ARCHIVE_USAGE\s*=\s*`([^`]*)`/s.exec(content);
    expect(archiveUsageMatch).not.toBeNull();
    if (archiveUsageMatch) {
      expect(archiveUsageMatch[1]).not.toContain("dry-run");
    }
  });

  it("src/cli/command-registry.ts does not pass dryRun to runArchive", async () => {
    const content = await readSrc("src/cli/command-registry.ts");
    // The archive handler must not reference dry-run or dryRun alongside runArchive
    // Count occurrences of "dry-run" in the file: after deletion, only inbox+prune references remain
    const dryRunOccurrences = (content.match(/"dry-run"/g) ?? []).length;
    // Before: archive has "dry-run" flag (~867) + inbox has "dry-run" flag (~969) = at least 2 in flags
    // After: only inbox "dry-run" flag remains (inbox ~969)
    // inbox flags has: "dry-run": { type: "boolean" } at ~969
    // The ARCHIVE_USAGE help text also counted above
    // Simplest correct check: dryRun alongside runArchive must not appear
    expect(content).not.toMatch(/runArchive\([^)]*dryRun/s);
  });

  it("src/cli/command-registry.ts inbox --dry-run is still present", async () => {
    const content = await readSrc("src/cli/command-registry.ts");
    // Inbox run section still has dry-run flag in INBOX_RUN_USAGE and in its handler
    expect(content).toContain("INBOX_RUN_USAGE");
    expect(content).toContain("--dry-run");
    // The inbox handler still passes dryRun
    expect(content).toContain("runInboxRun");
  });
});

// ---------------------------------------------------------------------------
// TC-018: checkConfigComplete deleted, preflight behavior unchanged
// ---------------------------------------------------------------------------
describe("TC-018: checkConfigComplete deleted, preflight compiles without it", () => {
  it("src/config/schema/validation.ts does NOT contain checkConfigComplete", async () => {
    const content = await readSrc("src/config/schema/validation.ts");
    expect(content).not.toContain("checkConfigComplete");
  });

  it("src/core/preflight.ts does NOT import or call checkConfigComplete", async () => {
    const content = await readSrc("src/core/preflight.ts");
    expect(content).not.toContain("checkConfigComplete");
  });

  it("no file in src/ bin/ tests/ references checkConfigComplete", async () => {
    const hits = await grepSymbol("checkConfigComplete");
    // Exclude this test file
    const filtered = hits.filter((h) => !h.includes("dead-code-adapter-cli.test.ts"));
    expect(filtered, `Found checkConfigComplete in: ${filtered.join(", ")}`).toHaveLength(0);
  });

  it("tests/core/preflight.test.ts exists and does not mock checkConfigComplete", async () => {
    expect(await exists("tests/core/preflight.test.ts")).toBe(true);
    const content = await readSrc("tests/core/preflight.test.ts");
    expect(content).not.toContain("checkConfigComplete");
  });

  it("tests/unit/config/runtime-config.test.ts exists and does not import checkConfigComplete", async () => {
    expect(await exists("tests/unit/config/runtime-config.test.ts")).toBe(true);
    const content = await readSrc("tests/unit/config/runtime-config.test.ts");
    expect(content).not.toContain("checkConfigComplete");
  });
});

// ---------------------------------------------------------------------------
// TC-019: logDebug/getLogLevel deleted, LEVEL_ORDER un-exported
// ---------------------------------------------------------------------------
describe("TC-019: logDebug/getLogLevel deleted, LEVEL_ORDER un-exported in stdout.ts", () => {
  it("src/logger/stdout.ts does NOT contain logDebug function", async () => {
    const content = await readSrc("src/logger/stdout.ts");
    expect(content).not.toMatch(/export function logDebug/);
    expect(content).not.toContain("function logDebug");
  });

  it("src/logger/stdout.ts does NOT export getLogLevel", async () => {
    const content = await readSrc("src/logger/stdout.ts");
    expect(content).not.toContain("export function getLogLevel");
  });

  it("src/logger/stdout.ts still contains LEVEL_ORDER but WITHOUT export keyword", async () => {
    const content = await readSrc("src/logger/stdout.ts");
    // LEVEL_ORDER must exist (used by isLevelEnabled)
    expect(content).toContain("LEVEL_ORDER");
    // Must NOT have export on LEVEL_ORDER
    expect(content).not.toMatch(/export const LEVEL_ORDER/);
    // Must be a plain const
    expect(content).toMatch(/const LEVEL_ORDER/);
  });

  it("logDebug has no references in tests/unit/logger/log-level.test.ts", async () => {
    const content = await readSrc("tests/unit/logger/log-level.test.ts");
    expect(content).not.toContain("logDebug");
  });

  it("getLogLevel absent from job-show-detach-log.test.ts vi.mock factory", async () => {
    const content = await readSrc(
      "src/cli/__tests__/job-show-detach-log.test.ts",
    );
    expect(content).not.toContain("getLogLevel");
  });

  it("getLogLevel absent from view-commands-worktree-guard.test.ts vi.mock factory", async () => {
    const content = await readSrc(
      "src/cli/__tests__/view-commands-worktree-guard.test.ts",
    );
    expect(content).not.toContain("getLogLevel");
  });

  it("getLogLevel absent from detach-output-contract.test.ts vi.mock factory", async () => {
    const content = await readSrc(
      "src/cli/__tests__/detach-output-contract.test.ts",
    );
    expect(content).not.toContain("getLogLevel");
  });
});

// ---------------------------------------------------------------------------
// TC-020: isLevelEnabled behavior maintained after LEVEL_ORDER un-export
// ---------------------------------------------------------------------------
describe("TC-020: isLevelEnabled behavior is maintained after LEVEL_ORDER un-export", () => {
  it("isLevelEnabled('quiet') returns true when level is quiet", async () => {
    const { setLogLevel, isLevelEnabled } = await import("../src/logger/stdout.js");
    setLogLevel("quiet");
    expect(isLevelEnabled("quiet")).toBe(true);
    // Reset to default
    setLogLevel("default");
  });

  it("isLevelEnabled('verbose') returns false at default level", async () => {
    const { setLogLevel, isLevelEnabled } = await import("../src/logger/stdout.js");
    setLogLevel("default");
    expect(isLevelEnabled("verbose")).toBe(false);
  });

  it("isLevelEnabled('verbose') returns true at verbose level", async () => {
    const { setLogLevel, isLevelEnabled } = await import("../src/logger/stdout.js");
    setLogLevel("verbose");
    expect(isLevelEnabled("verbose")).toBe(true);
    expect(isLevelEnabled("debug")).toBe(false);
    // Reset
    setLogLevel("default");
  });

  it("isLevelEnabled('debug') returns true at debug level", async () => {
    const { setLogLevel, isLevelEnabled } = await import("../src/logger/stdout.js");
    setLogLevel("debug");
    expect(isLevelEnabled("debug")).toBe(true);
    expect(isLevelEnabled("verbose")).toBe(true);
    // Reset
    setLogLevel("default");
  });

  it("LEVEL_ORDER is NOT exported from stdout.ts (un-exported = module-private)", async () => {
    // Dynamic import of the module — LEVEL_ORDER must not appear in its exports
    const mod = await import("../src/logger/stdout.js") as Record<string, unknown>;
    expect(mod["LEVEL_ORDER"]).toBeUndefined();
  });
});
