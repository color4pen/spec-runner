/**
 * Structural tests: single shared `matchesGlob` implementation.
 *
 * Covers:
 *   TC-009 (must): Both bite-evidence and staging-containment import matchesGlob
 *                  from shared glob-match.js; neither defines a local body
 *   TC-022 (must): matchesGlob re-export through test-file-selection.ts keeps existing
 *                  tests passing (verified by asserting the re-export structure is present)
 *
 * RED state: tests fail until:
 *   - T-01: src/util/glob-match.ts is created with the single matchesGlob definition
 *   - T-01: test-file-selection.ts removes its local matchesGlob body and re-exports
 *   - T-02: staging-containment.ts imports matchesGlob from glob-match.js
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolve paths relative to the repo root (three levels up from this test file's __tests__ dir)
const ROOT = resolve(import.meta.dirname, "../../../../");

const testFileSelectionSrc = readFileSync(
  resolve(ROOT, "src/core/step/bite-evidence/test-file-selection.ts"),
  "utf-8",
);

const stagingContainmentSrc = readFileSync(
  resolve(ROOT, "src/core/step/staging-containment.ts"),
  "utf-8",
);

const globMatchSrc = readFileSync(
  resolve(ROOT, "src/util/glob-match.ts"),
  "utf-8",
);

// ---------------------------------------------------------------------------
// TC-009: Both consumers import matchesGlob from a module ending in glob-match.js
// ---------------------------------------------------------------------------

describe("TC-009: both consumers import matchesGlob from the single shared glob-match implementation", () => {
  it(
    // TC-009
    "TC-009: test-file-selection.ts imports or re-exports matchesGlob from a specifier ending in glob-match.js",
    () => {
      // GIVEN the source of src/core/step/bite-evidence/test-file-selection.ts
      // WHEN the import structure is inspected
      // THEN it references matchesGlob via a specifier ending in glob-match.js
      const importsFromGlobMatch = /from\s+["'][^"']*glob-match\.js["']/.test(testFileSelectionSrc);
      expect(importsFromGlobMatch).toBe(true);
    },
  );

  it(
    // TC-009
    "TC-009: staging-containment.ts imports matchesGlob from a specifier ending in glob-match.js",
    () => {
      // GIVEN the source of src/core/step/staging-containment.ts
      // WHEN the import structure is inspected
      // THEN it references matchesGlob via a specifier ending in glob-match.js
      const importsFromGlobMatch = /from\s+["'][^"']*glob-match\.js["']/.test(stagingContainmentSrc);
      expect(importsFromGlobMatch).toBe(true);
    },
  );

  it(
    // TC-009
    "TC-009: src/util/glob-match.ts contains exactly one function matchesGlob definition",
    () => {
      // GIVEN the source of src/util/glob-match.ts
      // WHEN inspected
      // THEN it contains the single export function matchesGlob definition
      const matches = [...globMatchSrc.matchAll(/\bfunction\s+matchesGlob\b/g)];
      expect(matches).toHaveLength(1);
    },
  );

  it(
    // TC-009
    "TC-009: test-file-selection.ts does not define a local function matchesGlob body",
    () => {
      // GIVEN the source of src/core/step/bite-evidence/test-file-selection.ts
      // THEN it does not contain a local function matchesGlob body
      const hasLocalBody = /\bfunction\s+matchesGlob\s*\(/.test(testFileSelectionSrc);
      expect(hasLocalBody).toBe(false);
    },
  );

  it(
    // TC-009
    "TC-009: staging-containment.ts does not define a local function matchesGlob body",
    () => {
      // GIVEN the source of src/core/step/staging-containment.ts
      // THEN it does not contain a local function matchesGlob body
      const hasLocalBody = /\bfunction\s+matchesGlob\s*\(/.test(stagingContainmentSrc);
      expect(hasLocalBody).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-022: matchesGlob re-export through test-file-selection.ts keeps existing tests passing
// ---------------------------------------------------------------------------

describe("TC-022: test-file-selection.ts re-exports matchesGlob from shared util", () => {
  it(
    // TC-022
    "TC-022: test-file-selection.ts contains an explicit re-export of matchesGlob",
    () => {
      // GIVEN the source of src/core/step/bite-evidence/test-file-selection.ts
      // WHEN the re-export structure is inspected
      // THEN it has an export { matchesGlob } statement or equivalent re-export
      //      so that existing imports of matchesGlob from './test-file-selection.js' keep working
      const hasReExport =
        /export\s*\{\s*[^}]*matchesGlob[^}]*\}/.test(testFileSelectionSrc) ||
        /export\s+\{[^}]*matchesGlob[^}]*\}\s+from/.test(testFileSelectionSrc);
      expect(hasReExport).toBe(true);
    },
  );

  it(
    // TC-022
    "TC-022: matchesGlob can be imported at runtime from test-file-selection.js (re-export chain works)",
    async () => {
      // Import via the re-export chain: test-file-selection.ts → glob-match.ts
      const { matchesGlob } = await import(
        "../bite-evidence/test-file-selection.js"
      );

      // THEN the imported function works correctly (same behaviour as the shared implementation)
      expect(typeof matchesGlob).toBe("function");
      expect(matchesGlob("foo.test.ts", "**/*.test.*")).toBe(true);
      expect(matchesGlob("src/lib.rs", "**/*.test.*")).toBe(false);
    },
  );
});
