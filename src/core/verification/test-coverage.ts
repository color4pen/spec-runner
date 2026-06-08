/**
 * test-coverage phase — CLI internal processing.
 *
 * Reads test-cases.md, extracts Priority: must TC IDs via section-scan,
 * then checks if each TC ID appears in at least one test file anywhere
 * in the project (respecting the project's own test-placement convention).
 *
 * Uses node:fs/promises and node:path only (bun:* / Bun.* are prohibited).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Directory names that should never be scanned for project tests.
const ALWAYS_EXCLUDED_DIRS = new Set<string>([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  ".specrunner",
]);

// Path (relative to rootDir) where archived change folders live; their test
// references must not contaminate the active coverage check.
const ARCHIVE_REL_PATH = path.join("specrunner", "changes", "archive");

/** TC-002: Result of the test-coverage phase. */
export interface TestCoverageResult {
  status: "passed" | "failed" | "skipped";
  missingTcIds: string[];
  assertionlessTcIds: string[];
  totalMustTcs: number;
  foundTcIds: string[];
  /** Human-readable summary for verification-result.md. */
  stdout: string;
}

/**
 * Recursively collect all `.ts` / `.tsx` files under `rootDir`, skipping
 * common build / dependency / cache directories and the spec-runner change
 * archive.
 *
 * Returns an empty array if the directory does not exist or is unreadable.
 *
 * Exported for unit testing.
 */
export async function getTestFiles(rootDir: string): Promise<string[]> {
  const result: string[] = [];
  const absArchive = path.join(rootDir, ARCHIVE_REL_PATH);

  async function scan(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return; // Directory absent or unreadable — treat as no files
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (ALWAYS_EXCLUDED_DIRS.has(entry.name)) continue;
        if (full === absArchive) continue;
        await scan(full);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      ) {
        result.push(full);
      }
    }
  }

  await scan(rootDir);
  return result;
}

/**
 * Extract must TC IDs from test-cases.md content using a section-scan approach.
 *
 * Algorithm:
 * 1. Scan lines for TC section headers: ^##[#]?\s+(TC-\d+(?:-\d+)*)
 *    (supports both h2 "## TC-001" and h3 "### TC-001" formats)
 * 2. Within each TC section, scan subsequent lines until the next ## header
 * 3. If a line contains **Priority**: must, mark the TC as must
 *    (accepts both "- **Priority**: must" and "**Priority**: must" forms)
 * 4. Return IDs of all must TCs found
 *
 * Exported for unit testing.
 */
export function extractMustTcIds(content: string): string[] {
  const lines = content.split("\n");
  const mustTcIds: string[] = [];

  // Matches ## TC-001 or ### TC-10-01 (h2/h3, flat/hierarchical)
  const tcSectionRe = /^##[#]?\s+(TC-\d+(?:-\d+)*)/;
  // Matches **Priority**: must (with or without leading "- ")
  const priorityMustRe = /\*\*Priority\*\*:\s*must/;
  // Matches any ## level heading
  const anySectionRe = /^##/;

  let currentTcId: string | null = null;
  let currentIsMust = false;

  const flushCurrent = (): void => {
    if (currentTcId && currentIsMust) {
      mustTcIds.push(currentTcId);
    }
    currentTcId = null;
    currentIsMust = false;
  };

  for (const line of lines) {
    const tcMatch = line.match(tcSectionRe);
    if (tcMatch) {
      // New TC section header — flush previous, start new
      flushCurrent();
      currentTcId = tcMatch[1] ?? null;
    } else if (anySectionRe.test(line)) {
      // Non-TC section header — close current TC section
      flushCurrent();
    } else if (currentTcId && priorityMustRe.test(line)) {
      currentIsMust = true;
    }
  }

  // Flush last TC section
  flushCurrent();

  return mustTcIds;
}

/**
 * TC-004, TC-006, TC-007, TC-008, TC-009, TC-010, TC-011:
 * Run the test-coverage phase for the given slug.
 *
 * Steps:
 * 1. Read specrunner/changes/<slug>/test-cases.md
 *    → if absent, return status: "skipped" with skip reason in stdout
 * 2. Extract Priority: must TC IDs
 *    → if 0 must TCs, return status: "passed"
 * 3. Collect all .ts / .tsx files across the project (excluding build /
 *    dependency / cache directories and the change archive)
 * 4. Check each must TC ID appears in at least one file
 * 5. Return status: "passed" or "failed" with coverage summary
 *
 * @param slug - Change slug (e.g. "my-feature")
 * @param cwd  - Working directory (root of the target project)
 */
export async function runTestCoveragePhase(
  slug: string,
  cwd: string,
): Promise<TestCoverageResult> {
  const relPath = `specrunner/changes/${slug}/test-cases.md`;
  const testCasesPath = path.join(cwd, relPath);

  // Step 1: Read test-cases.md
  let content: string;
  try {
    content = await fs.readFile(testCasesPath, "utf-8");
  } catch {
    return {
      status: "skipped",
      missingTcIds: [],
      assertionlessTcIds: [],
      totalMustTcs: 0,
      foundTcIds: [],
      stdout: `test-cases.md not found at ${relPath}`,
    };
  }

  // Step 2: Extract must TC IDs
  const mustTcIds = extractMustTcIds(content);

  if (mustTcIds.length === 0) {
    return {
      status: "passed",
      missingTcIds: [],
      assertionlessTcIds: [],
      totalMustTcs: 0,
      foundTcIds: [],
      stdout: "test-coverage: 0/0 must TCs covered (no must TCs defined)",
    };
  }

  // Step 3: Collect test files from the entire project. We follow the
  // project's own test-placement convention rather than a hard-coded `tests/`
  // directory, so e.g. monorepo workspace tests (apps/*/src/**/*.test.ts) and
  // co-located unit tests are all picked up.
  const testFiles = await getTestFiles(cwd);

  // Step 4: Read all test files into memory
  const fileContents: string[] = [];
  for (const file of testFiles) {
    try {
      const text = await fs.readFile(file, "utf-8");
      fileContents.push(text);
    } catch {
      // Skip unreadable files
    }
  }

  // Step 5: Check each must TC ID against all file contents
  const foundTcIds: string[] = [];
  const missingTcIds: string[] = [];

  for (const tcId of mustTcIds) {
    const found = fileContents.some((text) => text.includes(tcId));
    if (found) {
      foundTcIds.push(tcId);
    } else {
      missingTcIds.push(tcId);
    }
  }

  // Step 5b: Assertion existence check — found TC IDs must have at least one
  // file containing a substantive assertion (expect( / assert( / assert.)
  const ASSERTION_RE = /expect\(|assert\(|assert\./;
  const assertionlessTcIds: string[] = [];

  for (const tcId of foundTcIds) {
    const filesWithTc = fileContents.filter((text) => text.includes(tcId));
    const hasAssertion = filesWithTc.some((text) => ASSERTION_RE.test(text));
    if (!hasAssertion) {
      assertionlessTcIds.push(tcId);
    }
  }

  // Step 6: Build human-readable stdout summary
  const total = mustTcIds.length;
  const foundCount = foundTcIds.length;
  const status =
    missingTcIds.length === 0 && assertionlessTcIds.length === 0
      ? "passed"
      : "failed";

  let stdout = `test-coverage: ${foundCount}/${total} must TCs covered`;
  if (missingTcIds.length > 0) {
    stdout += `\nMissing: ${missingTcIds.join(", ")}`;
  }
  if (assertionlessTcIds.length > 0) {
    stdout += `\nAssertionless: ${assertionlessTcIds.join(", ")}`;
  }

  return {
    status,
    missingTcIds,
    assertionlessTcIds,
    totalMustTcs: total,
    foundTcIds,
    stdout,
  };
}
