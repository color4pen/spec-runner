# Pipeline Context — review-exit-contract

## Paths

- **request-md**: openspec-workflow/requests/active/review-exit-contract/request.md
- **request-path**: openspec-workflow/requests/active/review-exit-contract
- **change-folder**: openspec/changes/review-exit-contract/
- **slug**: review-exit-contract
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-review-exit-contract
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: spec-change
- **branch**: change/review-exit-contract

## Workflow Options

- enabled: [test-case-generator, adr, pattern-reviewer]

## Spec Review Configuration

- **agents**: architect (default), pattern-reviewer (enabled)
- **emphasis**: review 系 step の出口契約一致 / agent prompt と capability 宣言の整合 / Managed Agents 制約と openspec-workflow 参照実装の差分の正当化 / filename suffix の dynamic 計算
- **result**: openspec-workflow/requests/active/review-exit-contract/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**:
  - spec-review agent が result file を origin に commit + push した上で end_turn する E2E 経路
  - code-review.ts の `capabilities.gitWrite` が true である構成検証
  - `specReviewResultNotFoundError` / `codeReviewResultNotFoundError` が iteration 引数から動的に正しい filename suffix (`-001` 等) を生成する
  - executor が GitHub から fetch する result filename と agent が書く filename が `{step}-result-{NNN}.md` 形式で一致する

## Code Review Configuration

- **emphasis**: prompt と capability 宣言の整合 / error hint factory が iteration を引数化していること / regression 0（既存 491 tests PASS）

## Module Analysis Configuration

- (Step 2.5 は enabled に module-architect が無いため未実施)

## Notes

- model-context-size: 1M
- model-context-size-source: request-meta
- step skips:
  - skipped: Step 1.6 cleanup-stale-knowledge, reason: spec-change だが technology-replacement ではなく contract-unification（旧/新技術名が存在しない）
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer (spec-review), reason: enabled-absent(security-reviewer)
  - skipped: Step 6 security-reviewer (code-review), reason: enabled-absent(security-reviewer)
- retries:
  - Step 3 spec-review: 1 retry (iter1 needs-fix HIGH×2 → spec-fixer → iter2 approved)
  - Step 6 code-review: 1 retry (iter1 needs-fix HIGH×1 → code-fixer → iter2 approved)
- Step 9.5 実行履歴:
  - Step 9.5: recommended: [module-architect]

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md
