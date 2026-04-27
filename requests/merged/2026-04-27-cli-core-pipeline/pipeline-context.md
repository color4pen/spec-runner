# Pipeline Context

## Paths

- **request-md**: requests/active/2026-04-27-cli-core-pipeline/request.md
- **request-path**: requests/active/2026-04-27-cli-core-pipeline
- **change-folder**: openspec/changes/2026-04-27-cli-core-pipeline/
- **slug**: 2026-04-27-cli-core-pipeline
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-27-cli-core-pipeline
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: new-feature
- **branch**: feat/2026-04-27-cli-core-pipeline

## Workflow Options

- enabled: [test-case-generator, adr, module-architect, security-reviewer]

## Spec Review Configuration

- **agents**: architect, spec-reviewer, security-reviewer
- **emphasis**: 認証/認可フロー、外部 SDK 型定義、Custom Tool の冪等性、状態ファイル/設定ファイルのスキーマ、SSE/ポーリング両立の整合性
- **result**: requests/active/2026-04-27-cli-core-pipeline/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**:
  - request.md のパース（正常系 + 不正フォーマット）
  - GitHub Device Flow OAuth（成功 + 失敗/期限切れ）
  - Managed Agents セッション作成 + SSE で `register_branch` Custom Tool 応答
  - セッション完了検知（status: idle, stop_reason: end_turn のポーリング）
  - 状態ファイルの読み書き（`~/.local/share/specrunner/jobs/<id>.json`）
  - `specrunner init` での Agent + Environment 作成 + config 永続化
  - `specrunner ps` の状態ファイル一覧表示
  - エラーハンドリング（API key 未設定、GitHub トークン期限切れ、リポジトリ未マウント）

## Code Review Configuration

- **emphasis**:
  - Custom Tool 登録の出口/入口接続漏れ（Bug 1 の再発防止）
  - SSE break-after-completion パターン（feedback_sse_break_after_completion）
  - bun:* / Bun.* の import 禁止（feedback_mainstream_toolchain）
  - 外部 API + ファイル I/O の多段ロールバック保証
  - サイレント障害（エラーなし・機能しない）の検出可能性

## Module Analysis Configuration

- **output**: openspec/changes/2026-04-27-cli-core-pipeline/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う

## Notes

- model-context-size: 1M
- model-context-size-source: user-prompt
- step skips:
  - skipped: Step 9b distill-learnings, reason: threshold (last-distilled=2026-04-27, additions=0, threshold=5)
  - skipped: Step 9b observe-patterns instinct generation, reason: artifact-absent(docs/observations.jsonl)
- retries:
  - Step 3 spec-review: iter1 needs-fix → spec-fixer → iter2 approved (8.50)
  - Step 6 code-review: iter1 needs-fix → code-fixer → iter2 approved (7.30)
- Step 9.5 実行履歴:
  - Step 9.5: no candidates detected (only pattern-reviewer not in enabled, no matching keywords in review files)

## Shared Resources

- **constraints**: docs/constraints.md
- **review-lessons**: docs/review-lessons.md（存在する場合）
