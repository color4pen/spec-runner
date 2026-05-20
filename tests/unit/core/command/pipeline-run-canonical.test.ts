/**
 * Unit tests for CANONICAL_PATTERN in pipeline-run.ts
 *
 * TC-PIPELINE-001: flat path matches and slug is extracted correctly
 * TC-PIPELINE-002: old requests/active path does not match
 * TC-PIPELINE-003: hyphenated slug is correctly extracted
 */
import { describe, it, expect } from "vitest";

// Mirror of the pattern defined in pipeline-run.ts
// Canonical path pattern: specrunner/drafts/<slug>.md
const CANONICAL_PATTERN = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;

describe("TC-PIPELINE-001: flat path matches and extracts slug", () => {
  it("extracts slug from canonical drafts path", () => {
    const m = CANONICAL_PATTERN.exec("/path/to/specrunner/drafts/my-feature.md");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("my-feature");
  });
});

describe("TC-PIPELINE-002: old requests/active path does not match", () => {
  it("rejects legacy requests/active/<slug>.md pattern", () => {
    const m = CANONICAL_PATTERN.exec(
      "/path/to/specrunner/requests/active/my-feature.md",
    );
    expect(m).toBeNull();
  });
});

describe("TC-PIPELINE-003: hyphenated slug is correctly extracted", () => {
  it("extracts multi-part-slug from drafts path", () => {
    const m = CANONICAL_PATTERN.exec(
      "/path/to/specrunner/drafts/multi-part-slug.md",
    );
    expect(m).not.toBeNull();
    expect(m![1]).toBe("multi-part-slug");
  });
});
