# Tasks: review routing の value-import cycle を解消する

## T-01: `src/core/review-routing.ts` を新設する

- [ ] ファイル `src/core/review-routing.ts` を新規作成する
- [ ] 文字列定数 `REGRESSION_GATE_STEP_NAME = "regression-gate"` を定義・export する
- [ ] `deriveImplReviewerChain` を `pipeline/reviewer-chain.ts` から移植する（実装コードをコピー）
- [ ] `deriveImplFixerChain` を `pipeline/reviewer-chain.ts` から移植する
- [ ] `resolveActiveReviewer` を `pipeline/reviewer-chain.ts` から移植する
- [ ] `nextAfterReviewer` を `pipeline/reviewer-chain.ts` から移植する
- [ ] `getLatestJudgeFindings` を `step/fixer-helpers.ts` から移植する
- [ ] `conformancePredecessorStep`（private）を `step/fixer-helpers.ts` から移植する
- [ ] `getConformanceFixContext` を `step/fixer-helpers.ts` から移植する
- [ ] `conformanceFixInProgress` を `pipeline/reviewer-chain.ts` から移植する
- [ ] `regressionGateActive` を `pipeline/reviewer-chain.ts` から移植する
- [ ] `codeReviewLoopActive` を `pipeline/reviewer-chain.ts` から移植する
- [ ] import を整理する: `Transition`、`JobState`、`ReviewerSnapshot`、`CodeReviewReportResult`、`Finding` は `import type` にする; `STEP_NAMES`、`collectFixableFindings`、`filterUndecidedFindings` は value import で取得する
- [ ] `review-routing.ts` に `pipeline/` composition module（reviewer-chain、findings-ledger、types 等）や `step/` factory module（fixer-helpers、regression-gate）への value import がないことを確認する

**Acceptance Criteria**:
- `src/core/review-routing.ts` が存在し、上記すべての識別子を export している
- value import 先が `step/step-names`・`step/judge-verdict`・`decision/decision-ledger` のみである（`pipeline/` や `step/fixer-helpers`・`step/regression-gate` への value import が 0 件）
- `bun run typecheck` でエラーが出ない

---

## T-02: `pipeline/reviewer-chain.ts` を更新する（re-export barrel + transition builders 残留）

- [ ] `import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js";` を削除する
- [ ] `import { getConformanceFixContext } from "../step/fixer-helpers.js";` を削除する
- [ ] `review-routing.ts` から以下を import する: `REGRESSION_GATE_STEP_NAME`、`resolveActiveReviewer`、`conformanceFixInProgress`、`regressionGateActive`、`codeReviewLoopActive`、`getLatestJudgeFindings`
- [ ] 以下を `review-routing.ts` から re-export する（backward compat 用）: `deriveImplReviewerChain`、`deriveImplFixerChain`、`resolveActiveReviewer`、`nextAfterReviewer`、`conformanceFixInProgress`、`regressionGateActive`、`codeReviewLoopActive`
- [ ] `buildReviewerChainTransitions` および `buildParallelReviewerTransitions` の実装はそのまま残す（移動しない）
- [ ] `lastFindingsOf`（private helper）を `getLatestJudgeFindings` 経由に更新する（`null` が返った場合は `[]` を返す）
- [ ] `lastReviewerFixableCount` は `lastFindingsOf` を呼ぶままにしておく
- [ ] `reviewer-chain.ts` に `step/regression-gate` または `step/fixer-helpers` への value import が残っていないことを確認する

**Acceptance Criteria**:
- `pipeline/reviewer-chain.ts` に `step/regression-gate` や `step/fixer-helpers` への value import が存在しない
- 既存の `pipeline/__tests__/reviewer-chain.test.ts`（TC-028〜TC-032 含む）がすべて green
- 既存の `pipeline/__tests__/standard-transitions.test.ts` が green
- `pipeline/pipeline.ts`、`step/code-fixer.ts` など既存 callers がコンパイルエラーなし

---

## T-03: `step/fixer-helpers.ts` を更新する（循環 import 除去 + re-export 追加）

- [ ] `import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js";` を削除する
- [ ] `getLatestJudgeFindings` 関数定義を削除する（T-01 で review-routing.ts に移植済み）
- [ ] `conformancePredecessorStep` 関数定義を削除する（T-01 で review-routing.ts に移植済み）
- [ ] `getConformanceFixContext` 関数定義を削除する（T-01 で review-routing.ts に移植済み）
- [ ] `export { getLatestJudgeFindings, getConformanceFixContext } from "../review-routing.js";` を追加する（backward compat re-export）
- [ ] 残留する定義を確認する: `FIXER_STEP_NAMES`、`getPreviousSessionId`、`isFixerContinuation`、`buildFindingsBlock`、`buildUnpushablePathContracts`、`buildContinuationMessage`
- [ ] `fixer-helpers.ts` に `pipeline/reviewer-chain` への value import が残っていないことを確認する

**Acceptance Criteria**:
- `step/fixer-helpers.ts` に `pipeline/reviewer-chain` への value import が存在しない
- 既存の `step/__tests__/fixer-reviewer.test.ts`・`step/__tests__/fixer-push-capability.test.ts` が green
- `step/code-fixer.ts`、`step/spec-fixer.ts`、`step/implementer.ts`、`pipeline/spec-observation.ts` など callers がコンパイルエラーなし（re-export 経由で同じ import path が使える）

---

## T-04: `step/regression-gate.ts` を更新する（`review-routing.ts` に依存を切り替える）

- [ ] `import { deriveImplReviewerChain } from "../pipeline/reviewer-chain.js";` を削除する
- [ ] `export const REGRESSION_GATE_STEP_NAME = "regression-gate";` を削除する
- [ ] `import { deriveImplReviewerChain, REGRESSION_GATE_STEP_NAME } from "../review-routing.js";` を追加する
- [ ] `export { REGRESSION_GATE_STEP_NAME } from "../review-routing.js";` を追加する（既存 callers への backward compat re-export）
- [ ] ファイル内の `REGRESSION_GATE_STEP_NAME` 使用箇所が import された定数を参照していることを確認する
- [ ] `regression-gate.ts` に `pipeline/reviewer-chain` への value import が残っていないことを確認する

**Acceptance Criteria**:
- `step/regression-gate.ts` に `pipeline/reviewer-chain` への value import が存在しない
- `REGRESSION_GATE_STEP_NAME` が `regression-gate.ts` から引き続き export されており、既存 callers（`pipeline/compose-reviewers.ts`、`pipeline/__tests__/reviewer-chain.test.ts` 等）がコンパイルエラーなし
- 既存の regression-gate 関連テストが green

---

## T-05: `pipeline/findings-ledger.ts` を更新する（`review-routing.ts` に依存を切り替える）

- [ ] `import { getLatestJudgeFindings } from "../step/fixer-helpers.js";` を削除する
- [ ] `import { getLatestJudgeFindings } from "../review-routing.js";` を追加する
- [ ] `findings-ledger.ts` に `step/fixer-helpers` への value import が残っていないことを確認する

**Acceptance Criteria**:
- `pipeline/findings-ledger.ts` に `step/fixer-helpers` への value import が存在しない
- 既存の `pipeline/__tests__/findings-ledger.test.ts` が green（`collectFindingsLedger`、`computeRegressionLedger` 等）

---

## T-06: value-import SCC 検出 architecture test を追加する

- [ ] `tests/unit/architecture/value-import-scc.test.ts` を新規作成する
- [ ] `src/` 配下の `.ts` ファイルを再帰的に収集する関数を実装する（`__tests__/` ディレクトリと `.test.ts` ファイルを除外）
- [ ] 各ファイルのテキストから value import のみのパスを抽出する関数を実装する:
  - `import type { ... } from "..."` → 除外（type-only）
  - `export type { ... } from "..."` → 除外（type-only）
  - `import { type X, Y } from "..."` → Y のみ抽出（inline type modifier を除外）
  - `export { type X, Y } from "..."` → Y のみ value edge
  - `import { X } from "..."` → X は value edge
  - `import X from "..."` / `import * as X from "..."` → value edge
- [ ] 相対パス（`./`・`../`）を絶対パスへ解決する関数を実装する（`.js` 拡張子は `.ts` に変換して解決; `node:*`、npm パッケージは除外）
- [ ] Tarjan's algorithm を実装してすべての SCC を返す関数を実装する（外部ライブラリ不使用、production module のロード不使用）
- [ ] テスト本体: `src/` をスキャンして size > 1 の SCC が 0 件であることをアサートする
- [ ] liveness guard: スキャン対象ファイルが 1 件以上検出されることをアサートする
- [ ] regression guard: 合成 2 ノード SCC（A→B, B→A）が検出されることをアサートする
- [ ] regression guard: `import type` 形式の edge が value edge としてカウントされないことをアサートする
- [ ] review-routing.ts import 制約の直接検査: `src/core/review-routing.ts` のテキストから value import 先を正規表現で抽出し、`pipeline/` モジュールおよび `step/fixer-helpers`・`step/regression-gate` への value import が 0 件であることをアサートする（TC-001/002 を SCC 検出に依存せずカバー。許容される value import 先: `step/step-names`、`step/judge-verdict`、`decision/decision-ledger`）

**Acceptance Criteria**:
- `src/` の value-import SCC が 0 件（T-01〜T-05 完了後）
- `import type` および `export type` は value edge にカウントされない
- inline type modifier `import { type X, Y }` において X は除外、Y は value edge
- 合成 2 ノード SCC（A→B, B→A）が検出される
- production module のロード（`import()`、`require()`）を使用しない
- `src/core/review-routing.ts` の value import 先が `step/step-names`・`step/judge-verdict`・`decision/decision-ledger` のみであることが正規表現で直接アサートされる（TC-001/002 をカバー）
- `bun run test tests/unit/architecture/value-import-scc.test.ts` が green

---

## T-07: transition parity test を追加する

- [ ] `tests/unit/pipeline/transition-parity.test.ts` を新規作成する
- [ ] ヘルパー型 `TransitionShape = { step: string; on: string; to: string; hasGuard: boolean }` を定義する
- [ ] `buildReviewerChainTransitions(["code-review"])` の出力について以下の行を順番通りにアサートする（step/on/to/hasGuard を比較）:
  - `{ step: "code-review", on: "approved", to: "code-fixer", hasGuard: true }` （fixable findings guard）
  - `{ step: "code-review", on: "approved", to: "conformance", hasGuard: false }` （clean pass）
  - `{ step: "code-review", on: "needs-fix", to: "code-fixer", hasGuard: false }`
  - `{ step: "code-review", on: "skipped", to: "conformance", hasGuard: false }`
  - code-fixer の approved 行（conformance へ with guard）
  - code-fixer の approved 行（code-review へ with guard、fallback）
  - code-fixer の error 行（escalate へ、guard なし）
- [ ] `buildParallelReviewerTransitions({ coordinator: "custom-reviewers", members: ["sec"] })` の出力について以下を確認する:
  - code-review セクション: approved(fixable)→code-fixer(guard), approved(clean)→coordinator(no guard), needs-fix→code-fixer, skipped→coordinator
  - coordinator セクション: approved→regression-gate, needs-fix→code-fixer, skipped→regression-gate
  - regression-gate セクション: approved→conformance(no guard), needs-fix→code-fixer, skipped→conformance
  - code-fixer セクション: priority 順の 4 行（conformance with guard、regression-gate with guard、code-review with guard、coordinator no guard）、error→escalate
- [ ] `STANDARD_TRANSITIONS` の code-review / code-fixer 行が `buildReviewerChainTransitions(["code-review"])` の shape と一致することをアサートする
- [ ] `FAST_TRANSITIONS` の code-review / code-fixer 行が同様に一致することをアサートする
- [ ] regression guard: 期待する行数と実際の行数が一致しない場合にテストが失敗することを確認する

**Acceptance Criteria**:
- STANDARD_TRANSITIONS と FAST_TRANSITIONS の code-review/code-fixer セクションが `buildReviewerChainTransitions(["code-review"])` と構造一致する
- `buildParallelReviewerTransitions` の全セクションの step・on・to・hasGuard の順序付き一覧が期待値と一致する
- guard 有無（`when` の presence/absence）が検査されている
- `bun run test tests/unit/pipeline/transition-parity.test.ts` が green

---

## T-08: 全 acceptance criteria を確認する

- [ ] `bun run build` が pass する
- [ ] `bun run typecheck` が pass する
- [ ] `bun run lint` が pass する
- [ ] `bun run test` がすべて green（unit / architecture / parity tests 含む）
- [ ] 新設した `value-import-scc.test.ts` が green（SCC 0 件アサーション）
- [ ] 新設した `transition-parity.test.ts` が green
- [ ] 既存の `core-invariants.test.ts`（B-1〜B-18、DSM closure）が green
- [ ] 既存の `reviewer-chain.test.ts`（TC-028〜TC-032 含む）が green
- [ ] 既存の `findings-ledger.test.ts` が green
- [ ] code-fixer の戻り先・regression-gate・findings ledger・conformance fix routing の既存テストが green
- [ ] `src/` に pipeline-managed artifact 以外の未追跡・未 commit ファイルが残っていない

**Acceptance Criteria**:
- build / typecheck / lint / test がすべて green
- `src/` 全体の value-import SCC が 0 件
- scope 外の production behavior 変更が 0 件
