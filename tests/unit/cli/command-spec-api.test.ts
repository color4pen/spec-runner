/**
 * Tests for CLI command interface spec normalization (cli-command-spec).
 *
 * Covers:
 *   TC-001: canonical list excludes alias
 *   TC-002: alias list includes alias
 *   TC-003: alias resolves to canonical + invokedAs
 *   TC-004: all public command paths in canonical list
 *   TC-005: run flags/worktreeGuard/requiresRepo resolved from job start
 *   TC-007: doctor requiresRepo is false
 *   TC-008: doctor repair requiresRepo is true
 *   TC-009: doctor repair appears in canonical list
 *   TC-010: child inherits parent requiresRepo (fixture)
 *   TC-011: child overrides parent requiresRepo (fixture)
 *   TC-012: job sub-leaf repo-optional leaves preserved
 *   TC-020: --issue non-integer → FlagParseError
 *   TC-021: --issue positive integer → number value
 *   TC-022: request validate file path not rejected by slug validation (source check)
 *   TC-023: SpecRunnerError dispatch normalization
 *   TC-027: --merge-wait-ms non-numeric lenient (no FlagParseError)
 *   TC-028: --limit non-integer → FlagParseError
 *   TC-029: --limit non-negative integer → number value
 *   TC-030: FlagParseError from handler → exit 2 with error message
 *   TC-032: job archive help contains "Archive the completed change folder"
 *   TC-033: runtime reset help contains "Delete the Anthropic Environment"
 *   TC-035: WORKTREE_GUARDED_COMMANDS and guardedSubcommands absent from source
 *   TC-036: requiresRepo values for all public commands
 *   TC-037: old type names (CommandDef, ParentCommandDef, CommandEntry) absent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  COMMANDS,
  listCommandPaths,
  resolveCommand,
  resolveEffectiveRequiresRepo,
  ARCHIVE_USAGE,
  RUNTIME_RESET_USAGE,
} from "../../../src/cli/command-registry.js";
import { parseFlags, FlagParseError } from "../../../src/cli/flag-parser.js";
import type { CommandSpec } from "../../../src/cli/command-registry.js";
import { SpecRunnerError, EXIT_CODE } from "../../../src/errors.js";

const ROOT_DIR = path.resolve(__dirname, "../../..");
const SRC_DIR = path.join(ROOT_DIR, "src");

// ---------------------------------------------------------------------------
// TC-001: canonical list excludes alias
// ---------------------------------------------------------------------------

describe("TC-001: canonical list excludes alias (listCommandPaths without includeAliases)", () => {
  it("listCommandPaths() does not include ['run'] (alias)", () => {
    const paths = listCommandPaths();
    const asStrings = paths.map((p) => p.join(" "));
    expect(asStrings).not.toContain("run");
  });

  it("listCommandPaths() includes canonical job start", () => {
    const paths = listCommandPaths();
    const asStrings = paths.map((p) => p.join(" "));
    expect(asStrings).toContain("job start");
  });
});

// ---------------------------------------------------------------------------
// TC-002: alias list includes alias
// ---------------------------------------------------------------------------

describe("TC-002: alias list includes alias (listCommandPaths with includeAliases)", () => {
  it("listCommandPaths({ includeAliases: true }) includes ['run']", () => {
    const paths = listCommandPaths({ includeAliases: true });
    const asStrings = paths.map((p) => p.join(" "));
    expect(asStrings).toContain("run");
  });

  it("listCommandPaths({ includeAliases: true }) still includes job start", () => {
    const paths = listCommandPaths({ includeAliases: true });
    const asStrings = paths.map((p) => p.join(" "));
    expect(asStrings).toContain("job start");
  });

  it("run appears exactly once in alias list (not double-counted)", () => {
    const paths = listCommandPaths({ includeAliases: true });
    const runPaths = paths.filter((p) => p.join(" ") === "run");
    expect(runPaths.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-003: alias resolves to canonical + invokedAs
// ---------------------------------------------------------------------------

describe("TC-003: resolveCommand(['run']) returns canonicalPath + invokedAs", () => {
  it("resolveCommand(['run', 'my-slug']) → status ok", () => {
    const result = resolveCommand(["run", "my-slug"]);
    expect(result.status).toBe("ok");
  });

  it("resolveCommand(['run', 'my-slug']) → canonicalPath = ['job', 'start']", () => {
    const result = resolveCommand(["run", "my-slug"]);
    if (result.status !== "ok") throw new Error(`unexpected: ${result.status}`);
    expect(result.canonicalPath).toEqual(["job", "start"]);
  });

  it("resolveCommand(['run', 'my-slug']) → invokedAs = ['run']", () => {
    const result = resolveCommand(["run", "my-slug"]);
    if (result.status !== "ok") throw new Error(`unexpected: ${result.status}`);
    expect(result.invokedAs).toEqual(["run"]);
  });

  it("resolveCommand(['run', 'my-slug']) → restArgs = ['my-slug']", () => {
    const result = resolveCommand(["run", "my-slug"]);
    if (result.status !== "ok") throw new Error(`unexpected: ${result.status}`);
    expect(result.restArgs).toEqual(["my-slug"]);
  });
});

// ---------------------------------------------------------------------------
// TC-004: all public command paths in canonical list
// ---------------------------------------------------------------------------

describe("TC-004: all known public command paths appear in canonical list", () => {
  const knownPaths = [
    "init",
    "login",
    "credentials set",
    "request new",
    "request prompt",
    "request ls",
    "request template",
    "request validate",
    "job start",
    "job ls",
    "job show",
    "job wait",
    "job cancel",
    "job resume",
    "job reopen",
    "job attach",
    "job archive",
    "job prune",
    "job stats",
    "config effective",
    "inbox run",
    "rules new",
    "reviewers new",
    "runtime setup",
    "runtime status",
    "runtime reset",
    "doctor",
    "doctor repair",
  ];

  for (const cmdPath of knownPaths) {
    it(`canonical list includes '${cmdPath}'`, () => {
      const paths = listCommandPaths();
      const asStrings = paths.map((p) => p.join(" "));
      expect(asStrings).toContain(cmdPath);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-005: run flags/worktreeGuard resolved from job start target
// ---------------------------------------------------------------------------

describe("TC-005: run resolves to job start spec (flags/worktreeGuard inherited)", () => {
  it("resolved spec for run has --detach flag (from job start)", () => {
    const result = resolveCommand(["run", "my-slug"]);
    if (result.status !== "ok") throw new Error("unexpected");
    expect(result.spec.flags).toHaveProperty("detach");
  });

  it("resolved spec for run has --issue flag (from job start)", () => {
    const result = resolveCommand(["run", "my-slug"]);
    if (result.status !== "ok") throw new Error("unexpected");
    expect(result.spec.flags).toHaveProperty("issue");
  });

  it("resolved spec for run has worktreeGuard: true (from job start)", () => {
    const result = resolveCommand(["run", "my-slug"]);
    if (result.status !== "ok") throw new Error("unexpected");
    expect(result.spec.worktreeGuard).toBe(true);
  });

  it("run and job start resolve to the same spec object", () => {
    const runResult = resolveCommand(["run", "my-slug"]);
    const startResult = resolveCommand(["job", "start", "my-slug"]);
    if (runResult.status !== "ok" || startResult.status !== "ok") throw new Error("unexpected");
    expect(runResult.spec).toBe(startResult.spec);
  });
});

// ---------------------------------------------------------------------------
// TC-007: doctor requiresRepo is false
// ---------------------------------------------------------------------------

describe("TC-007: doctor can run outside a repo (requiresRepo falsy)", () => {
  it("doctor spec has no requiresRepo (or requiresRepo: false)", () => {
    const doctorSpec = COMMANDS["doctor"];
    expect(doctorSpec?.requiresRepo).toBeFalsy();
  });

  it("resolveEffectiveRequiresRepo(['doctor']) returns false", () => {
    expect(resolveEffectiveRequiresRepo(COMMANDS, ["doctor"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-008: doctor repair requiresRepo is true
// ---------------------------------------------------------------------------

describe("TC-008: doctor repair requires a repo (requiresRepo: true)", () => {
  it("doctor repair child spec has requiresRepo: true", () => {
    const repairSpec = COMMANDS["doctor"]?.children?.["repair"];
    expect(repairSpec?.requiresRepo).toBe(true);
  });

  it("resolveEffectiveRequiresRepo(['doctor', 'repair']) returns true", () => {
    expect(resolveEffectiveRequiresRepo(COMMANDS, ["doctor", "repair"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-009: doctor repair appears in canonical list
// ---------------------------------------------------------------------------

describe("TC-009: doctor repair appears in canonical command paths", () => {
  it("listCommandPaths() includes ['doctor', 'repair']", () => {
    const paths = listCommandPaths();
    const asStrings = paths.map((p) => p.join(" "));
    expect(asStrings).toContain("doctor repair");
  });
});

// ---------------------------------------------------------------------------
// TC-010: child inherits parent requiresRepo (fixture)
// ---------------------------------------------------------------------------

describe("TC-010: child inherits parent requiresRepo from fixture spec", () => {
  const fixture: Record<string, CommandSpec> = {
    parent: {
      path: ["parent"],
      summary: "Parent with requiresRepo: true",
      requiresRepo: true,
      handler: async () => {},
      children: {
        childA: {
          path: ["parent", "childA"],
          summary: "Child A — no explicit requiresRepo, inherits from parent",
          handler: async () => {},
        },
      },
    },
  };

  it("childA (no explicit requiresRepo) inherits true from parent", () => {
    expect(resolveEffectiveRequiresRepo(fixture, ["parent", "childA"])).toBe(true);
  });

  it("parent itself has requiresRepo: true", () => {
    expect(resolveEffectiveRequiresRepo(fixture, ["parent"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-011: child overrides parent requiresRepo (fixture)
// ---------------------------------------------------------------------------

describe("TC-011: child overrides parent requiresRepo from fixture spec", () => {
  const fixture: Record<string, CommandSpec> = {
    parent: {
      path: ["parent"],
      summary: "Parent with requiresRepo: true",
      requiresRepo: true,
      handler: async () => {},
      children: {
        childB: {
          path: ["parent", "childB"],
          summary: "Child B — overrides to false",
          requiresRepo: false,
          handler: async () => {},
        },
      },
    },
  };

  it("childB (requiresRepo: false) overrides parent's true", () => {
    expect(resolveEffectiveRequiresRepo(fixture, ["parent", "childB"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-012: job sub-leaf repo-optional leaves preserved
// ---------------------------------------------------------------------------

describe("TC-012: job repo-optional leaves (start/ls/show/wait) are preserved as false", () => {
  const repoOptionalLeaves: string[][] = [
    ["job", "start"],
    ["job", "ls"],
    ["job", "show"],
    ["job", "wait"],
  ];

  for (const leafPath of repoOptionalLeaves) {
    it(`${leafPath.join(" ")} effective requiresRepo is false`, () => {
      expect(resolveEffectiveRequiresRepo(COMMANDS, leafPath)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-020: --issue non-integer → FlagParseError at parser level
// ---------------------------------------------------------------------------

describe("TC-020: --issue non-integer rejected at parser level", () => {
  const issueFlags = COMMANDS["job"]?.children?.["start"]?.flags ?? {};

  it("--issue abc → FlagParseError", () => {
    expect(() => parseFlags(["--issue", "abc"], issueFlags)).toThrow(FlagParseError);
  });

  it("--issue 3.14 (float) → FlagParseError", () => {
    expect(() => parseFlags(["--issue", "3.14"], issueFlags)).toThrow(FlagParseError);
  });

  it("--issue 0 (below min 1) → FlagParseError", () => {
    expect(() => parseFlags(["--issue", "0"], issueFlags)).toThrow(FlagParseError);
  });

  it("--issue -1 (below min 1) → FlagParseError", () => {
    expect(() => parseFlags(["--issue", "-1"], issueFlags)).toThrow(FlagParseError);
  });
});

// ---------------------------------------------------------------------------
// TC-021: --issue positive integer → number value in ParsedArgs
// ---------------------------------------------------------------------------

describe("TC-021: --issue positive integer parsed as number", () => {
  const issueFlags = COMMANDS["job"]?.children?.["start"]?.flags ?? {};

  it("--issue 42 → flags.issue === 42 (number)", () => {
    const result = parseFlags(["--issue", "42"], issueFlags);
    expect(result.flags["issue"]).toBe(42);
    expect(typeof result.flags["issue"]).toBe("number");
  });

  it("--issue 1 → flags.issue === 1 (number)", () => {
    const result = parseFlags(["--issue", "1"], issueFlags);
    expect(result.flags["issue"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-022: request validate file path not rejected by slug validation (source check)
// ---------------------------------------------------------------------------

describe("TC-022: request validate handler skips slug validation when file exists", () => {
  it("command-registry.ts: validate handler checks fs.existsSync before SLUG_REGEX", async () => {
    const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");
    // The handler must do: if (!fs.existsSync(filePath)) { if (!SLUG_REGEX.test(input)) ... }
    // Use negated forms which are unique to the validate handler
    const existsIdx = content.indexOf("!fs.existsSync(filePath)");
    const slugIdx = content.indexOf("!SLUG_REGEX.test(input)");
    expect(existsIdx).toBeGreaterThan(-1);
    expect(slugIdx).toBeGreaterThan(-1);
    expect(existsIdx).toBeLessThan(slugIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-023: SpecRunnerError from handler → Error/Hint/exitCode (not Fatal)
// ---------------------------------------------------------------------------

// Mocks for TC-023 integration test
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

const mockRunCancel = vi.hoisted(() => vi.fn());
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: mockRunCancel }));
vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn() }));
vi.mock("../../../src/cli/archive.js", () => ({ runArchive: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/managed.js", () => ({
  runManagedSetup: vi.fn(),
  runManagedStatus: vi.fn(),
  runManagedReset: vi.fn(),
}));
vi.mock("../../../src/core/command/request.js", () => ({
  executeTemplate: vi.fn(),
  executeValidate: vi.fn(),
}));
vi.mock("../../../src/core/command/request-list.js", () => ({ executeList: vi.fn() }));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn() }));
vi.mock("../../../src/core/command/request-prompt.js", () => ({ executePrompt: vi.fn().mockReturnValue(0) }));

let originalArgv: string[];
let stderrSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
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

describe("TC-023: SpecRunnerError from handler → Error/Hint/exitCode (unified catch)", () => {
  it("SpecRunnerError thrown by subcommand handler produces 'Error:' prefix in stderr", async () => {
    mockRunCancel.mockRejectedValueOnce(
      new SpecRunnerError("JOB_NOT_FOUND", "job not found", "Use 'specrunner job ls' to list jobs", EXIT_CODE.GENERAL_ERROR),
    );
    const result = await runMain(["job", "cancel", "--all-terminated", "--yes"]);

    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Error: ");
    expect(stderr).not.toContain("Fatal: ");
  });

  it("SpecRunnerError from subcommand handler produces 'Hint:' prefix in stderr", async () => {
    mockRunCancel.mockRejectedValueOnce(
      new SpecRunnerError("JOB_NOT_FOUND", "job not found", "Use 'specrunner job ls' to list jobs", EXIT_CODE.GENERAL_ERROR),
    );
    await runMain(["job", "cancel", "--all-terminated", "--yes"]);

    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Hint: ");
  });

  it("SpecRunnerError from handler exits with the error's exitCode (not always 1)", async () => {
    // ARG_ERROR = 2, which differs from the default Fatal exit code (1)
    mockRunCancel.mockRejectedValueOnce(
      new SpecRunnerError("CUSTOM_ERR", "custom error", "some hint", EXIT_CODE.ARG_ERROR),
    );
    const result = await runMain(["job", "cancel", "--all-terminated", "--yes"]);
    expect(result).toBe(`process.exit(${EXIT_CODE.ARG_ERROR})`);
  });
});

// ---------------------------------------------------------------------------
// TC-027: --merge-wait-ms non-numeric lenient (no FlagParseError)
// ---------------------------------------------------------------------------

describe("TC-027: --merge-wait-ms non-numeric is lenient (string flag, no FlagParseError)", () => {
  const archiveFlags = COMMANDS["job"]?.children?.["archive"]?.flags ?? {};

  it("--merge-wait-ms abc → no FlagParseError (lenient string flag)", () => {
    expect(() =>
      parseFlags(["my-slug", "--merge-wait-ms", "abc"], archiveFlags, { name: "slug", required: true }),
    ).not.toThrow();
  });

  it("--merge-wait-ms flag type is 'string' (not 'integer')", () => {
    const def = archiveFlags["merge-wait-ms"];
    expect(def?.type).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// TC-028: --limit non-integer → FlagParseError
// ---------------------------------------------------------------------------

describe("TC-028: --limit non-integer rejected at parser level", () => {
  const inboxFlags = COMMANDS["inbox"]?.children?.["run"]?.flags ?? {};

  it("--limit abc → FlagParseError", () => {
    expect(() => parseFlags(["--limit", "abc"], inboxFlags)).toThrow(FlagParseError);
  });

  it("--limit 3.14 → FlagParseError", () => {
    expect(() => parseFlags(["--limit", "3.14"], inboxFlags)).toThrow(FlagParseError);
  });

  it("--limit -1 → FlagParseError (below min 0)", () => {
    expect(() => parseFlags(["--limit", "-1"], inboxFlags)).toThrow(FlagParseError);
  });
});

// ---------------------------------------------------------------------------
// TC-029: --limit non-negative integer → number value
// ---------------------------------------------------------------------------

describe("TC-029: --limit non-negative integer parsed as number", () => {
  const inboxFlags = COMMANDS["inbox"]?.children?.["run"]?.flags ?? {};

  it("--limit 0 → flags.limit === 0 (number)", () => {
    const result = parseFlags(["--limit", "0"], inboxFlags);
    expect(result.flags["limit"]).toBe(0);
    expect(typeof result.flags["limit"]).toBe("number");
  });

  it("--limit 5 → flags.limit === 5 (number)", () => {
    const result = parseFlags(["--limit", "5"], inboxFlags);
    expect(result.flags["limit"]).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// TC-030: FlagParseError from dispatch → exit 2 with error message in stderr
// ---------------------------------------------------------------------------

describe("TC-030: FlagParseError from dispatch → exit 2 + error message in stderr", () => {
  it("run --issue abc → exit 2 (FlagParseError dispatch)", async () => {
    const result = await runMain(["run", "--issue", "abc", "my-slug"]);
    expect(result).toBe("process.exit(2)");
  });

  it("run --issue abc → error message in stderr", async () => {
    await runMain(["run", "--issue", "abc", "my-slug"]);
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toMatch(/--issue/i);
  });
});

// ---------------------------------------------------------------------------
// TC-032: job archive help contains "Archive the completed change folder"
// ---------------------------------------------------------------------------

describe("TC-032: job archive help pin — 'Archive the completed change folder'", () => {
  it("ARCHIVE_USAGE contains 'Archive the completed change folder'", () => {
    expect(ARCHIVE_USAGE).toContain("Archive the completed change folder");
  });

  it("job archive spec help.detail references ARCHIVE_USAGE content", () => {
    const archiveSpec = COMMANDS["job"]?.children?.["archive"];
    expect(archiveSpec?.help?.detail).toContain("Archive the completed change folder");
  });
});

// ---------------------------------------------------------------------------
// TC-033: runtime reset help contains "Delete the Anthropic Environment"
// ---------------------------------------------------------------------------

describe("TC-033: runtime reset help pin — 'Delete the Anthropic Environment'", () => {
  it("RUNTIME_RESET_USAGE contains 'Delete the Anthropic Environment'", () => {
    expect(RUNTIME_RESET_USAGE).toContain("Delete the Anthropic Environment");
  });

  it("runtime reset spec help.detail references RUNTIME_RESET_USAGE content", () => {
    const resetSpec = COMMANDS["runtime"]?.children?.["reset"];
    expect(resetSpec?.help?.detail).toContain("Delete the Anthropic Environment");
  });
});

// ---------------------------------------------------------------------------
// TC-035: WORKTREE_GUARDED_COMMANDS and guardedSubcommands absent
// ---------------------------------------------------------------------------

describe("TC-035: worktree guard hand-written Sets are absent from source", () => {
  it("bin/specrunner.ts does not contain WORKTREE_GUARDED_COMMANDS", async () => {
    const binPath = path.join(ROOT_DIR, "bin", "specrunner.ts");
    const content = await fs.readFile(binPath, "utf-8");
    expect(content).not.toContain("WORKTREE_GUARDED_COMMANDS");
  });

  it("src/cli/command-registry.ts does not contain guardedSubcommands", async () => {
    const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");
    expect(content).not.toContain("guardedSubcommands");
  });
});

// ---------------------------------------------------------------------------
// TC-036: requiresRepo values for all public commands
// ---------------------------------------------------------------------------

describe("TC-036: effective requiresRepo for all public commands matches expected", () => {
  const repoRequired: string[][] = [
    ["init"],
    ["request", "new"],
    ["job", "cancel"],
    ["job", "attach"],
    ["job", "prune"],
    ["job", "stats"],
    ["inbox", "run"],
    ["doctor", "repair"],
  ];

  const repoOptional: string[][] = [
    ["job", "start"],
    ["job", "ls"],
    ["job", "show"],
    ["job", "wait"],
    ["doctor"],
  ];

  for (const p of repoRequired) {
    it(`${p.join(" ")} → requiresRepo: true`, () => {
      expect(resolveEffectiveRequiresRepo(COMMANDS, p)).toBe(true);
    });
  }

  for (const p of repoOptional) {
    it(`${p.join(" ")} → requiresRepo: false`, () => {
      expect(resolveEffectiveRequiresRepo(COMMANDS, p)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-037: old type names absent from command-registry.ts
// ---------------------------------------------------------------------------

describe("TC-037: old CommandDef / ParentCommandDef / CommandEntry types absent", () => {
  const oldTypes = ["CommandDef", "ParentCommandDef", "CommandEntry"];

  for (const typeName of oldTypes) {
    it(`command-registry.ts does not define '${typeName}'`, async () => {
      const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
      const content = await fs.readFile(registryPath, "utf-8");
      // Must not appear as an interface/type definition or export
      const defPattern = new RegExp(`(interface|type|export)\\s+${typeName}\\b`);
      expect(content).not.toMatch(defPattern);
    });
  }
});
