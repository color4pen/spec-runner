/**
 * Provider lifecycle parity contract — ratchet test suite.
 *
 * Nine structural ratchets that must pass at all times:
 *
 *  1. ID ratchet         — CONTRACT_CASES IDs ⊆ REQUIRED_CASE_IDS and vice versa
 *  2. Duplicate ratchet  — no duplicate IDs in CONTRACT_CASES
 *  3. Area ratchet       — all CONTRACT_CASES areas ∈ LIFECYCLE_AREAS
 *  4. Shared ratchet     — for shared cases, both providers have support="supported"
 *  5. Reason ratchet     — support="absent" expectations always have a reason (≥40 chars)
 *  6. UNEXPLAINED ratchet— provider-specific cases with both providers supported must have reasons
 *  7. Skip ratchet       — every case has at least one supported provider (no all-absent cases)
 *  8. Registry ratchet   — PROVIDER_HARNESSES keys equal CONTRACT_PROVIDERS exactly
 *  9. Field matrix ratchet— RESULT_FIELD_MATRIX keys equal AgentRunResult interface fields
 *
 * The field matrix ratchet (9) uses the TypeScript compiler API to parse
 * src/core/port/agent-runner.ts and extract AgentRunResult member names.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
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

  test("shared case count equals 20", () => {
    const shared = CONTRACT_CASES.filter((c) => c.classification === "shared");
    expect(shared).toHaveLength(20);
  });

  test("provider-specific case count equals 11", () => {
    const specific = CONTRACT_CASES.filter((c) => c.classification === "provider-specific");
    expect(specific).toHaveLength(11);
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
