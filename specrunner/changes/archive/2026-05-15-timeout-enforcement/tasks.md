# Tasks: timeout-enforcement

## [x] T-01: StepResultInput に startedAt フィールドを追加し pushStepResult を修正

**変更ファイル**: `src/state/helpers.ts`

### 1-a: StepResultInput に startedAt を追加

```typescript
export interface StepResultInput {
  session?: { id: string; agentId: string; environmentId: string } | null;
  verdict: import("./schema.js").Verdict | null;
  findingsPath: string | null;
  completedAt?: string | null;
  startedAt?: string | null;   // ← 追加
  error: import("./schema.js").ErrorInfo | null;
  fileContent?: string | null;
  modelUsage?: Record<string, ModelUsage>;
}
```

### 1-b: pushStepResult の startedAt / endedAt ロジックを修正

現在（L82-93）:
```typescript
const now = partial.completedAt ?? new Date().toISOString();
const run: StepRun = {
  // ...
  startedAt: now,
  endedAt: now,
};
```

修正後:
```typescript
const now = new Date().toISOString();
const run: StepRun = {
  // ...
  startedAt: partial.startedAt ?? now,
  endedAt: partial.completedAt ?? now,
};
```

`partial.startedAt` が渡されなかった場合は現在時刻にフォールバックする（後方互換性）。

---

## [x] T-02: executor.ts の runAgentStep のタイムスタンプ取得位置を修正

**変更ファイル**: `src/core/step/executor.ts`

### 2-a: startedAt を runner.run() の前に取得

L140 の `const completedAt = new Date().toISOString();` を以下に置き換え:

```typescript
const startedAt = new Date().toISOString();
```

### 2-b: completedAt を runner.run() の後に取得

`runner.run()` の `.catch()` ブロック（L141-160）の **後**、timeout チェック（L162）の **前** に以下を挿入:

```typescript
const completedAt = new Date().toISOString();
```

### 2-c: recordFailedStepResult の呼び出しに startedAt を追加

`runAgentStep()` 内の全 `recordFailedStepResult()` 呼び出し（L148, L170, L198）の `partial` 引数に `startedAt` を追加:

```typescript
// L148 (.catch ブロック内)
// 採用方針: startedAt のみ渡し、completedAt は pushStepResult のフォールバック（new Date().toISOString()）に任せる
state = recordFailedStepResult(state, step.name, errorInfo, { startedAt });

// L170 (timeout ブロック内) — ブロック外の completedAt は定義済み
state = recordFailedStepResult(state, step.name, errorInfo, { completedAt, startedAt });

// L198 (error ブロック内) — ブロック外の completedAt は定義済み
state = recordFailedStepResult(state, step.name, errorInfo, { completedAt, startedAt });
```

注意: `.catch()` ブロック（L141-160）内では、ブロック外の `completedAt` はまだ定義されていないため渡せない。
**決定**: `.catch()` ブロック内では `startedAt` のみ渡し、`completedAt` は `pushStepResult` の
フォールバック（`new Date().toISOString()`）に任せる。これが最もシンプルな解法であり、
`.catch()` ブロック内に `const completedAt` を重複定義する必要がない。

### 2-d: finalizeStep のシグネチャに startedAt を追加

`finalizeStep()` の引数に `startedAt: string` を追加:

```typescript
private async finalizeStep(
  step: Step,
  state: JobState,
  deps: PipelineDeps,
  resultContent: string | null,
  completedAt: string,
  startedAt: string,       // ← 追加
  agentResult?: { ... },
): Promise<JobState> {
```

`finalizeStep()` 内の `pushStepResult()` 呼び出し（L381-388）に `startedAt` を追加:

```typescript
state = pushStepResult(state, step.name, {
  session: sessionEntry,
  verdict: verdict as Verdict | null,
  findingsPath,
  fileContent: resultContent,
  completedAt,
  startedAt,       // ← 追加
  error: null,
  modelUsage: agentResult?.modelUsage,
});
```

### 2-e: finalizeStep の呼び出し元を更新

`runAgentStep()` L209 の `finalizeStep()` 呼び出しに `startedAt` を追加:

```typescript
return this.finalizeStep(step, state, deps, runResult.resultContent, completedAt, startedAt, { ... });
```

---

## [x] T-03: executor.ts の runCliStep のタイムスタンプ取得位置を修正

**変更ファイル**: `src/core/step/executor.ts`

### 3-a: startedAt を step.run() の前に取得

L314 の `const completedAt = new Date().toISOString();` を以下に変更:

```typescript
const startedAt = new Date().toISOString();
```

### 3-b: completedAt を step.run() の後に取得

`step.run()` の try-catch ブロックの **後**（L332 付近）に:

```typescript
const completedAt = new Date().toISOString();
```

### 3-c: catch ブロック内の recordFailedStepResult に startedAt を追加

L326-328:
```typescript
// 採用方針: T-02c と同じく startedAt のみ渡し、completedAt は pushStepResult のフォールバックに任せる
state = recordFailedStepResult(state, step.name, errorInfo, { startedAt });
```

catch ブロック内では `completedAt` がまだ定義されていないため、`startedAt` のみ渡す。
`completedAt` は `pushStepResult` のフォールバック（`new Date().toISOString()`）で補完される。

### 3-d: finalizeStep 呼び出しに startedAt を追加

L347:
```typescript
return this.finalizeStep(step, state, deps, fileContent, completedAt, startedAt);
```

---

## [x] T-04: Managed Agent adapter の poll timeout と step timeout を分離

**変更ファイル**: `src/adapter/managed-agent/agent-runner.ts`

### 4-a: SSE polling fallback パス (L193-201)

現在:
```typescript
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
  timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
});
const timeoutMs = resolvedConfig.timeoutMs === 0 ? null : resolvedConfig.timeoutMs;

const pollResult = await this.sessionClient.pollUntilComplete(sessionId!, {
  abortSignal: abortController.signal,
  timeoutMs: timeoutMs ?? undefined,
});
```

修正後:
```typescript
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
});
const effectiveTimeoutMs =
  resolvedConfig.timeoutMs && resolvedConfig.timeoutMs > 0
    ? resolvedConfig.timeoutMs
    : DEFAULT_POLL_TIMEOUT_MS;

const pollResult = await this.sessionClient.pollUntilComplete(sessionId!, {
  abortSignal: abortController.signal,
  timeoutMs: effectiveTimeoutMs,
});
```

### 4-b: Polling-style パス (L437-445)

現在:
```typescript
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
  timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
});
const timeoutMs = resolvedConfig.timeoutMs === 0 ? null : resolvedConfig.timeoutMs;

const pollResult = await this.sessionClient.pollUntilComplete(sessionId!, { timeoutMs: timeoutMs ?? undefined });
```

修正後:
```typescript
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
});
const effectiveTimeoutMs =
  resolvedConfig.timeoutMs && resolvedConfig.timeoutMs > 0
    ? resolvedConfig.timeoutMs
    : DEFAULT_POLL_TIMEOUT_MS;

const pollResult = await this.sessionClient.pollUntilComplete(sessionId!, { timeoutMs: effectiveTimeoutMs });
```

**注意**: `??` (nullish coalescing) は `0` をフォールバックしないため使用しない。
`timeoutMs: 0` を渡すと `pollUntilComplete()` が即時 `PollTimeoutError` を返す。
Claude Code / Codex adapter の `resolvedConfig.timeoutMs > 0` ガードと挙動を揃えるため `> 0` チェックを採用。
未設定（null）および `0` はいずれも `DEFAULT_POLL_TIMEOUT_MS` にフォールバックする。

---

## [x] T-05a: store.ts の legacy timeoutMs stripping を除去

**変更ファイル**: `src/config/store.ts`

ADR-0013 supersede に伴い、`store.ts` L99-109 の `specReview` / `specFixer` の
`timeoutMs` を write 時に strip するコードを削除する。

`steps` 配下の `timeoutMs` は strip されておらず本 request でも活用するため、
「silently ignore」の方針を撤廃する本 request との認知矛盾を解消する。

削除対象:

```typescript
// Strip legacy timeoutMs from specReview / specFixer (D3: silently ignore on write)
if (toSave["specReview"] && typeof toSave["specReview"] === "object") {
  const specReview = { ...(toSave["specReview"] as Record<string, unknown>) };
  delete specReview["timeoutMs"];
  toSave["specReview"] = specReview;
}
if (toSave["specFixer"] && typeof toSave["specFixer"] === "object") {
  const specFixer = { ...(toSave["specFixer"] as Record<string, unknown>) };
  delete specFixer["timeoutMs"];
  toSave["specFixer"] = specFixer;
}
```

注意: `specReview` / `specFixer` の型定義（`SpecReviewConfig` / `SpecFixerConfig`）に `timeoutMs` フィールドが
存在しないことを確認してから削除すること（型上は無害だが、読み込み時に無視されることを確認）。

---

## [x] T-05b: schema.ts の JSDoc を更新

**変更ファイル**: `src/config/schema.ts`

L116-117 の JSDoc を更新する。現在:

```typescript
/**
 * Per-step execution config: model, maxTurns, timeoutMs.
 * Effective only for local runtime (ClaudeCodeRunner).
 * ManagedAgentRunner ignores this field.
 * ...
 */
steps?: StepConfigMap;
```

修正後:

```typescript
/**
 * Per-step execution config: model, maxTurns, timeoutMs.
 * Effective for local runtime (ClaudeCodeRunner) and managed agent runtime (ManagedAgentRunner).
 * - ClaudeCodeRunner: AbortController + setTimeout
 * - ManagedAgentRunner: pollUntilComplete() の timeoutMs パラメータ経由
 * Default: null (unlimited) — timeout is only applied when explicitly configured.
 * ...
 */
steps?: StepConfigMap;
```

---

## [x] T-05: ADR-0013 を Superseded に変更

**変更ファイル**: `openspec-workflow/adr/ADR-0013-remove-session-timeout.md`

L4 の `**Status**: accepted` を以下に変更:

```markdown
**Status**: superseded by ADR-0014
```

---

## [x] T-06: ADR-0014 を新規作成

**新規ファイル**: `openspec-workflow/adr/ADR-0014-reenable-timeout-with-default-null.md`

内容:

```markdown
# Re-enable timeoutMs with Default Null

**Date**: 2026-05-15
**Status**: accepted
**Supersedes**: ADR-0013

## Context

ADR-0013 で wall-clock timeout を完全撤廃した。理由は implementer 等の長時間ステップで
false positive が多発したため。しかし撤廃により以下の問題が残った:

- config で timeoutMs を設定してもユーザーが timeout を制御できない
- 異常時の手段が Ctrl+C のみ（cancel コマンドは #61 で別途）
- CI 環境で暴走セッションの制御手段がない

## Decision

timeoutMs をデフォルト null（無制限）で再有効化する。ユーザーが config で
明示的に設定した場合のみ、各 adapter が自身の SDK に合った方法で timeout を実施する。

- Claude Code: AbortController + setTimeout（既存配線を活用）
- Codex: AbortController + setTimeout（既存配線を活用）
- Managed Agent: pollUntilComplete() の timeoutMs パラメータ経由
- タイムアウト発生時は awaiting-resume に遷移（再開可能）

ADR-0013 の「false positive 多発」問題は「デフォルト無制限」で解決する。
ユーザーが自環境に合わせて設定する運用とする。

timeout の所有者は adapter（StepExecutor ではない）。3 つの SDK の timeout
メカニズムが異なるため、統一インターフェースは採用しない。

## Consequences

### Positive

- ユーザーが config で timeout を制御できる
- デフォルト null のため既存動作に影響なし
- CI 環境で config 設定により暴走セッションを制御可能
- 既存の adapter 配線を活用するため最小限の変更

### Negative

- 3 adapter で timeout メカニズムが異なる（AbortController vs timeoutMs パラメータ）
- 推奨値の策定は実行時間データ蓄積後に先送り

## Related

- ADR-0013: Remove Wall-Clock Timeout（superseded）
- Request: timeout-enforcement
```

---

## [x] T-07: テストの更新

**変更ファイル**: 既存テストファイル（`pushStepResult` / executor 関連）

### 7-a: pushStepResult のテスト更新

- startedAt を渡した場合に StepRun.startedAt に反映されることを確認
- startedAt を渡さなかった場合に現在時刻にフォールバックすることを確認
- startedAt と completedAt が異なるタイムスタンプで記録されることを確認

### 7-b: 型チェック・既存テストの通過確認

- `bun run typecheck` が green
- `bun run test` が green（既存テストが壊れていないこと）

---

## 受け入れ基準（チェックリスト）

- [x] StepRun の startedAt が step 実行開始時、endedAt が step 完了時のタイムスタンプを記録する
- [x] config に `steps.implementer.timeoutMs: 600000` を設定した場合、implementer が 10 分を超えるとタイムアウトする
- [x] config に timeoutMs を設定しない場合（デフォルト null）、従来通り無制限で実行される
- [x] `bun run typecheck && bun run test` が green
