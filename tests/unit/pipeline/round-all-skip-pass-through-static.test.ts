/**
 * TC-016 / TC-017: static dead-code checks for round-all-skip-pass-through.
 *
 * Verifies that the implementation removed all references to "ROUND_ALL_MEMBERS_SKIPPED"
 * from pipeline.ts (T-03) and reviewer-chain.ts (T-04).
 *
 * These tests are RED until T-03 and T-04 are implemented.
 *
 * TC-016: pipeline.ts に ROUND_ALL_MEMBERS_SKIPPED の参照が残らない
 * TC-017: reviewer-chain.ts に ROUND_ALL_MEMBERS_SKIPPED の参照が残らない
 *
 * Destruction confirmations:
 *   TC-016: re-adding the ROUND_ALL_MEMBERS_SKIPPED terminal seam to pipeline.ts
 *           causes this test to fail (dead code detected).
 *   TC-017: re-adding the ROUND_ALL_MEMBERS_SKIPPED routing to reviewer-chain.ts
 *           causes this test to fail (dead code detected).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to the src/core/pipeline/ directory. */
const PIPELINE_DIR = path.resolve(__dirname, "../../../src/core/pipeline");

// ---------------------------------------------------------------------------
// TC-016: pipeline.ts に ROUND_ALL_MEMBERS_SKIPPED の参照が残らない
// ---------------------------------------------------------------------------

describe("TC-016: pipeline.ts has no ROUND_ALL_MEMBERS_SKIPPED reference after T-03 implementation", () => {
  it("TC-016: src/core/pipeline/pipeline.ts must not contain the string 'ROUND_ALL_MEMBERS_SKIPPED'", async () => {
    // TC-016: verifies that the terminal seam dead code (T-03) has been removed.
    //
    // The old pipeline.ts had:
    //   if (state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED") { ... awaiting-resume ... }
    //
    // After T-03, the ROUND_ALL_MEMBERS_SKIPPED branch is deleted, and nextStep === "end"
    // always routes to awaiting-archive (single path, no error-code check).
    //
    // Destruction confirmation (TC-016): if T-03 is reverted and the branch is re-added,
    // this test fails — the string "ROUND_ALL_MEMBERS_SKIPPED" appears in pipeline.ts.
    const pipelinePath = path.join(PIPELINE_DIR, "pipeline.ts");
    const content = await fs.readFile(pipelinePath, "utf-8");

    // Must not have any reference to ROUND_ALL_MEMBERS_SKIPPED
    const occurrences = (content.match(/ROUND_ALL_MEMBERS_SKIPPED/g) ?? []).length;
    expect(occurrences, `pipeline.ts must have 0 occurrences of "ROUND_ALL_MEMBERS_SKIPPED", found ${occurrences}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-017: reviewer-chain.ts に ROUND_ALL_MEMBERS_SKIPPED の参照が残らない
// ---------------------------------------------------------------------------

describe("TC-017: reviewer-chain.ts has no ROUND_ALL_MEMBERS_SKIPPED reference after T-04 implementation", () => {
  it("TC-017: src/core/pipeline/reviewer-chain.ts must not contain the string 'ROUND_ALL_MEMBERS_SKIPPED'", async () => {
    // TC-017: verifies that the all-members-skipped escalation routing (T-04) has been removed.
    //
    // The old reviewer-chain.ts had:
    //   transitions.push({ step: coordinator, on: "escalation", to: REGRESSION_GATE_STEP_NAME,
    //     when: (s) => s.steps?.[coordinator]?.slice(-1)[0]?.outcome?.error?.code === "ROUND_ALL_MEMBERS_SKIPPED" })
    //
    // After T-04, this specialized routing is deleted. coordinator "escalation" falls through
    // to the default escalate terminal (→ awaiting-resume) for genuine escalations.
    // The approved structural-skip case is now handled via "approved" → regression-gate.
    //
    // Destruction confirmation (TC-017): if T-04 is reverted and the routing is re-added,
    // this test fails — the string "ROUND_ALL_MEMBERS_SKIPPED" appears in reviewer-chain.ts.
    const chainPath = path.join(PIPELINE_DIR, "reviewer-chain.ts");
    const content = await fs.readFile(chainPath, "utf-8");

    // Must not have any reference to ROUND_ALL_MEMBERS_SKIPPED
    const occurrences = (content.match(/ROUND_ALL_MEMBERS_SKIPPED/g) ?? []).length;
    expect(occurrences, `reviewer-chain.ts must have 0 occurrences of "ROUND_ALL_MEMBERS_SKIPPED", found ${occurrences}`).toBe(0);
  });
});
