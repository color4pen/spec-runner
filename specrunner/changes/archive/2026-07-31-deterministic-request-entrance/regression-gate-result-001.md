# Regression Gate — deterministic-request-entrance — iter 1

## 検証対象

台帳に記載された 5 件の findings を個別に検証した。

---

## Finding 1: T-07 count assertion (LOW)

**台帳の主張**: `tests/unit/prompts/common-context-catch.test.ts:42` の `toBe(11)` が `toBe(10)` に更新されている。

**検証結果**: ✅ FIXED（維持）

`tests/unit/prompts/common-context-catch.test.ts:43` を読み取り確認:
```ts
expect(ALL_AGENT_PROMPTS.length).toBe(10);
```
`REQUEST_GENERATE_SYSTEM_PROMPT` の import は行 23 コメントで除去済み、配列エントリも行 36 でコメントアウト済み。count は 10 で正しい。

---

## Finding 2 & 4: B-18 regression guard が grepE を呼ばず vacuously true (LOW, 2件)

**台帳の主張**: "B-18 regression guard" ブロックの trivially true テストが修正されている。

**検証結果**: ❌ NOT FIXED（未修正のまま）

`tests/unit/architecture/request-entrance-llm-boundary.test.ts:107–135` を読み取り確認。該当ブロックは以下の構造のまま変更なし:

```ts
describe("B-18 regression guard: sabotage（入口への LLM 系 import 追加）で検知される", () => {
  it("...", () => {
    const syntheticMatch = 'src/core/request/manager.ts:3:import type { AgentRunner }...';
    expect(syntheticMatch).not.toBe("");  // 常に green
  });
  it("...", () => {
    const syntheticMatch = 'src/core/command/request-prompt.ts:5:import { ClaudeCodeOneShotQueryClient }...';
    expect(syntheticMatch).not.toBe("");  // 常に green
  });
});
```

`grepE` は一切呼ばれていない。events.jsonl によると code-fixer は "Both review findings are LOW severity. Per instructions, LOW severity findings are ignored. No code changes required." と判断し、この finding を意図的にスキップした。

---

## Finding 3 & 5: 削除検証テストが 2 ファイルに重複 (LOW, 2件)

**台帳の主張**: `generate-chain-removed.test.ts` または `deprecated-generate-removal.test.ts` の一方が削除されている。

**検証結果**: ❌ NOT FIXED（未修正のまま）

両ファイルが現在も存在:
- `tests/unit/generate-chain-removed.test.ts` — 12748 bytes, 291 行
- `tests/unit/cli/deprecated-generate-removal.test.ts` — 12497 bytes, 291 行

TC-005 / TC-007 / TC-008 / TC-009 / TC-010 / TC-011 / TC-012 / TC-014 / TC-016 が両ファイルでほぼ同一の assertion で二重カバーされている状態に変化なし。

events.jsonl で確認: code-fixer が LOW severity を理由にスキップ。custom-reviewers (cross-boundary-invariants) が同じ所見を再報告している。

---

## 証拠サマリ

| Finding | 期待状態 | 実際の状態 | 判定 |
|---------|----------|------------|------|
| T-07 count assertion | `toBe(10)` | `toBe(10)` ✓ | FIXED |
| B-18 guard (code-review) | grepE 呼び出し | hardcoded syntheticMatch | NOT FIXED |
| Duplicate files (code-review) | 1 ファイルに統合 | 両ファイル存在 | NOT FIXED |
| B-18 guard (custom-reviewer) | grepE 呼び出し | hardcoded syntheticMatch | NOT FIXED |
| Duplicate files (custom-reviewer) | 1 ファイルに統合 | 両ファイル存在 | NOT FIXED |

checked: 5 / skipped: 0 / unverified: 0

> Note: code-fixer が LOW severity を理由に 4 件をスキップしたのは記録上明確。regression gate はスキップされた未修正 finding を再報告する。
