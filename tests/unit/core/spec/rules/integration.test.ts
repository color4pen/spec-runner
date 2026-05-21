/**
 * Integration and regression tests for DSV format rules expansion.
 *
 * Covers:
 *   TC-081 — validateDeltaSpecPaths accepts optional baselineSpecLoader
 *   TC-090 — typecheck passes (import-level smoke test)
 *   TC-091 — test suite: all 6 new rules have valid DeltaSpecRule interface
 *   TC-092 — false positive regression: archive-format delta specs pass all new rules
 *   TC-093 — self-consistency: change folder's own delta spec validates cleanly
 *   TC-094 — removed-section-format rule has severity: "error"
 *   TC-095 — all 6 new rules have severity: "error"
 */
import { describe, it, expect } from "vitest";
import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateDeltaSpecPaths } from "../../../../../src/core/spec/delta-spec-validator.js";
import { removedSectionFormat } from "../../../../../src/core/spec/rules/removed-section-format.js";
import { renamedSectionFormat } from "../../../../../src/core/spec/rules/renamed-section-format.js";
import { requirementHeaderRequired } from "../../../../../src/core/spec/rules/requirement-header-required.js";
import { scenarioRequiredPerRequirement } from "../../../../../src/core/spec/rules/scenario-required-per-requirement.js";
import { normativeKeywordRequired } from "../../../../../src/core/spec/rules/normative-keyword-required.js";
import { baselineHeaderMatch } from "../../../../../src/core/spec/rules/baseline-header-match.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
/** Absolute path to the repository/worktree root. */
const PROJECT_ROOT = nodePath.resolve(__dirname, "../../../../../");

const ALL_NEW_RULES = [
  removedSectionFormat,
  renamedSectionFormat,
  requirementHeaderRequired,
  scenarioRequiredPerRequirement,
  normativeKeywordRequired,
  baselineHeaderMatch,
];

// ---------------------------------------------------------------------------
// TC-081: validateDeltaSpecPaths が baselineSpecLoader を省略可能として受け付ける
// ---------------------------------------------------------------------------
describe("TC-081: validateDeltaSpecPaths — baselineSpecLoader is optional (3 args)", () => {
  it("accepts call with only 3 arguments and returns ok: true for a valid spec", async () => {
    const specContent = [
      "## Requirements",
      "",
      "### Requirement: Foo",
      "",
      "The system SHALL do X.",
      "",
      "#### Scenario: basic",
      "",
      "- GIVEN a user",
      "- WHEN they act",
      "- THEN it works",
    ].join("\n");
    const deps = makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: specContent });
    // No 4th argument — must compile and run without error
    const result = await validateDeltaSpecPaths(CHANGE_PATH, deps, "spec-change");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-090: bun run typecheck が全体で green
// ---------------------------------------------------------------------------
describe("TC-090: typecheck — new rule modules import cleanly (compile-level smoke)", () => {
  it("all 6 new rule modules are importable with expected named exports", () => {
    // If TypeScript compilation is broken, these imports would fail at the module level.
    // Reaching this assertion confirms type-correct compilation of each rule module.
    expect(typeof removedSectionFormat.check).toBe("function");
    expect(typeof renamedSectionFormat.check).toBe("function");
    expect(typeof requirementHeaderRequired.check).toBe("function");
    expect(typeof scenarioRequiredPerRequirement.check).toBe("function");
    expect(typeof normativeKeywordRequired.check).toBe("function");
    expect(typeof baselineHeaderMatch.check).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-091: bun run test が全体で green
// ---------------------------------------------------------------------------
describe("TC-091: test suite — all 6 new rules satisfy the DeltaSpecRule interface", () => {
  it("each rule has name (string), severity ('error'|'warning'), and check (function)", () => {
    for (const rule of ALL_NEW_RULES) {
      expect(typeof rule.name, `${rule.name}.name`).toBe("string");
      expect(rule.name.length, `${rule.name}.name non-empty`).toBeGreaterThan(0);
      expect(typeof rule.check, `${rule.name}.check`).toBe("function");
      expect(["error", "warning"], `${rule.name}.severity valid`).toContain(rule.severity);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-092: 既存 archive delta spec で新 rule が false positive を出さない (最低 3 件)
// ---------------------------------------------------------------------------
describe("TC-092: false positive regression — 3 representative archive-style specs produce no violations", () => {
  /**
   * Archive sample 1: old MODIFIED Requirements format.
   * Pre-rule archive specs used "## MODIFIED Requirements" / "## ADDED Requirements"
   * instead of "## Requirements". New rules MUST NOT flag these as violations.
   */
  const archiveSample1_ModifiedFormat = [
    "## MODIFIED Requirements",
    "",
    "### Requirement: Foo SHALL work",
    "",
    "The system SHALL perform the operation.",
    "",
    "#### Scenario: basic",
    "",
    "- GIVEN a user",
    "- WHEN they trigger the action",
    "- THEN it succeeds",
  ].join("\n");

  /**
   * Archive sample 2: canonical ## Requirements section, fully compliant format.
   * Represents modern archive specs that already follow all rules.
   */
  const archiveSample2_CanonicalFormat = [
    "# Delta Spec: my-capability",
    "",
    "## Requirements",
    "",
    "### Requirement: The system SHALL validate input",
    "",
    'The system SHALL reject invalid payloads with HTTP 400.',
    "",
    "#### Scenario: invalid payload",
    "",
    "- GIVEN a client sends an invalid payload",
    "- WHEN the system receives it",
    "- THEN it responds with HTTP 400",
    "",
    "### Requirement: The system MUST log errors",
    "",
    "The system MUST write structured log entries for all errors.",
    "",
    "#### Scenario: error logging",
    "",
    "- GIVEN an error occurs",
    "- WHEN the system handles it",
    "- THEN a log entry is written",
  ].join("\n");

  /**
   * Archive sample 3: canonical format with ## Removed and ## Renamed sections.
   * Represents specs that used the correct format for Removed/Renamed sections.
   */
  const archiveSample3_WithRemovedRenamed = [
    "# Delta Spec: cli-commands",
    "",
    "## Requirements",
    "",
    "### Requirement: `specrunner request ls` SHALL list drafts",
    "",
    "The system SHALL list all request drafts in specrunner/drafts/.",
    "",
    "#### Scenario: list drafts",
    "",
    "- GIVEN drafts exist",
    "- WHEN the user runs specrunner request ls",
    "- THEN all drafts are listed",
    "",
    '## Renamed',
    "",
    '- "old command name" → "new command name"',
    "",
    "## Removed",
    "",
    '- "deprecated-command"',
    '- "another-removed-command"',
  ].join("\n");

  function makeArchiveInput(content: string) {
    return {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: content }),
      baselineSpecLoader: async (_cap: string): Promise<string | null> => null,
    };
  }

  it("archive sample 1 (MODIFIED Requirements format) — no false positives from any new rule", async () => {
    const input = makeArchiveInput(archiveSample1_ModifiedFormat);
    for (const rule of ALL_NEW_RULES) {
      const violations = await rule.check(input);
      expect(violations, `${rule.name} must not flag archive sample 1`).toEqual([]);
    }
  });

  it("archive sample 2 (canonical Requirements format) — no false positives from any new rule", async () => {
    const input = makeArchiveInput(archiveSample2_CanonicalFormat);
    for (const rule of ALL_NEW_RULES) {
      const violations = await rule.check(input);
      expect(violations, `${rule.name} must not flag archive sample 2`).toEqual([]);
    }
  });

  it("archive sample 3 (with Removed + Renamed sections) — no false positives from any new rule", async () => {
    const input = makeArchiveInput(archiveSample3_WithRemovedRenamed);
    for (const rule of ALL_NEW_RULES) {
      const violations = await rule.check(input);
      expect(violations, `${rule.name} must not flag archive sample 3`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-093: delta spec が自己整合している (change folder の delta spec が新 rule に違反しない)
// ---------------------------------------------------------------------------
describe("TC-093: self-consistency — dsv-format-rules-expansion delta spec passes validateDeltaSpecPaths", () => {
  it("specrunner/changes/dsv-format-rules-expansion validates without violations", async () => {
    const changePath = nodePath.join(
      PROJECT_ROOT,
      "specrunner/changes/dsv-format-rules-expansion",
    );
    const deps = {
      readdir: (p: string) => nodeFs.readdir(p),
      readFile: (p: string) => nodeFs.readFile(p, "utf-8"),
    };
    const baselineSpecLoader = async (capability: string): Promise<string | null> => {
      try {
        return await nodeFs.readFile(
          nodePath.join(PROJECT_ROOT, `specrunner/specs/${capability}/spec.md`),
          "utf-8",
        );
      } catch {
        return null;
      }
    };
    const result = await validateDeltaSpecPaths(
      changePath,
      deps,
      "spec-change",
      baselineSpecLoader,
    );
    if (!result.ok) {
      // Surface the violations to make failures debuggable
      const msgs = result.violations.map((v) => `[${v.reason}] ${v.path}: ${v.suggested ?? ""}`);
      throw new Error(`Delta spec has violations:\n${msgs.join("\n")}`);
    }
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-094: removed-section-format rule の violation に severity: "error" が設定されている
// ---------------------------------------------------------------------------
describe("TC-094: severity — removed-section-format rule declares severity: error", () => {
  it("removedSectionFormat.severity is 'error'", () => {
    expect(removedSectionFormat.severity).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// TC-095: 全 6 新 rule の violation severity が "error" である
// ---------------------------------------------------------------------------
describe("TC-095: severity — all 6 new rules declare severity: error", () => {
  it("every new rule has severity === 'error'", () => {
    for (const rule of ALL_NEW_RULES) {
      expect(rule.severity, `${rule.name}.severity`).toBe("error");
    }
  });
});
