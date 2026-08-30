# Cross-boundary invariants review — review-routing-cycle-elimination iteration 1

<!--
Typed findings から CLI が verdict を導出するため、この evidence report に verdict 行は置かない。
-->

## Review scope

`git diff main...HEAD --stat` を実行し、production code では review-routing の新設、reviewer-chain / fixer-helpers の re-export 化、regression-gate / findings-ledger の import 境界変更を確認した。あわせて `design.md` と `tasks.md` を読み、変更が新しい runtime 経路を追加するものではなく、既存の判断関数を中立 module に移して参照経路を変える refactoring であることを確認した。

## Cross-boundary evidence

### Pipeline composition → routing predicates

- `buildReviewerChainTransitions` と `buildParallelReviewerTransitions` は引き続き `pipeline/reviewer-chain.ts` にあり、transition の宣言順、guard の評価順、destination は変更されていない。
- 移動された `resolveActiveReviewer`、`nextAfterReviewer`、`conformanceFixInProgress`、`regressionGateActive`、`codeReviewLoopActive` を main の旧実装と照合し、状態の読み取り対象、fallback、startedAt の `>=` tie-break、priority 条件が同一であることを確認した。
- 未変更の pipeline executor が前提とする「最初に真になった transition を採用する」順序に対し、新規 parity test は STANDARD / FAST / custom reviewer の全対象行について step、outcome、destination、guard 有無、行順を固定している。

### Step factories → fixer context

- `code-fixer.ts`、`spec-fixer.ts`、`implementer.ts`、`routed-findings.ts` は従来の import path を維持し、`fixer-helpers.ts` / `reviewer-chain.ts` の value re-export を介して同一の binding を取得する。
- `getLatestJudgeFindings` と `getConformanceFixContext` を main の旧 `fixer-helpers.ts` と比較し、最終 run の選択、legacy toolResult の null 処理、conformance target 判定、predecessor の選択、endedAt recency 条件、findings の null/empty-array 区別が同一であることを確認した。
- conformance → code-fixer の判定では reviewer chain に regression-gate を含める既存条件も維持され、未変更の prompt / routed-findings 側が読む active reviewer と transition guard の判定元は一致する。

### Ledger / regression-gate / compatibility boundaries

- `findings-ledger.ts` は `getLatestJudgeFindings` の import 元だけを変更しており、reviewerChain の caller injection、ledger aggregation、ledgerRef の契約は変更されていない。
- `regression-gate.ts` は reviewer chain と step-name 定数を新 module から直接取得するが、既存 caller 向けに同じ `REGRESSION_GATE_STEP_NAME` binding を re-export する。`pipeline/types.ts`、`compose-reviewers.ts`、resume step resolution、wontfix ledger が前提とする文字列 identity は `"regression-gate"` のままである。
- re-export により一対一の識別子が多重定義された形にはなっておらず、step map、role map、iteration budget、result-path lookup の key は従来と同一である。

### Import graph guard

- architecture test は production module をロードせず `src/` の相対 value imports / value re-exports を解決し、Tarjan SCC を検査する。
- `import type` / `export type` と inline type-only specifier の除外、合成 cycle の検出、scan liveness、test file 除外を確認した。
- `review-routing.ts` の runtime value import は `step/step-names` のみであり、pipeline composition、fixer-helpers、regression-gate への back edge はない。

## Verification

- `bun run test tests/unit/architecture/value-import-scc.test.ts tests/unit/pipeline/transition-parity.test.ts src/core/pipeline/__tests__/reviewer-chain.test.ts src/core/pipeline/__tests__/findings-ledger.test.ts`
- Result: 4 files passed, 122 tests passed.
- Vitest の GitHub Actions summary reporter は read-only の runner summary path への書き込み警告を出したが、test process 自体は exit code 0 で完了した。

## Findings

Typed finding として報告すべき、変更外コードの不変条件を破る具体的な実行列は確認されなかった。

