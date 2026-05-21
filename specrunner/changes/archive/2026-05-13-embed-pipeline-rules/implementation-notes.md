# Implementation Notes: embed-pipeline-rules

## Status

- **result**: completed
- **tasks_completed**: 6/6

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/prompts/pipeline-rules.ts` | created | `PIPELINE_RULES` 定数を export。review-standards の Severity/Categories/Findings Format/Scoring/Verdict/Iteration Comparison セクションをキュレーションして埋め込み。Authority matrix/Output Contract/Skip-Status/参照リンク等のマルチエージェント固有セクションは除外 |
| `src/prompts/code-review-system.ts` | modified | `PIPELINE_RULES` import 追加。`## Review Standards` セクションを `## Pipeline Rules\n\n${PIPELINE_RULES}` に置換。inline の Severity/Verdict/Categories 定義を削除。JSDoc の review-standards.md 参照を pipeline-rules に更新。step 4 の `.claude/rules` 参照を削除 |
| `src/prompts/spec-review-system.ts` | modified | `PIPELINE_RULES` import 追加。`## Pipeline Rules\n\n${PIPELINE_RULES}` を `## Your Output` の前に挿入。inline `Severity levels: CRITICAL, HIGH, MEDIUM, LOW` 行を削除。`review-standards.md severity definitions` を `Pipeline Rules above` に変更 |
| `src/core/step/code-review.ts` | modified | `buildCodeReviewInitialMessage` の step 4 から `Read .claude/rules/review-standards.md` 参照を削除し `Refer to the Pipeline Rules in your system prompt` に変更 |
| `.claude/rules/review-standards.md` | deleted | `git rm` で削除。`.claude/rules/` ディレクトリも消滅（git は空ディレクトリを追跡しない） |
| `tests/prompts/pipeline-rules.test.ts` | created | TC-01〜08、TC-10〜12、TC-15〜18、TC-27 を vitest で実装（40 tests） |
| `specrunner/changes/embed-pipeline-rules/tasks.md` | modified | 全タスクを完了マーク（`[x]`）に更新 |

## Blocked Tasks

なし

## Test Cases Coverage

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-01 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-02 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-03 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-04 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-05 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-06 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-07 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-08 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-09 | must | verified by typecheck | bun run typecheck pass |
| TC-10 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-11 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-12 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-15 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-16 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-17 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-18 | must | implemented | tests/prompts/pipeline-rules.test.ts |
| TC-19 | must | verified by grep | grep -r ".claude/rules" src/ → 0 hits |
| TC-20 | must | verified by git rm | git ls-files .claude/rules/review-standards.md → empty |
| TC-21 | must | verified by grep | grep -r "review-standards" src/ → 0 hits |
| TC-22 | must | verified by grep | grep -r ".claude/rules" src/ → 0 hits |
| TC-23 | must | verified | bun run typecheck exit 0 |
| TC-24 | must | verified | bun run test 1706 tests passed |
| TC-27 | must | implemented | tests/prompts/pipeline-rules.test.ts |

## Verification Results

- `bun run typecheck`: exit 0（型エラーなし）
- `bun run test`: 144 test files, 1706 tests passed
- `grep -r "review-standards" src/`: 0 hits
- `grep -r ".claude/rules" src/`: 0 hits
