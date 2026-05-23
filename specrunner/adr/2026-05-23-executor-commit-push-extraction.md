# ADR-20260523: executor.ts から commit/push ロジックを step/commit-push.ts に抽出する

**Date**: 2026-05-23
**Status**: accepted

## Context

`src/core/step/executor.ts`（495 行）に 2 つの責務が同居していた:

1. **step ライフサイクル制御** — `execute` / `runAgentStep` / `runCliStep` / `finalizeStep`
2. **git commit/push 操作** — `findAuthoritySpecViolations` / `commitAndPush` / `pushOnly`（`tryPush` retry lambda 含む）約 100 行

両者は変更理由が独立している。authority spec 検出ルールの変更は step ライフサイクル制御に影響しない。低レベルの git プリミティブ（`gitExec` / `gitExecExitCode`）は既に `util/git-exec.ts` に分離されており、上位の commit/push ロジックを抽出する素地があった。

加えて `src/core/pipeline/pipeline.ts`（474 行）の 3 経路（loop 完了 / iteration exhaustion / fixer exhaustion）でほぼ同一の stdout フォーマット行が 3 重に存在し、出力フォーマットの変更が全箇所追跡を強いる構造になっていた。

## Decision

### D1: commit/push を `src/core/step/commit-push.ts` に配置する

`src/core/git/` や `src/util/` ではなく `src/core/step/` の sibling file として配置する。

**理由**:
- commit/push は step 実行後の後処理であり、step ドメインの概念（`AgentStep.requiresCommit`、authority spec guard）を直接扱う
- `src/core/git/` に置くと step 固有の概念が汎用レイヤーに漏出し cohesion が崩れる
- `src/util/` は低レベル git プリミティブ（`gitExec`）の層であり、JobState / AgentStep に依存する上位ロジックの置き場ではない
- `executor-helpers.ts` が sibling file パターンで既に存在しており、慣習に合致する

### D2: API 形式は free functions + dependency object（class 不使用）

```ts
export interface CommitPushInfra {
  spawnFn: SpawnFn;
  sleepFn: (ms: number) => Promise<void>;
  events: EventBus;
}

export function findAuthoritySpecViolations(filePaths: string[]): string[];
export async function commitAndPush(step, state, deps, headBeforeStep, infra): Promise<void>;
export async function pushOnly(branch, cwd, stepName, infra): Promise<void>;
```

**理由**:
- `executor-helpers.ts` と同じパターン（pure functions with deps passed in）
- `commitAndPush` / `pushOnly` は instance state を持たず、`spawnFn` / `sleepFn` / `events` を都度受け取れば十分
- class にすると `StepExecutor` が `CommitPushService` を construct/hold する間接層が増えるだけで、testability / readability の利益がない

`StepExecutor` は constructor で `CommitPushInfra` を一度だけ組み立て、`runAgentStep` 内で `await commitAndPush(step, state, deps, headBeforeStep, this.commitPushInfra)` として委譲する。

### D3: pipeline の stdout helper は Pipeline class の private method にする

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

**理由**:
- 3 箇所とも `this.steps`（`Map<string, Step>`）へのアクセスを含む
- free function にすると `steps` を引数で渡す必要があり冗長になる
- `Pipeline` クラス内の純粋な整形ロジックであり、外部 testability は不要（3 call site が同じ出力を生む回帰テストで十分）

## Alternatives Considered

### Alternative 1: commit/push を `src/core/git/` に配置する

- **Pros**: 「git 操作」という名前でまとまる
- **Cons**: `AgentStep.requiresCommit`・authority spec guard 等の step ドメイン概念が `src/core/git/` に漏出する。`util/git-exec.ts`（低レベル）との層の混同が起きる
- **Why not**: cohesion 優先で step/ に配置

### Alternative 2: commit/push を class（CommitPushService）として実装する

- **Pros**: DI パターンが明示的
- **Cons**: `commitAndPush` / `pushOnly` は状態を持たないため class 化のメリットがない。`executor-helpers.ts` の free functions パターンと乖離し一貫性が失われる
- **Why not**: 既存パターン（executor-helpers.ts）との一貫性を優先

### Alternative 3: pipeline helper を free function にする

- **Pros**: Pipeline クラスの外に出るため単体テストが書きやすい
- **Cons**: `steps: Map<string, Step>` を引数で渡す必要があり、caller 側が冗長になる。3 call site の回帰テストで十分カバーされるため testability のメリットが薄い
- **Why not**: class private method の方が呼び出しが簡潔

## Consequences

### Positive

- `executor.ts` が step ライフサイクル制御に専念し、責務が単一化された（495 行 → ~390 行）
- `commit-push.ts` として独立したモジュール境界が生まれ、git 後処理ロジックの変更局所化が可能になった
- `sleepFn` injectable な `tryPush` retry が `CommitPushInfra` 経由で testability を維持したまま移動できた
- pipeline の stdout フォーマット変更が `printPipelineFinished` 1 箇所で完結するようになった

### Negative

- `src/core/step/` に executor.ts / executor-helpers.ts / commit-push.ts と 3 ファイルが並ぶ。`commit-push.ts` が step/ に属することを知らない読者には配置が直感的でない可能性がある
- Combined サイズは executor.ts 削減分 + commit-push.ts 新設で実質横ばい（構造リファクタの必然的トレードオフ）

### Known Debt

- `commitAndPush` のエラー catch は `executor.ts` 側（呼び出し元）に残っており、`commit-push.ts` 内でエラーハンドリングが完結していない。将来 commit/push の error 種別を拡張する際は catch 経路の移動を検討する
- `pushOnly` の 5 秒 retry 間隔・試行回数はハードコードのまま（本 refactoring のスコープ外）

## References

- Request: `specrunner/changes/executor-pipeline-cleanup/request.md`
- Design: `specrunner/changes/executor-pipeline-cleanup/design.md`
- Related: `specrunner/adr/2026-05-23-managed-agent-runner-stage-extraction.md`（同型の構造リファクタ前例）
- Related: `specrunner/adr/2026-04-29-module-architecture-style.md`（hexagonal-lite + module-boundary 原則）
- Related: `specrunner/adr/2026-04-29-step-abstraction-implementation.md`（step ドメインの設計）
