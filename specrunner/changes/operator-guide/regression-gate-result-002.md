# Regression Gate Result — Iteration 2

## Evidence

Checked 6 findings from the ledger. All 6 verified against current HEAD.

---

## Finding 1: [MEDIUM] spec.md の「コマンド実在」Scenario がコマンド抽出の制限範囲を明記していない

**Status: FIXED**

`spec.md` の「本文コマンドが registry で解決される」Scenario の `Given` 節に抽出制限が追加済み:

> 抽出対象は backtick 内の完全形 `specrunner <tokens>` のみ。shorthand 表記や backtick 外の言及は検証対象外

`spec.md` line 133 で確認。

---

## Finding 2: [MEDIUM] TC-013: merge/audit/setup/request/inject の 5 topic でコマンド実在検証がゼロ

**Status: FIXED**

`guide.test.ts` に `TC-013 direct` セクション(line 608–669)が追加されており、
merge / audit / setup / request / inject の各 topic の主要コマンドを `resolveCommand` で直接 assert している。

```
describe("TC-013 direct: merge/audit/setup/request/inject topic コマンドが registry で解決される", () => {
  it("specrunner job ls resolves (merge topic)", ...)
  it("specrunner init resolves (setup topic)", ...)
  it("specrunner rules new resolves (inject topic)", ...)
  ...
})
```

---

## Finding 3: [LOW] guide --help summary 行の topic 一覧が GUIDE_TOPICS 非依存の手書き

**Status: FIXED**

`command-registry.ts` line 1493 が以下に変更済み:

```ts
summary: `  guide [topic]                   運用ガイドを表示 (topics: ${GUIDE_TOPICS.map((t) => t.name).join(" ")})`,
```

手書き列挙は排除され、`GUIDE_TOPICS` から動的に導出。drift-guard テスト (TC-008) も追加済み。

---

## Finding 4: [LOW] TC-009: runInit 統合ではなく buildClaudeMdSnippet() builder 単体のみ検証

**Status: FIXED**

`src/cli/__tests__/init-snippet.test.ts` が新規追加されており、`runInit({ repoRoot })` を呼び出して
`stdoutWrite` への呼び出しを mock でキャプチャし、`buildClaudeMdSnippet()` の内容が含まれることを assert している。

```ts
it("runInit writes buildClaudeMdSnippet() content to stdout", async () => {
  await runInit({ repoRoot: "/mock/repo" });
  const snippet = buildClaudeMdSnippet();
  const allWritten = vi.mocked(stdoutWrite).mock.calls.map((c) => c[0]).join("");
  expect(allWritten).toContain(snippet);
});
```

---

## Finding 5: [LOW] コメント「4 required fields」が実装と乖離 — 実際は 5 要素を出力

**Status: FIXED**

`escalation.ts` ファイル先頭コメント(line 3):

> TC-023: formatEscalation must include 5 required fields:

「4」→「5」に修正済み。

---

## Finding 6: [LOW] function JSDoc says 'All 4 fields'

**Status: FIXED**

`escalation.ts` の関数 JSDoc (line 16):

> All 5 elements are required and will always appear in the output.

「4 fields」→「5 elements」に修正済み。ファイル先頭コメントと整合。

---

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | MEDIUM | spec.md 抽出制限の明記なし | FIXED |
| 2 | MEDIUM | TC-013: 5 topic の検証ゼロ | FIXED |
| 3 | LOW | --help summary 手書き | FIXED |
| 4 | LOW | TC-009: 統合テスト欠如 | FIXED |
| 5 | LOW | コメント「4 required fields」乖離 | FIXED |
| 6 | LOW | JSDoc「All 4 fields」乖離 | FIXED |

回帰なし。全 6 件が修正済みであることを確認。
