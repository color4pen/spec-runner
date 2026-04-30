# Review Feedback: review-exit-contract — Iteration 2

## Code Review Result

- **verdict**: approved
- **score**: 8.30 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving (+1.10 vs iter 1)
- **agents**: code-reviewer (orchestrator-integrated, subagent dispatch unavailable in env), pattern-reviewer (enabled), security-reviewer (skipped — `enabled-absent` per pipeline-context.md)
- **blocking_findings**: CRITICAL: 0, HIGH: 0

> Note: 本 iteration も `code-review` skill の Task ツール（subagent dispatch）が当環境で利用不能だったため、orchestrator が code-reviewer / pattern-reviewer の 2 観点を統合的に評価した。security-reviewer は pipeline-context.md `enabled` に含まれず skip。iter 1 と同条件のため比較は妥当。

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.30** |

> 補足: HIGH severity finding が 0 件、加重合計が pass_threshold 7.0 を超えているため verdict は `approved`（review-standards.md）。

## Verification Summary

| Phase | Result | Detail |
|-------|--------|--------|
| Build | PASS | `tsc --noEmit false --outDir dist` 成功 |
| Type Check | PASS | `bun run typecheck` (`tsc --noEmit`) 0 errors |
| Lint | SKIP | プロジェクトに lint script 未設定（package.json 参照） |
| Tests | PASS | `bun run test` (vitest) **533 / 533 passed**, 58 files (+4 vs iter 1) |
| Security | SKIP | scope-out（security-reviewer not enabled） |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | src/core/step/code-review.ts:55-57 vs src/prompts/spec-review-system.ts:118-120 | branch fallback 時の inline 文言（`"After writing the result file, commit and push..."`）が code-review.ts と spec-review-system.ts に重複している。`buildGitPushInstruction` を branch=null 時にも一元呼び出しできるようにすれば DRY 化できる。 | （非ブロッカー）`buildGitPushInstruction(undefined)` を許容するか、`buildGitPushInstructionFallback()` を新設して両 callsite から呼ぶ。現状は意味的に同一かつ short string なので保留可。 |
| 2 | LOW | testing | tests/unit/step/review-exit-contract.test.ts:475-492 | `makeReviewStepStub` が `agent.tools = []`、`AGENT_TOOLSET_TYPE` を含めていないため、actual の `SpecReviewStep` / `CodeReviewStep` の AgentDefinition との shape divergence がある。executor のロジックは `tools` を直接使わないので test 自体は valid だが、将来 executor が tools を参照したときに silent regression する可能性。 | （非ブロッカー）`makeReviewStepStub` で tools に `[{ type: AGENT_TOOLSET_TYPE }]` を入れて actual と shape を揃える。または `SpecReviewStep` / `CodeReviewStep` を直接渡して resultFilePath だけ override する shape に変える。 |
| 3 | LOW | testing | openspec/changes/review-exit-contract/test-cases.md (TC-019/TC-020/TC-021/TC-022) | E2E 系（agent push 検証 / source code 不変検証 / dogfooding 完走）が iter 1 から引き続き manual / post-merge に deferred。本 request の根本目的（dogfooding-001 の再発防止）は dogfooding を通さない限り検証完了しない。code-review skill の verdict には影響しない（progress.md で意図的に deferred と記録あり）。 | （非ブロッカー）archive 後の dogfooding-002 で TC-019/TC-021 の通過を必ず確認し、結果を `learned-patterns` または follow-up request に記録。 |

## Iteration Comparison

### Improvements（iter 1 → iter 2）

| iter1 # | Severity | 内容 | 修正状況 |
|---------|----------|------|---------|
| 1 | HIGH | executor.ts:711 の off-by-one (`length` → `length + 1`) | **解消**: 現行 `executor.ts:711` は `const iteration = existingResults.length + 1;` で、コメント "+1" と完全整合。`computeSpecReviewIteration` / `computeCodeReviewIteration` とも一致。 |
| 2 | MEDIUM | code-review.ts:100 の `?? deps.slug` フォールバックが意味的に誤り | **解消**: 現行 `code-review.ts:104` は `branch: state.branch ?? undefined` に修正。`buildCodeReviewInitialMessage` 側で `branch === undefined` のときは inline fallback 文言を組み込む（spec-review と対称）。 |
| 3 | MEDIUM | round-trip test に executor error-hint 経路が含まれない | **解消**: `tests/unit/step/review-exit-contract.test.ts` に **TC-011 / TC-012**（spec-review / code-review の executor `getRawFile` 失敗時に hint へ正しい iteration suffix が出ることを assert）を追加。`existingResults.length=0 → -001.md`、`length=1 → -002.md` の双方を検証。 |
| 4 | LOW | code-review/spec-review の branch fallback 非対称 | **解消**: 両者とも `state.branch ?? undefined` で統一。 |
| 5 | LOW | executor.ts:709 のコメントと実装の矛盾 | **解消**: Finding #1 の修正で実装がコメント通りになり自然解消。 |
| 6 | LOW | E2E manual deferred | **未対応（意図的）**: progress.md / tasks.md で deferred と明文化されており scope 外。iter 2 でも引き続き LOW として記録（Finding #3）。 |

### Regressions

なし。退行（修正により別の品質低下を生んだ箇所）は検出されず。

### Unchanged Issues

- iter 1 Finding #6（E2E manual deferred）→ iter 2 Finding #3 に再掲（非ブロッカー）

### Test Suite Delta

- iter 1: 529 / 529 PASS, 58 files
- iter 2: **533 / 533 PASS, 58 files**（+4 tests = TC-011×2 + TC-012×2）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-------------|---------|-------------|
| 1 | 7.20 | needs-fix | initial review — HIGH 1 (executor off-by-one), MEDIUM 2, LOW 3 |
| 2 | **8.30** | **approved** | iter1 の HIGH 1 + MEDIUM 2 をすべて修正、LOW 3 件のみ残存（いずれも非ブロッカー）。test +4。 |

## Convergence

- **trend**: **improving** (+1.10 ≧ 0.3 改善閾値)
- **recommendation**: **approved** → 次工程へ進む。残 LOW 3 件は本 PR スコープ外として archive、または follow-up tasks に記録。

## Summary

iter 1 の must-fix（HIGH 1, MEDIUM 2）はすべて適切に修正され、副作用も検出されなかった。

具体的には、(1) `executor.ts:711` の iteration 計算が `length + 1` に修正されコメントと完全整合、(2) `code-review.ts:104` の branch fallback が `state.branch ?? undefined` に統一されて spec-review と対称化、`buildCodeReviewInitialMessage` 側で branch=undefined 時の fallback 文言を持つ責務分離が成立、(3) `tests/unit/step/review-exit-contract.test.ts` に **TC-011 / TC-012**（executor の error-hint iteration 計算を直接 assert する unit test）が追加され、Finding #1 の off-by-one が将来再発した場合に CI で確実に catch できる体制になった。

verification は **533 / 533 PASS**（iter 1 比 +4 tests）、typecheck clean、build PASS で品質ゲートを完全通過。HIGH / CRITICAL 0 件、加重合計 8.30（pass threshold 7.0 を 1.30 上回る）、improving trend (+1.10)。本 request の根本目的「review 系 step の 3 層 divergence を構造的に解消する」は code-level で達成されており、ADR / delta spec / 38 件超の追加 unit test を含む骨格も整っている。

verdict は **approved**。残存 LOW 3 件（fallback 文言の DRY、stub の shape divergence、E2E manual deferred）はいずれも非ブロッカーで、archive 後の dogfooding-002 / follow-up で対応する運用が妥当。
