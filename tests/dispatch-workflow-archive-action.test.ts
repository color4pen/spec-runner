/**
 * TC-001: action choices contain archive
 * TC-002: archive branch delegates to the CLI only
 * TC-003: existing start and resume dispatch behavior is unchanged
 *
 * Structural assertions on .github/workflows/specrunner-dispatch.yml.
 * No yaml parser package is used — blocks are extracted by indent scope.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const WORKFLOW_PATH = path.resolve(__dirname, "../.github/workflows/specrunner-dispatch.yml");

let content: string;
let lines: string[];

beforeAll(async () => {
  content = await fs.readFile(WORKFLOW_PATH, "utf-8");
  lines = content.split("\n");
});

// ---------------------------------------------------------------------------
// Indent-scope helpers
// ---------------------------------------------------------------------------

/**
 * Starting at `startIdx`, collect all subsequent lines whose indent (leading spaces)
 * is strictly greater than `parentIndent`. Stops at the first line that is non-empty
 * and has indent <= parentIndent.
 */
function collectIndentedBlock(lines: string[], startIdx: number, parentIndent: number): string[] {
  const block: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      block.push(line);
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= parentIndent) break;
    block.push(line);
  }
  return block;
}

/**
 * Extract the `options:` block under a given key path in the YAML.
 * keyPath is an array of keys from outermost to innermost.
 * Returns the lines of the options block (content lines only).
 *
 * On failure, returns null and fills `failureReason`.
 */
function extractOptionsBlock(
  lines: string[],
  keyPath: string[],
): { block: string[] | null; failureReason: string | null } {
  let searchLines = lines;

  for (const key of keyPath) {
    const pattern = new RegExp(`^(\\s*)${key}\\s*:`);
    let found = false;
    for (let i = 0; i < searchLines.length; i++) {
      const line = searchLines[i]!;
      const match = pattern.exec(line);
      if (match) {
        const parentIndent = match[1]!.length;
        const blockLines = collectIndentedBlock(searchLines, i + 1, parentIndent);
        searchLines = blockLines;
        found = true;
        break;
      }
    }
    if (!found) {
      return {
        block: null,
        failureReason: `Key "${key}" not found in YAML scope. Searched ${searchLines.length} lines.`,
      };
    }
  }

  return { block: searchLines, failureReason: null };
}

/**
 * Extract the `run: |` script from a step named by matching a line containing `name: <stepName>`.
 * Returns lines of the script body (the indented block under `run:`).
 */
function extractRunScript(lines: string[], stepName: string): string[] | null {
  const namePattern = new RegExp(`name:\\s*${stepName}`);
  for (let i = 0; i < lines.length; i++) {
    if (namePattern.test(lines[i]!)) {
      // Find the `run:` key within this step's block
      const stepIndent = lines[i]!.length - lines[i]!.trimStart().length;
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j]!;
        if (line.trim() === "") continue;
        const indent = line.length - line.trimStart().length;
        if (indent <= stepIndent) break; // left the step block
        if (/^\s+run:\s*\|/.test(line)) {
          return collectIndentedBlock(lines, j + 1, indent);
        }
      }
    }
  }
  return null;
}

/**
 * Parse the `if / elif / else` branches from a shell script body.
 * Returns a map: { "if:<condition>": lines[], "elif:<condition>": lines[], "else": lines[] }
 */
function parseBranches(scriptLines: string[]): Map<string, string[]> {
  const branches = new Map<string, string[]>();
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of scriptLines) {
    const trimmed = line.trim();

    // Match if/elif conditions
    const ifMatch = /^(if|elif)\s+\[([^\]]*)\]/.exec(trimmed);
    if (ifMatch) {
      if (currentKey !== null) {
        branches.set(currentKey, currentLines);
      }
      currentKey = `${ifMatch[1]}:${ifMatch[2]!.trim()}`;
      currentLines = [];
      continue;
    }

    // Match else
    if (trimmed === "else") {
      if (currentKey !== null) {
        branches.set(currentKey, currentLines);
      }
      currentKey = "else";
      currentLines = [];
      continue;
    }

    // fi closes the block
    if (trimmed === "fi") {
      if (currentKey !== null) {
        branches.set(currentKey, currentLines);
        currentKey = null;
        currentLines = [];
      }
      continue;
    }

    if (currentKey !== null) {
      currentLines.push(trimmed);
    }
  }

  return branches;
}

// ---------------------------------------------------------------------------
// TC-001: action choices contain archive
// ---------------------------------------------------------------------------

describe("TC-001: action choices contain archive", () => {
  it("options block contains start, resume, and archive", () => {
    const { block, failureReason } = extractOptionsBlock(lines, [
      "on",
      "workflow_dispatch",
      "inputs",
      "action",
      "options",
    ]);

    if (block === null) {
      throw new Error(
        `Failed to extract options block: ${failureReason}\nFull workflow (first 60 lines):\n${lines.slice(0, 60).join("\n")}`,
      );
    }

    const items = block
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim());

    expect(items, `Extracted options: ${JSON.stringify(items)}`).toContain("start");
    expect(items, `Extracted options: ${JSON.stringify(items)}`).toContain("resume");
    expect(items, `Extracted options: ${JSON.stringify(items)}`).toContain("archive");
  });
});

// ---------------------------------------------------------------------------
// TC-002: archive branch delegates to the CLI only
// ---------------------------------------------------------------------------

describe("TC-002: archive branch delegates to the CLI only", () => {
  let branches: Map<string, string[]>;

  beforeAll(() => {
    const scriptLines = extractRunScript(lines, "Run pipeline");
    if (!scriptLines) throw new Error("Could not find 'Run pipeline' step in workflow");
    branches = parseBranches(scriptLines);
  });

  it("archive branch exists as an elif", () => {
    const archiveKey = [...branches.keys()].find(
      (k) => k.startsWith("elif:") && k.includes('"archive"'),
    );
    expect(archiveKey, `Branch keys: ${[...branches.keys()].join(", ")}`).toBeDefined();
  });

  it("archive branch body is exactly 1 non-empty, non-comment line", () => {
    const archiveKey = [...branches.keys()].find(
      (k) => k.startsWith("elif:") && k.includes('"archive"'),
    )!;
    const body = (branches.get(archiveKey) ?? []).filter(
      (l) => l.trim() !== "" && !l.trim().startsWith("#"),
    );
    expect(body).toHaveLength(1);
  });

  it("archive branch body contains 'job archive'", () => {
    const archiveKey = [...branches.keys()].find(
      (k) => k.startsWith("elif:") && k.includes('"archive"'),
    )!;
    const body = (branches.get(archiveKey) ?? []).join("\n");
    expect(body).toContain("job archive");
  });

  it("archive branch body contains '--from-issue'", () => {
    const archiveKey = [...branches.keys()].find(
      (k) => k.startsWith("elif:") && k.includes('"archive"'),
    )!;
    const body = (branches.get(archiveKey) ?? []).join("\n");
    expect(body).toContain("--from-issue");
  });

  it('archive branch body contains "$ISSUE"', () => {
    const archiveKey = [...branches.keys()].find(
      (k) => k.startsWith("elif:") && k.includes('"archive"'),
    )!;
    const body = (branches.get(archiveKey) ?? []).join("\n");
    expect(body).toContain('"$ISSUE"');
  });

  it("archive branch body does not contain --with-merge", () => {
    const archiveKey = [...branches.keys()].find(
      (k) => k.startsWith("elif:") && k.includes('"archive"'),
    )!;
    const body = (branches.get(archiveKey) ?? []).join("\n");
    expect(body).not.toContain("--with-merge");
  });

  it("workflow yaml has no --with-merge anywhere", () => {
    expect(content).not.toContain("--with-merge");
  });
});

// ---------------------------------------------------------------------------
// TC-003: existing start and resume dispatch behavior is unchanged
// ---------------------------------------------------------------------------

describe("TC-003: existing start and resume dispatch behavior is unchanged", () => {
  let branches: Map<string, string[]>;

  beforeAll(() => {
    const scriptLines = extractRunScript(lines, "Run pipeline");
    if (!scriptLines) throw new Error("Could not find 'Run pipeline' step in workflow");
    branches = parseBranches(scriptLines);
  });

  it("resume branch contains 'job resume --from-issue'", () => {
    const resumeKey = [...branches.keys()].find(
      (k) => k.startsWith("if:") && k.includes('"resume"'),
    )!;
    const body = (branches.get(resumeKey) ?? []).join("\n");
    expect(body).toContain("job resume");
    expect(body).toContain("--from-issue");
  });

  it("start (else) branch contains 'job start --from-issue'", () => {
    const body = (branches.get("else") ?? []).join("\n");
    expect(body).toContain("job start");
    expect(body).toContain("--from-issue");
  });
});
