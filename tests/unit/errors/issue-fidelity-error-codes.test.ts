/**
 * TC-014: ERROR_CODES に 2 code が存在し FATAL_ERROR_CODES に含まれない
 *   Source: tasks.md > T-03
 *
 * GIVEN src/errors.ts の ERROR_CODES と FATAL_ERROR_CODES
 * WHEN 両 error code の存在と所属を検査する
 * THEN ISSUE_FIDELITY_UNDECLARED_DROP と ISSUE_FETCH_FAILED が ERROR_CODES に存在する
 * THEN 両 code は FATAL_ERROR_CODES に含まれない（resumable = awaiting-resume で stop する）
 */
import { describe, it, expect } from "vitest";
import { ERROR_CODES } from "../../../src/errors.js";

// FATAL_ERROR_CODES は pipeline.ts 内の private set であるため、
// コードの有無は src/core/pipeline/pipeline.ts の export を使う代わりに
// ファイル内容を検査するアプローチを取る。
// 実装後は pipeline.ts から FATAL_ERROR_CODES を export するか、
// あるいは errors.ts に isResumable() を追加することで直接テストできる。
// このテストでは ERROR_CODES の存在確認と、pipeline.ts テキストを使った
// FATAL_ERROR_CODES 非包含確認の 2 段構えとする。
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// TC-014: ERROR_CODES に 2 code が存在する
// ---------------------------------------------------------------------------

describe("TC-014: ISSUE_FIDELITY_UNDECLARED_DROP と ISSUE_FETCH_FAILED が ERROR_CODES に存在する", () => {
  it("TC-014-a: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP が存在する", () => {
    expect(ERROR_CODES).toHaveProperty("ISSUE_FIDELITY_UNDECLARED_DROP");
    expect(ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP).toBe("ISSUE_FIDELITY_UNDECLARED_DROP");
  });

  it("TC-014-b: ERROR_CODES.ISSUE_FETCH_FAILED が存在する", () => {
    expect(ERROR_CODES).toHaveProperty("ISSUE_FETCH_FAILED");
    expect(ERROR_CODES.ISSUE_FETCH_FAILED).toBe("ISSUE_FETCH_FAILED");
  });
});

// ---------------------------------------------------------------------------
// TC-014: 両 code は FATAL_ERROR_CODES に含まれない（resumable = awaiting-resume で stop）
// ---------------------------------------------------------------------------

describe("TC-014: ISSUE_FIDELITY_UNDECLARED_DROP と ISSUE_FETCH_FAILED は FATAL_ERROR_CODES に含まれない", () => {
  it("TC-014-c: pipeline.ts の FATAL_ERROR_CODES に ISSUE_FIDELITY_UNDECLARED_DROP が含まれない", () => {
    // pipeline.ts is the canonical location for FATAL_ERROR_CODES.
    // We read the source file and assert the code string does NOT appear in FATAL_ERROR_CODES.
    const pipelinePath = path.resolve(
      __dirname,
      "../../../src/core/pipeline/pipeline.ts",
    );
    const content = fs.readFileSync(pipelinePath, "utf-8");

    // Extract FATAL_ERROR_CODES block (multi-line set literal).
    // Pattern: const FATAL_ERROR_CODES: Set<string> = new Set([ ... ]);
    const match = /const FATAL_ERROR_CODES[^=]*=\s*new Set\(\[([^\]]*)\]\)/s.exec(content);
    if (!match) {
      // If FATAL_ERROR_CODES uses a different format, fail with a clear message
      throw new Error(
        "Could not find FATAL_ERROR_CODES in pipeline.ts — check format. " +
        "The test expects: const FATAL_ERROR_CODES ... = new Set([...])",
      );
    }
    const setBody = match[1] ?? "";
    expect(setBody).not.toContain("ISSUE_FIDELITY_UNDECLARED_DROP");
  });

  it("TC-014-d: pipeline.ts の FATAL_ERROR_CODES に ISSUE_FETCH_FAILED が含まれない", () => {
    const pipelinePath = path.resolve(
      __dirname,
      "../../../src/core/pipeline/pipeline.ts",
    );
    const content = fs.readFileSync(pipelinePath, "utf-8");

    const match = /const FATAL_ERROR_CODES[^=]*=\s*new Set\(\[([^\]]*)\]\)/s.exec(content);
    if (!match) {
      throw new Error(
        "Could not find FATAL_ERROR_CODES in pipeline.ts — check format.",
      );
    }
    const setBody = match[1] ?? "";
    expect(setBody).not.toContain("ISSUE_FETCH_FAILED");
  });
});
