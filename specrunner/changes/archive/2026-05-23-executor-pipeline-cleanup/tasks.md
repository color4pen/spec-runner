# Tasks: executor-pipeline-cleanup

## Task 1: commit-push.ts を新設し、commit/push ロジックを移動 [x]

### 1.1 `src/core/step/commit-push.ts` を作成

以下を executor.ts から移動:

- `AUTHORITY_SPEC_PREFIX` 定数 (L24)
- `findAuthoritySpecViolations()` 関数 (L27-29) — export
- `commitAndPush()` メソッド本体 (L272-338) — free function として export
- `pushOnly()` メソッド本体 (L345-363) — free function として export

dependency 注入用の interface を定義:

```ts
export interface CommitPushInfra {
  spawnFn: SpawnFn;
  sleepFn: (ms: number) => Promise<void>;
  events: EventBus;
}
```

import 対象:
- `AgentStep` from `./types.js`
- `JobState` from `../../state/schema.js`
- `PipelineDeps` from `../types.js`
- `EventBus` from `../event/event-bus.js`
- `gitExec`, `gitExecExitCode`, `SpawnFn` from `../../util/git-exec.js`
- `stderrWrite` from `../../logger/stdout.js`
- `noCommitDetectedError`, `pushFailedError`, `authoritySpecEditViolationError` from `../../errors.js`

`this.spawnFn` → `infra.spawnFn`、`this.sleepFn` → `infra.sleepFn`、`this.events` → `infra.events` に機械的に置換。

### 1.2 executor.ts から移動済みコードを削除し、import + 委譲に変更

- `AUTHORITY_SPEC_PREFIX`, `findAuthoritySpecViolations`, `commitAndPush` (private method), `pushOnly` (private method) を削除
- `import { commitAndPush, CommitPushInfra } from "./commit-push.js"` を追加
- constructor で `this.commitPushInfra` を初期化:
  ```ts
  private readonly commitPushInfra: CommitPushInfra;
  // constructor 内:
  this.commitPushInfra = { spawnFn: this.spawnFn, sleepFn: this.sleepFn, events: this.events };
  ```
- L234 の呼び出しを変更:
  ```ts
  // before: await this.commitAndPush(step, state, deps, headBeforeStep)
  // after:
  await commitAndPush(step, state, deps, headBeforeStep, this.commitPushInfra);
  ```
- executor.ts から不要になった import を削除:
  - `noCommitDetectedError`, `pushFailedError`, `authoritySpecEditViolationError` (errors.ts から)
  - `stderrWrite` (logger/stdout.ts から) — ただし他で使っていないか確認

### 1.3 検証

- `bun run typecheck` が green
- `bun run test -- tests/unit/step/executor.commit.test.ts` が全 14 テスト green
- `bun run test -- tests/unit/step/executor.test.ts` が green

---

## Task 2: pipeline.ts の `Pipeline finished` stdout を private method に集約 [x]

### 2.1 `printPipelineFinished` private method を Pipeline class に追加

```ts
/** Print the "Pipeline finished" summary line if spec-review was in the pipeline. */
private printPipelineFinished(state: JobState): void {
  if (!this.steps.has(STEP_NAMES.SPEC_REVIEW)) return;
  const specReviewResults = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
  const finalVerdict = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW)?.verdict ?? "escalation";
  stdoutWrite(
    `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
  );
}
```

### 2.2 3 箇所の呼び出しを置換

1. **L262-268** (terminal conditions 内): 6 行のブロック → `this.printPipelineFinished(state);`
2. **L320-326** (loop exhaustion 内): 6 行のブロック → `this.printPipelineFinished(state);`
3. **L346-352** (fixer exhaustion 内): 6 行のブロック → `this.printPipelineFinished(state);`

### 2.3 検証

- `bun run typecheck` が green
- `bun run test -- tests/core/pipeline/pipeline.test.ts` が green
- `bun run test -- tests/core/pipeline/pipeline.loop-iter-stdout.test.ts` が green (stdout 文言不変の確認)

---

## Task 3: 全体検証 [x]

- `bun run typecheck && bun run test` が green
- executor.ts の行数が ~100 行減少していること (目視確認、努力目標)
- pipeline.ts の重複ブロックが消えていること (目視確認)
