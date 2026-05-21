# Design: StepContext.repo フィールド廃止

## Summary

`StepContext.repo` を型定義レベルで削除し、3 runner の `stepCtx` 組み立て、spec-review プロンプトの `Repository:` 行、および `buildDeps()` シグネチャまでの一連の伝搬経路を構造的に除去する。

## Design Decisions

### D1: StepContext.repo 削除と PipelineDeps への波及

`PipelineDeps extends StepContext` のため、`StepContext` から `repo` を削除すると `PipelineDeps` からも自動消滅する。下流で `deps.repo` を読む箇所は `spec-review.ts:117` の 1 箇所のみであり、これも同時に削除する。

### D2: buildDeps() シグネチャの repo パラメータ除去

`RuntimeStrategy.buildDeps()` は `repo` を受け取って `PipelineDeps.repo` にセットするだけ。フィールドが消えるのでパラメータも不要になる。以下が連鎖的に影響を受ける:

- `RuntimeStrategy.buildDeps()` interface (strategy.ts:114)
- `LocalRuntime.buildDeps()` (local.ts:258)
- `ManagedRuntime.buildDeps()` (managed.ts:161)
- `CommandRunner.execute()` の `buildDeps()` 呼び出し (runner.ts:119)
- `PrepareResult.repo` field (runner.ts:53)

### D3: ManagedAgentRunner.repo の維持

`ManagedAgentRunner` は constructor で受け取った `this.repo` を GitHub API 呼び出し (branch verification, session creation, result fetch) で 10 箇所以上使用している。`StepContext.repo` 廃止とは独立した系統であり、**維持する**。

`ManagedRuntime` の constructor も `repo` を受け取り `this.repo` に保持して `createAgentRunner()` に渡しており、これも維持。

### D4: PrepareResult.repo の削除

`PrepareResult.repo` は `buildDeps()` に渡す中継目的のみ。`buildDeps()` からパラメータが消えるので `PrepareResult` からも削除する。ただし `preflight()` は引き続き `repo` を算出して `state.repository` に記録するため、`preflight()` 側の `getOriginInfo()` 呼び出しとその戻り値型は維持。

### D5: spec-review プロンプトからの Repository 行削除

`SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` から `Repository: {{REPOSITORY}}` 行を削除し、`.replace(/{{REPOSITORY}}/g, ...)` と `SpecReviewPromptInput.repository` field も削除する。spec-review の AI 動作に影響なし (挨拶的文脈表示のみ)。

### D6: テスト fixture への影響

`PipelineDeps` / `StepContext` を組み立てるテスト fixture (pipeline-integration.test.ts, spec-review.test.ts, step-interface.test.ts, etc.) から `repo:` プロパティを削除する。`buildRepo()` ヘルパー自体は `ManagedAgentRunner` のテストで引き続き使用されるため削除しない。

### D7: OriginInfo import の整理

`src/core/types.ts` から `OriginInfo` の import を削除する。`OriginInfo` 型自体 (`src/git/remote.ts`) は `preflight` / `state` / `ManagedRuntime` で継続使用。

## Affected Files

| File | Change |
|------|--------|
| `src/core/types.ts` | `repo: OriginInfo` field + import 削除 |
| `src/core/runtime/strategy.ts` | `buildDeps()` から `repo` param + import 削除 |
| `src/core/runtime/local.ts` | `buildDeps()` signature + body から `repo` 削除 |
| `src/core/runtime/managed.ts` | `buildDeps()` signature + body から `repo` 削除 |
| `src/core/command/runner.ts` | `PrepareResult.repo` 削除 + `buildDeps()` 呼び出し更新 |
| `src/core/step/spec-review.ts` | `repository:` 引数削除 |
| `src/prompts/spec-review-system.ts` | template 行 + replace + type field 削除 |
| `src/adapter/claude-code/agent-runner.ts` | `repo:` 行削除 |
| `src/adapter/codex/agent-runner.ts` | `repo:` 行削除 |
| `src/adapter/managed-agent/agent-runner.ts` | `stepCtx` の `repo:` 行削除 |
| `tests/pipeline-integration.test.ts` | deps fixture から `repo:` 削除 |
| `tests/error-codes.test.ts` | deps fixture から `repo:` 削除 |
| `tests/cli-stdout-snapshot.test.ts` | deps fixture から `repo:` 削除 |
| `tests/test-case-gen-step.test.ts` | deps fixture から `repo:` 削除 |
| `tests/core/steps/spec-review.test.ts` | deps fixture + assertion 更新 |
| `tests/core/step/step-interface.test.ts` | deps fixture 更新 |
| `tests/prompts/spec-review-system.test.ts` | `repository:` 引数削除 + assertion 更新 |
| `tests/unit/step/*.test.ts` | fixture から `repo:` 削除 (executor, review-exit-contract, code-review, build-fixer, spec-fixer, code-fixer, implementer, verification, pr-create, code-review-verdict, commit-and-push, spec-review-lightweight の各テスト) |
| `tests/spec-review-step.test.ts` | fixture から `repo:` 削除 |
| `specrunner/specs/step-execution-architecture/spec.md` | `StepContext` 定義 (L319) および `repo` 参照シナリオ (L336, L354) から `repo: OriginInfo` を削除 |

## Not Changed

- `src/git/remote.ts` — `OriginInfo` 型定義維持
- `src/core/preflight.ts` — `getOriginInfo()` 呼び出し維持 (state.repository 記録用)
- `src/state/schema.ts` — `JobState.repository` 維持
- `src/adapter/managed-agent/agent-runner.ts` の `this.repo` field — GitHub API 用に維持
- `src/core/runtime/managed.ts` の constructor `repo` param — createAgentRunner() 用に維持
- `specrunner/specs/agent-runner-port/spec.md` — `StepContext.repo` の記述なし。MODIFIED 不要
- `specrunner/specs/spec-review-session/spec.md` — repository 情報をプロンプトに渡す記述なし。MODIFIED 不要
