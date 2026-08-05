/**
 * Unit tests for IssueFidelityComparator adapter (TC-019, TC-020, TC-021)
 *
 * TC-019: comparator adapter — 正常 JSON 出力から undeclaredDrops を parse する
 *   Source: tasks.md > T-07
 *   GIVEN queryOneShot 相当が空配列または複数要素を含む undeclaredDrops JSON を返す
 *   WHEN compare() を呼ぶ
 *   THEN 空配列の場合は undeclaredDrops: [] が返る
 *   THEN 複数要素の場合は全要素が文字列として含まれた配列が返る
 *
 * TC-020: comparator adapter — parse 不能な出力は throw する（fail-closed）
 *   Source: tasks.md > T-07
 *   GIVEN queryOneShot 相当が JSON でない / undeclaredDrops キーを含まないテキストを返す
 *   WHEN compare() を呼ぶ
 *   THEN 例外が throw される（null や空配列を返さない — fail-closed）
 *
 * TC-021: comparator adapter の compare() が issueTitle / issueBody / requestMd を prompt builder に渡す
 *   Source: tasks.md > T-07
 *   GIVEN queryOneShot を spy 化した comparator
 *   WHEN compare({ issueTitle: "T", issueBody: "B", requestMd: "R" }) を呼ぶ
 *   THEN 生成された system prompt または user prompt に issueTitle / issueBody / requestMd の内容が含まれている
 */
import { describe, it, expect, vi } from "vitest";
import { createIssueFidelityComparator } from "../../../../src/adapter/claude-code/issue-fidelity-comparator.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
  };
}

/**
 * Create a comparator with a fake query function injected (instead of real queryOneShot).
 * The factory should accept an optional query function override for testability.
 */
function makeComparatorWithFakeQuery(fakeOutput: string) {
  const fakeQuery = vi.fn().mockResolvedValue({ text: fakeOutput, sessionId: null, stopReason: "end_turn" });
  const comparator = createIssueFidelityComparator(makeConfig(), fakeQuery);
  return { comparator, fakeQuery };
}

// ---------------------------------------------------------------------------
// TC-019: 正常 JSON 出力から undeclaredDrops を parse する
// ---------------------------------------------------------------------------

describe("TC-019: comparator — 正常 JSON 出力から undeclaredDrops を parse する", () => {
  it("TC-019-a: 空配列の undeclaredDrops → { undeclaredDrops: [] } が返る", async () => {
    const { comparator } = makeComparatorWithFakeQuery(
      '```json\n{"undeclaredDrops":[]}\n```',
    );

    const result = await comparator.compare({
      issueTitle: "Test Issue",
      issueBody: "Issue body",
      requestMd: "# Request\n\n## Requirements\n\n- req1\n",
    });

    expect(result.undeclaredDrops).toEqual([]);
  });

  it("TC-019-b: 複数要素の undeclaredDrops → 全要素が含まれた配列が返る", async () => {
    const { comparator } = makeComparatorWithFakeQuery(
      '{"undeclaredDrops":["install into fixture project","run from subdirectory"]}',
    );

    const result = await comparator.compare({
      issueTitle: "Test Issue",
      issueBody: "Issue body",
      requestMd: "# Request\n\n## Requirements\n\n- req1\n",
    });

    expect(result.undeclaredDrops).toHaveLength(2);
    expect(result.undeclaredDrops).toContain("install into fixture project");
    expect(result.undeclaredDrops).toContain("run from subdirectory");
  });

  it("TC-019-c: JSON が markdown code block に包まれていても parse できる", async () => {
    const { comparator } = makeComparatorWithFakeQuery(
      "Some analysis...\n\n```json\n{\"undeclaredDrops\":[\"missing requirement\"]}\n```",
    );

    const result = await comparator.compare({
      issueTitle: "T",
      issueBody: "B",
      requestMd: "R",
    });

    expect(result.undeclaredDrops).toEqual(["missing requirement"]);
  });
});

// ---------------------------------------------------------------------------
// TC-020: parse 不能な出力は throw する（fail-closed）
// ---------------------------------------------------------------------------

describe("TC-020: comparator — parse 不能な出力は throw する（fail-closed）", () => {
  it("TC-020-a: JSON でないテキスト → throw する（null や空配列を返さない）", async () => {
    const { comparator } = makeComparatorWithFakeQuery("This is not JSON at all");

    await expect(
      comparator.compare({ issueTitle: "T", issueBody: "B", requestMd: "R" }),
    ).rejects.toThrow();
  });

  it("TC-020-b: undeclaredDrops キーを含まない JSON → throw する（fail-closed）", async () => {
    const { comparator } = makeComparatorWithFakeQuery('{"result": "ok", "drops": []}');

    await expect(
      comparator.compare({ issueTitle: "T", issueBody: "B", requestMd: "R" }),
    ).rejects.toThrow();
  });

  it("TC-020-c: 空文字列の出力 → throw する（fail-closed）", async () => {
    const { comparator } = makeComparatorWithFakeQuery("");

    await expect(
      comparator.compare({ issueTitle: "T", issueBody: "B", requestMd: "R" }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-021: compare() が issueTitle / issueBody / requestMd を prompt builder に渡す
// ---------------------------------------------------------------------------

describe("TC-021: comparator — compare() が issueTitle / issueBody / requestMd を prompt に渡す", () => {
  it("TC-021: spy された query 関数が受け取る prompt に issueTitle / issueBody / requestMd が含まれる", async () => {
    const fakeQuery = vi.fn().mockResolvedValue({
      text: '{"undeclaredDrops":[]}',
      sessionId: null,
      stopReason: "end_turn",
    });
    const comparator = createIssueFidelityComparator(makeConfig(), fakeQuery);

    await comparator.compare({
      issueTitle: "UNIQUE_ISSUE_TITLE_SENTINEL",
      issueBody: "UNIQUE_ISSUE_BODY_SENTINEL",
      requestMd: "UNIQUE_REQUEST_MD_SENTINEL",
    });

    // fakeQuery should have been called with something that includes our sentinels
    expect(fakeQuery).toHaveBeenCalledOnce();
    const callArgs = fakeQuery.mock.calls[0];
    // The combined prompt string (system + user) must contain all three sentinels
    const allArgs = JSON.stringify(callArgs);
    expect(allArgs).toContain("UNIQUE_ISSUE_TITLE_SENTINEL");
    expect(allArgs).toContain("UNIQUE_ISSUE_BODY_SENTINEL");
    expect(allArgs).toContain("UNIQUE_REQUEST_MD_SENTINEL");
  });
});
