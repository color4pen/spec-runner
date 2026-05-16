# Implementation Notes: github-token-source-visibility

## Status

- **result**: completed
- **tasks_completed**: 6/6

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/preflight.ts` | modified | `logInfo` import 追加。`PreflightResult` に `githubTokenSource: "credentials" \| "env"` field 追加。`runPreflight` で `resolveGitHubToken` の `source` を保持し info ログ出力、return に含める |
| `src/core/doctor/types.ts` | modified | `DoctorContext` に `githubTokenSource: "credentials" \| "env" \| null` field 追加 |
| `src/cli/doctor.ts` | modified | `githubTokenSource` 変数を宣言し `resolveGitHubToken` の `source` を保持。`DoctorContext` 組み立て時に `githubTokenSource` を注入 |
| `src/core/doctor/checks/config/github-token-present.ts` | modified | pass 時の message に `ctx.githubTokenSource` を使った source ラベルを付加 |
| `tests/core/doctor/mock-context.ts` | modified | `buildMockContext` のデフォルトに `githubTokenSource: "credentials"` を追加 |
| `tests/core/doctor/checks/config/github-token-present.test.ts` | modified | TC-05〜08 のテストケース追加（source label の検証、null 防御の確認） |
| `tests/core/preflight.test.ts` | created | TC-01〜04 を実装。`resolveGitHubToken` / `logInfo` を vi.mock でスパイ。credentials/env の両ソースで `githubTokenSource` と `logInfo` 呼び出しを検証 |
| `specrunner/changes/github-token-source-visibility/tasks.md` | modified | 全タスクを完了マーク（`[x]`）に更新 |

## Blocked Tasks

なし

## Test Cases Coverage

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-01 | must | implemented | tests/core/preflight.test.ts |
| TC-02 | must | implemented | tests/core/preflight.test.ts |
| TC-03 | must | implemented | tests/core/preflight.test.ts |
| TC-04 | must | implemented | tests/core/preflight.test.ts |
| TC-05 | must | implemented | tests/core/doctor/checks/config/github-token-present.test.ts |
| TC-06 | must | implemented | tests/core/doctor/checks/config/github-token-present.test.ts |
| TC-07 | must | implemented | tests/core/doctor/checks/config/github-token-present.test.ts |
| TC-08 | should | implemented | tests/core/doctor/checks/config/github-token-present.test.ts |
| TC-09 | must | verified by typecheck | bun run typecheck pass |
| TC-10 | must | verified by typecheck | bun run typecheck pass |
| TC-11 | must | verified by typecheck | bun run typecheck pass |
| TC-12 | must | verified by typecheck | bun run typecheck pass |
| TC-13 | should | verified by test helper default | mock-context.ts default = "credentials" |
| TC-14 | should | verified by existing tests | github-token-valid.test.ts に "(source:" なし |
| TC-15 | must | verified | bun run typecheck && bun run test: 162 files, 1909 tests passed |

## Verification Results

- `bun run typecheck`: exit 0（型エラーなし）
- `bun run test`: 162 test files, 1909 tests passed
