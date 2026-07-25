# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Diff scope
`git diff main...HEAD --stat` で 20 ファイル (+2038 行) を確認。コア実装は以下 2 ファイル:
- `src/core/verification/test-coverage.ts` (+16 行)
- `src/prompts/test-materialize-system.ts` (+6 行)

### TC Coverage (test-cases.md 照合)

| TC | Priority | カバーファイル |
|---|---|---|
| TC-001: manual かつ must の TC は missing にならない | must | `test-coverage-manual-exclusion.test.ts` — 5 assertions |
| TC-002: unit / integration の判定は従来と同一 | must | `test-coverage-manual-exclusion.test.ts` — 6 assertions |
| TC-003: prompt が manual TC 対象外の記述を含む | must | `test-materialize-manual-scope-contract.test.ts` — 6 assertions |
| TC-004: docs が manual 除外規約を含む | must | `test-coverage-manual-contract.test.ts` — 5 assertions |
| TC-005: bullet/plain 両形式が除外される | should | `test-coverage-manual-exclusion.test.ts` — 4 assertions |
| TC-006: manual TC が foundTcIds / assertionlessTcIds にも現れない | should | `test-coverage-manual-exclusion.test.ts` — 3 assertions |
| TC-007: テンプレート enum 行での誤除外が起きない | could | `test-coverage-manual-exclusion.test.ts` — 3 assertions |
| TC-008: docs/README.md の説明文に manual 除外が反映される | should | `test-coverage-manual-contract.test.ts` — 2 assertions |

全 4 must TC カバー済み。

### 受け入れ基準の確認

- [x] traceability comment 手順が prompt に含まれる — 先行変更で確立済み。`test-materialize-prompt-contract.test.ts` が diff なしで green
- [x] コメント形式 TC-ID fixture で test-coverage passed — 先行変更で確立済み。`test-coverage-comment-form.test.ts` が diff なしで green
- [x] `**Category**: manual` かつ must の TC が missingTcIds に入らない — TC-001 で固定
- [x] unit / integration の must TC 判定が従来と同一 — TC-002 で固定
- [x] manual TC 対象外の記述が prompt に含まれる — TC-003 で固定
- [x] docs に manual 除外規約が明文化される — TC-004 / TC-008 で固定
- [x] `typecheck && test` green — verification-result.md 確認: build/typecheck/test/lint/changed-line-coverage 全 passed。実測でも `bun run typecheck` / `bun run test` (9653 passed, 1 skip) を確認

### 実装の正確性確認

**D1 (extractMustTcIds)**: `categoryManualRe = /\*\*Category\*\*:\s*manual/` を追加し、`currentIsManual` フラグで TC section 単位に管理。`flushCurrent` は `currentTcId && currentIsMust && !currentIsManual` のときのみ push — 設計 D1 に一致。

**D2 (prompt)**: Step 3 の近傍に `**Category**: manual` の must TC は自動テスト化・トレーサビリティコメントのいずれも対象外であることを追記。新規 h2 見出しなし、リポジトリ固有パス参照なし — 設計 D2 に一致。

**D3 (docs)**: `docs/test-coverage.md` に `## Category: manual の must TC は集計から除外` 節を追加し、除外ルール・totalMustTcs 非算入・コメント追記不要・conformance / レビュー gate の管轄を明文化。`docs/README.md` の説明行に `manual TC の coverage 集計除外` を反映 — 設計 D3 に一致。

**D4 (既存テスト無改変)**: `test-coverage.test.ts` / `test-coverage-comment-form.test.ts` / `test-materialize-prompt-contract.test.ts` / `test-coverage-docs-contract.test.ts` の diff が空であることを確認 — 設計 D4 に一致。

### 境界・エッジケースの確認

- TC section 外の `**Category**: manual` 行（HTMLコメントブロック等）は `currentTcId == null` のため無視される ✓
- `**Category**: unit | integration | manual` という enum 行はコロン直後が `unit` のため categoryManualRe にマッチしない ✓（TC-007 でテスト固定）
- bullet 形式 (`- **Category**: manual`) と plain 形式 (`**Category**: manual`) の両方が除外される ✓（TC-005 でテスト固定）
- manual TC の ID がテストファイルに偶然出現しても foundTcIds / assertionlessTcIds に含まれない（extractMustTcIds が返さないため evaluateTestCoverage のループ対象に入らない）✓（TC-006 でテスト固定）

## 検証できなかった項目

None

## Findings 詳細

### INFO-001: `categoryManualRe` は word-boundary で終端されていない

`/\*\*Category\*\*:\s*manual/` は `**Category**: manually` のような値でも理論上マッチする。ただし:
- Category は固定 enum（unit | integration | manual）であり `manual-testing` 等の亜種は実運用で出現しない
- 既存の `priorityMustRe = /\*\*Priority\*\*:\s*must/` と同型であり、コードベース全体で一貫したパターン

アクション不要。参考情報として記録する。
