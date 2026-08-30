# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前提確認: 循環の実在性

`src/core/pipeline/reviewer-chain.ts`、`src/core/step/fixer-helpers.ts`、`src/core/step/regression-gate.ts`、`src/core/pipeline/findings-ledger.ts` を直接 Read し、design.md に記載された SCC エッジを確認した。

**SCC-A（2ノード）確認**:
- `reviewer-chain.ts` line 19: `import { getConformanceFixContext } from "../step/fixer-helpers.js"` ✓
- `fixer-helpers.ts` line 14: `import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js"` ✓

**SCC-B（4ノード）確認**:
- `reviewer-chain.ts` line 18: `import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js"` ✓
- `regression-gate.ts` lines 27–28: `computeRegressionLedger, computeLedgerRef` from `findings-ledger.js` AND `deriveImplReviewerChain` from `reviewer-chain.js` ✓
- `findings-ledger.ts` line 14: `import { getLatestJudgeFindings } from "../step/fixer-helpers.js"` ✓
- `fixer-helpers.ts` line 14: back-edge to `reviewer-chain.js` ✓

### アーキテクチャ

**`review-routing.ts` の配置と DSM 適合性**:

`src/core/review-routing.ts` は `core-invariants.test.ts` の `classifyLayer` 関数において `src/core/` prefix にマッチし domain layer に分類される。domain layer は ports / persistence / shared-kernel / leaf を import 可能。design.md D1 が示す value import 先（`step/step-names` → domain、`step/judge-verdict` → domain、`decision/decision-ledger` → domain）は全て同 domain layer 内（same-layer は DSM の対角で常に許容）。type-only import 先（`state/schema` → shared-kernel、`port/report-result` → ports、`kernel/report-result` → leaf）はいずれも domain layer が到達可能な層。DSM 違反なし。

**一方向依存の設計**:

提案後の依存グラフを追跡した。`review-routing.ts` は `step-names`・`judge-verdict`・`decision-ledger` のみに依存し、back-edge がない。`pipeline/reviewer-chain.ts` → `review-routing.ts`、`step/fixer-helpers.ts` → `review-routing.ts`（re-export）、`step/regression-gate.ts` → `review-routing.ts`、`pipeline/findings-ledger.ts` → `review-routing.ts` となり、`review-routing.ts` がグラフの底辺（leaf に近い）に位置するため SCC は形成されない。

`pipeline/types.ts` は T-04 後も `step/regression-gate.ts` から `REGRESSION_GATE_STEP_NAME` を import し続けるが（scope 外、design.md Open Questions 参照）、`regression-gate.ts` → `review-routing.ts` の一方向なので cycle は生じない。

**新 architecture layer の不追加**:

`review-routing.ts` は `src/core/` 直下に置かれ domain 層内であることを確認。Non-goal「新しい architecture layer の追加なし」に準拠。

### 正確性

**SCC 解消後の依存グラフ検証**:

T-01〜T-05 の変更を仮適用してグラフを手動追跡し、SCC が 0 になることを確認した。とくに `findings-ledger.ts` → `fixer-helpers.ts` の残存有無を確認: T-05 で `import { getLatestJudgeFindings }` の import 先を `fixer-helpers.js` から `review-routing.js` に切り替えるため、`findings-ledger.ts` → `fixer-helpers.ts` value edge は消える。一方 `regression-gate.ts` → `findings-ledger.ts` は残るが back-edge がないため SCC を形成しない。

**`lastFindingsOf` のセマンティクス保全**:

現行 `reviewer-chain.ts` の `lastFindingsOf` は toolResult が存在しない場合 `[]` を返す（`toolResult?.findings ?? []`）。`getLatestJudgeFindings` は同ケースで `null` を返す。T-02 で `lastFindingsOf` を `getLatestJudgeFindings(…) ?? []` 形式に更新することが明記されており（Risk-2 mitigation）、TC-022 でこの変換が unit test でカバーされる。

**`getConformanceFixContext` の recency check**:

現行 `fixer-helpers.ts` line 136: `if (latestPredecessor && latestPredecessor.endedAt >= latestConformance.endedAt) return null;` を確認。spec.md のシナリオ「conformance が predecessor より古い場合 null 返却」と一致。T-01 の移植でこのロジックがそのまま `review-routing.ts` に移されることで振る舞いが保たれる。

**`conformancePredecessorStep` の依存関係**:

同関数は `resolveActiveReviewer(state, deriveImplFixerChain(state))` を呼ぶ。T-01 後はいずれも同じ `review-routing.ts` 内で定義されるため module 間 import 不要。循環なし。

**`resolveActiveReviewer` の tie-break**:

line 80: `if (lastRun && lastRun.startedAt >= latestTime)` の `>=` を確認。spec.md の TC-012 が参照するとおり、後位のレビュアーが優先される tie-break が保持される。

**transition parity の検証可能性**:

`STANDARD_TRANSITIONS`（pipeline/types.ts line 267）と `FAST_TRANSITIONS`（line 318）が `...buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW])` の spread を使用していることを確認。T-07 の parity test はこの spread を明示的なアサーション行に分解して比較するため、将来のハードコード化や順序変更を検知できる。

**`buildParallelReviewerTransitions` の code-fixer 行数**:

実際のコードから生成される行を手動カウント: code-review 4 行 + coordinator 3 行 + regression-gate 3 行 + code-fixer 5 行（approved×4 + error×1）= 15 行。T-07 の期待値と一致。

### 完全性（タスク分解のカバレッジ）

| 要件 | 対応タスク | カバー状況 |
|------|------------|-----------|
| Req 1 (pure boundary) | T-01 | 全識別子リスト・import 制約明記 ✓ |
| Req 2 (一方向依存) | T-01〜T-05 | 5 ファイルの変更が網羅的に列挙 ✓ |
| Req 3 (振る舞い不変) | T-02〜T-05 (re-export), T-07, T-08 | 既存テスト green 確認含む ✓ |
| Req 4 (cycle 検査) | T-06 | Tarjan inline + liveness + regression guard ✓ |
| Req 5 (transition parity) | T-07 | step/on/to/hasGuard 全行比較 ✓ |

T-08 が build / typecheck / lint / test 全通過を最終確認する。全 AC に対応タスクが存在する。

### 既存テストの影響範囲確認

`src/core/pipeline/__tests__/reviewer-chain.test.ts` が `reviewer-chain.js` から `deriveImplReviewerChain`・`resolveActiveReviewer` 等を import していることを確認。T-02 で re-export barrel になっても import path は変わらず、既存テストはコンパイルエラーなく継続できる。`src/core/pipeline/__tests__/findings-ledger.test.ts` が `collectFindingsLedger`・`computeRegressionLedger` を直接 import していることを確認。T-05 で `findings-ledger.ts` の内部依存先が変わるだけでエクスポートは変わらないため影響なし。

---

## 検証できなかった項目

**実行時の動作確認**: spec-review は静的レビューのみで、`bun run test` の実行・cycle 消滅の runtime 確認は行っていない。T-08 が実装フェーズで行う。

**TC-014 の専用テスト有無**: `review-routing.ts` が全識別子を export していることを verify する専用 unit test が tasks.md に明示されていない。typecheck + downstream import 成功により間接確認される設計だが、明示的なテストは存在しない。

**DSM allowlist への影響**: `core-invariants.test.ts` の DSM closure test が `review-routing.ts` の import graph を正しく pass させるかは、実際のコード生成後に typecheck + test 実行で初めて確認できる。分析上は問題ない。

---

## Findings 詳細

### F-1: TC-001/002 の import 制約検証がサイクル検出に依存しており、非循環違反を検知できない

**概要**:

TC-001（"review-routing の value import 先は `step/step-names`・`step/judge-verdict`・`decision/decision-ledger` のみ"）と TC-002（"pipeline/types への import は type-only"）は "must" カテゴリの unit test として記載されているが、tasks.md T-06 の SCC test はこの制約を**サイクル検出を通じてのみ**検知する。

具体的には: もし実装者が `review-routing.ts` に `import { someUtil } from "../pipeline/spec-observation.js"` を value import しても、`pipeline/spec-observation.ts` が `review-routing.ts` に依存していなければ SCC は形成されず、T-06 は失敗しない。しかし TC-001 は依然として違反している。

**リスク評価**:

低い。提案後の依存グラフでは、`pipeline/` と `step/` の主要モジュール（`reviewer-chain`・`regression-gate`・`findings-ledger`・`fixer-helpers`）が全て `review-routing.ts` に依存するため、それらへの value import は必ずサイクルを形成し検知される。非サイクル path は `pipeline/spec-observation.ts`・`pipeline/reverification.ts` 等の周辺モジュールにのみ存在するが、`review-routing.ts` がこれらを必要とする設計上の理由はない。コードレビュー step が意図しない import を検出する機会もある。

**推奨**:

`tests/unit/architecture/value-import-scc.test.ts` に、`review-routing.ts` の value import 先が許可リスト（`step-names`・`judge-verdict`・`decision-ledger`）のみであることを正規表現で直接検査するアサーションを追加することで TC-001/002 を完全にカバーできる。既存の B-* grep テストと同様のパターンで実装可能。

ただし SCC test の主目的（サイクル 0 件）は完全に達成されており、本 finding は実装上の防護深度の問題であり設計の正確性には影響しない。
