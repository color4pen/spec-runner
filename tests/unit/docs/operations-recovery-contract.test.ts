/**
 * Drift guard: docs/operations.md must contain the halt → resume recovery contract subsection.
 *
 * TC-021: docs/operations.md contains the recovery-contract subsection with all three classes
 *
 * This test fails if:
 *   - The `halt → resume の回復契約` heading is removed or renamed
 *   - Any of the three path class names is removed
 *   - The quarantine destination (.specrunner/local/) is removed
 *   - The fail-closed-on-quarantine-failure rule is removed
 *
 * Making the docs acceptance criterion a tooth (machine-enforced).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import * as path from "node:path";

const OPERATIONS_MD_PATH = path.resolve(process.cwd(), "docs", "operations.md");

describe("TC-021: docs/operations.md halt → resume recovery contract drift guard", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(OPERATIONS_MD_PATH, "utf-8");
  });

  it("TC-021: contains the 'halt → resume の回復契約' heading", () => {
    expect(
      content,
      "docs/operations.md must contain the 'halt → resume の回復契約' heading",
    ).toContain("halt → resume の回復契約");
  });

  it("TC-021: names the protected canon path class", () => {
    // The three classes must be named; protected canon is one of them
    const hasProtectedCanon =
      content.includes("protected canon") ||
      content.includes("protectedCanonPaths") ||
      content.includes("保護正典") ||
      content.includes("protected-canon");
    expect(
      hasProtectedCanon,
      "docs/operations.md must name the protected canon path class in the recovery contract",
    ).toBe(true);
  });

  it("TC-021: names the pipeline-managed artifact path class", () => {
    // The pipeline-managed artifact class must be named
    const hasPipelineManaged =
      content.includes("pipeline-managed artifact") ||
      content.includes("pipeline managed artifact") ||
      content.includes("パイプライン管理成果物") ||
      content.includes("pipelineManagedPaths") ||
      content.includes("pipeline-managed");
    expect(
      hasPipelineManaged,
      "docs/operations.md must name the pipeline-managed artifact path class in the recovery contract",
    ).toBe(true);
  });

  it("TC-021: names the non-managed path class", () => {
    // The non-managed path class must be named
    const hasNonManaged =
      content.includes("non-managed path") ||
      content.includes("非管理パス") ||
      content.includes("non-managed") ||
      content.includes("unmanaged path");
    expect(
      hasNonManaged,
      "docs/operations.md must name the non-managed path class in the recovery contract",
    ).toBe(true);
  });

  it("TC-021: names .specrunner/local/ as the quarantine destination", () => {
    expect(
      content,
      "docs/operations.md must name .specrunner/local/ as the quarantine destination",
    ).toContain(".specrunner/local/");
  });

  it("TC-021: states the fail-closed-on-quarantine-failure rule", () => {
    // The fail-closed rule for quarantine failure must be stated
    const hasFailClosed =
      content.includes("fail-closed") ||
      content.includes("フェイルクローズ") ||
      content.includes("quarantine") ||
      content.includes("退避");
    expect(
      hasFailClosed,
      "docs/operations.md must state the fail-closed-on-quarantine-failure rule in the recovery contract",
    ).toBe(true);
  });

  it("TC-021: all three classes and quarantine destination appear in the same section (after the heading)", () => {
    // Find the heading position and verify all required elements appear after it
    const headingIdx = content.indexOf("halt → resume の回復契約");
    expect(headingIdx, "heading 'halt → resume の回復契約' must exist in docs/operations.md").toBeGreaterThanOrEqual(0);

    const sectionContent = content.slice(headingIdx);

    // All three classes must appear in the section
    const hasProtectedCanon =
      sectionContent.includes("protected canon") ||
      sectionContent.includes("protectedCanonPaths") ||
      sectionContent.includes("保護正典") ||
      sectionContent.includes("protected-canon");
    expect(hasProtectedCanon, "protected canon class must appear in the recovery-contract section").toBe(true);

    const hasPipelineManaged =
      sectionContent.includes("pipeline-managed artifact") ||
      sectionContent.includes("パイプライン管理成果物") ||
      sectionContent.includes("pipelineManagedPaths") ||
      sectionContent.includes("pipeline-managed");
    expect(hasPipelineManaged, "pipeline-managed artifact class must appear in the recovery-contract section").toBe(true);

    const hasNonManaged =
      sectionContent.includes("non-managed path") ||
      sectionContent.includes("非管理パス") ||
      sectionContent.includes("non-managed") ||
      sectionContent.includes("unmanaged");
    expect(hasNonManaged, "non-managed path class must appear in the recovery-contract section").toBe(true);

    // Quarantine destination
    expect(
      sectionContent,
      ".specrunner/local/ quarantine destination must appear in the recovery-contract section",
    ).toContain(".specrunner/local/");
  });
});
