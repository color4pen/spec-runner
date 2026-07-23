# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. `src/core/verification/test-coverage.ts:1-11` — リテラル走査の確認

ファイルを全行 Read し確認。`evaluateTestCoverage`（lines 167–255）の Step 4（lines 207–215）で各 must TC ID に対して `tcIdBoundaryRe(tcId).test(text)` を実行。`text` はテストファイルの全文字列であり、コメント行（`// TC-001: 説明`）も含まれる。このため、コメント形式のトレーサビリティコメントはリテラル走査を通過する。

`assertionlessTcIds` チェック（lines 222–229）は TC ID が含まれるファイルに `expect(|assert(|assert\.` が存在するか確認するが、既存テストであれば assertion は既にある。

要求の前提「出現形式（コメント / 文字列 / identifier）は区別しない」は実装と一致する。

### 2. `src/core/step/test-materialize.ts:47-50` — outputContracts() の確認

lines 47–50 は `TestMaterializeStep` の JSDoc コメントであり、`outputContracts()` が `test-coverage` 契約を宣言することを記述している。lines 87–96 の実装で確認:

```ts
outputContracts(_state, deps) {
  return [{
    kind: "test-coverage",
    path: `${changeFolderPath(deps.slug)}/test-cases.md`,
    policy: "halt",
  }];
}
```

policy `"halt"` のため TC ID が test file に存在しなければ pipeline が停止する。要求の前提と一致。

### 3. `src/prompts/test-materialize-system.ts` — 既存テスト充足指示の不在確認

`TEST_MATERIALIZE_BASE`（lines 25–76）の Method 節を確認。line 61 は「テストフレームワーク・配置パターンを既存テスト数件から確認する」であり、配置パターン把握のみを目的とする。`buildTestMaterializeInitialMessage`（lines 99–128）の line 117 は「Read a few existing test files to understand the project's test framework and placement pattern」—— 同様に配置パターンのみ。

既存テストが must TC を充足している場合に「トレーサビリティコメントを追記する」という指示は存在しないことを確認。

### 4. `src/core/step/write-scope.ts:33` — GUARDED_WRITE_STEPS の確認

`GUARDED_WRITE_STEPS`（lines 33–39）の内容:

```ts
export const GUARDED_WRITE_STEPS: ReadonlySet<string> = new Set([
  "implementer",
  "build-fixer",
  "code-fixer",
  "test-materialize",
  "adr-gen",
]);
```

`"test-materialize"` が含まれており、guarded モードで実行されることを確認。write-scope 上、既存テストファイルへの編集は可能（protected paths 外）。

### 5. 受け入れ基準の実装可能性確認

- **prompt contract テスト**: `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` に `TEST_MATERIALIZE_SYSTEM_PROMPT` を検証するテスト群が既にある。同テストの構造で新規 TC を追加可能。
- **test-coverage fixture テスト**: `src/core/verification/test-coverage.ts` の `evaluateTestCoverage` / `extractMustTcIds` / `tcIdBoundaryRe` はすべて export されており、既存テストは存在しない（要新規作成）。コメント形式のみの fixture テストは実装可能。
- **docs 追記**: `docs/` 配下に適切なファイルがあり（`docs/README.md` で docs の配置方針を確認）、追記先として適切な場所を design step が判断できる。

### 6. スコープ外の確認

- `covered-by` フィールド: test-cases.md への新フィールド追加は不要と明記され、却下理由も妥当（第二の正本化・drift リスク）。
- coverage 検査方式の変更なし: 要件 4 で test-coverage.ts のロジック変更は禁止と明記。
- 意味的検証なし: operator がコメントの妥当性を判断する責任を agent に負わせない設計が明示。

## 検証できなかった項目

- **issue #921 の実測確認**: 「既存 architecture test が must TC を満たすケースで test-materialize が output contract 不満足で停止し、operator のコメント追記で回避した」という事実は GitHub issue の内容を直接確認できないため未検証。ただし、コードの実装から導かれる挙動と一致しており、記述の蓋然性は高い。

## Findings 詳細

None（指摘なし）。

request の前提コード主張はすべて実装と一致し、要件は明確かつ実装可能。受け入れ基準は機械検証可能な形で記述されている。
