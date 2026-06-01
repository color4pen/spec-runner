/**
 * Architecture invariant enforcement: core layer — full scope.
 *
 * Enforces architecture/model.md §4 invariants B-1 through B-8 across the
 * entire src/core/ directory (formerly only core/request/ was covered).
 *
 * Scope expansion rationale (arch-test-core-wide-ratchet):
 *   - The previous module-boundary.test.ts was scoped to core/request/ only,
 *     explicitly excluding core/runtime/ (see that file's docstring).
 *   - This file extends coverage to ALL of src/core/ (core/runtime/ exclusion
 *     removed) for dependency-direction invariants and to the full domain for
 *     call-site invariants (B-5 through B-8).
 *
 * Ratchet (allowlist) design:
 *   - Known divergences are grandfather'd in arch-allowlist.ts.
 *   - Each test filters grep results through the allowlist and asserts the
 *     remainder is empty.
 *   - Allowlist entries can ONLY be removed (paired with a code fix).
 *     Adding entries requires explicit review (CODEOWNERS-gated file).
 *
 * Layer mapping (architecture/model.md §2):
 *   composition-root : src/cli/, src/core/runtime/
 *   domain           : src/core/  (excluding runtime/ and port/)
 *   ports            : src/core/port/
 *   adapters         : src/adapter/, src/auth/
 *   persistence      : src/store/
 *   shared-kernel    : src/config/, src/state/, src/git/, src/parser/,
 *                      src/prompts/, src/logger/, src/errors, src/templates/
 *   leaf             : src/util/
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";
import { ARCH_ALLOWLIST, type AllowlistEntry } from "./arch-allowlist.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ─── grep helpers ────────────────────────────────────────────────────────────

/**
 * Run `grep -rEn PATTERN DIR` from the project root (extended regex).
 * Returns the raw stdout, or "" when grep exits 1 (no matches).
 * Throws on grep exit code > 1 (real error).
 */
function grepE(pattern: string, dir: string): string {
  try {
    return execSync(`grep -rEn ${pattern} ${dir}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const exitCode = (err as { status?: number }).status;
    if (exitCode === 1) return ""; // no matches — success
    throw err;
  }
}

// ─── match parsing ───────────────────────────────────────────────────────────

/** A single grep match parsed from the `file:linenum:content` format. */
export interface GrepMatch {
  /** Relative file path (as returned by grep). */
  file: string;
  /** 1-based line number. */
  line: number;
  /** Raw line content (may have leading whitespace). */
  content: string;
}

/**
 * Parse raw grep output (one `file:linenum:content` entry per line) into
 * structured GrepMatch objects.
 */
export function parseGrepOutput(raw: string): GrepMatch[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // The format is  path/to/file.ts:42:  some content here
      // We split on the FIRST two colons only.
      const firstColon = line.indexOf(":");
      const secondColon = line.indexOf(":", firstColon + 1);
      if (firstColon === -1 || secondColon === -1) {
        return { file: line, line: 0, content: "" };
      }
      return {
        file: line.slice(0, firstColon),
        line: parseInt(line.slice(firstColon + 1, secondColon), 10) || 0,
        content: line.slice(secondColon + 1),
      };
    });
}

// ─── allowlist filtering ─────────────────────────────────────────────────────

/**
 * Return true if the match is covered by at least one allowlist entry.
 * Coverage = file path ends-with entry.file AND content includes entry.pattern.
 */
export function isAllowlisted(
  match: GrepMatch,
  entries: AllowlistEntry[],
): boolean {
  return entries.some(
    (e) =>
      (match.file.endsWith(e.file) || match.file === e.file) &&
      match.content.includes(e.pattern),
  );
}

/**
 * Return true if the line content is a comment (JSDoc, single-line, or
 * block comment continuation).  Used to avoid false positives from
 * documentation mentioning invariant-related identifiers.
 */
export function isCommentLine(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  );
}

/**
 * Given a list of grep matches, return only those that are:
 *   - not comment lines, AND
 *   - not covered by any allowlist entry.
 *
 * The returned slice represents genuine, un-allowed violations.
 * This function is also used by T-04 regression guard tests.
 */
export function filterViolations(
  matches: GrepMatch[],
  allowlistEntries: AllowlistEntry[],
): GrepMatch[] {
  return matches.filter(
    (m) => !isCommentLine(m.content) && !isAllowlisted(m, allowlistEntries),
  );
}

/**
 * Convert a list of violations into a descriptive string for assertion output.
 * When used with `toEqual([])`, Vitest will show this in the diff.
 */
function violationLines(violations: GrepMatch[]): string[] {
  return violations.map((v) => `${v.file}:${v.line}: ${v.content.trim()}`);
}

// ─── T-02: B-1 through B-4 dependency-direction invariants ───────────────────

describe("B-1: domain (core/ excl. runtime/) must not import from adapter/", () => {
  /**
   * B-1 (model.md §4): domain layer must not reference adapter implementations.
   * I/O must flow through ports.  Only composition-root (cli/, core/runtime/)
   * is allowed to wire concrete adapters.
   *
   * Scope: src/core/ EXCLUDING src/core/runtime/ (runtime = composition-root).
   *        core/runtime/ adapter imports are documented in the allowlist as
   *        B-1 entries but are NOT checked here (they are architecture-compliant
   *        per model.md §2 and the §3 closure table).
   */
  it("grep finds no adapter/ imports in src/core/ domain (excluding runtime/)", () => {
    const raw = grepE(
      `"from ['\\"](\\.\\./)*(adapter)/"`,
      "src/core",
    );
    const matches = parseGrepOutput(raw);

    // Exclude composition-root (core/runtime/) — those are allowed to import adapters.
    const domainMatches = matches.filter(
      (m) => !m.file.includes("core/runtime/"),
    );

    // Filter through allowlist (should be empty after domain-only scoping)
    const b1Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-1");
    const violations = filterViolations(domainMatches, b1Entries);

    expect(violationLines(violations)).toEqual([]);
  });
});

describe("B-2: core/ must not import external SDK (@anthropic-ai/*) directly", () => {
  /**
   * B-2 (model.md §4): external SDK types must not leak outside adapter/.
   * Any @anthropic-ai/* import in src/core/ is a B-2 violation unless
   * explicitly allowlisted (currently: local.ts in composition-root).
   *
   * Scope: all of src/core/ (including runtime/).
   */
  it("grep finds no @anthropic-ai/* imports in src/core/ beyond the allowlist", () => {
    const raw = grepE(`"from ['\\"]\@anthropic-ai/"`, "src/core");
    const matches = parseGrepOutput(raw);

    const b2Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-2");
    const violations = filterViolations(matches, b2Entries);

    expect(violationLines(violations)).toEqual([]);
  });
});

describe("B-3: closure model — upward imports into core/ from shared-kernel/leaf/persistence", () => {
  /**
   * B-3 (model.md §4): shared-kernel / leaf / persistence must not import
   * domain (core/).  This prevents upward edges that break the non-circular
   * layer hierarchy.
   *
   * Scope: non-core directories that are upstream in the call graph —
   *   src/parser/, src/config/, src/state/, src/git/, src/prompts/,
   *   src/logger/, src/templates/, src/store/
   * These are scanned for any `from "...core/"` relative import.
   *
   * Known violations are grandfather'd in arch-allowlist.ts (B-3 entries).
   * New upward edges NOT in the allowlist will cause this test to fail.
   */
  it("grep finds no upward imports into core/ from shared-kernel/persistence beyond the allowlist", () => {
    const dirs = [
      "src/parser",
      "src/config",
      "src/state",
      "src/git",
      "src/prompts",
      "src/logger",
      "src/templates",
      "src/store",
    ];

    const allMatches: GrepMatch[] = dirs.flatMap((dir) => {
      const raw = grepE(`"from ['\\"](\\.\\./)*(core)/"`, dir);
      return parseGrepOutput(raw);
    });

    // Exclude test files — production dependency violations only.
    const candidates = allMatches.filter(
      (m) =>
        !m.file.includes("__tests__/") && !m.file.includes(".test.ts"),
    );

    const b3Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-3");
    const violations = filterViolations(candidates, b3Entries);

    expect(violationLines(violations)).toEqual([]);
  });
});

describe("B-4: closure model — leaf (util/) must not import any other src/ module", () => {
  /**
   * B-4 (model.md §4): util/ is the leaf layer and must not import upward.
   * Any `from "../` relative import in src/util/ indicates a dependency on
   * a higher-level module and violates the leaf constraint.
   *
   * Scope: src/util/ — all relative imports that traverse upward (`../`).
   *
   * Known violations are grandfather'd in arch-allowlist.ts (B-4 entries).
   * New upward edges NOT in the allowlist will cause this test to fail.
   */
  it("grep finds no external imports in src/util/ beyond the allowlist", () => {
    const raw = grepE(`"from ['\\"]\\.\\."`, "src/util");
    const allMatches = parseGrepOutput(raw);

    // Exclude test files — production dependency violations only.
    const candidates = allMatches.filter(
      (m) =>
        !m.file.includes("__tests__/") && !m.file.includes(".test.ts"),
    );

    const b4Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-4");
    const violations = filterViolations(candidates, b4Entries);

    expect(violationLines(violations)).toEqual([]);
  });
});

// ─── T-03: B-5 through B-8 call-site invariants ──────────────────────────────

describe("B-5: verdict/transition logic in core/pipeline/ must not have direct I/O", () => {
  /**
   * B-5 (model.md §4): domain verdict / transition / spec-rules must not
   * invoke real I/O directly.  Seam-injected I/O (via `deps.readFile` etc.)
   * is allowed.
   *
   * Scope: src/core/pipeline/ (the pure transition/routing logic).
   *        src/core/spec/rules/ correctly uses injected deps (seam) and is
   *        excluded from the raw grep scope to avoid false positives from
   *        `deps.readFile` call-sites.
   *
   * Current state: zero direct I/O in pipeline/ → no allowlist entries needed.
   */
  it("grep finds no direct fs I/O call-sites in src/core/pipeline/", () => {
    const raw = grepE(
      `"(readFile|readFileSync|readdir|existsSync|statSync)"`,
      "src/core/pipeline",
    );
    const matches = parseGrepOutput(raw).filter(
      (m) => !isCommentLine(m.content),
    );
    // No allowlist filtering needed: zero violations expected.
    expect(violationLines(matches)).toEqual([]);
  });
});

describe("B-6: core/ must not reference process.env directly (must use stripSecrets seam)", () => {
  /**
   * B-6 (model.md §4): subprocess / SDK query env must pass through the
   * `stripSecrets` seam (util/env-filter) so credentials are never leaked
   * to child processes or external APIs.
   *
   * Scope: all of src/core/ (excluding __tests__/).
   * Safe usages filtered: lines containing `stripSecrets` (already using seam).
   * Comment lines filtered: JSDoc mentioning process.env.
   */
  it("grep finds no raw process.env references in src/core/ beyond the allowlist", () => {
    const raw = grepE(`"process\\.env"`, "src/core");
    const allMatches = parseGrepOutput(raw);

    // Remove test files and lines that already use the stripSecrets seam.
    const candidates = allMatches.filter(
      (m) =>
        !m.file.includes("__tests__/") &&
        !m.content.includes("stripSecrets"),
    );

    const b6Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-6");
    const violations = filterViolations(candidates, b6Entries);

    expect(violationLines(violations)).toEqual([]);
  });
});

describe("B-7: core/ must not write to process.stdout/stderr directly", () => {
  /**
   * B-7 (model.md §4): stdout / stderr output must pass through the
   * `maskSensitive` seam (logger/stdout).  Raw process.stdout/stderr.write
   * calls outside logger/ risk leaking tokens in log output.
   *
   * Pattern is call-site limited (`write\s*\(`) to avoid false positives from
   * JSDoc comments like `(defaults to process.stderr.write).`
   *
   * Scope: all of src/core/ (excluding __tests__/).
   * Current state: zero call-site violations → no allowlist entries needed.
   */
  it("grep finds no raw process.(stdout|stderr).write call-sites in src/core/", () => {
    const raw = grepE(
      `"process\\.(stdout|stderr)\\.write\\s*\\("`,
      "src/core",
    );
    const allMatches = parseGrepOutput(raw);
    const candidates = allMatches.filter(
      (m) => !m.file.includes("__tests__/"),
    );

    // No allowlist entries for B-7 — currently zero violations.
    const b7Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-7");
    const violations = filterViolations(candidates, b7Entries);

    expect(violationLines(violations)).toEqual([]);
  });
});

describe("B-8: config.runtime branching must be confined to createRuntime factory", () => {
  /**
   * B-8 (model.md §4): only core/runtime/factory.ts (createRuntime) should
   * branch on config.runtime.  Branching scattered across domain / CLI makes
   * runtime additions risky and violates single-point-of-change.
   *
   * Scope: src/core/ EXCLUDING src/core/runtime/ (where the factory lives and
   *        branching is intentional).
   *
   * Comment lines (JSDoc mentioning config.runtime) are excluded to avoid
   * false positives from design comments.
   */
  it("grep finds no config.runtime branches outside core/runtime/ beyond the allowlist", () => {
    const raw = grepE(`"(config|cfg)\\.runtime"`, "src/core");
    const allMatches = parseGrepOutput(raw);

    // Exclude composition-root (core/runtime/) — that is where branching belongs.
    const domainMatches = allMatches.filter(
      (m) => !m.file.includes("core/runtime/"),
    );

    const b8Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-8");
    const violations = filterViolations(domainMatches, b8Entries);

    expect(violationLines(violations)).toEqual([]);
  });
});

// ─── T-04: regression guard ───────────────────────────────────────────────────

describe("T-04 regression guard: new forbidden edge not in allowlist triggers detection", () => {
  /**
   * These tests verify the DETECTION MECHANISM, not the actual codebase.
   * They inject synthetic violation data to confirm that:
   *   (a) Violations NOT in the allowlist are correctly flagged.
   *   (b) Violations that ARE in the allowlist are correctly suppressed.
   *
   * This proves that adding a new forbidden import to the real codebase would
   * cause the B-1/B-2/B-6/B-8 tests above to fail — demonstrating that the
   * ratchet is one-directional (only shrinks via entry removal + code fix).
   */

  it("detects new forbidden adapter import not in allowlist (B-1 regression guard)", () => {
    // Simulate discovering a NEW adapter import in a hypothetical domain file.
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/core/command/new-feature.ts",
        line: 7,
        content:
          '  import { createFooAdapter } from "../../adapter/foo/index.js";',
      },
    ];

    const b1Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-1");
    const violations = filterViolations(injectedMatches, b1Entries);

    // The new import is NOT in the allowlist — it must be detected.
    expect(violations).toHaveLength(1);
    const first = violations.at(0);
    expect(first?.file).toBe("src/core/command/new-feature.ts");
  });

  it("does not flag violations that are correctly allowlisted (B-2 allowlist suppression)", () => {
    // Simulate the known B-2 violation in local.ts that is already allowlisted.
    const allowlistedMatch: GrepMatch[] = [
      {
        file: "src/core/runtime/local.ts",
        line: 17,
        content:
          'import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";',
      },
    ];

    const b2Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-2");
    const violations = filterViolations(allowlistedMatch, b2Entries);

    // The known violation IS in the allowlist — it must be suppressed.
    expect(violations).toHaveLength(0);
  });

  it("detects new forbidden SDK import not in allowlist (B-2 regression guard)", () => {
    // Simulate a NEW @anthropic-ai import added to a domain file (NOT allowlisted).
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/core/step/my-new-step.ts",
        line: 3,
        content: 'import type { Message } from "@anthropic-ai/sdk";',
      },
    ];

    const b2Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-2");
    const violations = filterViolations(injectedMatches, b2Entries);

    expect(violations).toHaveLength(1);
    const first = violations.at(0);
    expect(first?.file).toBe("src/core/step/my-new-step.ts");
  });

  it("detects new raw process.env reference not in allowlist (B-6 regression guard)", () => {
    // Simulate a NEW process.env direct read in a new domain file.
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/core/command/my-new-command.ts",
        line: 15,
        content: "  const token = process.env.MY_TOKEN;",
      },
    ];

    const b6Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-6");
    // Filter: not a stripSecrets call → must be detected.
    const notSeam = injectedMatches.filter(
      (m) => !m.content.includes("stripSecrets"),
    );
    const violations = filterViolations(notSeam, b6Entries);

    expect(violations).toHaveLength(1);
    const first = violations.at(0);
    expect(first?.file).toBe("src/core/command/my-new-command.ts");
  });

  it("does not flag process.env references that use the stripSecrets seam (B-6 seam exemption)", () => {
    // Simulate a compliant process.env usage going through stripSecrets.
    const seamUsage: GrepMatch[] = [
      {
        file: "src/core/step/my-new-step.ts",
        line: 22,
        content:
          "      env: stripSecrets(process.env as Record<string, string | undefined>),",
      },
    ];

    // The seam filter (applied before allowlist in the real test) removes this.
    const notSeam = seamUsage.filter(
      (m) => !m.content.includes("stripSecrets"),
    );
    expect(notSeam).toHaveLength(0);
  });

  it("detects new upward import into core/ not in allowlist (B-3 regression guard)", () => {
    // Simulate discovering a NEW upward import in a hypothetical shared-kernel file.
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/parser/x.ts",
        line: 5,
        content: '  import { Foo } from "../core/y.js";',
      },
    ];

    const b3Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-3");
    const violations = filterViolations(injectedMatches, b3Entries);

    // The new import is NOT in the allowlist — it must be detected.
    expect(violations).toHaveLength(1);
    const first = violations.at(0);
    expect(first?.file).toBe("src/parser/x.ts");
  });

  it("does not flag violations that are correctly allowlisted (B-3 allowlist suppression)", () => {
    // Simulate the known B-3 violation in request-md.ts that is already allowlisted.
    const allowlistedMatch: GrepMatch[] = [
      {
        file: "src/parser/request-md.ts",
        line: 6,
        content:
          'import type { ParsedRequest, ParsedRequestSections } from "../core/request/types.js";',
      },
    ];

    const b3Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-3");
    const violations = filterViolations(allowlistedMatch, b3Entries);

    // The known violation IS in the allowlist — it must be suppressed.
    expect(violations).toHaveLength(0);
  });

  it("detects new external import in util/ not in allowlist (B-4 regression guard)", () => {
    // Simulate discovering a NEW external import in a hypothetical util file.
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/util/x.ts",
        line: 3,
        content: '  import { bar } from "../state/baz.js";',
      },
    ];

    const b4Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-4");
    const violations = filterViolations(injectedMatches, b4Entries);

    // The new import is NOT in the allowlist — it must be detected.
    expect(violations).toHaveLength(1);
    const first = violations.at(0);
    expect(first?.file).toBe("src/util/x.ts");
  });
});
