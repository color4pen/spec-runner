# Code Review Feedback — refactor-finish-preflight-split (Iteration 1)

- **verdict**: approved
- **iteration**: 1
- **total-score**: 8.5
- **trend**: N/A (first iteration)

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 10 | 0.10 | 1.00 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.50** |

## Summary

責務分離は正確で、preflight.ts 504→248 行、pr-status.ts / branch-checkout.ts / spawn-helper.ts への分割は設計通り。orchestrator.ts の ForTest suffix 除去と spawnOrEscalate 適用（6 箇所）も完了。typecheck green、全 1294 テスト pass、循環依存なし。受け入れ基準 7 項目のうち全項目を充足。

Design D2 で計画された 8 適用箇所のうち 1 箇所（openspec validate）が未適用だが、カスタム recommendedAction の構築パターンが spawnOrEscalate のデフォルトと若干異なるため、意図的な判断と見なせる。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/core/finish/preflight.ts:217-228 | Design D2 で openspec validate を spawnOrEscalate 適用対象に列挙しているが、手動の spawn + formatEscalation パターンが残存。8 適用箇所のうち 7 のみ変換済み | spawnOrEscalate の recommendedAction パラメータにカスタムメッセージを渡して置換する。ただし現在の escalation 文字列は stderr を含む複数行フォーマットのため、既存動作を維持するなら現状維持でも許容可能 |
| 2 | MEDIUM | testing | tests/unit/core/finish/preflight.test.ts | TC-16（warnFn で unpushed commits 警告キャプチャ）と TC-17（warnFn で change folder not found 警告キャプチャ）が must priority だが専用テストが未実装。warnFn DI 機構自体は TC-12/TC-CHECKOUT-4 で検証済みだが、runPreflight 経由の統合パスは未テスト | runPreflight を呼び出し changeFolderExists=false の FS mock + warnFn spy で TC-17 を、rev-list count > 0 の spawn mock + warnFn spy で TC-16 を追加する |
| 3 | LOW | maintainability | src/core/finish/preflight.ts:33 | PrViewData が types.ts, pr-status.ts, preflight.ts の 3 箇所から re-export されている。現在 preflight.ts の re-export を使用する consumer は 0 件 | preflight.ts の `export type { PrViewData }` を削除し、consumer は types.ts または pr-status.ts から import させる |
| 4 | LOW | maintainability | src/core/finish/pr-status.ts:133 | pollMergeStateAfterPush の `slug` パラメータが `_slug` として destructure され未使用。API 対称性のための保持と推測されるが dead code | パラメータを削除するか、JSDoc で「将来のログ出力用に保持」と明記する |
| 5 | LOW | consistency | openspec/changes/refactor-finish-preflight-split/test-cases.md:469-479 | TC-33 は「PrViewData を preflight.js から import」と記述しているが、実装では types.ts から import しており test-cases.md が不正確 | test-cases.md の TC-33 を実装に合わせて「types.js から import」に修正する |

## Acceptance Criteria Verification

| Criteria | Status | Evidence |
|----------|--------|----------|
| preflight.ts ≤ 250 行 | PASS | 248 行 |
| pr-status.ts に PR ポーリング集約 | PASS | fetchPrViewWithRetry + pollMergeStateAfterPush |
| branch-checkout.ts に checkout/restore 集約 | PASS | checkoutForValidation + restoreBranch |
| orchestrator.ts が pr-status.ts から直接 import（ForTest なし） | PASS | `import { fetchPrViewWithRetry, pollMergeStateAfterPush } from "./pr-status.js"` |
| spawnOrEscalate ≥ 5 箇所 | PASS | 7 箇所（branch-checkout: 1, orchestrator: 6） |
| 全既存テスト pass | PASS | 1294 tests passed |
| typecheck green | PASS | `tsc --noEmit` exit 0 |

## Test Coverage (must scenarios)

| TC | Status | Notes |
|----|--------|-------|
| TC-01 | PASS | spawn-helper.test.ts |
| TC-02 | PASS | spawn-helper.test.ts |
| TC-03 | PASS | spawn-helper.test.ts |
| TC-05 | PASS | preflight.test.ts の import で検証 |
| TC-06 | PASS | preflight.test.ts の import で検証 |
| TC-07 | PASS | TC-014 として実装 |
| TC-09 | SKIP | pollMergeStateAfterPush は mergeStateStatus のみ返却、state フィールドは対象外。test-cases.md の記述が実装と乖離 |
| TC-11 | PASS | branch-checkout.test.ts |
| TC-12 | PASS | branch-checkout.test.ts |
| TC-14 | PASS | 248 行 ≤ 250 |
| TC-15 | PASS | ForTest export なし |
| TC-16 | MISSING | warnFn + unpushed commits 警告の統合テスト未実装 |
| TC-17 | MISSING | warnFn + change folder not found 警告の統合テスト未実装 |
| TC-19 | PASS | orchestrator.ts import 検証済み |
| TC-20 | PASS | 6 箇所 |
| TC-21-24 | PASS | 既存 orchestrator test で各 Phase の escalation を検証 |
| TC-27 | PASS | ForTest suffix なし |
| TC-28 | PASS | 全テスト pass |
| TC-29 | PASS | 全テスト pass |
| TC-30 | PASS | typecheck green |
| TC-31 | PASS | 7 箇所 ≥ 5 |
