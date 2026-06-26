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

  /**
   * B-5 extension: scope.ts (and all of core/pipeline/) must not import or
   * call child_process / execSync / spawnSync.  The scope breach derivation
   * function is a pure domain function; all subprocess access must flow
   * through the RuntimeStrategy seam (same as verifyFindingRefs).
   *
   * This complements the fs call-site check above and fixes the scope.ts
   * B-5 coverage gap that would exist if only fs calls were checked.
   */
  it("grep finds no child_process imports or execSync/spawnSync call-sites in src/core/pipeline/", () => {
    const raw = grepE(
      `"(child_process|execSync|spawnSync)"`,
      "src/core/pipeline",
    );
    const matches = parseGrepOutput(raw).filter(
      (m) => !isCommentLine(m.content),
    );
    // No allowlist filtering needed: zero violations expected.
    expect(violationLines(matches)).toEqual([]);
  });
});

describe("B-6: core/, adapter/, util/ must not reference process.env directly (must use stripSecrets seam)", () => {
  /**
   * B-6 (model.md §4): subprocess / SDK query env must pass through the
   * `stripSecrets` seam (util/env-filter) so credentials are never leaked
   * to child processes or external APIs.
   *
   * Scope: src/core/, src/adapter/, and src/util/ (excluding __tests__/).
   * Safe usages filtered: lines containing `stripSecrets` (already using seam).
   * Comment lines filtered: JSDoc mentioning process.env.
   *
   * Known-safe call-sites that read individual non-secret keys (XDG paths,
   * diagnostic flags, explicit SDK apiKey forwarding) are grandfather'd in
   * arch-allowlist.ts (invariant "B-6").
   */
  it("grep finds no raw process.env references in src/core/, src/adapter/, and src/util/ beyond the allowlist", () => {
    const rawCore    = grepE(`"process\\.env"`, "src/core");
    const rawAdapter = grepE(`"process\\.env"`, "src/adapter");
    const rawUtil    = grepE(`"process\\.env"`, "src/util");
    const allMatches = [
      ...parseGrepOutput(rawCore),
      ...parseGrepOutput(rawAdapter),
      ...parseGrepOutput(rawUtil),
    ];

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

describe("B-7: core/ and cli/ must not write to process.stdout/stderr directly", () => {
  /**
   * B-7 (model.md §4): stdout / stderr output must pass through the
   * `maskSensitive` seam (logger/stdout).  Raw process.stdout/stderr.write
   * calls outside logger/ risk leaking tokens in log output.
   *
   * Pattern is call-site limited (`write\s*\(`) to avoid false positives from
   * JSDoc comments like `(defaults to process.stderr.write).`
   *
   * Scope: all of src/core/ and src/cli/ (excluding __tests__/).
   * cli/ extension rationale: cli/progress.ts uses process.stderr.write for
   *   progress output; B-7 must cover cli/ to prevent secret leakage via
   *   p.reason / error strings in progress events.
   * Seam exemption: lines containing `maskSensitive` are already routed
   *   through the mask seam — same exemption structure as B-6 `stripSecrets`.
   * Current state: zero violations after T-01 maskSensitive wrap → no allowlist entries needed.
   */
  it("grep finds no raw process.(stdout|stderr).write call-sites in src/core/ and src/cli/", () => {
    const rawCore = grepE(
      `"process\\.(stdout|stderr)\\.write\\s*\\("`,
      "src/core",
    );
    const rawCli = grepE(
      `"process\\.(stdout|stderr)\\.write\\s*\\("`,
      "src/cli",
    );
    const allMatches = [
      ...parseGrepOutput(rawCore),
      ...parseGrepOutput(rawCli),
    ];
    const candidates = allMatches.filter(
      (m) =>
        !m.file.includes("__tests__/") &&
        !m.content.includes("maskSensitive"),
    );

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

// ─── B-9: single mutator enforcement ─────────────────────────────────────────

describe("B-9: status 直書き禁止 — JobState.status changes must go through transitionJob", () => {
  /**
   * B-9 (architecture/model.md §4): JobState.status must only be mutated via
   * transitionJob (src/state/lifecycle.ts).  Direct `status: "..."` writes in
   * patches or persist calls bypass the valid-transition table and risk illegal
   * state mutations.
   *
   * Scope: src/store/ and src/core/ (two directories scanned separately).
   *
   * Exclusions applied before allowlist filtering:
   *   - src/core/verification/ — PhaseResult.status ("passed"|"failed"|"skipped"),
   *     not JobState.status; different type entirely.
   *   - Test files (__tests__/ / .test.ts) — not production code.
   *   - store/job-state-store.ts lines containing '"running"' — this is the
   *     create() initialisation (no prior state, so not a transition).
   *   - Comment lines — handled by isCommentLine() inside filterViolations().
   *
   * src/state/lifecycle.ts (transitionJob definition) is naturally excluded
   * because it is not under src/store/ or src/core/.
   */
  it("grep finds no direct JobState.status writes in src/store/ and src/core/ beyond the allowlist", () => {
    const pattern =
      `'status:\\s*"(running|failed|awaiting-resume|awaiting-merge|terminated|archived|canceled)"'`;

    const rawStore = grepE(pattern, "src/store");
    const rawCore = grepE(pattern, "src/core");

    const allMatches: GrepMatch[] = [
      ...parseGrepOutput(rawStore),
      ...parseGrepOutput(rawCore),
    ];

    // Exclude test files — production violations only.
    const withoutTests = allMatches.filter(
      (m) => !m.file.includes("__tests__/") && !m.file.includes(".test.ts"),
    );

    // Exclude src/core/verification/ — those are PhaseResult.status, not JobState.status.
    const withoutVerification = withoutTests.filter(
      (m) => !m.file.includes("core/verification/"),
    );

    // Exclude the create() initialisation in job-state-store.ts — this sets the
    // *initial* status (no prior state), so it is not a transition.
    const withoutInit = withoutVerification.filter(
      (m) =>
        !(
          m.file.includes("store/job-state-store.ts") &&
          m.content.includes('"running"')
        ),
    );

    const b9Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-9");
    const violations = filterViolations(withoutInit, b9Entries);

    expect(violationLines(violations)).toEqual([]);
  });
});

// ─── B-12: direct node:child_process import ban ──────────────────────────────

describe("B-12: direct `node:child_process` import banned outside seam modules", () => {
  /**
   * B-12: subprocess spawn must be confined to the two seam modules
   * (util/spawn.ts / util/git-exec.ts). Direct node:child_process import
   * in other files enables env-omission spawns that bypass stripSecrets —
   * the exact class of vulnerability that the B-6 process.env grep cannot
   * detect (env-omission spawn writes no process.env reference at all).
   *
   * Allowed importers are listed in the B-12 section of arch-allowlist.ts.
   * Any file not in that allowlist that imports node:child_process is a violation.
   *
   * Liveness: the raw match count must be > 0 so a broken grep that returns
   * nothing cannot pass vacuously.
   */
  it("grep finds no direct node:child_process imports outside the B-12 allowlist", () => {
    const raw = grepE(`"from ['\\\"]node:child_process"`, "src");
    const allMatches = parseGrepOutput(raw);

    // Exclude test files and comment lines.
    const candidates = allMatches.filter(
      (m) =>
        !m.file.includes("__tests__/") &&
        !m.file.includes(".test.ts") &&
        !isCommentLine(m.content),
    );

    // Liveness: at least one import must be found (seams must exist).
    expect(candidates.length).toBeGreaterThan(0);

    const b12Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-12");
    const violations = filterViolations(candidates, b12Entries);

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

  it("does not flag violations that are correctly allowlisted (B-3 suppression mechanism — synthetic entry)", () => {
    // Verify filterViolations suppression mechanism using a locally-defined hypothetical entry.
    // This test is decoupled from the real ARCH_ALLOWLIST contents so it remains valid
    // even as real entries are removed via burn-down requests.
    const syntheticEntry: AllowlistEntry[] = [
      {
        file: "src/hypothetical/some-module.ts",
        pattern: "core/hypothetical/some-service.js",
        invariant: "B-3",
        tracking: "B3-synthetic-suppression-demo",
        comment: "Synthetic entry for suppression mechanism verification only.",
      },
    ];

    // A grep match that exactly matches the synthetic allowlist entry.
    const allowlistedMatch: GrepMatch[] = [
      {
        file: "src/hypothetical/some-module.ts",
        line: 5,
        content:
          'import type { SomeService } from "../core/hypothetical/some-service.js";',
      },
    ];

    const violations = filterViolations(allowlistedMatch, syntheticEntry);

    // The match IS covered by the synthetic entry — it must be suppressed.
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

  it("detects new raw process.stderr.write call-site in src/cli/ not in allowlist (B-7 regression guard / TC-021)", () => {
    // Simulate a NEW raw process.stderr.write in a hypothetical cli file.
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/cli/new-feature.ts",
        line: 10,
        content: '  process.stderr.write("output");',
      },
    ];

    const b7Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-7");
    // Filter: not a maskSensitive call → must be detected.
    const notSeam = injectedMatches.filter(
      (m) => !m.content.includes("maskSensitive"),
    );
    const violations = filterViolations(notSeam, b7Entries);

    expect(violations).toHaveLength(1);
    const first = violations.at(0);
    expect(first?.file).toBe("src/cli/new-feature.ts");
  });

  it("does not flag process.stderr.write calls that use the maskSensitive seam (B-7 seam exemption / TC-020)", () => {
    // Simulate a compliant process.stderr.write usage going through maskSensitive.
    const seamUsage: GrepMatch[] = [
      {
        file: "src/cli/progress.ts",
        line: 42,
        content: "  process.stderr.write(maskSensitive(content));",
      },
    ];

    // The seam filter (applied before allowlist in the real test) removes this.
    const notSeam = seamUsage.filter(
      (m) => !m.content.includes("maskSensitive"),
    );
    expect(notSeam).toHaveLength(0);
  });

  it("detects new direct status write not in allowlist (B-9 regression guard)", () => {
    // Simulate a NEW direct status write in a hypothetical domain file (NOT allowlisted).
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/core/command/new-feature.ts",
        line: 7,
        content: '  status: "failed",',
      },
    ];

    const b9Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-9");
    const violations = filterViolations(injectedMatches, b9Entries);

    // The new status write is NOT in the allowlist — it must be detected.
    expect(violations).toHaveLength(1);
    const first = violations.at(0);
    expect(first?.file).toBe("src/core/command/new-feature.ts");
  });

  // ── T-09: B-12 and narrowed B-6 regression guards ──────────────────────────

  it("B-12 detection: direct node:child_process import in non-seam file is detected (T-09)", () => {
    // Inject a synthetic match for a new git helper that directly imports child_process.
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/git/new-helper.ts",
        line: 1,
        content: 'import { execFile } from "node:child_process";',
      },
    ];

    const b12Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-12");
    const violations = filterViolations(injectedMatches, b12Entries);

    // src/git/new-helper.ts is NOT in the B-12 allowlist — must be detected.
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("src/git/new-helper.ts");
  });

  it("B-12 suppression: direct node:child_process import in seam module is suppressed (T-09)", () => {
    // Inject a synthetic match for the git-exec seam — should be suppressed.
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/util/git-exec.ts",
        line: 1,
        content: 'import { spawn as nodeSpawn } from "node:child_process";',
      },
    ];

    const b12Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-12");
    const violations = filterViolations(injectedMatches, b12Entries);

    // src/util/git-exec.ts IS in the B-12 allowlist — must be suppressed.
    expect(violations).toHaveLength(0);
  });

  it("B-6 narrowing: cast-bearing raw-env spawn in agent-runner.ts is detected by narrowed entry (T-09)", () => {
    // Inject a synthetic match simulating a future raw-env spawn in the same file.
    // The narrowed B-6 entry pattern is 'resolveClaudeCodeOAuthTokenFn(' — this line
    // does NOT contain that pattern, so it must NOT be suppressed.
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/adapter/claude-code/agent-runner.ts",
        line: 99,
        content: "spawn(cmd, args, { env: process.env as Record<string, string | undefined> });",
      },
    ];

    const b6Entries = ARCH_ALLOWLIST.filter((e) => e.invariant === "B-6");
    // Not a stripSecrets call — apply allowlist.
    const notSeam = injectedMatches.filter(
      (m) => !m.content.includes("stripSecrets"),
    );
    const violations = filterViolations(notSeam, b6Entries);

    // The narrowed entry does NOT cover this line (no resolveClaudeCodeOAuthTokenFn() on it).
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("src/adapter/claude-code/agent-runner.ts");
  });

});

// ─── B-10: host↔token 束縛 ───────────────────────────────────────────────────

describe("B-10: host↔token 束縛 — composition-root の全呼び出しで host / baseUrl が渡される", () => {
  /**
   * B-10: github.com 用 token を別 host へ送るのは security advisory パターン。
   * composition-root (src/cli/, src/core/preflight.ts) の全 resolveGitHubToken 呼び出しに
   * host 引数が存在し、全 createGitHubClient 呼び出しに baseUrl 引数が存在することを検証する。
   *
   * 検証方法: grep で呼び出し行を取得し、それぞれに必要な引数が含まれることを確認する。
   */

  const COMPOSITION_ROOT_DIRS = ["src/cli", "src/core/preflight.ts"];

  /**
   * grep for a pattern across composition-root directories.
   */
  function grepCompositionRoot(pattern: string): string {
    return COMPOSITION_ROOT_DIRS.reduce((acc, dir) => {
      return acc + grepE(`"${pattern}"`, dir);
    }, "");
  }

  it("全 resolveGitHubToken 呼び出しに host 引数がある (B-10)", () => {
    // Find all lines that call resolveGitHubToken (but not the import line)
    const raw = grepCompositionRoot("resolveGitHubToken\\(");
    const matches = parseGrepOutput(raw);

    // Exclude comment lines and import statements
    const callSites = matches.filter(
      (m) =>
        !isCommentLine(m.content) &&
        !m.content.includes("import ") &&
        m.content.includes("resolveGitHubToken("),
    );

    // Every call site must contain "host:" to pass the host option
    const missingHost = callSites.filter((m) => !m.content.includes("host:") && !m.content.includes("host,"));

    expect(violationLines(missingHost)).toEqual([]);
    // Liveness: at least one call site must exist
    expect(callSites.length).toBeGreaterThan(0);
  });

  it("全 createGitHubClient 呼び出しに baseUrl 引数がある (B-10 adapter host-aware)", () => {
    const raw = grepCompositionRoot("createGitHubClient\\(");
    const matches = parseGrepOutput(raw);

    // Exclude comment lines and import statements
    const callSites = matches.filter(
      (m) =>
        !isCommentLine(m.content) &&
        !m.content.includes("import ") &&
        m.content.includes("createGitHubClient("),
    );

    // Each call should have at least 3 args (fetchFn, token, baseUrl).
    // We verify by checking that the line is not a 2-arg call (no trailing ")") or
    // that githubApiBaseUrl / baseUrl appears within a few lines.
    // Simplest approach: check that none of them end with just (fetch, token) pattern.
    const missingBaseUrl = callSites.filter(
      (m) =>
        // A 2-arg call ends with just the token variable then close paren
        // A 3-arg call has a 3rd comma-separated argument
        !m.content.match(/createGitHubClient\s*\([^,]+,[^,]+,[^,)]+/),
    );

    expect(violationLines(missingBaseUrl)).toEqual([]);
    // Liveness: at least one call site must exist
    expect(callSites.length).toBeGreaterThan(0);
  });

  it("B-10 regression guard: resolveGitHubToken without host argument is detected", () => {
    // Simulate a call without host option
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/cli/some-new-command.ts",
        line: 10,
        content: "  const { token } = await resolveGitHubToken(process.env);",
      },
    ];

    // This call has no "host:" — should be flagged
    const violating = injectedMatches.filter(
      (m) =>
        !isCommentLine(m.content) &&
        !m.content.includes("import ") &&
        m.content.includes("resolveGitHubToken(") &&
        !m.content.includes("host:") &&
        !m.content.includes("host,"),
    );
    expect(violating).toHaveLength(1);
  });

  it("B-10 regression guard: createGitHubClient without baseUrl argument is detected", () => {
    // Simulate a 2-arg call without baseUrl
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/cli/some-new-command.ts",
        line: 15,
        content: "  const client = createGitHubClient(fetch, token);",
      },
    ];

    const violating = injectedMatches.filter(
      (m) =>
        !isCommentLine(m.content) &&
        !m.content.includes("import ") &&
        m.content.includes("createGitHubClient(") &&
        !m.content.match(/createGitHubClient\s*\([^,]+,[^,]+,[^,)]+/),
    );
    expect(violating).toHaveLength(1);
  });
});

// ─── B-11: bare implements RuntimeStrategy 不在 pin ──────────────────────────

describe("B-11 (arch pin): src/core/runtime/ 具象クラスは bare implements RuntimeStrategy を使わない", () => {
  /**
   * B-11: concrete runtime classes in src/core/runtime/ must implement RealRuntimeStrategy,
   * not bare RuntimeStrategy.
   *
   * This ensures canDeriveChangedFiles() is required for all concrete runtimes,
   * making predicate omission a compile-time error (type-level pin).
   *
   * Test fakes in tests/ are excluded — the optional predicate in RuntimeStrategy port
   * remains the convenience for test fakes.
   *
   * This test only checks "bare implements" absence, not individual methods —
   * so it has zero maintenance cost as RuntimeStrategy methods evolve over time.
   */
  it("src/core/runtime/ に bare 'implements RuntimeStrategy' が存在しない (RealRuntimeStrategy のみ許容)", () => {
    // Grep for any "implements RuntimeStrategy" in src/core/runtime/
    const raw = grepE(`"implements RuntimeStrategy"`, "src/core/runtime");
    const matches = parseGrepOutput(raw);

    // Exclude comment lines
    const nonComment = matches.filter((m) => !isCommentLine(m.content));

    // Exclude lines that use RealRuntimeStrategy (the correct form for real runtimes)
    const bareImplements = nonComment.filter(
      (m) => !m.content.includes("RealRuntimeStrategy"),
    );

    // No bare "implements RuntimeStrategy" should remain in src/core/runtime/
    expect(violationLines(bareImplements)).toEqual([]);
  });

  it("B-11 regression guard: bare implements RuntimeStrategy (without Real prefix) is detected", () => {
    // Simulate a new runtime class that uses bare implements RuntimeStrategy
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/core/runtime/some-new-runtime.ts",
        line: 10,
        content: "export class SomeNewRuntime implements RuntimeStrategy {",
      },
    ];

    // Filter: not RealRuntimeStrategy → should be detected
    const bareImplements = injectedMatches.filter(
      (m) => !isCommentLine(m.content) && !m.content.includes("RealRuntimeStrategy"),
    );
    expect(bareImplements).toHaveLength(1);
  });

  it("B-11: RealRuntimeStrategy is not falsely detected as bare implements", () => {
    // Simulate a correct runtime class using RealRuntimeStrategy
    const injectedMatches: GrepMatch[] = [
      {
        file: "src/core/runtime/local.ts",
        line: 81,
        content: "export class LocalRuntime implements RealRuntimeStrategy {",
      },
    ];

    // Filter: contains RealRuntimeStrategy → correctly excluded
    const bareImplements = injectedMatches.filter(
      (m) => !isCommentLine(m.content) && !m.content.includes("RealRuntimeStrategy"),
    );
    expect(bareImplements).toHaveLength(0);
  });
});

// ─── DSM closure: §3 全層 whitelist enforcement ───────────────────────────────

/**
 * Layer names as defined in architecture/model.md §2.
 * "ext-sdk" is not a physical src/ layer but used as a target classification
 * for @anthropic-ai/* and @openai/* imports.
 */
type LayerName =
  | "composition-root"
  | "domain"
  | "ports"
  | "adapters"
  | "persistence"
  | "shared-kernel"
  | "leaf"
  | "ext-sdk";

/**
 * Classify a src/ file path into its architectural layer (model.md §2).
 * Uses longest-match prefix; more specific paths are listed first.
 * Returns null for paths that cannot be classified (unrecognised src/ subdir).
 */
function classifyLayer(filePath: string): LayerName | null {
  // composition-root (more specific core/ paths first)
  if (filePath.startsWith("src/core/runtime/")) return "composition-root";
  if (filePath.startsWith("src/cli/")) return "composition-root";
  // ports (more specific than remaining core/)
  if (filePath.startsWith("src/core/port/")) return "ports";
  // domain (remaining core/)
  if (filePath.startsWith("src/core/")) return "domain";
  // adapters
  if (filePath.startsWith("src/adapter/")) return "adapters";
  if (filePath.startsWith("src/auth/")) return "adapters";
  // persistence
  if (filePath.startsWith("src/store/")) return "persistence";
  // shared-kernel
  if (filePath.startsWith("src/config/")) return "shared-kernel";
  if (filePath.startsWith("src/state/")) return "shared-kernel";
  if (filePath.startsWith("src/git/")) return "shared-kernel";
  if (filePath.startsWith("src/parser/")) return "shared-kernel";
  if (filePath.startsWith("src/prompts/")) return "shared-kernel";
  if (filePath.startsWith("src/logger/")) return "shared-kernel";
  if (filePath.startsWith("src/templates/")) return "shared-kernel";
  if (filePath === "src/errors.ts" || filePath === "src/errors.js") return "shared-kernel";
  // leaf
  if (filePath.startsWith("src/util/")) return "leaf";
  if (filePath.startsWith("src/kernel/")) return "leaf";
  return null;
}

/**
 * §3 DSM closure model: allowed import edges per source layer.
 * Same-layer imports (— diagonal) are handled separately in scanImportEdges.
 * "ext-sdk" is included for type completeness; no src/ file classifies as ext-sdk.
 */
const DSM_WHITELIST: Record<LayerName, Set<LayerName>> = {
  "composition-root": new Set<LayerName>([
    "domain",
    "ports",
    "adapters",
    "persistence",
    "shared-kernel",
    "leaf",
  ]),
  domain: new Set<LayerName>(["ports", "persistence", "shared-kernel", "leaf"]),
  ports: new Set<LayerName>(["shared-kernel", "leaf"]),
  adapters: new Set<LayerName>(["ports", "shared-kernel", "leaf", "ext-sdk"]),
  persistence: new Set<LayerName>(["shared-kernel", "leaf"]),
  "shared-kernel": new Set<LayerName>(["shared-kernel", "leaf"]),
  leaf: new Set<LayerName>(),
  "ext-sdk": new Set<LayerName>(),
};

/** A forbidden import edge detected by DSM closure scan. */
interface ForbiddenEdge {
  source: GrepMatch;
  sourceLayer: LayerName;
  targetLayer: LayerName;
}

/**
 * Scan all src/ import statements and return edges that violate the §3 DSM
 * whitelist.  Same-layer imports (— diagonal) are always allowed.
 *
 * Only relative paths and external SDK imports (anthropic-ai / openai) are
 * classified.  Node built-ins, zod, vitest, and other packages are skipped.
 */
function scanImportEdges(): ForbiddenEdge[] {
  // Grep all double-quoted import-from statements in src/.
  // No single-quoted imports exist in this codebase (confirmed by project lint).
  const raw = grepE(`'from "'`, "src");
  const matches = parseGrepOutput(raw);

  // Exclude test files — production dependency violations only.
  const candidates = matches.filter(
    (m) => !m.file.includes("__tests__/") && !m.file.includes(".test.ts"),
  );

  const forbidden: ForbiddenEdge[] = [];

  for (const match of candidates) {
    // Classify the source file's layer.
    const sourceLayer = classifyLayer(match.file);
    if (sourceLayer === null) continue;

    // Extract the import path from the line content.
    const importMatch = match.content.match(/from\s+['"]([^'"]+)['"]/);
    if (!importMatch) continue;
    const importPath = importMatch[1];
    if (!importPath) continue; // Regex group unmatched — skip.

    let targetLayer: LayerName;

    if (
      importPath.startsWith("@anthropic-ai/") ||
      importPath.startsWith("@openai/")
    ) {
      targetLayer = "ext-sdk";
    } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
      // Resolve the relative path from the source file's directory.
      const absSourceDir = path.dirname(path.join(ROOT, match.file));
      const absResolved = path.resolve(absSourceDir, importPath);
      const relPath = path.relative(ROOT, absResolved);

      if (!relPath.startsWith("src/")) continue; // Outside src/ — skip.
      const tl = classifyLayer(relPath);
      if (tl === null) continue; // Unclassifiable target — skip.
      targetLayer = tl;
    } else {
      // node:*, zod, vitest, and other npm packages — skip.
      continue;
    }

    // Same-layer self-reference is always allowed (— in §3 matrix).
    if (sourceLayer === targetLayer) continue;

    // Check against the DSM whitelist.
    if (!DSM_WHITELIST[sourceLayer].has(targetLayer)) {
      forbidden.push({ source: match, sourceLayer, targetLayer });
    }
  }

  return forbidden;
}

describe("DSM closure — §3 全層 whitelist enforcement", () => {
  /**
   * Verifies that the §3 DSM matrix is fully enforced across all src/ layers,
   * including adapter/ and kernel/ (previously unscanned by B-1~B-9 tests).
   *
   * Current divergences are grandfather'd in ARCH_ALLOWLIST (invariant "DSM").
   * New forbidden edges NOT in the allowlist will cause this test to fail —
   * demonstrating the ratchet is one-directional (only shrinks via removal).
   */
  it("§3 whitelist に無い import edge は存在しない（allowlist 除外後）", () => {
    const forbiddenEdges = scanImportEdges();
    const forbiddenMatches = forbiddenEdges.map((e) => e.source);
    const dsmEntries = ARCH_ALLOWLIST.filter((e) => e.invariant === "DSM");
    // Liveness guard: scan must detect at least as many forbidden edges as the
    // number of allowlisted DSM entries.  If classifyLayer or path.resolve
    // regresses and returns 0 edges, this assertion catches the silent failure
    // before filterViolations masks it with an empty violations list.
    expect(forbiddenEdges.length).toBeGreaterThanOrEqual(dsmEntries.length);
    const violations = filterViolations(forbiddenMatches, dsmEntries);
    expect(violationLines(violations)).toEqual([]);
  });

  it("src/kernel/ は import ゼロ（leaf 相当）", () => {
    // kernel/ is a newly established physical directory with an explicit
    // "zero-import" principle.  No allowlist — strict assertion.
    const raw = grepE(`'from "'`, "src/kernel");
    const matches = parseGrepOutput(raw);
    const candidates = matches.filter(
      (m) => !m.file.includes("__tests__/") && !m.file.includes(".test.ts"),
    );
    expect(violationLines(candidates)).toEqual([]);
  });
});

describe("DSM regression guard: new forbidden edge not in allowlist triggers detection", () => {
  /**
   * Verifies the DETECTION MECHANISM for DSM closure violations.
   * Synthetic forbidden edges are injected to confirm that:
   *   (a) Violations NOT in the DSM allowlist are correctly flagged.
   *   (b) The ratchet applies to DSM the same way it applies to B-1/B-2/etc.
   */

  it("detects new forbidden adapter→domain import not in allowlist (DSM regression guard)", () => {
    // Inject a synthetic adapter→domain edge that is NOT in the allowlist.
    const syntheticEdge: GrepMatch = {
      file: "src/adapter/claude-code/new-feature.ts",
      line: 5,
      content:
        'import type { Pipeline } from "../../core/pipeline/types.js";',
    };
    const dsmEntries = ARCH_ALLOWLIST.filter((e) => e.invariant === "DSM");
    const violations = filterViolations([syntheticEdge], dsmEntries);
    // This file and pattern are NOT in the allowlist — must be detected.
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("src/adapter/claude-code/new-feature.ts");
  });

  it("detects new forbidden shared-kernel→domain import not in allowlist (DSM regression guard)", () => {
    // Inject a synthetic shared-kernel→domain edge that is NOT in the allowlist.
    const syntheticEdge: GrepMatch = {
      file: "src/config/new-helper.ts",
      line: 3,
      content: 'import type { Step } from "../core/step/types.js";',
    };
    const dsmEntries = ARCH_ALLOWLIST.filter((e) => e.invariant === "DSM");
    const violations = filterViolations([syntheticEdge], dsmEntries);
    // This file and pattern are NOT in the allowlist — must be detected.
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("src/config/new-helper.ts");
  });
});
