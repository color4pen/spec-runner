/**
 * Unit tests for CANONICAL_PATTERN in pipeline-run.ts
 *
 * TC-PIPELINE-001: flat path matches and slug is extracted correctly
 * TC-PIPELINE-002: old dir-form path does not match
 * TC-PIPELINE-003: hyphenated slug is correctly extracted
 */
import { describe, it, expect } from "vitest";

// Mirror of the pattern defined in pipeline-run.ts
// Canonical path pattern: specrunner/requests/active/<slug>.md
const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\.md$/;

// ---------------------------------------------------------------------------
// TC-PIPELINE-001
// ---------------------------------------------------------------------------
describe("TC-PIPELINE-001: flat path matches and extracts slug", () => {
  it("extracts slug from canonical flat path", () => {
    const m = CANONICAL_PATTERN.exec("/path/to/specrunner/requests/active/my-feature.md");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("my-feature");
  });
});

// ---------------------------------------------------------------------------
// TC-PIPELINE-002
// ---------------------------------------------------------------------------
describe("TC-PIPELINE-002: old dir-form path does not match", () => {
  it("rejects legacy active/<slug>/request.md pattern", () => {
    const m = CANONICAL_PATTERN.exec(
      "/path/to/specrunner/requests/active/my-feature/request.md",
    );
    expect(m).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-PIPELINE-003
// ---------------------------------------------------------------------------
describe("TC-PIPELINE-003: hyphenated slug is correctly extracted", () => {
  it("extracts multi-part-slug from path", () => {
    const m = CANONICAL_PATTERN.exec(
      "/path/to/specrunner/requests/active/multi-part-slug.md",
    );
    expect(m).not.toBeNull();
    expect(m![1]).toBe("multi-part-slug");
  });
});
