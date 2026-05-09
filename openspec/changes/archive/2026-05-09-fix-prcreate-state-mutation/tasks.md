# Tasks: PrCreateStep の state 直接ミューテーション解消

## T1: ParsedStepResult に pullRequest フィールドを追加

**File**: `src/core/step/types.ts`

**Location**: `ParsedStepResult` interface（L24-36）

**Changes**:
`scores` フィールドの後に `pullRequest` optional フィールドを追加する。

```typescript
/** PR info extracted by PrCreateStep. Other steps leave this undefined. */
pullRequest?: { url: string; number: number; createdAt: string };
```

**Note**: `PullRequestInfo` 型を import せず inline で定義する。構造的型付けにより互換。ステップ層から state 層への依存を増やさない。

---

## T2: PrCreateStep.run() から state mutation を除去し、result file に createdAt を追加

**File**: `src/core/step/pr-create.ts`

### T2.1: state.pullRequest 直接代入の除去

**Location**: L45-51

**変更前**:
```typescript
if (result.status === "created" || result.status === "existing-open") {
  // Record PR info in state (mutation — StepExecutor will persist this)
  state.pullRequest = {
    url: result.url,
    number: result.number,
    createdAt: new Date().toISOString(),
  };
```

**変更後**:
```typescript
if (result.status === "created" || result.status === "existing-open") {
  const createdAt = new Date().toISOString();
```

`state.pullRequest` への代入を完全に除去する。`createdAt` は result file 書き込みに使うためローカル変数として保持。

### T2.2: result file に createdAt 行を追加

**Location**: L53-64 の content テンプレート

**変更前**:
```typescript
const content = [
  `# pr-create Result — ${slug}`,
  "",
  `## Status: success`,
  "",
  `## PR`,
  "",
  `- **URL**: ${result.url}`,
  `- **Number**: ${result.number}`,
  `- **Action**: ${result.status === "created" ? "created" : "existing-open (idempotent)"}`,
  "",
].join("\n");
```

**変更後**:
```typescript
const content = [
  `# pr-create Result — ${slug}`,
  "",
  `## Status: success`,
  "",
  `## PR`,
  "",
  `- **URL**: ${result.url}`,
  `- **Number**: ${result.number}`,
  `- **CreatedAt**: ${createdAt}`,
  `- **Action**: ${result.status === "created" ? "created" : "existing-open (idempotent)"}`,
  "",
].join("\n");
```

---

## T3: PrCreateStep.parseResult() で PR 情報を抽出

**File**: `src/core/step/pr-create.ts`

**Location**: `parseResult` メソッド（L90-101）

**変更前**:
```typescript
parseResult(content: string, deps: StepDeps) {
  void deps;
  const match = /^## Status: (success|failed)$/m.exec(content);
  const status = match?.[1];
  if (status === "success") {
    return { verdict: "success" as const, findingsPath: null };
  }
  if (status === "failed") {
    return { verdict: "error" as const, findingsPath: null };
  }
  return { verdict: null, findingsPath: null };
},
```

**変更後**:
```typescript
parseResult(content: string, deps: StepDeps) {
  void deps;
  const match = /^## Status: (success|failed)$/m.exec(content);
  const status = match?.[1];
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

---

## T4: StepExecutor.finalizeStep() で pullRequest を state に反映

**File**: `src/core/step/executor.ts`

### T4.1: parseResult 結果全体を保持するように変更

**Location**: L232-233

**変更前**:
```typescript
if (resultContent !== null) {
  verdict = step.parseResult(resultContent, deps).verdict;
}
```

**変更後**:
```typescript
let parsed: import("./types.js").ParsedStepResult | null = null;
if (resultContent !== null) {
  parsed = step.parseResult(resultContent, deps);
  verdict = parsed.verdict;
}
```

### T4.2: pullRequest の state 反映を追加

**Location**: L260-262 付近（`setsBranch` 処理の後、`store.persist(state)` の前）

以下を追加:
```typescript
if (parsed?.pullRequest) {
  state = { ...state, pullRequest: parsed.pullRequest };
}
```

**配置**: `store.persist(state)` の直前。`pushStepResult` / `appendHistory` / `branch` 設定の後。

---

## T5: テストの更新

**File**: `tests/unit/step/pr-create.test.ts`

### T5.1: TC-013 を parseResult 経由のテストに変更

TC-013 の `state.pullRequest` 直接アサーションを以下に変更:
- `run()` 後に `state.pullRequest` が **undefined のまま**であることをアサート（mutation 除去の検証）
- `parseResult()` で result file を解析し、`pullRequest` フィールドが返ることをアサート

### T5.2: TC-015 を同様に変更

TC-015 の `state.pullRequest` 直接アサーションを以下に変更:
- `run()` 後に `state.pullRequest` が **undefined のまま**であることをアサート
- `parseResult()` で `pullRequest` が返ることをアサート

### T5.3: parseResult の PR 情報抽出テストを追加

新規テストケース:
- **TC-018**: `parseResult()` が success 時に `pullRequest: { url, number, createdAt }` を返す
- **TC-019**: `parseResult()` が failed 時に `pullRequest` を返さない
- **TC-020**: `parseResult()` が URL/Number/CreatedAt のいずれかが欠落した result file で `pullRequest` を undefined にする（defensive parsing）

### T5.4: TC-016 の result file 構造テストを更新

TC-016 で `createdAt` 行が result file に含まれることをアサートに追加。

---

## T6: 型チェックとテスト実行

**Command**: `bun run typecheck && bun test`

**Verification checklist**:
- [x] `bun run typecheck` が exit 0
- [x] `bun test tests/unit/step/pr-create.test.ts` が全 pass
- [x] `bun test` 全体が green

---

## タスク依存関係

```
T1 (ParsedStepResult 型拡張)
  ↓
T2 (run() mutation 除去 + result file 変更) ← T1 不要で並行可
T3 (parseResult() 拡張) ← T1 必須
T4 (finalizeStep() 拡張) ← T1 必須
  ↓
T5 (テスト更新) ← T2, T3 必須
  ↓
T6 (検証)
```

---

## 受け入れ基準の検証手順

### AC1: PrCreateStep.run() 内で state を変更していない

- T2.1 で `state.pullRequest = ...` を除去
- T5.1 / T5.2 で `run()` 後に `state.pullRequest` が undefined であることを検証

### AC2: pipeline 完了後の state.pullRequest に url と number が格納されている

- T3 で `parseResult()` が `pullRequest` を返す
- T4 で `finalizeStep()` が `state = { ...state, pullRequest }` で反映
- `runner.ts:172` の `finalState.pullRequest?.url` が引き続き動作

### AC3: runner.ts:172 の PR URL 表示が引き続き動作する

- `finalState` は `finalizeStep()` の返り値であり、T4 により `pullRequest` が含まれる
- コード変更不要

### AC4: bun run typecheck && bun run test が green

- T6 で検証

---

## 完了条件

- [x] T1: `ParsedStepResult` に `pullRequest` フィールド追加
- [x] T2: `PrCreateStep.run()` から state mutation 除去、result file に createdAt 追加
- [x] T3: `PrCreateStep.parseResult()` で PR 情報抽出
- [x] T4: `StepExecutor.finalizeStep()` で pullRequest を state に反映
- [x] T5: テスト更新（TC-013, TC-015 修正、TC-018〜TC-020 追加）
- [x] T6: `bun run typecheck && bun test` が green
