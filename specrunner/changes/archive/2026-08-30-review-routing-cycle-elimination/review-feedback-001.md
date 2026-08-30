# Code Review Feedback — review-routing-cycle-elimination iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更ファイルの確認

`git diff main...HEAD --stat` で以下の production file 変更を確認した（change folder artifacts を除く）:
- `src/core/review-routing.ts` — 新規作成（259行）
- `src/core/pipeline/reviewer-chain.ts` — 変更（175行の変更、re-export barrel化）
- `src/core/step/fixer-helpers.ts` — 変更（113行の変更、re-export追加）
- `src/core/step/regression-gate.ts` — 変更（9行、import先切り替え）
- `src/core/pipeline/findings-ledger.ts` — 変更（2行、import先切り替え）
- `tests/unit/architecture/value-import-scc.test.ts` — 新規作成（430行）
- `tests/unit/pipeline/transition-parity.test.ts` — 新規作成（307行）

### SCC解消の検証（TC-001〜TC-005）

`tests/unit/architecture/value-import-scc.test.ts` を読み、Tarjan's algorithm が正しくインライン実装されていることを確認。`collectSourceFiles` は `__tests__/` ディレクトリと `.test.ts` ファイルを除外し（TC-020）、production module のロード（import()/require()）を行わない（TC-021）。

`src/core/review-routing.ts` の import を直接確認:
- value import: `{ STEP_NAMES } from "./step/step-names.js"` のみ
- type-only: `JobState`, `ReviewerSnapshot`, `Finding` を `import type` で取得
- `pipeline/reviewer-chain`, `pipeline/findings-ledger`, `step/fixer-helpers`, `step/regression-gate` への value import なし ✓

`src/core/pipeline/reviewer-chain.ts` の import を確認:
- `step/fixer-helpers` への value import: 削除済み ✓
- `step/regression-gate` への value import: 削除済み ✓
- `review-routing.ts` から `REGRESSION_GATE_STEP_NAME`, routing predicates, `getLatestJudgeFindings` を import ✓

`src/core/step/fixer-helpers.ts` の import を確認:
- `pipeline/reviewer-chain` への value import: 削除済み ✓
- `{ getLatestJudgeFindings, getConformanceFixContext } from "../review-routing.js"` を re-export ✓

`src/core/step/regression-gate.ts` の import を確認:
- `pipeline/reviewer-chain` への value import: 削除済み ✓
- `{ deriveImplReviewerChain, REGRESSION_GATE_STEP_NAME } from "../review-routing.js"` を import ✓
- `REGRESSION_GATE_STEP_NAME` を `review-routing.js` から re-export ✓

`src/core/pipeline/findings-ledger.ts` の import を確認:
- `step/fixer-helpers` への value import: 削除済み ✓
- `{ getLatestJudgeFindings } from "../review-routing.js"` を import ✓

### テスト実行結果（TC-024〜TC-027）

- `bun run build`: passed ✓
- `bun run typecheck`: passed ✓
- `bun run test tests/unit/architecture/value-import-scc.test.ts`: 16 tests passed ✓
- `bun run test tests/unit/pipeline/transition-parity.test.ts`: 24 tests passed ✓
- `bun run test src/core/pipeline/__tests__/reviewer-chain.test.ts`: 55 tests passed ✓
- `bun run test src/core/pipeline/__tests__/findings-ledger.test.ts`: 26 tests passed ✓
- `bun run test src/core/pipeline/__tests__/standard-transitions.test.ts`: 9 tests passed ✓
- `bun run test tests/unit/architecture/core-invariants.test.ts`: 72 tests passed ✓
- 全テスト: 826 files, 12544 tests passed, 1 skipped, 2 todo ✓

### TC-012: resolveActiveReviewer tie-break

`reviewer-chain.test.ts` TC-028（line 168）が `>=` tie-break（chain後位優先）をカバーしていることを確認。`review-routing.ts` の実装（line 75: `>= latestTime`）が元の実装と同一ロジックであることを確認。

### TC-013: getConformanceFixContext recency check

code coverage（lcov.info）で `review-routing.ts` line 189（`return null` when predecessor.endedAt >= conformance.endedAt）が **2回** 実行されていることを確認（DA:189,2）。recency check の null-return branch は既存テスト群によって間接的にカバーされている。ただし、この recency null ケースに対する **専用の unit test は追加されていない**（後述の finding F-1 参照）。

### TC-022: lastFindingsOf null→[] 変換

code coverage（lcov.info）で `reviewer-chain.ts` line 56（`return getLatestJudgeFindings ?? []`）の null branch（BRDA:56,3,1,41: 41回実行）が確認されており、TC-022 は既存テストで間接的にカバーされている。

### TC-014: review-routing.ts 全 export 確認

`export` を grep して確認:
- `REGRESSION_GATE_STEP_NAME` ✓
- `deriveImplReviewerChain` ✓
- `deriveImplFixerChain` ✓
- `resolveActiveReviewer` ✓
- `nextAfterReviewer` ✓
- `getLatestJudgeFindings` ✓
- `getConformanceFixContext` ✓
- `conformanceFixInProgress` ✓
- `regressionGateActive` ✓
- `codeReviewLoopActive` ✓

### TC-015〜TC-017: backward compat re-export 確認

- `reviewer-chain.ts` は `deriveImplReviewerChain`, `deriveImplFixerChain`, `resolveActiveReviewer`, `nextAfterReviewer`, routing predicates を `review-routing.js` から re-export ✓
- `fixer-helpers.ts` は `getLatestJudgeFindings`, `getConformanceFixContext` を `review-routing.js` から re-export ✓
- `regression-gate.ts` は `REGRESSION_GATE_STEP_NAME` を `review-routing.js` から re-export ✓
- `code-fixer.ts`, `decision/wontfix.ts` は変更なしで従来の import path を使用可能 ✓

### design.md との整合性

- D1（`review-routing.ts` 新設）: 実装一致 ✓
- D2（transition builder は reviewer-chain.ts に残留）: 実装一致 ✓
- D3（reviewer-chain.ts が re-export barrel）: 実装一致 ✓
- D4（fixer-helpers.ts が re-export）: 実装一致 ✓
- D5（SCC 検査は静的 regex ベース）: 実装一致 ✓
- D6（transition parity test は明示的構造アサーション）: 実装一致 ✓

## 検証できなかった項目

- **TC-013 専用 unit test**: 前述の通り、`predecessor.endedAt >= conformance.endedAt → null` ケースをダイレクトにアサートする unit test が `value-import-scc.test.ts` および `reviewer-chain.test.ts` のどちらにも追加されていない。coverage で実行は確認できたが、named test で明示的に固定されていない。

## Findings 詳細

### F-1: TC-013（must）のダイレクト unit test が欠けている

**対象ファイル**: `src/core/review-routing.ts`（または対応するテストファイル）

`spec.md` の TC-013 シナリオ「conformance が predecessor より古い状態で `getConformanceFixContext` を呼び出す → `null` が返却される」に対する専用 unit test が追加されていない。

code coverage では line 189（`return null`）が 2 回実行されていることが確認でき、既存の integration tests 経由で間接カバーされているが、`test-cases.md` が「must」と分類した要件に対して named test がないため、将来的に recency check ロジックが変更された際に無音で回帰するリスクが残る。

再現ステップ:
1. `reviewer-chain.test.ts` の `conformanceFixInProgress` describe block を確認
2. conformance verdict が `needs-fix:code-fixer` かつ toolResult.findings あり、しかし **code-review の endedAt が conformance の endedAt 以降** という state で `conformanceFixInProgress` が `false` を返すテストケースが存在しないことを確認

影響範囲: behavior regression の早期検知能力が低下する（現時点では機能的に正しく実装されている）

---

### F-2（低・観察のみ）: findings-ledger.ts のコメントが旧サイクルを参照している

`src/core/pipeline/findings-ledger.ts` の line 215–216 および 265–267 のコメントが、解消前のサイクル経路（`findings-ledger.ts → reviewer-chain.ts → regression-gate.ts → findings-ledger.ts`）を記述したままになっている。リファクタリング後は `findings-ledger.ts` が `reviewer-chain.ts` を value import しないため、このサイクルは存在しない。コメントの「import cycle 回避」という rationale 自体は不正確ではないが（呼び出し側でチェーンを渡すことで責務分離が維持されている）、サイクルの具体例は現状に合わせた更新が望ましい。

これは動作に影響しない stale comment であり、fixable な低優先度の cosmetic 指摘。
