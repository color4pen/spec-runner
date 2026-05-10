## 1. パスユーティリティモジュールの新設

- [x] 1.1 `src/util/paths.ts` を作成し、以下の関数を実装する:
  - `changeFolderPath(slug: string): string` → `openspec/changes/${slug}`
  - `specReviewResultPath(slug: string, iteration: number): string` → `openspec/changes/${slug}/spec-review-result-${nnn}.md`
  - `reviewFeedbackPath(slug: string, iteration: number): string` → `openspec/changes/${slug}/review-feedback-${nnn}.md`
  - `verificationResultPath(slug: string): string` → `openspec/changes/${slug}/verification-result.md`
  - `prCreateResultPath(slug: string): string` → `openspec/changes/${slug}/pr-create-result.md`
  - `requestMdPath(slug: string): string` → `openspec/changes/${slug}/request.md`
  - `changesDirRel(): string` → `openspec/changes`
  - `specsDirRel(): string` → `openspec/specs`
- [x] 1.2 `tests/util/paths.test.ts` を作成し、全関数の出力を検証する（iteration の zero-padding 含む）

## 2. step の result file path 置換

- [x] 2.1 `src/core/step/spec-review.ts`: `buildFindingsPath` の実装を `specReviewResultPath` の re-export に変更する
- [x] 2.2 `src/core/step/code-review.ts`: `buildReviewFeedbackPath` の実装を `reviewFeedbackPath` の re-export に変更する
- [x] 2.3 `src/core/step/verification.ts`: `resultFilePath` 内の literal を `verificationResultPath(deps.slug)` に置換する。`parseResult` 内の `findingsPath` 構築も同様
- [x] 2.4 `src/core/step/pr-create.ts`: `resultFilePath` 内の literal を `prCreateResultPath(deps.slug)` に置換する
- [x] 2.5 `src/core/verification/runner.ts`: line 220 の `path.join(cwd, "openspec", "changes", slug, "verification-result.md")` を `path.join(cwd, verificationResultPath(slug))` に置換する
- [x] 2.6 `src/core/verification/propagate.ts`: `VERIFICATION_RESULT_REL_PATH` 関数を `verificationResultPath` に置換する。line 40 の sourceFile 構築も同様

## 3. fixer / implementer step のプロンプト内パス置換

- [x] 3.1 `src/core/step/implementer.ts`: message 内の `openspec/changes/${slug}` を `changeFolderPath(slug)` に置換する
- [x] 3.2 `src/core/step/spec-fixer.ts`: message 内の `openspec/changes/${slug}` を `changeFolderPath(slug)` に置換する
- [x] 3.3 `src/core/step/code-fixer.ts`: message 内の `openspec/changes/${deps.slug}` を `changeFolderPath(deps.slug)` に置換する
- [x] 3.4 `src/core/step/build-fixer.ts`: message 内の `openspec/changes/${deps.slug}` を `changeFolderPath(deps.slug)` に置換する

## 4. system prompt のパスリテラル置換

- [x] 4.1 `src/prompts/propose-system.ts`: 全ての `openspec/changes/` リテラル（template literal 内含む）を `changeFolderPath()` / `changesDirRel()` / `specsDirRel()` 経由に置換する
- [x] 4.2 `src/prompts/spec-review-system.ts`: `openspec/changes/` リテラルを関数経由に置換する
- [x] 4.3 `src/prompts/test-case-gen-system.ts`: `changeFolder` 変数の構築を `changeFolderPath(slug)` に置換する
- [x] 4.4 `src/prompts/code-review-system.ts`: instruction text 内のパス参照を関数経由に置換する

## 5. finish 関連モジュールのパス置換

- [x] 5.1 `src/core/finish/archive-openspec.ts`: line 73 の `path.join(cwd, "openspec", "changes", slug)` を `path.join(cwd, changeFolderPath(slug))` に置換する。line 80 の warning メッセージも同様
- [x] 5.2 `src/core/finish/preflight.ts`: line 203 の `path.join(checkCwd, "openspec", "changes", slug)` を `path.join(checkCwd, changeFolderPath(slug))` に置換する。line 207 の warning メッセージも同様
- [x] 5.3 `src/cli/finish.ts`: line 75 の `path.join(opts.cwd, "openspec", "changes", opts.slug, "request.md")` を `path.join(opts.cwd, requestMdPath(opts.slug))` に置換する

## 6. dynamic-context / errors / adapter のパス置換

- [x] 6.1 `src/git/dynamic-context.ts`: `path.join(cwd, "openspec", "specs")` を `path.join(cwd, specsDirRel())` に、`path.join(cwd, "openspec", "changes")` を `path.join(cwd, changesDirRel())` に置換する
- [x] 6.2 `src/errors.ts`: `specReviewResultNotFoundError` と `codeReviewResultNotFoundError` 内のパスリテラルを `specReviewResultPath()` / `reviewFeedbackPath()` 経由に置換する
- [x] 6.3 `src/adapter/managed-agent/agent-runner.ts`: line 226 の `openspec/changes/${ctx.slug}` を `changeFolderPath(ctx.slug)` に置換する

## 7. テストのパスリテラル置換

- [x] 7.1 `tests/core/steps/spec-review.test.ts`: `buildFindingsPath` の assertion と hardcoded path を `specReviewResultPath` import 経由に置換する
- [x] 7.2 `tests/unit/step/code-review.test.ts`: `buildReviewFeedbackPath` assertion と hardcoded path を `reviewFeedbackPath` import 経由に置換する
- [x] 7.3 `tests/pipeline-integration.test.ts`: path 構築を関数経由に置換する
- [x] 7.4 `tests/test-case-gen-step.test.ts`: `openspec/changes/my-change` の assertion を `changeFolderPath("my-change")` に置換する
- [x] 7.5 `tests/prompts/spec-fixer-system.test.ts`: hardcoded path を関数経由に置換する
- [x] 7.6 `tests/cli-run-verdict.test.ts`: path リテラルを関数経由に置換する
- [x] 7.7 `tests/spec-review-step.test.ts`: path リテラルを関数経由に置換する
- [x] 7.8 `tests/finish-archive-openspec.test.ts`: `openspec/changes/my-feature` を `changeFolderPath("my-feature")` に置換する
- [x] 7.9 `tests/store/job-state-store.test.ts`, `tests/state/io.test.ts`, `tests/state/helpers.test.ts`: path リテラルを関数経由に置換する
- [x] 7.10 `tests/prompts/dynamic-context-prompts.test.ts`: `reviewFeedbackPath` import 経由に置換する
- [x] 7.11 `tests/unit/core/pr-create/body-template.test.ts`: path リテラルを関数経由に置換する
- [x] 7.12 `tests/unit/core/pipeline/pipeline.transitions.test.ts`: path リテラルを関数経由に置換する
- [x] 7.13 `tests/core/step/step-interface.test.ts`, `tests/unit/core/step/types.test.ts`: path リテラルを関数経由に置換する
- [x] 7.14 `tests/git/dynamic-context.test.ts`: `openspec/specs`, `openspec/changes` の構築を `specsDirRel()` / `changesDirRel()` に置換する
- [x] 7.15 fixture JSON ファイル（`tests/fixtures/legacy-job-state-post-pr24.json`）は変更しない（互換性テスト用データ）

## 8. 最終検証

- [x] 8.1 `bun run typecheck` が green であることを確認する
- [x] 8.2 `bun run test` が green であることを確認する
- [x] 8.3 ソースコード（テスト含む）を `openspec/changes/` で grep し、`changeFolderPath` の実装内部以外にリテラルが残っていないことを確認する（fixture JSON は除外）
