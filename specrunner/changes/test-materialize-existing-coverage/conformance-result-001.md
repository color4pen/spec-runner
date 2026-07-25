# Conformance Result — test-materialize-existing-coverage — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### tasks.md — 全チェックボックス確認

T-01, T-02, T-03, T-04 すべて [x] 完了。

### D1: extractMustTcIds — Category: manual 除外 (src/core/verification/test-coverage.ts)

- `categoryManualRe = /\*\*Category\*\*:\s*manual/` — D1 spec と一致。enum 行 `unit | integration | manual` への誤マッチなし（コロン直後が `unit`）。✓
- `currentIsManual` フラグが `flushCurrent` でリセットされる。✓
- `flushCurrent`: `currentTcId && currentIsMust && !currentIsManual` のときのみ push。✓
- JSDoc に algorithm step 4（Category: manual 検出）と step 5（must かつ非 manual を返す）が追記。✓
- 走査方式・assertionless 判定（Step 4b）・`tcIdBoundaryRe` は無変更。✓

テスト固定（新規 `tests/unit/core/verification/test-coverage-manual-exclusion.test.ts`）:
- TC-001: manual+must TC が missingTcIds に含まれない、totalMustTcs=0、status passed ✓
- TC-002: unit/integration/Category欄なしの must TC が従来どおり missing 判定（回帰）✓
- TC-005: bullet 形式・plain 形式の両 `**Category**: manual` が除外される ✓
- TC-006: manual TC の ID がテストファイルに出現しても foundTcIds/assertionlessTcIds に含まれない ✓
- TC-007: テンプレート enum 行での誤除外が起きない（回帰）✓

### D2: test-materialize prompt — manual TC 対象外記述 (src/prompts/test-materialize-system.ts)

- 追記場所: Step 3 の `**既存テストがない場合**:` ブロック直後、`## Method` 節内部。新規 h2 見出しなし。✓
- 内容: `**Category**: manual の must TC は自動テスト化の対象外`、`トレーサビリティコメントも追記しない`（偽装 pass になるため）、`conformance / レビュー gate の管轄` の 3 点を明示。✓
- リポジトリ固有パスへの参照なし。✓
- 5 節骨格（Question / Contract / Method / Evidence / Completion）維持。✓

テスト固定（新規 `tests/unit/prompts/test-materialize-manual-scope-contract.test.ts`）:
- TC-003: ## Method 節に manual 対象外記述・コメント作成禁止・conformance gate 管轄が含まれることを固定 ✓
- 5 節骨格と順序が維持されることを固定 ✓

### D3: docs/test-coverage.md および docs/README.md — manual 除外明文化

docs/test-coverage.md:
- 新節「## Category: manual の must TC は集計から除外」追加 ✓
- missingTcIds に入らない、totalMustTcs に数えられない、コメント追記不要（偽装 pass 防止）、conformance / レビュー gate 管轄を記述 ✓
- 例外なし注記: unit/integration/Category欄なしは従来どおり集計対象 ✓
- まとめ表に `**Category**: manual の must TC → 集計から除外` 行を追加 ✓
- 既存の TC-ID リテラル走査・トレーサビリティコメント規約の記述は維持 ✓

docs/README.md:
- test-coverage.md 行の説明に `manual TC の coverage 集計除外` を追加 ✓

テスト固定（新規 `tests/unit/docs/test-coverage-manual-contract.test.ts`）:
- TC-004: manual 除外の記述・conformance gate 管轄・既存走査規約・既存トレーサビリティ規約が残っていることを固定 ✓
- TC-008: docs/README.md の test-coverage.md エントリに manual 除外への言及が含まれることを固定 ✓

### D4: 新規テストは別ファイル、既存テストは無改変

`git diff main...HEAD` で既存テストファイル 4 件への変更ゼロを確認:
- `tests/unit/core/verification/test-coverage.test.ts` — 無改変 ✓
- `tests/unit/core/verification/test-coverage-comment-form.test.ts` — 無改変 ✓
- `tests/unit/prompts/test-materialize-prompt-contract.test.ts` — 無改変 ✓
- `tests/unit/docs/test-coverage-docs-contract.test.ts` — 無改変 ✓

### T-04: typecheck && test

- `bun run typecheck`: clean（エラーなし）✓
- `bun run test`: 9653 passed, 1 skipped, 0 failed ✓

### Acceptance Criteria

| 受け入れ基準 | 対応箇所 | 結果 |
|---|---|---|
| prompt に既存テスト充足時のトレーサビリティコメント手順（prompt contract テスト） | 先行変更実装済み、既存テストが green 維持 | ✓ |
| TC-ID コメント形式のみ出現 fixture で test-coverage が passed | 先行変更実装済み、既存テストが green 維持 | ✓ |
| manual+must TC が missingTcIds に入らないことを fixture テストで固定 | TC-001 in test-coverage-manual-exclusion.test.ts | ✓ |
| manual 以外の must TC の判定が従来と同一（テスト固定） | TC-002 in test-coverage-manual-exclusion.test.ts | ✓ |
| prompt に manual TC 対象外の記述（prompt contract テスト） | TC-003 in test-materialize-manual-scope-contract.test.ts | ✓ |
| docs に規約（リテラル走査+トレーサビリティコメント+manual 除外）が明文化 | TC-004/TC-008 in test-coverage-manual-contract.test.ts | ✓ |
| `typecheck && test` が green | typecheck clean、test 9653 passed | ✓ |

## 検証できなかった項目

None。

## Findings 詳細

None。
