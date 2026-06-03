/**
 * Unit tests for buildInitialMessage (design step)
 *
 * TC-14: 補助 section を含む request.md → initial message に Request Constraints (CLI-injected) が含まれる
 * TC-15: Request Constraints は </user-request> タグ外に存在する
 * TC-16: 配置順が <user-request> → Request Constraints → Repository Context
 * TC-17: 補助 section が存在しない request.md → Request Constraints が含まれない
 * TC-18: Request Constraints 内にスコープ外の本文が含まれる
 */
import { describe, it, expect } from "vitest";
import { buildInitialMessage } from "../../../src/prompts/design-system.js";
import type { DynamicContext } from "../../../src/git/dynamic-context.js";

/** request.md content with all three constraint sections */
const REQUEST_WITH_CONSTRAINTS = [
  "# design step に補助 section を注入する",
  "",
  "## Meta",
  "",
  "- **type**: spec-change",
  "- **slug**: design-request-followup",
  "- **base-branch**: main",
  "- **adr**: true",
  "",
  "## 背景",
  "",
  "PR #407 で design step が読み飛ばした。",
  "",
  "## スコープ外",
  "",
  "- rules ファイルでの対応",
  "- spec-review step への適用",
  "",
  "## 受け入れ基準",
  "",
  "- [ ] design step の agent context にスコープ外 section が含まれる",
  "- [ ] code-review step にも同様に注入される",
  "",
  "## architect 評価済みの設計判断",
  "",
  "- CLI 内フォローアップを採用（LLM uncertainty 回避）",
  "",
].join("\n");

/** request.md content without constraint sections */
const REQUEST_WITHOUT_CONSTRAINTS = [
  "# シンプルなバグ修正",
  "",
  "## Meta",
  "",
  "- **type**: bug-fix",
  "- **slug**: simple-fix",
  "- **base-branch**: main",
  "- **adr**: false",
  "",
  "## 背景",
  "",
  "クラッシュする。",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// TC-14: 補助 section あり → Request Constraints が含まれる
// ---------------------------------------------------------------------------

describe("TC-14: 補助 section を含む request.md → Request Constraints が initial message に注入される", () => {
  it("includes ## Request Constraints (CLI-injected) in the message", () => {
    const message = buildInitialMessage(
      REQUEST_WITH_CONSTRAINTS,
      "design-request-followup",
    );
    expect(message).toContain("## Request Constraints (CLI-injected)");
  });

  it("includes the three ### constraint headings", () => {
    const message = buildInitialMessage(
      REQUEST_WITH_CONSTRAINTS,
      "design-request-followup",
    );
    expect(message).toContain("### スコープ外");
    expect(message).toContain("### 受け入れ基準");
    expect(message).toContain("### architect 評価済みの設計判断");
  });
});

// ---------------------------------------------------------------------------
// TC-15: Request Constraints は </user-request> タグ外に存在する
// ---------------------------------------------------------------------------

describe("TC-15: Request Constraints は </user-request> タグ外に存在する", () => {
  it("Request Constraints block appears after </user-request>", () => {
    const message = buildInitialMessage(
      REQUEST_WITH_CONSTRAINTS,
      "design-request-followup",
    );
    const closeTagIdx = message.indexOf("</user-request>");
    const constraintsIdx = message.indexOf("## Request Constraints (CLI-injected)");
    expect(closeTagIdx).toBeGreaterThan(-1);
    expect(constraintsIdx).toBeGreaterThan(-1);
    expect(constraintsIdx).toBeGreaterThan(closeTagIdx);
  });

  it("Request Constraints block does not appear inside <user-request> tag", () => {
    const message = buildInitialMessage(
      REQUEST_WITH_CONSTRAINTS,
      "design-request-followup",
    );
    const openTagIdx = message.indexOf("<user-request>");
    const closeTagIdx = message.indexOf("</user-request>");
    const constraintsIdx = message.indexOf("## Request Constraints (CLI-injected)");
    // constraintsIdx must be outside [openTagIdx, closeTagIdx] range
    const isInsideTag =
      constraintsIdx > openTagIdx && constraintsIdx < closeTagIdx;
    expect(isInsideTag).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-16: 配置順 </user-request> → Request Constraints → Repository Context
// ---------------------------------------------------------------------------

describe("TC-16: 配置順が <user-request> → Request Constraints → Repository Context", () => {
  it("Request Constraints appears before Repository Context", () => {
    const dynamicContext: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: ["design-request-followup"],
    };
    const message = buildInitialMessage(
      REQUEST_WITH_CONSTRAINTS,
      "design-request-followup",
      "feat/design-request-followup",
      dynamicContext,
    );
    const constraintsIdx = message.indexOf("## Request Constraints (CLI-injected)");
    const repoContextIdx = message.indexOf("## Repository Context");
    expect(constraintsIdx).toBeGreaterThan(-1);
    expect(repoContextIdx).toBeGreaterThan(-1);
    expect(constraintsIdx).toBeLessThan(repoContextIdx);
  });

  it("</user-request> appears before Request Constraints", () => {
    const dynamicContext: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: ["design-request-followup"],
    };
    const message = buildInitialMessage(
      REQUEST_WITH_CONSTRAINTS,
      "design-request-followup",
      "feat/design-request-followup",
      dynamicContext,
    );
    const closeTagIdx = message.indexOf("</user-request>");
    const constraintsIdx = message.indexOf("## Request Constraints (CLI-injected)");
    expect(closeTagIdx).toBeLessThan(constraintsIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-17: 補助 section なし → Request Constraints が含まれない
// ---------------------------------------------------------------------------

describe("TC-17: 補助 section が存在しない request.md → Request Constraints が含まれない", () => {
  it("does not include Request Constraints when no constraint sections exist", () => {
    const message = buildInitialMessage(
      REQUEST_WITHOUT_CONSTRAINTS,
      "simple-fix",
    );
    expect(message).not.toContain("Request Constraints");
  });
});

// ---------------------------------------------------------------------------
// TC-18: Request Constraints 内にスコープ外の本文が含まれる
// ---------------------------------------------------------------------------

describe("TC-18: Request Constraints 内にスコープ外の本文が含まれる", () => {
  it("includes the scope-out content text in the ### スコープ外 section", () => {
    const message = buildInitialMessage(
      REQUEST_WITH_CONSTRAINTS,
      "design-request-followup",
    );
    expect(message).toContain("rules ファイルでの対応");
    expect(message).toContain("spec-review step への適用");
  });
});
