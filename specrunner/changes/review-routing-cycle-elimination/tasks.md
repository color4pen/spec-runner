# Tasks: review routing の value-import cycle を解消する

## T-01: `src/core/review-routing.ts` を新設する

- [x] ファイル `src/core/review-routing.ts` を新規作成する
- [x] 文字列定数 `REGRESSION_GATE_STEP_NAME = "regression-gate"` を定義・export する
- [x] `deriveImplReviewerChain` を `pipeline/reviewer-chain.ts` から移植する（実装コードをコピー）
- [x] `deriveImplFixerChain` を `pipeline/reviewer-chain.ts` から移植する
- [x] `resolveActiveReviewer` を `pipeline/reviewer-chain.ts` から移植する
- [x] `nextAfterReviewer` を `pipeline/reviewer-chain.ts` から移植する
- [x] `getLatestJudgeFindings` を `step/fixer-helpers.ts` から移植する
- [x] `conformancePredecessorStep`（private）を `step/fixer-helpers.ts` から移植する
- [x] `getConformanceFixContext` を `step/fixer-helpers.ts` から移植する
- [x] `conformanceFixInProgress` を `pipeline/reviewer-chain.ts` から移植する
- [x] `regressionGateActive` を `pipeline/reviewer-chain.ts` から移植する
- [x] `codeReviewLoopActive` を `pipeline/reviewer-chain.ts` から移植する
- [x] import を整理する: `JobState`、`ReviewerSnapshot`、`Finding` は `import type` にする; `STEP_NAMES` は value import で取得する（`collectFixableFindings`・`filterUndecidedFindings` は移植された関数には不要だったため省略）
- [x] `review-routing.ts` に `pipeline/` composition module（reviewer-chain、findings-ledger、types 等）や `step/` factory module（fixer-helpers、regression-gate）への value import がないことを確認する

**Acceptance Criteria**:
- `src/core/review-routing.ts` が存在し、上記すべての識別子を export している
- value import 先が `step/step-names` のみである（`pipeline/` や `step/fixer-helpers`・`step/regression-gate` への value import が 0 件）
- `bun run typecheck` でエラーが出ない

---

## T-02: `pipeline/reviewer-chain.ts` を更新する（re-export barrel + transition builders 残留）

- [x] `import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js";` を削除する
- [x] `import { getConformanceFixContext } from "../step/fixer-helpers.js";` を削除する
- [x] `review-routing.ts` から以下を import する: `REGRESSION_GATE_STEP_NAME`、`resolveActiveReviewer`、`nextAfterReviewer`、`conformanceFixInProgress`、`regressionGateActive`、`codeReviewLoopActive`、`getLatestJudgeFindings`
- [x] 以下を `review-routing.ts` から re-export する（backward compat 用）: `deriveImplReviewerChain`、`deriveImplFixerChain`、`resolveActiveReviewer`、`nextAfterReviewer`、`conformanceFixInProgress`、`regressionGateActive`、`codeReviewLoopActive`
- [x] `buildReviewerChainTransitions` および `buildParallelReviewerTransitions` の実装はそのまま残す（移動しない）
- [x] `lastFindingsOf`（private helper）を `getLatestJudgeFindings` 経由に更新する（`null` が返った場合は `[]` を返す）
- [x] `lastReviewerFixableCount` は `lastFindingsOf` を呼ぶままにしておく
- [x] `reviewer-chain.ts` に `step/regression-gate` または `step/fixer-helpers` への value import が残っていないことを確認する

**Acceptance Criteria**:
- `pipeline/reviewer-chain.ts` に `step/regression-gate` や `step/fixer-helpers` への value import が存在しない
- 既存の `pipeline/__tests__/reviewer-chain.test.ts`（TC-028〜TC-032 含む）がすべて green
- 既存の `pipeline/__tests__/standard-transitions.test.ts` が green
- `pipeline/pipeline.ts`、`step/code-fixer.ts` など既存 callers がコンパイルエラーなし

---

## T-03: `step/fixer-helpers.ts` を更新する（循環 import 除去 + re-export 追加）

- [x] `import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js";` を削除する
- [x] `getLatestJudgeFindings` 関数定義を削除する（T-01 で review-routing.ts に移植済み）
- [x] `conformancePredecessorStep` 関数定義を削除する（T-01 で review-routing.ts に移植済み）
- [x] `getConformanceFixContext` 関数定義を削除する（T-01 で review-routing.ts に移植済み）
- [x] `export { getLatestJudgeFindings, getConformanceFixContext } from "../review-routing.js";` を追加する（backward compat re-export）
- [x] 残留する定義を確認する: `FIXER_STEP_NAMES`、`getPreviousSessionId`、`isFixerContinuation`、`buildFindingsBlock`、`buildUnpushablePathContracts`、`buildContinuationMessage`
- [x] `fixer-helpers.ts` に `pipeline/reviewer-chain` への value import が残っていないことを確認する

**Acceptance Criteria**:
- `step/fixer-helpers.ts` に `pipeline/reviewer-chain` への value import が存在しない
- 既存の `step/__tests__/fixer-reviewer.test.ts`・`step/__tests__/fixer-push-capability.test.ts` が green
- `step/code-fixer.ts`、`step/spec-fixer.ts`、`step/implementer.ts`、`pipeline/spec-observation.ts` など callers がコンパイルエラーなし（re-export 経由で同じ import path が使える）

---

## T-04: `step/regression-gate.ts` を更新する（`review-routing.ts` に依存を切り替える）

- [x] `import { deriveImplReviewerChain } from "../pipeline/reviewer-chain.js";` を削除する
- [x] `export const REGRESSION_GATE_STEP_NAME = "regression-gate";` を削除する
- [x] `import { deriveImplReviewerChain, REGRESSION_GATE_STEP_NAME } from "../review-routing.js";` を追加する
- [x] `export { REGRESSION_GATE_STEP_NAME } from "../review-routing.js";` を追加する（既存 callers への backward compat re-export）
- [x] ファイル内の `REGRESSION_GATE_STEP_NAME` 使用箇所が import された定数を参照していることを確認する
- [x] `regression-gate.ts` に `pipeline/reviewer-chain` への value import が残っていないことを確認する

**Acceptance Criteria**:
- `step/regression-gate.ts` に `pipeline/reviewer-chain` への value import が存在しない
- `REGRESSION_GATE_STEP_NAME` が `regression-gate.ts` から引き続き export されており、既存 callers（`pipeline/compose-reviewers.ts`、`pipeline/__tests__/reviewer-chain.test.ts` 等）がコンパイルエラーなし
- 既存の regression-gate 関連テストが green

---

## T-05: `pipeline/findings-ledger.ts` を更新する（`review-routing.ts` に依存を切り替える）

- [x] `import { getLatestJudgeFindings } from "../step/fixer-helpers.js";` を削除する
- [x] `import { getLatestJudgeFindings } from "../review-routing.js";` を追加する
- [x] `findings-ledger.ts` に `step/fixer-helpers` への value import が残っていないことを確認する

**Acceptance Criteria**:
- `pipeline/findings-ledger.ts` に `step/fixer-helpers` への value import が存在しない
- 既存の `pipeline/__tests__/findings-ledger.test.ts` が green（`collectFindingsLedger`、`computeRegressionLedger` 等）

---

## T-06: value-import SCC 検出 architecture test を追加する

- [x] `tests/unit/architecture/value-import-scc.test.ts` を新規作成する
- [x] `src/` 配下の `.ts` ファイルを再帰的に収集する関数を実装する（`__tests__/` ディレクトリと `.test.ts` ファイルを除外）
- [x] 各ファイルのテキストから value import のみのパスを抽出する関数を実装する:
  - `import type { ... } from "..."` → 除外（type-only）
  - `export type { ... } from "..."` → 除外（type-only）
  - `import { type X, Y } from "..."` → Y のみ抽出（inline type modifier を除外）
  - `export { type X, Y } from "..."` → Y のみ value edge
  - `import { X } from "..."` → X は value edge
  - `import X from "..."` / `import * as X from "..."` → value edge
- [x] 相対パス（`./`・`../`）を絶対パスへ解決する関数を実装する（`.js` 拡張子は `.ts` に変換して解決; `node:*`、npm パッケージは除外）
- [x] Tarjan's algorithm を実装してすべての SCC を返す関数を実装する（外部ライブラリ不使用、production module のロード不使用）
- [x] テスト本体: `src/` をスキャンして size > 1 の SCC が 0 件であることをアサートする
- [x] liveness guard: スキャン対象ファイルが 1 件以上検出されることをアサートする
- [x] regression guard: 合成 2 ノード SCC（A→B, B→A）が検出されることをアサートする
- [x] regression guard: `import type` 形式の edge が value edge としてカウントされないことをアサートする
- [x] review-routing.ts import 制約の直接検査: `src/core/review-routing.ts` のテキストから value import 先を正規表現で抽出し、`pipeline/` モジュールおよび `step/fixer-helpers`・`step/regression-gate` への value import が 0 件であることをアサートする（TC-001/002 を SCC 検出に依存せずカバー。許容される value import 先: `step/step-names`）

**Acceptance Criteria**:
- `src/` の value-import SCC が 0 件（T-01〜T-05 完了後）
- `import type` および `export type` は value edge にカウントされない
- inline type modifier `import { type X, Y }` において X は除外、Y は value edge
- 合成 2 ノード SCC（A→B, B→A）が検出される
- production module のロード（`import()`、`require()`）を使用しない
- `src/core/review-routing.ts` の value import 先が `step/step-names` のみであることが正規表現で直接アサートされる（TC-001/002 をカバー）
- `bun run test tests/unit/architecture/value-import-scc.test.ts` が green

---

## T-07: transition parity test を追加する

- [x] `tests/unit/pipeline/transition-parity.test.ts` を新規作成する
- [x] ヘルパー型 `TransitionShape = { step: string; on: string; to: string; hasGuard: boolean }` を定義する
- [x] `buildReviewerChainTransitions(["code-review"])` の出力について以下の行を順番通りにアサートする（step/on/to/hasGuard を比較）:
  - `{ step: "code-review", on: "approved", to: "code-fixer", hasGuard: true }` （fixable findings guard）
  - `{ step: "code-review", on: "approved", to: "conformance", hasGuard: false }` （clean pass）
  - `{ step: "code-review", on: "needs-fix", to: "code-fixer", hasGuard: false }`
  - `{ step: "code-review", on: "skipped", to: "conformance", hasGuard: false }`
  - code-fixer の approved 行（conformance へ with guard）
  - code-fixer の approved 行（code-review へ with guard、fallback）
  - code-fixer の error 行（escalate へ、guard なし）
- [x] `buildParallelReviewerTransitions({ coordinator: "custom-reviewers", members: ["sec"] })` の出力について以下を確認する:
  - code-review セクション: approved(fixable)→code-fixer(guard), approved(clean)→coordinator(no guard), needs-fix→code-fixer, skipped→coordinator
  - coordinator セクション: approved→regression-gate, needs-fix→code-fixer, skipped→regression-gate
  - regression-gate セクション: approved→conformance(no guard), needs-fix→code-fixer, skipped→conformance
  - code-fixer セクション: priority 順の 4 行（conformance with guard、regression-gate with guard、code-review with guard、coordinator no guard）、error→escalate
- [x] `STANDARD_TRANSITIONS` の code-review / code-fixer 行が `buildReviewerChainTransitions(["code-review"])` の shape と一致することをアサートする
- [x] `FAST_TRANSITIONS` の code-review / code-fixer 行が同様に一致することをアサートする
- [x] regression guard: 期待する行数と実際の行数が一致しない場合にテストが失敗することを確認する

**Acceptance Criteria**:
- STANDARD_TRANSITIONS と FAST_TRANSITIONS の code-review/code-fixer セクションが `buildReviewerChainTransitions(["code-review"])` と構造一致する
- `buildParallelReviewerTransitions` の全セクションの step・on・to・hasGuard の順序付き一覧が期待値と一致する
- guard 有無（`when` の presence/absence）が検査されている
- `bun run test tests/unit/pipeline/transition-parity.test.ts` が green

---

## T-08: 全 acceptance criteria を確認する

- [x] `bun run build` が pass する
- [x] `bun run typecheck` が pass する
- [x] `bun run lint` が pass する
- [x] `bun run test` がすべて green（unit / architecture / parity tests 含む）
- [x] 新設した `value-import-scc.test.ts` が green（SCC 0 件アサーション）
- [x] 新設した `transition-parity.test.ts` が green
- [x] 既存の `core-invariants.test.ts`（B-1〜B-18、DSM closure）が green
- [x] 既存の `reviewer-chain.test.ts`（TC-028〜TC-032 含む）が green
- [x] 既存の `findings-ledger.test.ts` が green
- [x] code-fixer の戻り先・regression-gate・findings ledger・conformance fix routing の既存テストが green
- [x] `src/` に pipeline-managed artifact 以外の未追跡・未 commit ファイルが残っていない

**Acceptance Criteria**:
- build / typecheck / lint / test がすべて green
- `src/` 全体の value-import SCC が 0 件
- scope 外の production behavior 変更が 0 件
