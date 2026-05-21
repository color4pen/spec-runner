# Tasks: implementer-self-commit-tolerance

## Task 1: executor HEAD 比較判定の追加

**File**: `src/core/step/executor.ts`

### 1-1. `runAgentStep` 冒頭で HEAD SHA を取得

`runAgentStep` の `runner.run(ctx)` 呼び出し前に:

```ts
const headBeforeStep = await gitExec(this.spawnFn, deps.cwd ?? process.cwd(), ["rev-parse", "HEAD"]);
```

### 1-2. `commitAndPush` に `headBeforeStep` パラメータを追加

signature を拡張:

```ts
private async commitAndPush(
  step: AgentStep,
  state: JobState,
  deps: PipelineDeps,
  headBeforeStep: string | null,
): Promise<void>
```

呼び出し側 (L208) も引数追加。

### 1-3. staged 0 時の HEAD 比較ロジック

`commitAndPush` 内の `if (!hasChanges)` ブロックを以下に変更:

```ts
if (!hasChanges) {
  if (step.requiresCommit) {
    // Check if HEAD advanced (agent self-committed)
    const headAfterStep = await gitExec(this.spawnFn, cwd, ["rev-parse", "HEAD"]);
    if (headBeforeStep && headAfterStep && headAfterStep !== headBeforeStep) {
      // Agent authored commit(s) — push only
      stderrWrite("Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is.\n");
      await this.pushOnly(branch);
      return;
    }
    throw noCommitDetectedError(step.name, branch);
  }
  // No changes and requiresCommit is falsy — silently skip
  return;
}
```

### 1-4. `pushOnly` private メソッド追加

push retry ロジックを `commitAndPush` から抽出した push-only 経路:

```ts
private async pushOnly(branch: string, cwd: string, stepName: string): Promise<void> {
  const tryPush = () => gitExecExitCode(this.spawnFn, cwd, ["push", "origin", branch]);

  const firstPushCode = await tryPush();
  if (firstPushCode === 0) {
    this.events.emit("commit:push" as Parameters<EventBus["emit"]>[0], { step: stepName, branch } as never);
    return;
  }

  await this.sleepFn(5000);
  const secondPushCode = await tryPush();
  if (secondPushCode === 0) {
    this.events.emit("commit:push" as Parameters<EventBus["emit"]>[0], { step: stepName, branch } as never);
    return;
  }

  throw pushFailedError(stepName, branch, `exit code ${secondPushCode}`);
}
```

既存の `commitAndPush` 内の push 部分もこの `pushOnly` を呼ぶようリファクタ。

- [x] Task 1 完了

## Task 2: prompt commit-discipline fragment の作成

**File**: `src/prompts/commit-discipline.ts` (新規)

```ts
/**
 * Git commit discipline rule injected into all `requiresCommit: true` step prompts.
 * Centralizes the "no manual git operations" rule so the wording does not drift
 * across implementer / spec-fixer / code-fixer / build-fixer / delta-spec-fixer.
 */
export const COMMIT_DISCIPLINE_RULE = `## git operations

あなたは file edit のみ行ってください。\`git add\` / \`git commit\` / \`git push\` の実行は禁止です。
commit / push は pipeline executor が一括で行います。違反して自主 commit してしまっても pipeline は halt せず agent commit を許容しますが、commit message format が pipeline 規定 (\`<step>: <slug>\`) から外れて履歴が読みづらくなるため、必ず file edit のみで完了してください。
`;
```

- [x] Task 2 完了

## Task 3: prompt への COMMIT_DISCIPLINE_RULE embed

### 3-1. `src/prompts/implementer-system.ts`

import 追加 + `## パイプライン上の位置づけ` の直前に `${COMMIT_DISCIPLINE_RULE}` を embed。

### 3-2. `src/prompts/spec-fixer-system.ts`

import 追加 + `## 役割` の直前に `${COMMIT_DISCIPLINE_RULE}` を embed。delta-spec-fixer はこの prompt を共有 import しているため自動カバー。

### 3-3. `src/prompts/code-fixer-system.ts`

import 追加 + `## 役割` の直前に `${COMMIT_DISCIPLINE_RULE}` を embed。

### 3-4. `src/prompts/build-fixer-system.ts`

import 追加 + `## 役割` の直前に `${COMMIT_DISCIPLINE_RULE}` を embed。

- [x] Task 3 完了

## Task 4: unit test (executor.commit.test.ts)

**File**: `tests/unit/step/executor.commit.test.ts` (新規)

StepExecutor の `commitAndPush` ロジックをテスト。SpawnFn を mock して git コマンドの呼び出しと分岐を検証。

テストケース:

1. staged あり + HEAD 進みなし → `<step>: <slug>` で commit + push
2. staged 0 + HEAD 進みなし + `requiresCommit: true` → `noCommitDetectedError` throw
3. staged 0 + HEAD 進みあり + `requiresCommit: true` → halt せず push のみ (新規挙動)
4. staged あり + HEAD 進みあり → staged 分を commit + push (agent 部分 commit 混在)
5. staged 0 + HEAD 進みなし + `requiresCommit: false` → silent skip
6. staged 0 + HEAD 進みあり + `requiresCommit: false` → silent skip (HEAD 進み無視)
7. agent 自主 commit 検出時の stderr ログ出力確認

- [x] Task 4 完了

## Task 5: integration test 追加

**File**: `tests/pipeline-integration.test.ts`

テストケース:

- implementer が自主 commit して終了 → pipeline halt せず verification 以降へ進む

SpawnFn mock で implementer step 完了時の HEAD が進行した状態を再現し、pipeline が halt せずに verification step へ遷移することを検証。

- [x] Task 5 完了

## Task 6: spec 更新

**File**: `specrunner/specs/step-execution-architecture/spec.md`

既存 Requirement「StepExecutor performs commitAndPush after agent step completion (local runtime)」の scenario を拡張:

- Scenario: No staged changes but HEAD advanced with requiresCommit true pushes only
- Scenario: No staged changes but HEAD advanced with requiresCommit false skips silently

既存 scenario (staged あり / staged 0 + requiresCommit true で halt / staged 0 + requiresCommit false で skip) はそのまま維持。

- [x] Task 6 完了
