# Tasks: StepContext.repo フィールド廃止

## Task 1: spec-review プロンプトから Repository 行を削除 [x]

**File**: `src/prompts/spec-review-system.ts`

1. `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` (L85) から `Repository: {{REPOSITORY}}` 行を削除
2. `SpecReviewPromptInput` interface (L105) から `repository: string` field を削除
3. `buildSpecReviewInitialMessage()` (L191) から `.replace(/{{REPOSITORY}}/g, input.repository)` 行を削除

## Task 2: spec-review step の呼び出し側を更新 [x]

**File**: `src/core/step/spec-review.ts`

1. `buildMessage()` (L117) で `buildSpecReviewInitialMessage()` に渡す引数から `repository: \`${deps.repo.owner}/${deps.repo.name}\`` を削除

## Task 3: StepContext 型から repo フィールドを削除 [x]

**File**: `src/core/types.ts`

1. L25 の `repo: OriginInfo;` 行を削除
2. L5 の `import type { OriginInfo } from "../git/remote.js";` を削除 (他に OriginInfo の参照がないことを確認)

## Task 4: RuntimeStrategy.buildDeps() から repo パラメータを削除 [x]

**File**: `src/core/runtime/strategy.ts`

1. `buildDeps()` signature (L114) から `repo: OriginInfo` パラメータを削除
2. `import type { OriginInfo }` (L13) を削除

## Task 5: LocalRuntime.buildDeps() を更新 [x]

**File**: `src/core/runtime/local.ts`

1. `buildDeps()` (L258) の signature から `repo: OriginInfo` パラメータを削除
2. 返り値オブジェクト (L266) から `repo,` 行を削除
3. L13 の `OriginInfo` import を削除 (他参照がなければ)

## Task 6: ManagedRuntime.buildDeps() を更新 [x]

**File**: `src/core/runtime/managed.ts`

1. `buildDeps()` (L161) の signature から `repo: OriginInfo` パラメータを削除
2. 返り値オブジェクト (L169) から `repo,` 行を削除
3. `OriginInfo` import (L14) は constructor 引数で使用しているため **維持**

## Task 7: CommandRunner から repo 伝搬を削除 [x]

**File**: `src/core/command/runner.ts`

1. `PrepareResult` interface (L53) から `repo: OriginInfo;` field を削除
2. `execute()` 内 (L79) のデストラクチャリングから `repo` を削除
3. `buildDeps()` 呼び出し (L119) から `repo` 引数を削除
4. L33 の `import type { OriginInfo }` を削除 (他参照がなければ)

## Task 8: 各 runner の stepCtx 組み立てから repo を削除 [x]

**Files**:
- `src/adapter/claude-code/agent-runner.ts`: L79 の `repo: { owner: "", name: "" },` を削除
- `src/adapter/codex/agent-runner.ts`: L99 の `repo: { owner: "", name: "" },` を削除
- `src/adapter/managed-agent/agent-runner.ts`: L315 の `repo: this.repo,` を削除

## Task 9: preflight の PrepareResult 組み立てから repo を除外 [x]

**File**: 各 CommandRunner 実装 (PipelineRunCommand, ResumeCommand 等) の `prepare()` メソッド

- `PrepareResult` に `repo` を含めていた箇所を grep し削除
- `preflight()` の戻り値から `repo` を destructure している箇所を更新 (`state.repository` への記録は preflight 内で完結しているはずだが、確認して対処)

## Task 10: テスト fixture の更新 [x]

`bun run typecheck` で検出される全 fixture を対象とし、`PipelineDeps` / `StepContext` fixture から `repo:` プロパティを削除する。既知の対象ファイルは以下の通りだが、漏れは型チェックで補足する:

- `tests/pipeline-integration.test.ts` — 全 `repo: buildRepo()` を削除 (約 20 箇所)
- `tests/error-codes.test.ts` — `repo: { owner: "testowner", name: "testrepo" }` を削除
- `tests/cli-stdout-snapshot.test.ts` — 同上
- `tests/test-case-gen-step.test.ts` — 同上
- `tests/core/steps/spec-review.test.ts` — deps fixture + `stepCtx` 組み立てから `repo:` 削除
- `tests/core/step/step-interface.test.ts` — deps fixture + `stepCtx` 組み立てから `repo:` 削除
- `tests/spec-review-step.test.ts` — deps fixture から `repo:` 削除
- `tests/unit/step/executor.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/review-exit-contract.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/code-review.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/build-fixer.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/spec-fixer.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/code-fixer.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/implementer.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/verification.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/pr-create.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/code-review-verdict.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/commit-and-push.test.ts` — fixture から `repo:` 削除
- `tests/unit/step/spec-review-lightweight.test.ts` — fixture から `repo:` 削除

## Task 11: spec-review プロンプトテストの更新 [x]

**File**: `tests/prompts/spec-review-system.test.ts`

1. `buildSpecReviewInitialMessage()` 呼び出しから `repository: "owner/repo"` 引数を削除 (約 6 箇所)
2. `deps` fixture から `repo:` を削除 (L205, L246)
3. 出力に `Repository:` が含まれないことを確認する assertion があれば更新 (含まれる assertion があれば削除)

## Task 12: 型チェック・テスト通過確認 [x]

```bash
bun run typecheck
bun run test
```

- `grep -rn "stepCtx\.repo" src/` が 0 件であることを確認
- `grep -rn "deps\.repo" src/` のヒットが `ManagedAgentRunnerDeps.repo` 系統のみであることを確認

## Verification Checklist

- [x] `bun run typecheck` pass
- [x] `bun run test` pass (162 files, 1924 tests)
- [x] `grep -rn "stepCtx\.repo" src/` → 0 件
- [x] `state.repository` / `OriginInfo` 型は維持されている
- [x] `ManagedAgentRunner.this.repo` は維持されている (GitHub API 用)
