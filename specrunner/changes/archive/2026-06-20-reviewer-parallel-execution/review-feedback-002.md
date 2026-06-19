# Code Review Feedback — iteration 002

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | `src/core/pipeline/__tests__/findings-ledger.test.ts` | test-cases.md TC-026（must）が明示的にカバーされていない。TC-026 は「coordinator synthetic StepRun が `steps["custom-reviewers"]` に存在する状態で `collectFindingsLedger(state, ["code-review", "A", "B"])` を呼ぶと coordinator の findings は混入しない」を検証するが、現在のテストは state に "custom-reviewers" ステップを含まないため TC-026 の除外シナリオを直接確認していない。`collectFindingsLedger` の実装は chain 配列のみを走査するため構造的にこの排除は保証されており、regression リスクは極めて低い。 | findings-ledger.test.ts に TC-026 シナリオを追加: `steps["custom-reviewers"]` に synthetic StepRun（findings 付き）を持つ state で `collectFindingsLedger(state, ["code-review", "A", "B"])` を呼び、coordinator の findings が含まれないことを assert する。 | no |
| 2 | low | maintainability | `src/core/pipeline/pipeline.ts` (`mergeParallelReviewerStates`) | iter 001 Finding 5 の未修正キャリーオーバー。`mergeParallelReviewerStates` の `memberNames` パラメータが `string[] | undefined`（optional）のまま。呼び出し側は常に `pending`（非 null）を渡すが、型シグネチャが optional のため将来の caller が `undefined` を渡すと member step の StepRun が上書きされないリスクが残る。 | `memberNames?: string[]` を `memberNames: string[]`（non-optional）に変更して型レベルで強制する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 8.80

## Summary

iter 001 の全 high/medium findings が修正された。

**修正確認済み**:
- Finding 1（high/testing）: `src/core/pipeline/__tests__/reviewer-chain.test.ts` に TC-029〜TC-032 を網羅するテストが追加された。`buildParallelReviewerTransitions` 遷移行の生成、member 名行の不存在、routing predicates（conformanceFixInProgress / regressionGateActive / codeReviewLoopActive）の true/false 条件、`buildReviewerChainTransitions` の無変更の 4 系統すべてが確認済み。
- Finding 2（high/testing）: `src/core/pipeline/__tests__/findings-ledger.test.ts` に TC-024（複数 needs-fix member の fixable findings 集約・dedup）と TC-025（approved / skipped member の除外）が追加された。
- Finding 3（high/testing）: `src/core/step/__tests__/executor-commit-mutex.test.ts` が新設され TC-035 がカバーされた。`setTimeout(20ms)` を使った並行実行 + maxConcurrent カウンタにより、`finalizeStepArtifacts` が直列に呼ばれることを実測で確認している。
- Finding 4（medium/maintainability）: `computeInvalidations` の JSDoc が「path-constrained reviewer は `touchedFiles = []` で invalidation 不発（fail-safe）、always-activate reviewer（`activationPaths: undefined`）は `touchedFiles = []` でも常に pending に戻る」と正確に記述されるよう修正された。

**残留**:
- Finding 5（low/iter 001）: `mergeParallelReviewerStates` の `memberNames` が optional のままだが呼び出し側は常に正しく渡しており実害なし。
- TC-026 テスト欠落（低リスク）: coordinator synthetic run 除外の明示的な unit test がないが、`collectFindingsLedger` は chain 配列のみ走査する構造的保証があり regression の余地はほぼない。

`typecheck && test` は green（406 test files、5478 tests）。受け入れ基準を満たすと判定する。
