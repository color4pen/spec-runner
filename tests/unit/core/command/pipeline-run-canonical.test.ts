/**
 * Unit tests for CANONICAL_PATTERN in pipeline-run.ts
 *
 * TC-PIPELINE-001: new directory path matches and slug is extracted correctly
 * TC-PIPELINE-002: old requests/active path does not match
 * TC-PIPELINE-003: new format with hyphenated slug
 * TC-PIPELINE-004: legacy flat path matches and slug is extracted (backward compat)
 */
import { describe, it, expect } from "vitest";

// Mirror of the patterns defined in pipeline-run.ts
// New canonical path pattern: specrunner/drafts/<slug>/request.md
const CANONICAL_PATTERN = /^.*\/specrunner\/drafts\/([^/]+)\/request\.md$/;
// Legacy pattern: specrunner/drafts/<slug>.md
const CANONICAL_PATTERN_LEGACY = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;

function matchCanonical(path: string): RegExpExecArray | null {
  return CANONICAL_PATTERN.exec(path) ?? CANONICAL_PATTERN_LEGACY.exec(path);
}

describe("TC-PIPELINE-001: new directory path matches and extracts slug", () => {
  it("extracts slug from new-format drafts path", () => {
    const m = matchCanonical("/path/to/specrunner/drafts/my-feature/request.md");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("my-feature");
  });
});

describe("TC-PIPELINE-002: old requests/active path does not match", () => {
  it("rejects legacy requests/active/<slug>.md pattern", () => {
    const m = matchCanonical(
      "/path/to/specrunner/requests/active/my-feature.md",
    );
    expect(m).toBeNull();
  });
});

describe("TC-PIPELINE-003: new format with hyphenated slug", () => {
  it("extracts multi-part-slug from new-format drafts path", () => {
    const m = matchCanonical(
      "/path/to/specrunner/drafts/multi-part-slug/request.md",
    );
    expect(m).not.toBeNull();
    expect(m![1]).toBe("multi-part-slug");
  });
});

describe("TC-PIPELINE-004: legacy flat path falls back correctly", () => {
  it("extracts slug from legacy drafts/<slug>.md path", () => {
    const m = matchCanonical("/path/to/specrunner/drafts/my-feature.md");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("my-feature");
  });

  it("extracts hyphenated slug from legacy flat path", () => {
    const m = matchCanonical("/path/to/specrunner/drafts/multi-part-slug.md");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("multi-part-slug");
  });
});

describe("New CANONICAL_PATTERN does not match legacy flat path", () => {
  it("new pattern rejects flat .md path", () => {
    const m = CANONICAL_PATTERN.exec("/path/to/specrunner/drafts/my-feature.md");
    expect(m).toBeNull();
  });

  it("legacy pattern rejects new directory path", () => {
    const m = CANONICAL_PATTERN_LEGACY.exec("/path/to/specrunner/drafts/my-feature/request.md");
    expect(m).toBeNull();
  });
});
