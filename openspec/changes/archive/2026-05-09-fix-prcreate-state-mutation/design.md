# Design: PrCreateStep の state 直接ミューテーション解消

## 設計方針

PR 情報を `ParsedStepResult` 経由で伝搬し、`StepExecutor.finalizeStep()` が immutable spread で state に反映する。既存の `branch` や `scores` と同じパターンに統一する。

## D1: ParsedStepResult に pullRequest フィールドを追加

**File**: `src/core/step/types.ts`

```typescript
export interface ParsedStepResult {
  verdict: import("../../state/schema.js").Verdict | null;
  findingsPath: string | null;
  fileContent?: string | null;
  scores?: ReviewScores & Pick<FindingSeverityCounts, "critical" | "high">;
  /** PR info extracted by PrCreateStep. Other steps leave this undefined. */
  pullRequest?: { url: string; number: number; createdAt: string };
}
```

`PullRequestInfo` 型を import してもよいが、`ParsedStepResult` はステップ層の型であり state 層への依存を最小化するため inline で定義する。構造的型付けにより `PullRequestInfo` と互換。

## D2: PrCreateStep.run() から state mutation を除去

**File**: `src/core/step/pr-create.ts`

変更前（L45-51）:
```typescript
if (result.status === "created" || result.status === "existing-open") {
  state.pullRequest = {
    url: result.url,
    number: result.number,
    createdAt: new Date().toISOString(),
  };
```

変更後:
```typescript
if (result.status === "created" || result.status === "existing-open") {
  // PR info is persisted in the result file and extracted by parseResult().
  // StepExecutor.finalizeStep() merges it into state immutably.
```

`run()` は result file への書き込みだけを担当する。PR 情報（url, number）は既に result file に書き込まれている（L60-61）。`createdAt` は result file に含まれていないため追加する。

## D3: pr-create-result.md に createdAt を追加

成功時の result file テンプレートに `createdAt` 行を追加:

```markdown
- **URL**: ${result.url}
- **Number**: ${result.number}
- **CreatedAt**: ${new Date().toISOString()}
- **Action**: ${...}
```

これにより `parseResult()` が全情報を抽出できる。

## D4: PrCreateStep.parseResult() で PR 情報を抽出

**File**: `src/core/step/pr-create.ts`

```typescript
parseResult(content: string, deps: StepDeps) {
  void deps;
  const statusMatch = /^## Status: (success|failed)$/m.exec(content);
  const status = statusMatch?.[1];

  if (status === "success") {
    const urlMatch = /\*\*URL\*\*: (.+)$/m.exec(content);
    const numberMatch = /\*\*Number\*\*: (\d+)$/m.exec(content);
    const createdAtMatch = /\*\*CreatedAt\*\*: (.+)$/m.exec(content);
    const url = urlMatch?.[1]?.trim();
    const number = numberMatch?.[1] ? parseInt(numberMatch[1], 10) : undefined;
    const createdAt = createdAtMatch?.[1]?.trim();

    return {
      verdict: "success" as const,
      findingsPath: null,
      ...(url && number && createdAt
        ? { pullRequest: { url, number, createdAt } }
        : {}),
    };
  }
  if (status === "failed") {
    return { verdict: "error" as const, findingsPath: null };
  }
  return { verdict: null, findingsPath: null };
},
```

URL / number / createdAt のいずれかが抽出できなかった場合、`pullRequest` を undefined にして verdict だけ返す（defensive）。

## D5: StepExecutor.finalizeStep() で pullRequest を state に反映

**File**: `src/core/step/executor.ts`

`finalizeStep()` 内、`pushStepResult()` の直後（L253 付近）に追加:

```typescript
// L232-233 で parseResult の結果全体を保持するように変更
const parsed = resultContent !== null
  ? step.parseResult(resultContent, deps)
  : null;
verdict = parsed?.verdict ?? null;

// ... 既存の pushStepResult / appendHistory / branch 処理 ...

// pullRequest を state に反映（immutable spread）
if (parsed?.pullRequest) {
  state = { ...state, pullRequest: parsed.pullRequest };
}
```

既存の `verdict = step.parseResult(resultContent, deps).verdict` を分解し、`parsed` オブジェクト全体を保持する。これにより `scores`（将来的に code-review で使う可能性）と `pullRequest` の両方にアクセスできる。

配置は `pushStepResult()` の後、`store.persist(state)` の前。

## データフロー（修正後）

```
PrCreateStep.run(state, deps)
  ├── runPrCreate() → { status, url, number }
  ├── result file に url, number, createdAt を書き込み
  └── state は変更しない（read-only）

StepExecutor.runCliStep()
  ├── step.run(state, deps)
  ├── fs.readFile(resultFilePath) → content
  └── finalizeStep(step, state, deps, content, ...)
       ├── parsed = step.parseResult(content, deps)
       │    └── { verdict: "success", pullRequest: { url, number, createdAt } }
       ├── pushStepResult(state, ...) → new state
       ├── appendHistory(state, ...) → new state
       ├── if (parsed.pullRequest) state = { ...state, pullRequest }
       ├── store.persist(state)
       └── return state
```

## 影響するテスト

### 変更が必要なテスト

- **TC-013** (`pr-create.test.ts`): `state.pullRequest` の直接 mutation アサーションを `parseResult()` の返り値アサーションに変更
- **TC-015** (`pr-create.test.ts`): 同上

### 追加が必要なテスト

- **TC-NEW-1**: `parseResult()` が success 時に `pullRequest` を返すことを検証
- **TC-NEW-2**: `parseResult()` が failed 時に `pullRequest` を返さないことを検証

### 変更不要なテスト

- TC-008〜TC-012, TC-014, TC-016, TC-017: 既存のまま動作
- `runner.ts:172` の PR URL 表示: `finalState.pullRequest?.url` は `finalizeStep()` 経由で設定されるため変更不要
