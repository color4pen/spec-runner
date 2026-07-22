/**
 * Unit tests for pipeline-sole-committer: bite-evidence-result.md 管理パス追加 (#888)
 *
 * TC-026: bite-evidence-result.md が合成 commit に取り込まれる
 * TC-027: bite-evidence-result.md の残留が round guard を誤発火させない
 *
 * RED phase: pipelineManagedPaths does not include bite-evidence-result.md yet (D6 / T-02).
 *   TC-026: pipelineManagedPaths(slug) will NOT contain biteEvidenceResultPath(slug) → fails.
 *   TC-027: partitionRoundChanges puts bite-evidence-result.md in offending → fails.
 *
 * The new implementation should:
 *   - Add biteEvidenceResultPath(slug) to pipelineManagedPaths(slug) (T-02).
 *   - This single change makes both TC-026 and TC-027 pass simultaneously (#888 fix).
 */
import { describe, it, expect } from "vitest";
import { pipelineManagedPaths, partitionRoundChanges } from "../../../src/core/pipeline/round-git-scope.js";
import { biteEvidenceResultPath } from "../../../src/util/paths.js";

const SLUG = "my-slug";

// ─────────────────────────────────────────────────────────────────────────────
// TC-026: bite-evidence-result.md が合成 commit に取り込まれる
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-026: bite-evidence-result.md が合成 commit に取り込まれる", () => {
  it("pipelineManagedPaths(slug) には biteEvidenceResultPath(slug) が含まれる", () => {
    // TC-031 destruction context:
    // If T-02 is NOT implemented (bite-evidence-result.md not added to pipelineManagedPaths),
    // this test fails because the path is absent from the managed set.
    // Adding it fixes both this test (TC-026) and the round guard false-fire (TC-027).

    const managed = pipelineManagedPaths(SLUG);
    const expectedPath = biteEvidenceResultPath(SLUG);

    expect(
      managed,
      `pipelineManagedPaths must include ${expectedPath} (T-02: #888 fix)`,
    ).toContain(expectedPath);
  });

  it("biteEvidenceResultPath(slug) は worktree-relative パスを返す", () => {
    // Sanity: verify the expected path shape
    const p = biteEvidenceResultPath(SLUG);
    expect(p).toBe(`specrunner/changes/${SLUG}/bite-evidence-result.md`);
  });

  it("pipelineManagedPaths は state.json / events.jsonl / usage.json も含む（既存管理パスの保存）", () => {
    const managed = pipelineManagedPaths(SLUG);
    expect(managed).toContain(`specrunner/changes/${SLUG}/state.json`);
    expect(managed).toContain(`specrunner/changes/${SLUG}/events.jsonl`);
    expect(managed).toContain(`specrunner/changes/${SLUG}/usage.json`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-027: bite-evidence-result.md の残留が round guard を誤発火させない
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-027: bite-evidence-result.md の残留が round guard を誤発火させない", () => {
  it("bite-evidence-result.md は changed にあり declared になくても offending に現れない", () => {
    // Simulates #888 bug: bite-evidence step writes bite-evidence-result.md,
    // parallel round runs next and detects it as a worktree change.
    // Without T-02, partitionRoundChanges puts it in offending → round halts incorrectly.
    // With T-02 (pipelineManagedPaths includes it), it is filtered out of offending.

    const biteEvidence = biteEvidenceResultPath(SLUG);
    const sourcePath = "src/module.ts"; // legitimate declared output

    const { toStage, offending } = partitionRoundChanges({
      changed: [sourcePath, biteEvidence],
      declared: [sourcePath], // bite-evidence-result.md NOT declared by any reviewer
      slug: SLUG,
    });

    expect(
      offending,
      "bite-evidence-result.md must NOT appear in offending (pipeline-managed path)",
    ).not.toContain(biteEvidence);

    // Declared path changes are staged normally
    expect(toStage).toContain(sourcePath);
  });

  it("bite-evidence-result.md のみが変更された場合、offending は空でありラウンドは停止しない", () => {
    // If only bite-evidence-result.md changed (no reviewer wrote anything else),
    // offending should be empty and the round should not halt.
    const biteEvidence = biteEvidenceResultPath(SLUG);

    const { offending } = partitionRoundChanges({
      changed: [biteEvidence],
      declared: [],
      slug: SLUG,
    });

    expect(
      offending,
      "offending must be empty when only bite-evidence-result.md changed",
    ).toHaveLength(0);
  });

  it("state.json / events.jsonl / usage.json も offending に現れない（既存動作の保存）", () => {
    const stateJson = `specrunner/changes/${SLUG}/state.json`;
    const eventsJsonl = `specrunner/changes/${SLUG}/events.jsonl`;
    const usageJson = `specrunner/changes/${SLUG}/usage.json`;

    const { offending } = partitionRoundChanges({
      changed: [stateJson, eventsJsonl, usageJson, biteEvidenceResultPath(SLUG)],
      declared: [],
      slug: SLUG,
    });

    expect(offending).not.toContain(stateJson);
    expect(offending).not.toContain(eventsJsonl);
    expect(offending).not.toContain(usageJson);
    expect(offending).toHaveLength(0);
  });
});
