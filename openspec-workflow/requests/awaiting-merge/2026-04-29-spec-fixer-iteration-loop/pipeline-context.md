# Pipeline Context

Step 1 で生成される共有メタデータ。各エージェントはこのファイルを読んで
パス情報・ワークフローオプション・構成を取得する。

## Paths

- **request-md**: openspec-workflow/requests/active/2026-04-29-spec-fixer-iteration-loop/request.md
- **request-path**: openspec-workflow/requests/active/2026-04-29-spec-fixer-iteration-loop
- **change-folder**: openspec/changes/2026-04-29-spec-fixer-iteration-loop/
- **slug**: 2026-04-29-spec-fixer-iteration-loop
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-29-spec-fixer-iteration-loop
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: new-feature
- **branch**: feat/2026-04-29-spec-fixer-iteration-loop

## Workflow Options

- enabled: [test-case-generator, adr, module-architect]

## Spec Review Configuration

- **agents**: architect (常時起動)
- **emphasis**: Managed Agents 制約への構造的対処、Pipeline 層の loop プリミティブ設計、JobState 互換性、Author-Bias Elimination
- **result**: openspec-workflow/requests/active/2026-04-29-spec-fixer-iteration-loop/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**:
  - iteration loop primitive (runLoopUntil) — body/evaluator/maxIterations/onExceeded の各分岐
  - spec-review needs-fix → spec-fixer → 再 spec-review の自動連鎖
  - retry 上限到達時の escalation verdict 確定と SPEC_REVIEW_RETRIES_EXHAUSTED エラーコード
  - JobState.steps[stepName] の配列化と StepResult.iteration フィールド
  - config 拡張 (agents.{propose, specReview, specFixer}) と backward compat（既存 config.agent.id へのフォールバック）
  - spec-fixer Agent の Custom Tools 不在（register_branch を含めない）

## Code Review Configuration

- **emphasis**: Pipeline loop の正しさ、StepResult 配列化の後方互換性、spec-fixer Agent 分離の構造的妥当性、iteration ログ出力

## Module Analysis Configuration

- **output**: openspec/changes/2026-04-29-spec-fixer-iteration-loop/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う

## Notes

- model-context-size: 1M
- model-context-size-source: user-prompt (Opus 4.7 1M context)
- step skips: なし（test-case-generator / adr / module-architect すべて enabled）
- retries: spec-review iter1 needs-fix→spec-fixer→iter2 approved; code-review iter1 needs-fix→code-fixer→iter2 approved
- depends-on: openspec-workflow/requests/merged/2026-04-29-spec-review-pipeline (PR #22, MERGED)
- Step 9.5: no candidates detected

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md（存在する場合）
