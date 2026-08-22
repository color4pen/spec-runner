/**
 * TC-R01: action choices contain reopen
 * TC-R02: reopen branch resolves the job via attach and delegates to `job reopen`
 * TC-R03: reopen branch requires from and reason
 * TC-R04: canon_patch is removed — canon edits enter as operator-apply pushes
 *
 * Structural assertions on .github/workflows/specrunner-dispatch.yml (issue #1066).
 * No yaml parser package is used — blocks are extracted by indent scope, mirroring
 * tests/dispatch-workflow-archive-action.test.ts.
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
// Indent-scope helpers (same contract as dispatch-workflow-archive-action.test.ts)
// ---------------------------------------------------------------------------

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

function extractRunScript(lines: string[], stepName: string): string[] | null {
  const namePattern = new RegExp(`name:\\s*${stepName}`);
  for (let i = 0; i < lines.length; i++) {
    if (namePattern.test(lines[i]!)) {
      const stepIndent = lines[i]!.length - lines[i]!.trimStart().length;
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j]!;
        if (line.trim() === "") continue;
        const indent = line.length - line.trimStart().length;
        if (indent <= stepIndent) break;
        if (/^\s+run:\s*\|/.test(line)) {
          return collectIndentedBlock(lines, j + 1, indent);
        }
      }
    }
  }
  return null;
}

/**
 * Depth-aware top-level if/elif/else branch parser — nested `if ... fi` blocks
 * (attach / canon_patch guards) stay inside the enclosing branch body.
 */
function parseBranches(scriptLines: string[]): Map<string, string[]> {
  const branches = new Map<string, string[]>();
  let currentKey: string | null = null;
  let currentLines: string[] = [];
  let depth = 0;

  for (const line of scriptLines) {
    const trimmed = line.trim();

    if (currentKey === null) {
      const ifMatch = /^if\s+\[([^\]]*)\]/.exec(trimmed);
      if (ifMatch) {
        currentKey = `if:${ifMatch[1]!.trim()}`;
        currentLines = [];
      }
      continue;
    }

    if (/^if\s/.test(trimmed)) {
      depth++;
      currentLines.push(trimmed);
      continue;
    }

    if (trimmed === "fi") {
      if (depth > 0) {
        depth--;
        currentLines.push(trimmed);
      } else {
        branches.set(currentKey, currentLines);
        currentKey = null;
        currentLines = [];
      }
      continue;
    }

    if (depth === 0) {
      const elifMatch = /^elif\s+\[([^\]]*)\]/.exec(trimmed);
      if (elifMatch) {
        branches.set(currentKey, currentLines);
        currentKey = `elif:${elifMatch[1]!.trim()}`;
        currentLines = [];
        continue;
      }
      if (trimmed === "else") {
        branches.set(currentKey, currentLines);
        currentKey = "else";
        currentLines = [];
        continue;
      }
    }

    currentLines.push(trimmed);
  }

  return branches;
}

function reopenBranchBody(branches: Map<string, string[]>): string {
  const reopenKey = [...branches.keys()].find(
    (k) => k.startsWith("elif:") && k.includes('"reopen"'),
  );
  expect(reopenKey, `Branch keys: ${[...branches.keys()].join(", ")}`).toBeDefined();
  return (branches.get(reopenKey!) ?? []).join("\n");
}

// ---------------------------------------------------------------------------
// TC-R01: action choices contain reopen
// ---------------------------------------------------------------------------

describe("TC-R01: action choices contain reopen", () => {
  it("options block contains reopen alongside start, resume, and archive", () => {
    const { block, failureReason } = extractOptionsBlock(lines, [
      "on",
      "workflow_dispatch",
      "inputs",
      "action",
      "options",
    ]);

    if (block === null) {
      throw new Error(`Failed to extract options block: ${failureReason}`);
    }

    const items = block
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim());

    expect(items, `Extracted options: ${JSON.stringify(items)}`).toEqual([
      "start",
      "resume",
      "reopen",
      "archive",
    ]);
  });

  it("reason input is declared", () => {
    const { block, failureReason } = extractOptionsBlock(lines, [
      "on",
      "workflow_dispatch",
      "inputs",
      "reason",
    ]);
    if (block === null) {
      throw new Error(`Failed to extract reason input block: ${failureReason}`);
    }
    expect(block.join("\n")).toContain("type: string");
  });
});

// ---------------------------------------------------------------------------
// TC-R02: reopen branch resolves the job via attach and delegates to `job reopen`
// ---------------------------------------------------------------------------

describe("TC-R02: reopen branch resolves the job via attach and delegates to job reopen", () => {
  let branches: Map<string, string[]>;

  beforeAll(() => {
    const scriptLines = extractRunScript(lines, "Run pipeline");
    if (!scriptLines) throw new Error("Could not find 'Run pipeline' step in workflow");
    branches = parseBranches(scriptLines);
  });

  it("reopen branch exists as an elif", () => {
    const reopenKey = [...branches.keys()].find(
      (k) => k.startsWith("elif:") && k.includes('"reopen"'),
    );
    expect(reopenKey, `Branch keys: ${[...branches.keys()].join(", ")}`).toBeDefined();
  });

  it("resolves the Development linked branch and attaches before reopen", () => {
    const body = reopenBranchBody(branches);
    expect(body).toContain("linkedBranches");
    expect(body).toContain("job attach --branch");
  });

  it("falls back to the issue's open closing PR head branch (post-PR reopen)", () => {
    // PR 作成後は Development link が branch から PR に置き換わり linkedBranches が
    // 空になる (実測: run 32568457970) — closing PR 参照からの解決を固定する
    const body = reopenBranchBody(branches);
    expect(body).toContain("closedByPullRequestsReferences");
    expect(body).toContain("headRefName");
  });

  it("delegates to 'job reopen' with --from and --reason", () => {
    const body = reopenBranchBody(branches);
    expect(body).toContain("job reopen");
    expect(body).toContain('--from "$FROM"');
    expect(body).toContain('--reason "$REASON"');
  });

  it("does not pass --prompt (reopen CLI contract rejects it)", () => {
    const body = reopenBranchBody(branches);
    expect(body).not.toContain("--prompt");
  });
});

// ---------------------------------------------------------------------------
// TC-R03: reopen branch requires from and reason
// ---------------------------------------------------------------------------

describe("TC-R03: reopen branch requires from and reason", () => {
  let branches: Map<string, string[]>;

  beforeAll(() => {
    const scriptLines = extractRunScript(lines, "Run pipeline");
    if (!scriptLines) throw new Error("Could not find 'Run pipeline' step in workflow");
    branches = parseBranches(scriptLines);
  });

  it("guards on empty FROM or REASON before any git/CLI work", () => {
    const body = reopenBranchBody(branches);
    const guardIdx = body.indexOf('-z "$FROM"');
    const attachIdx = body.indexOf("job attach");
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(body).toContain('-z "$REASON"');
    expect(attachIdx).toBeGreaterThan(guardIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-R04: canon_patch input is removed — canon edits enter as operator pushes
// ---------------------------------------------------------------------------

describe("TC-R04: canon_patch is removed from the dispatch workflow", () => {
  // patch の inline 輸送 (raw / base64) は env 輸送や operator の転記で壊れる
  // (実測: run 32554216686 whitespace 破損 / run 32590206028 転記破損)。
  // canon の operator 修正は feature branch への operator-apply commit の直接 push で
  // 入れる運用に一本化し、workflow は patch を一切受け取らないことを固定する。

  it("workflow declares no canon_patch input", () => {
    const { block } = extractOptionsBlock(lines, [
      "on",
      "workflow_dispatch",
      "inputs",
      "canon_patch",
    ]);
    expect(block).toBeNull();
  });

  it("run script has no CANON_PATCH handling", () => {
    expect(content).not.toContain("CANON_PATCH");
    expect(content).not.toContain("canon.patch");
  });

  it("reopen branch does not use --apply-canon (reopen CLI contract rejects it)", () => {
    const scriptLines = extractRunScript(lines, "Run pipeline");
    if (!scriptLines) throw new Error("Could not find 'Run pipeline' step in workflow");
    const branches = parseBranches(scriptLines);
    const codeLines = reopenBranchBody(branches)
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(codeLines).not.toContain("--apply-canon");
  });
});
