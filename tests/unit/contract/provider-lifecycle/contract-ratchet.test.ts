/**
 * Provider lifecycle parity contract — ratchet test suite.
 *
 * Thirteen structural ratchets that must pass at all times:
 *
 *  1. ID ratchet         — CONTRACT_CASES IDs ⊆ REQUIRED_CASE_IDS and vice versa
 *  2. Duplicate ratchet  — no duplicate IDs in CONTRACT_CASES
 *  3. Area ratchet       — all CONTRACT_CASES areas ∈ LIFECYCLE_AREAS; every area has ≥1 case
 *  4. Shared ratchet     — for shared cases, both providers have support="supported"
 *  5. Reason ratchet     — support="absent" expectations always have a reason (≥40 chars)
 *  6. UNEXPLAINED ratchet— no reason starts with UNEXPLAINED: (Design D11); both-supported
 *                          provider-specific cases must have non-trivial reasons (≥40 chars)
 *  7. Skip ratchet       — every case has at least one supported provider (no all-absent cases)
 *  8. Registry ratchet   — PROVIDER_HARNESSES keys equal CONTRACT_PROVIDERS exactly;
 *                          every src/adapter/ dir with agent-runner.ts is registered or justified
 *  9. Field matrix ratchet— RESULT_FIELD_MATRIX keys equal AgentRunResult interface fields
 * 10. No-skip ratchet    — no test.skip/it.skip/describe.skip/it.todo/.only in contract files (TC-023)
 * 11. SDK containment    — shared contract modules do not import provider adapters or SDKs (TC-028/TC-029);
 *                          provider-specific SDKs stay inside their two allowed adapter directories
 * 12. D5 isolation       — case-table.ts does not import case-ids.ts (TC-040)
 * 13. case-ids isolation — case-ids.ts has zero import statements (TC-031)
 *
 * The field matrix ratchet (9) uses the TypeScript compiler API to parse
 * src/core/port/agent-runner.ts and extract AgentRunResult member names.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { CONTRACT_CASES } from "./case-table.js";
import { REQUIRED_CASE_IDS, LIFECYCLE_AREAS, CONTRACT_PROVIDERS } from "./case-ids.js";
import { PROVIDER_HARNESSES } from "./harness/registry.js";
import { RESULT_FIELD_MATRIX } from "./result-field-matrix.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all member names from a TypeScript interface in a source file. */
function extractInterfaceMemberNames(sourcePath: string, interfaceName: string): Set<string> {
  const source = readFileSync(sourcePath, "utf8");
  const sf = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);

  const members = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === interfaceName
    ) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const name = ts.isIdentifier(member.name)
            ? member.name.text
            : member.name.getText(sf);
          members.add(name);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return members;
}

// Path to the agent-runner port:
//   this file: tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts
//   target:    src/core/port/agent-runner.ts
//   relative:  ../../../../src/core/port/agent-runner.ts
const _thisDir = dirname(fileURLToPath(import.meta.url));
const AGENT_RUNNER_PORT_PATH = resolve(_thisDir, "../../../../src/core/port/agent-runner.ts");

// ---------------------------------------------------------------------------
// 1. ID ratchet
// ---------------------------------------------------------------------------

describe("ratchet:id", () => {
  test("all REQUIRED_CASE_IDS are present in CONTRACT_CASES", () => {
    const caseIds = new Set<string>(CONTRACT_CASES.map((c) => c.id));
    const missing = REQUIRED_CASE_IDS.filter((id) => !caseIds.has(id));
    expect(missing, `Missing case IDs: ${missing.join(", ")}`).toHaveLength(0);
  });

  test("all CONTRACT_CASES IDs are in REQUIRED_CASE_IDS", () => {
    const requiredSet = new Set<string>(REQUIRED_CASE_IDS);
    const extra = CONTRACT_CASES.filter((c) => !requiredSet.has(c.id));
    expect(
      extra.map((c) => c.id),
      `Unexpected case IDs not in REQUIRED_CASE_IDS`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Duplicate ratchet
// ---------------------------------------------------------------------------

describe("ratchet:duplicate", () => {
  test("no duplicate IDs in CONTRACT_CASES", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const c of CONTRACT_CASES) {
      if (seen.has(c.id)) duplicates.push(c.id);
      seen.add(c.id);
    }
    expect(duplicates, `Duplicate case IDs: ${duplicates.join(", ")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Area ratchet
// ---------------------------------------------------------------------------

describe("ratchet:area", () => {
  test("all CONTRACT_CASES areas are in LIFECYCLE_AREAS", () => {
    const areasSet = new Set<string>(LIFECYCLE_AREAS);
    const invalid = CONTRACT_CASES.filter((c) => !areasSet.has(c.area));
    expect(
      invalid.map((c) => `${c.id}:${c.area}`),
      `Cases with invalid area`,
    ).toHaveLength(0);
  });

  test("every LIFECYCLE_AREA has at least one case", () => {
    const caseAreas = new Set(CONTRACT_CASES.map((c) => c.area));
    const missing = LIFECYCLE_AREAS.filter((area) => !caseAreas.has(area));
    expect(
      missing,
      `LIFECYCLE_AREAS with no cases: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  test("total case count equals 31", () => {
    expect(CONTRACT_CASES).toHaveLength(31);
  });
});

// ---------------------------------------------------------------------------
// 4. Shared ratchet
// ---------------------------------------------------------------------------

describe("ratchet:shared", () => {
  test("shared cases have both providers as supported", () => {
    const violations: string[] = [];
    for (const c of CONTRACT_CASES) {
      if (c.classification !== "shared") continue;
      for (const providerId of CONTRACT_PROVIDERS) {
        const exp = c.expectations[providerId];
        if (exp.support !== "supported") {
          violations.push(
            `${c.id}[${providerId}]: shared case has support="${exp.support}"`,
          );
        }
      }
    }
    expect(violations).toHaveLength(0);
  });

  test("shared case count equals 19", () => {
    const shared = CONTRACT_CASES.filter((c) => c.classification === "shared");
    expect(shared).toHaveLength(19);
  });

  test("provider-specific case count equals 12", () => {
    const specific = CONTRACT_CASES.filter((c) => c.classification === "provider-specific");
    expect(specific).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// 5. Reason ratchet
// ---------------------------------------------------------------------------

describe("ratchet:reason", () => {
  test("absent expectations always have a reason of ≥40 chars", () => {
    const violations: string[] = [];
    for (const c of CONTRACT_CASES) {
      for (const providerId of CONTRACT_PROVIDERS) {
        const exp = c.expectations[providerId];
        if (exp.support === "absent") {
          if (!exp.reason || exp.reason.length < 40) {
            violations.push(
              `${c.id}[${providerId}]: absent but reason is missing or too short (got: "${exp.reason ?? ""}")`,
            );
          }
        }
      }
    }
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. UNEXPLAINED ratchet
// ---------------------------------------------------------------------------

describe("ratchet:unexplained", () => {
  test("provider-specific cases with both providers supported must have reasons", () => {
    const violations: string[] = [];
    for (const c of CONTRACT_CASES) {
      if (c.classification !== "provider-specific") continue;
      const bothSupported = CONTRACT_PROVIDERS.every(
        (p) => c.expectations[p].support === "supported",
      );
      if (!bothSupported) continue;

      // Both supported in a provider-specific case: each must explain the difference.
      for (const providerId of CONTRACT_PROVIDERS) {
        const exp = c.expectations[providerId];
        if (!exp.reason || exp.reason.length < 40) {
          violations.push(
            `${c.id}[${providerId}]: UNEXPLAINED — provider-specific with both supported but reason missing/short`,
          );
        }
      }
    }
    expect(violations).toHaveLength(0);
  });

  test("no reason starts with UNEXPLAINED: — Design D11", () => {
    // Design D11: the system must stop rather than normalize unexplained provider differences.
    // Any expectation reason that starts with "UNEXPLAINED:" signals a placeholder that was
    // never resolved; a well-formed UNEXPLAINED: reason (≥40 chars) would pass the ≥40-char
    // check above, so this separate ratchet is required to catch it.
    const violations: string[] = [];
    for (const c of CONTRACT_CASES) {
      for (const providerId of CONTRACT_PROVIDERS) {
        const exp = c.expectations[providerId];
        if (exp.reason && exp.reason.trimStart().startsWith("UNEXPLAINED:")) {
          violations.push(
            `${c.id}[${providerId}]: reason starts with "UNEXPLAINED:" — resolve the divergence before committing`,
          );
        }
      }
    }
    expect(
      violations,
      `Found UNEXPLAINED: reason(s) — investigate the divergence and replace with a real explanation:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Skip ratchet
// ---------------------------------------------------------------------------

describe("ratchet:skip", () => {
  test("every case has at least one supported provider", () => {
    const allAbsent = CONTRACT_CASES.filter((c) =>
      CONTRACT_PROVIDERS.every((p) => c.expectations[p].support === "absent"),
    );
    expect(
      allAbsent.map((c) => c.id),
      `Cases where ALL providers are absent (dead code)`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Registry ratchet
// ---------------------------------------------------------------------------

describe("ratchet:registry", () => {
  test("PROVIDER_HARNESSES keys equal CONTRACT_PROVIDERS exactly", () => {
    const harnessKeys = new Set(Object.keys(PROVIDER_HARNESSES));
    const contractSet = new Set<string>(CONTRACT_PROVIDERS);

    const missingInHarness = CONTRACT_PROVIDERS.filter((p) => !harnessKeys.has(p));
    const extraInHarness = [...harnessKeys].filter((k) => !contractSet.has(k));

    expect(
      missingInHarness,
      `Providers in CONTRACT_PROVIDERS missing from PROVIDER_HARNESSES`,
    ).toHaveLength(0);
    expect(
      extraInHarness,
      `Providers in PROVIDER_HARNESSES not in CONTRACT_PROVIDERS`,
    ).toHaveLength(0);
  });

  test("PROVIDER_HARNESSES entries have id matching their key", () => {
    const mismatches: string[] = [];
    for (const [key, harness] of Object.entries(PROVIDER_HARNESSES)) {
      if (harness.id !== key) {
        mismatches.push(`${key} → harness.id="${harness.id}"`);
      }
    }
    expect(mismatches).toHaveLength(0);
  });

  test("every src/adapter/ subdirectory with agent-runner.ts is registered in CONTRACT_PROVIDERS or explicitly excluded", () => {
    // Adding a new local adapter without registering it in CONTRACT_PROVIDERS (or this
    // exclusion list) must fail this ratchet. The exclusion list must be updated with a
    // justification whenever an adapter is intentionally omitted from the parity contract.
    //
    // Adapters intentionally excluded from the parity contract (directory name → reason):
    const EXCLUDED_FROM_CONTRACT: Record<string, string> = {
      dispatching:
        "DispatchingAgentRunner delegates to other adapters at runtime; it is not " +
        "a standalone local SDK caller and has no distinct lifecycle to characterize.",
      "managed-agent":
        "ManagedAgentRunner uses the Anthropic managed sessions API (server-side); " +
        "its lifecycle is governed by the sessions API, not the local-provider contract.",
    };

    const adapterDir = resolve(_thisDir, "../../../../src/adapter");
    const contractSet = new Set<string>(CONTRACT_PROVIDERS);
    const violations: string[] = [];

    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(adapterDir, { withFileTypes: true });
    } catch {
      violations.push(`src/adapter/ directory not found at expected path: ${adapterDir}`);
      expect(violations, violations.join("\n")).toHaveLength(0);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Check whether agent-runner.ts exists in this adapter directory.
      const agentRunnerPath = resolve(adapterDir, entry.name, "agent-runner.ts");
      let agentRunnerExists = false;
      try {
        readFileSync(agentRunnerPath);
        agentRunnerExists = true;
      } catch {
        // No agent-runner.ts — this adapter is not relevant to the parity contract.
      }
      if (!agentRunnerExists) continue;

      if (!contractSet.has(entry.name) && !Object.prototype.hasOwnProperty.call(EXCLUDED_FROM_CONTRACT, entry.name)) {
        violations.push(
          `src/adapter/${entry.name}/agent-runner.ts exists but "${entry.name}" is neither in ` +
            `CONTRACT_PROVIDERS nor in the EXCLUDED_FROM_CONTRACT list in this ratchet. ` +
            `Either add it to CONTRACT_PROVIDERS (if it is a local provider that should be ` +
            `covered by the parity contract) or add it to EXCLUDED_FROM_CONTRACT with a justification.`,
        );
      }
    }

    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Field matrix ratchet
// ---------------------------------------------------------------------------

describe("ratchet:field-matrix", () => {
  test("RESULT_FIELD_MATRIX keys equal AgentRunResult interface fields", () => {
    const agentRunResultFields = extractInterfaceMemberNames(
      AGENT_RUNNER_PORT_PATH,
      "AgentRunResult",
    );

    const matrixKeys = new Set(Object.keys(RESULT_FIELD_MATRIX));

    const inResultNotMatrix = [...agentRunResultFields].filter((f) => !matrixKeys.has(f));
    const inMatrixNotResult = [...matrixKeys].filter((f) => !agentRunResultFields.has(f));

    expect(
      inResultNotMatrix,
      `AgentRunResult fields missing from RESULT_FIELD_MATRIX — add entries for new fields`,
    ).toHaveLength(0);

    expect(
      inMatrixNotResult,
      `RESULT_FIELD_MATRIX has fields not in AgentRunResult — remove stale entries`,
    ).toHaveLength(0);
  });

  test("all absent entries have reason of ≥40 chars", () => {
    const violations: string[] = [];
    for (const [field, capability] of Object.entries(RESULT_FIELD_MATRIX)) {
      for (const [providerId, status] of Object.entries(capability.providers)) {
        if (status === "absent") {
          if (!capability.reason || capability.reason.length < 40) {
            violations.push(
              `RESULT_FIELD_MATRIX[${field}][${providerId}]: absent but reason missing/short`,
            );
          }
        }
      }
    }
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10. No-skip ratchet (TC-023, Design D9 item 5)
// ---------------------------------------------------------------------------

describe("ratchet:no-skip", () => {
  test("contract source files contain no test.skip, it.skip, describe.skip, it.todo, test.todo, or .only markers", () => {
    // Collect all .ts files under the contract directory, excluding this ratchet file
    // (which contains the pattern strings as string/regex literals).
    function collectTs(dir: string): string[] {
      const entries = readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectTs(full));
        } else if (entry.name.endsWith(".ts")) {
          // Exclude this ratchet file — its own source contains the pattern strings.
          if (full !== resolve(_thisDir, "contract-ratchet.test.ts")) {
            files.push(full);
          }
        }
      }
      return files;
    }

    // Patterns that must not appear in any contract source file.
    // Using string matching to avoid regex self-reference issues.
    const FORBIDDEN = [
      { label: "test.skip", test: (s: string) => s.includes("test.skip") },
      { label: "it.skip", test: (s: string) => s.includes("it.skip") },
      { label: "describe.skip", test: (s: string) => s.includes("describe.skip") },
      { label: "it.todo", test: (s: string) => s.includes("it.todo") },
      { label: "test.todo", test: (s: string) => s.includes("test.todo") },
      { label: ".only", test: (s: string) => /\.(only)\b/.test(s) },
    ];

    const violations: string[] = [];
    for (const filePath of collectTs(_thisDir)) {
      const content = readFileSync(filePath, "utf8");
      const relPath = filePath.slice(_thisDir.length + 1);
      for (const { label, test: check } of FORBIDDEN) {
        if (check(content)) {
          violations.push(`${relPath}: contains forbidden marker "${label}"`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 11. SDK containment ratchet (TC-028, TC-029, Design D9 item 6)
// ---------------------------------------------------------------------------

describe("ratchet:sdk-containment", () => {
  test("shared contract modules do not import from adapter/claude-code/, adapter/codex/, or provider SDK packages", () => {
    // These files are "shared" — they must not take provider-specific dependencies.
    const sharedModules = [
      "case-ids.ts",
      "scenario.ts",
      "case-table.ts",
      "result-field-matrix.ts",
      "harness/types.ts",
      "provider-lifecycle-parity.test.ts",
    ].map((f) => resolve(_thisDir, f));

    // Forbidden import path fragments (matched against import/from strings).
    const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
      { label: "adapter/claude-code", pattern: /from\s+["'][^"']*adapter\/claude-code/ },
      { label: "adapter/codex", pattern: /from\s+["'][^"']*adapter\/codex/ },
      { label: "@anthropic-ai/", pattern: /from\s+["']@anthropic-ai\// },
      { label: "openai package", pattern: /from\s+["']openai\b/ },
      { label: "@openai/", pattern: /from\s+["']@openai\// },
    ];

    const violations: string[] = [];
    for (const filePath of sharedModules) {
      let content: string;
      try {
        content = readFileSync(filePath, "utf8");
      } catch {
        violations.push(`${filePath}: could not be read`);
        continue;
      }
      const relPath = filePath.slice(_thisDir.length + 1);
      for (const { label, pattern } of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: contains forbidden import from "${label}"`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  test("provider-specific SDK references are confined to their two allowed adapter directories in src/", () => {
    // @anthropic-ai/claude-agent-sdk must only appear in src/adapter/claude-code/
    // @openai/codex-sdk must only appear in src/adapter/codex/
    // Any file outside these directories that references these package names is a
    // containment violation — TC-028 / TC-029.
    const srcDir = resolve(_thisDir, "../../../../src");
    const ALLOWED: Array<{ pkg: string; allowedPrefix: string }> = [
      { pkg: "@anthropic-ai/claude-agent-sdk", allowedPrefix: resolve(srcDir, "adapter", "claude-code") + "/" },
      { pkg: "@openai/codex-sdk", allowedPrefix: resolve(srcDir, "adapter", "codex") + "/" },
    ];

    // Recursively collect all .ts files under src/.
    function collectSrcTs(dir: string): string[] {
      let entries: ReturnType<typeof readdirSync>;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return [];
      }
      const files: string[] = [];
      for (const entry of entries) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectSrcTs(full));
        } else if (entry.name.endsWith(".ts")) {
          files.push(full);
        }
      }
      return files;
    }

    const violations: string[] = [];
    for (const filePath of collectSrcTs(srcDir)) {
      let content: string;
      try {
        content = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      for (const { pkg, allowedPrefix } of ALLOWED) {
        if (content.includes(pkg) && !filePath.startsWith(allowedPrefix)) {
          // Compute a repo-relative path for the error message.
          const repoRoot = resolve(_thisDir, "../../../../..");
          const relPath = filePath.startsWith(repoRoot)
            ? filePath.slice(repoRoot.length + 1)
            : filePath;
          violations.push(
            `${relPath}: references "${pkg}" outside the allowed directory — ` +
              `SDK references for this package must stay inside ${allowedPrefix.slice(repoRoot.length + 1)}`,
          );
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12. D5 isolation ratchet (TC-040)
// ---------------------------------------------------------------------------

describe("ratchet:d5-isolation", () => {
  test("case-table.ts does not import from case-ids.ts (Design D5 / TC-040)", () => {
    const caseTablePath = resolve(_thisDir, "case-table.ts");
    const content = readFileSync(caseTablePath, "utf8");
    // Any import (type or value) from ./case-ids or ./case-ids.js is forbidden.
    const hasImport = /from\s+["']\.\/case-ids(\.js)?["']/.test(content);
    expect(
      hasImport,
      "case-table.ts must not import from case-ids.ts — Design D5 requires the dependency " +
        "to flow only ratchet→{case-table, case-ids}. The ratchet enforces ID and area " +
        "constraints at runtime; the compile-time narrowing is redundant.",
    ).toBe(false);
  });

  test("case-ids.ts has zero import statements (TC-031)", () => {
    const caseIdsPath = resolve(_thisDir, "case-ids.ts");
    const content = readFileSync(caseIdsPath, "utf8");
    // Match any import statement at the start of a line (including type imports).
    // case-ids.ts is the leaf node of the dependency graph; the file comment explicitly
    // states 'No imports in this file (including type imports) — the ratchet enforces this.'
    const hasImport = /^\s*import\b/m.test(content);
    expect(
      hasImport,
      "case-ids.ts must have zero import statements — it is the leaf node of the " +
        "dependency graph. See the file header comment and TC-031.",
    ).toBe(false);
  });
});
