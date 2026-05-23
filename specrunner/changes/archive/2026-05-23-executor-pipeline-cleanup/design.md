# Design: executor-pipeline-cleanup

## Overview

executor.ts (495 行) から commit/push 関連ロジック (~100 行) を `src/core/step/commit-push.ts` に抽出し、pipeline.ts の同型 stdout 3 箇所を private method に集約する。振る舞い不変の構造リファクタ。

## Decision 1: commit-push の配置

**選択**: `src/core/step/commit-push.ts` (step/ ディレクトリの sibling file)

**理由**:
- commit/push は step 実行後の後処理であり、step ライフサイクルと同じドメインに属する
- 既に `executor-helpers.ts` が sibling file パターンで存在しており、慣習に合致
- `src/core/git/` や `src/util/` に置くと、step 固有の概念 (`AgentStep.requiresCommit`, authority spec guard) が汎用レイヤーに漏出する
- `gitExec` / `gitExecExitCode` は引き続き `util/git-exec.ts` から import する (既存の低レベル層は触らない)

## Decision 2: commit-push の API 形式

**選択**: Free functions + dependency object (class 不使用)

**理由**:
- `executor-helpers.ts` と同じパターン (pure functions with deps passed in)
- `commitAndPush` / `pushOnly` は instance state を持たない — `spawnFn`, `sleepFn`, `events` を都度受け取れば十分
- class にすると StepExecutor が CommitPushService を construct/hold する間接層が増えるだけ

**API**:

```ts
// Infrastructure deps for commit/push operations
export interface CommitPushInfra {
  spawnFn: SpawnFn;
  sleepFn: (ms: number) => Promise<void>;
  events: EventBus;
}

// Pure function — authority spec 検出
export function findAuthoritySpecViolations(filePaths: string[]): string[];

// Stage → commit → push (with authority spec guard & agent self-commit tolerance)
export async function commitAndPush(
  step: AgentStep,
  state: JobState,
  deps: PipelineDeps,
  headBeforeStep: string | null,
  infra: CommitPushInfra,
): Promise<void>;

// Push with one retry (5s sleep between attempts)
export async function pushOnly(
  branch: string,
  cwd: string,
  stepName: string,
  infra: CommitPushInfra,
): Promise<void>;
```

StepExecutor 側の呼び出し:

```ts
// constructor で一度だけ作る
private readonly commitPushInfra: CommitPushInfra;

// runAgentStep 内
await commitAndPush(step, state, deps, headBeforeStep, this.commitPushInfra);
```

## Decision 3: pipeline の stdout 共通化

**選択**: Pipeline class の private method

**理由**:
- 3 箇所とも `this.steps.has(STEP_NAMES.SPEC_REVIEW)` のガード + `getLatestStepResult` + `stdoutWrite` で構成
- `this.steps` (Map) にアクセスするため class method が自然
- free function にすると `steps: Map<string, Step>` を引数で渡す必要があり、冗長

**API**:

```ts
private printPipelineFinished(state: JobState): void {
  if (!this.steps.has(STEP_NAMES.SPEC_REVIEW)) return;
  const specReviewResults = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
  const finalVerdict = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW)?.verdict ?? "escalation";
  stdoutWrite(
    `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
  );
}
```

各呼び出し箇所 (L262-268, L320-326, L346-352) → `this.printPipelineFinished(state);` に置換。

## Decision 4: テスト戦略

- `tests/unit/step/executor.commit.test.ts` の既存テスト (TC-CAP-NEW-001〜008, TC-AUTH-01〜06) はそのまま green を維持
  - import 先が `commit-push.ts` の free function に変わるが、テストは StepExecutor 経由で呼び出しているため変更不要
- `commit-push.ts` の unit test は新設しない (既存テストが StepExecutor 経由で十分カバー)
- pipeline の stdout テスト (`pipeline.loop-iter-stdout.test.ts` 等) もそのまま green を維持

## 移動対象の詳細

### executor.ts → commit-push.ts に移動

| 要素 | 行 (現在) | 備考 |
|------|-----------|------|
| `AUTHORITY_SPEC_PREFIX` const | L24 | commit-push 内部定数に |
| `findAuthoritySpecViolations()` | L27-29 | export |
| `commitAndPush()` | L272-338 | export, `this.*` を `infra.*` に置換 |
| `pushOnly()` | L345-363 | export, `this.*` を `infra.*` に置換 |

### executor.ts に残るもの

- `execute()` / `runStepInternal()` / `runAgentStep()` / `runCliStep()` / `finalizeStep()` — step ライフサイクル
- `getStore()` / store cache — state 永続化
- `commitAndPush` の呼び出し箇所 (L233-246) — catch ハンドラも含めそのまま維持、委譲先が変わるだけ

## 振る舞い保持チェックリスト

- [ ] `commitAndPush` のエラー catch (executor.ts L234-246) が `AUTHORITY_SPEC_EDIT_VIOLATION` / `PUSH_FAILED` を state に記録する経路は不変
- [ ] `requiresCommit` guard の silent exit 経路は不変
- [ ] `tryPush` の 5 秒 retry (sleepFn injectable) は不変
- [ ] agent self-commit 検出 → `stderrWrite` + `pushOnly` 経路は不変
- [ ] pipeline の stdout 文言が `Pipeline finished: spec-review iterations=N, final verdict=V\n` のまま不変
