# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### tasks.md チェックボックス
全タスク T-01〜T-07 のチェックボックスが `[x]` で完了済み。T-07 で注記された TC-001 / TC-008 の fixture 問題は、
実装者が選択肢 1（fixture 文字列から `expect(` を除去）を適用して解消済み。
実測: 9637 passed | 1 skipped | 0 failed。

### D1 — OutputViolation.coverage 構造化フィールド
`src/core/port/output-contract.ts` に `coverage?: { missingTcIds: string[]; assertionlessTcIds: string[] }` が追加済み。
doc コメントで `test-coverage` kind 専用・他 kind では undefined を明示。`detail` の既存意味（union）は維持。
既存フィールド・他 kind の型は無変更。

### D2 — halt メッセージへの TC-ID 描画
`src/core/step/step-halt.ts` に `formatTestCoverageViolationPath` ヘルパを追加。
`makeOutputGateHalt` の `violationPaths` map に `v.kind === "test-coverage"` 分岐を挿入済み。
`error.message` と `error.hint` の両方に TC-ID が載ることを TC-002 / TC-005 で確認。
`coverage` undefined または両カテゴリ空の場合に `see file` fall back（TC-009 で確認）。
既存の `tasks-complete` / `content-format` / `produced` 分岐は無変更。

### D3 — follow-up prompt の test-coverage 節
`src/core/step/output-verify.ts` の `buildOutputFollowUpPrompt` に test-coverage 節追加済み。
`### Missing TC-IDs — write tests` と `### Assertionless TC-IDs — add assertions` の 2 サブ節で区別。
両カテゴリ空の場合は `(see <path> for uncovered must TCs)` fallback（TC-014 で確認）。
既存 tasks-complete / produced / content-format 節は無変更。

### D4 — test-materialize の follow-up policy 化
`src/core/step/test-materialize.ts` の `outputContracts` で `policy: "follow-up"` に変更済み。
コメントで T-05 の意図（in-session repair before halt）を説明。
TC-TMB-04 が `"follow-up"` を期待するよう更新済み（唯一の既存テスト期待値変更）。

### Spec 要件の充足
- R1（violation の missing/assertionless 区別保持）: `src/core/runtime/local.ts` が `coverage` を格納。TC-001 / TC-006 / TC-007 / TC-008 で確認。
- R2（halt メッセージへの TC-ID 列挙）: `makeOutputGateHalt` + helper。TC-002 / TC-005 / TC-015 で確認。
- R3（follow-up prompt の ID 明示修復指示）: `buildOutputFollowUpPrompt`。TC-003 / TC-014 / TC-016 で確認。
- R4（follow-up policy + 修復→再検証 pass + 上限枯渇→halt）: TC-004 / TC-005 / TC-010 / TC-011 で確認。

### Request 受け入れ基準
| 基準 | テスト | 結果 |
|------|--------|------|
| halt メッセージに欠落 TC-ID | TC-002, TC-005, TC-015 | ✅ |
| buildOutputFollowUpPrompt が TC-ID 明示修復指示 | TC-003, TC-014, TC-016 | ✅ |
| test-coverage が follow-up policy + 修復→再検証 pass | TC-004, TC-010, TC-011 | ✅ |
| 上限枯渇→halt+TC-ID | TC-005 | ✅ |
| missing/assertionless が halt/follow-up 上で区別 | TC-002, TC-003, TC-015, TC-016 | ✅ |
| typecheck && test が green | 実測 | ✅ |

### スコープ境界
- coverage 判定ロジック（evaluateTestCoverage / extractMustTcIds / ASSERTION_RE）: 無変更。
- OUTPUT_FOLLOWUP_MAX_ATTEMPTS: 参照のみ、値変更なし。
- 他 step の契約 policy: 無変更。
- managed runtime の test-coverage 分岐: best-effort skip のまま（TC-012 で確認）。

### リグレッション
TC-TMB-13 / 14 / 15 / 16 は入力契約を `policy: "halt"` で明示構築する汎用検出テストであり無変更で green。
既存 9618 件（TC-TMB-04 期待値更新を除く）が無改変で green。

## 検証できなかった項目

None。全受け入れ基準を実装コードとテスト結果で確認した。

## Findings 詳細

None。指摘事項なし。
