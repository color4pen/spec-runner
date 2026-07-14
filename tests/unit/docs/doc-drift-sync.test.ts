/**
 * Semantic drift guards — axis (a) registry N-step counts, axis (b) domain-model version.
 *
 * axis (a): Each "N-step" annotation in registry.ts must equal the corresponding descriptor's
 *   steps.length. Derived from the live descriptor object — no hardcoded counts.
 *
 * axis (b): Every version member in the JobState version union (schema.ts) must appear in the
 *   version clause of architecture/domain-model.md. Parsed from source — no hardcoded versions.
 *
 * Convention follows tests/grep-no-step-name-hardcode.test.ts: read source text, assert with regex.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  STANDARD_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
  FAST_DESCRIPTOR,
} from "../../../src/core/pipeline/registry.js";

const REGISTRY_PATH   = path.resolve(process.cwd(), "src/core/pipeline/registry.ts");
const SCHEMA_PATH     = path.resolve(process.cwd(), "src/state/schema/types.ts");
const DOMAIN_MODEL_PATH = path.resolve(process.cwd(), "architecture/domain-model.md");

// ---------------------------------------------------------------------------
// axis (a): registry "N-step" comment drift guard
// ---------------------------------------------------------------------------

describe("registry.ts N-step comment drift guard (axis a)", () => {
  /**
   * For each pipeline we define:
   *   - label: human-readable name for test output
   *   - descriptor: the live PipelineDescriptor (expected count = steps.length)
   *   - patterns: regexes that capture the N in every "N-step" comment for this pipeline
   *
   * Pattern rationale:
   *   standard  — "Standard N-step pipeline descriptor." (JSDoc at top) and
   *                "standard (N-step)" (registry mapping comment)
   *   design-only — "design-only (N-step)"
   *   fast        — "fast (N-step ..."
   */
  const pipelines = [
    {
      label: "standard",
      descriptor: STANDARD_DESCRIPTOR,
      patterns: [/Standard\s+(\d+)-step/g, /standard\s*\((\d+)-step\)/g],
    },
    {
      label: "design-only",
      descriptor: DESIGN_ONLY_DESCRIPTOR,
      patterns: [/design-only\s*\((\d+)-step\)/g],
    },
    {
      label: "fast",
      descriptor: FAST_DESCRIPTOR,
      patterns: [/fast\s*\((\d+)-step/g],
    },
  ] as const;

  for (const { label, descriptor, patterns } of pipelines) {
    it(`"${label}" N-step comments in registry.ts match descriptor.steps.length`, async () => {
      const source = await fs.readFile(REGISTRY_PATH, "utf-8");
      const expected = descriptor.steps.length;

      // Collect all captured numbers across every pattern for this pipeline.
      const captured: number[] = [];
      for (const pattern of patterns) {
        // Reset lastIndex for reuse across loop iterations.
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) {
          captured.push(Number(match[1]));
        }
      }

      // At least one annotation must exist; if it is absent the guard itself is broken.
      expect(
        captured.length,
        `No "${label}" N-step annotation found in registry.ts — annotation is missing`,
      ).toBeGreaterThan(0);

      // Every captured number must equal the descriptor's actual step count.
      for (const n of captured) {
        expect(
          n,
          `"${label}" comment says ${n}-step but descriptor has ${expected} steps`,
        ).toBe(expected);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// axis (b): domain-model.md version clause drift guard
// ---------------------------------------------------------------------------

describe("domain-model.md version clause drift guard (axis b)", () => {
  it("schema.ts version union members all appear in domain-model.md version clause", async () => {
    // --- Parse allowed version members from schema.ts source ---
    // Target line: "  version: 1 | 2;"
    // Capture the run of digits/spaces/pipes up to the semicolon.
    const schemaSource = await fs.readFile(SCHEMA_PATH, "utf-8");
    const versionMatch = /version:\s*([\d\s|]+);/.exec(schemaSource);
    expect(
      versionMatch,
      "Could not find 'version: <union>;' in schema.ts — check the regex if the type moved",
    ).not.toBeNull();

    const versionUnionText = versionMatch![1] as string | undefined;
    expect(versionUnionText, "Capture group 1 missing from version regex").toBeDefined();
    const allowedVersions = (versionUnionText ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);

    expect(
      allowedVersions.length,
      "Parsed zero version members from schema.ts — regex may be broken",
    ).toBeGreaterThan(0);

    // --- Extract the version clause from domain-model.md ---
    // The invariant bullet leads with "`version` は" and the clause ends at the first 。.
    // Using "`version` は" anchors to the invariant line, not the projection descriptor line
    // (line 14) which also contains the `version` token but in a different context.
    // Expected shape after T-03:
    //   `version` は `1 | 2`（新規 state は 2、旧 version 1 は read 時に 2 へ normalize）。
    const docSource = await fs.readFile(DOMAIN_MODEL_PATH, "utf-8");
    const clauseMatch = /`version` は[^。]*。/.exec(docSource);
    expect(
      clauseMatch,
      "Could not find '`version` は ...' invariant clause (up to first 。) in architecture/domain-model.md",
    ).not.toBeNull();

    const clause = clauseMatch![0];

    // Every allowed version number must appear as a literal in the clause.
    for (const v of allowedVersions) {
      expect(
        clause,
        `domain-model.md version clause does not mention version ${v} (present in schema.ts union)`,
      ).toContain(String(v));
    }
  });
});
