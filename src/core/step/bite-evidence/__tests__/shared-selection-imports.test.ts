/**
 * Structural tests: shared test-file selection import invariant.
 *
 * Covers:
 *   TC-021: both consumers import selectMaterializedTestFiles from test-file-selection.js
 *   TC-022: no local isExcludedPath body in consumers; gate.ts only re-exports it
 *
 * These tests read source text of the consumer files to assert that the shared
 * selection predicate is not duplicated. They fail if either consumer stops
 * importing from the shared module or re-introduces a local selection filter.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Resolve source file paths
// ---------------------------------------------------------------------------

// __dirname is the __tests__ directory; navigate to the repo/worktree root.
// __tests__ → bite-evidence → step → core → src → (worktree root)
const REPO_ROOT = resolve(__dirname, "../../../../../");
const GATE_TS = resolve(REPO_ROOT, "src/core/step/bite-evidence/gate.ts");
const ACHIEVED_ASSURANCE_TS = resolve(REPO_ROOT, "src/core/archive/achieved-assurance.ts");

// ---------------------------------------------------------------------------
// TC-021: both consumers import selectMaterializedTestFiles from test-file-selection.js
// ---------------------------------------------------------------------------

describe("TC-021: both consumers import selectMaterializedTestFiles from test-file-selection.js", () => {
  it(
    "TC-021: gate.ts imports selectMaterializedTestFiles from a module ending in test-file-selection.js",
    () => {
      // GIVEN the source file src/core/step/bite-evidence/gate.ts
      // WHEN its import declarations are inspected
      const source = readFileSync(GATE_TS, "utf-8");

      // THEN it contains an import of selectMaterializedTestFiles from test-file-selection.js
      // Pattern: import { ... selectMaterializedTestFiles ... } from "...test-file-selection.js"
      expect(source).toMatch(/selectMaterializedTestFiles/);
      expect(source).toMatch(/test-file-selection\.js/);

      // Verify the import connects selectMaterializedTestFiles to the shared module
      const hasImportFromShared = /import[^;]*selectMaterializedTestFiles[^;]*test-file-selection\.js/.test(source)
        || /from\s+["']\.\/test-file-selection\.js["']/.test(source);
      expect(hasImportFromShared).toBe(true);
    },
  );

  it(
    "TC-021: achieved-assurance.ts imports selectMaterializedTestFiles from a module ending in test-file-selection.js",
    () => {
      // GIVEN the source file src/core/archive/achieved-assurance.ts
      // WHEN its import declarations are inspected
      const source = readFileSync(ACHIEVED_ASSURANCE_TS, "utf-8");

      // THEN it contains an import of selectMaterializedTestFiles from test-file-selection.js
      expect(source).toMatch(/selectMaterializedTestFiles/);
      expect(source).toMatch(/test-file-selection\.js/);

      const hasImportFromShared = /import[^;]*selectMaterializedTestFiles[^;]*test-file-selection\.js/.test(source)
        || (/selectMaterializedTestFiles/.test(source) && /test-file-selection\.js/.test(source));
      expect(hasImportFromShared).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-022: no local isExcludedPath body in consumers; gate.ts only re-exports it
// ---------------------------------------------------------------------------

describe("TC-022: no local isExcludedPath body in consumers; gate.ts only re-exports it", () => {
  it(
    "TC-022: achieved-assurance.ts contains no local `function isExcludedPath` definition",
    () => {
      // GIVEN the source file src/core/archive/achieved-assurance.ts
      const source = readFileSync(ACHIEVED_ASSURANCE_TS, "utf-8");

      // THEN it contains no local function isExcludedPath definition
      // (it should import isExcludedPath if needed, not define it)
      expect(source).not.toMatch(/function\s+isExcludedPath\s*\(/);
    },
  );

  it(
    "TC-022: gate.ts does not define its own isExcludedPath function body (only re-exports)",
    () => {
      // GIVEN the source file src/core/step/bite-evidence/gate.ts
      const source = readFileSync(GATE_TS, "utf-8");

      // THEN gate.ts does not contain a `function isExcludedPath` definition with a body
      // It should only have a re-export: export { isExcludedPath } from "./test-file-selection.js"
      //
      // Check that if isExcludedPath appears, it's only in a re-export statement, not as a
      // function definition with a body (containing `return` or `startsWith`)
      const functionDefPattern = /(?:export\s+)?function\s+isExcludedPath\s*\([^)]*\)\s*:\s*\w+\s*\{[^}]*return/;
      expect(source).not.toMatch(functionDefPattern);

      // If isExcludedPath appears at all in gate.ts, it must be in a re-export form
      if (source.includes("isExcludedPath")) {
        // Must be a re-export, not a function definition with implementation
        expect(source).toMatch(/export\s*\{[^}]*isExcludedPath[^}]*\}\s*from\s+["']\.\/test-file-selection\.js["']/);
      }
    },
  );
});
