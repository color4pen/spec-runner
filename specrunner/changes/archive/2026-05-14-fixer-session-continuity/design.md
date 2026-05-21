# Design: fixer-session-continuity

## Overview

fixer ステップ（spec-fixer / code-fixer / build-fixer）の 2 回目以降の iteration で、前回の session を継続して実行する機能を追加する。これにより fixer が前回の修正コンテキストを保持したまま次の修正に取り組めるようになり、reviewer ↔ fixer ループの収束率を改善する。

## Design Decisions

### D1: AgentRunContext に resumeSessionId を追加する

`AgentRunContext` に `resumeSessionId?: string` を追加する。このフィールドが存在する場合、adapter は既存 session を継続する。存在しない場合は従来通り新規 session を作成する。

**根拠**: Port interface に 1 フィールド追加するだけで、3 adapter すべてが session 継続の意図を受け取れる。AgentRunner の `run()` シグネチャは変わらない。

### D2: StepExecutor が resumeSessionId を注入する

StepExecutor の `runAgentStep()` で `AgentRunContext` を構築する際、fixer ステップの場合のみ `state.steps[step.name]` の最後の StepRun から `sessionId` を取得し `ctx.resumeSessionId` に設定する。

fixer ステップの判定は step name の集合（`FIXER_STEP_NAMES`）で行う。これは `fixer-helpers.ts` で定義する。

**根拠**: Pipeline は transition table 駆動に専念し state の内部構造を解釈する責務を持たない。session 継続の判定と注入は StepExecutor レベルで行うのが適切。

### D3: Adapter ごとの session 継続実装

各 adapter は `ctx.resumeSessionId` の有無で分岐する:

- **ClaudeCodeRunner**: `query()` の options に `resume: ctx.resumeSessionId` を追加する（1 行変更）。`session_id` プロパティが SDK response に返される既存パスはそのまま。
- **CodexAgentRunner**: `codex.startThread()` の代わりに `codex.resumeThread(ctx.resumeSessionId)` を呼び、返された thread で `thread.run(prompt)` を実行する。
- **ManagedAgentRunner**: `createSession()` をスキップし、`sessionClient.sendUserMessage(ctx.resumeSessionId, message)` で既存 session にメッセージを送信する。以降の poll は同じ `ctx.resumeSessionId` で行う。
- **DispatchingAgentRunner**: ctx をそのまま delegate するため変更不要。

### D4: Session 失効フォールバック

session 継続に失敗した場合（SDK エラー、session 期限切れ等）、warn ログを出力して新規 session にフォールバックする。pipeline は停止しない。

フォールバックの実装場所は各 adapter 内。adapter は session 継続を試行し、特定のエラー（session not found / expired 等）をキャッチした場合に `resumeSessionId` を無視して通常の新規 session パスに fallthrough する。

### D5: 継続時の prompt 最適化

session 継続時は、fixer の `buildMessage` が返す内容を短縮する。具体的には:

- **初回**（`state.steps[stepName]` が空または存在しない）: 現行の full prompt をそのまま使う
- **継続**（`state.steps[stepName]` に前回の run が存在）: 新しい reviewer findings のパスのみを伝える短縮 prompt を使う

初回/継続の判定と短縮 prompt 生成は `src/core/step/fixer-helpers.ts` の共通 helper に集約する。各 fixer の `buildMessage` 内でこの helper を呼ぶ。

**Step interface の署名 `buildMessage(state, deps)` は変更しない。** buildMessage 内で `state.steps` を参照して自己判定する。

### D6: fixer-helpers.ts の責務

新規ファイル `src/core/step/fixer-helpers.ts` に以下の helper を定義する:

```ts
/** fixer ステップ名の集合 */
export const FIXER_STEP_NAMES: ReadonlySet<string>;

/** 前回の session ID を取得。初回（前回 run なし）は null */
export function getPreviousSessionId(state: JobState, stepName: string): string | null;

/** session 継続かどうか（前回 run が存在し sessionId が非 null） */
export function isFixerContinuation(state: JobState, stepName: string): boolean;

/**
 * 継続時の短縮 prompt を生成。
 * `stepName` で findings の出所（build-fixer → "verification"、それ以外 → "reviewer"）を出し分ける。
 * `slug` は将来のテンプレート拡張のために保持するが現在は出力に使用しない。
 */
export function buildContinuationMessage(opts: {
  stepName: string;
  findingsPath: string;
  slug: string;
}): string;
```

また、`CodexThread` interface には `id: string` プロパティが必要（F-01 対応）。`CodexAgentRunner.run()` の return に `sessionId: thread.id` を含め、StepRun への sessionId 永続化を保証する。

### D7: maxTurns は調整不要

3 adapter いずれも、session 継続時の `query()` / `thread.run()` / `sendUserMessage()` は新しい呼び出しであり、maxTurns は呼び出しごとにリセットされる。前回消費分は引き継がない。特別な調整は不要。

### D8: StepRun の構造は変更しない

`StepRun` は iteration ごとに記録する（現行通り）。session が継続しても StepRun の構造は変えない。同一 step 名での合算で fixer 全体のコストが取れる状態を維持する。

## Architecture

```
StepExecutor.runAgentStep()
  │
  ├─ isFixer(step.name)?
  │    └─ YES: ctx.resumeSessionId = getPreviousSessionId(state, step.name)
  │
  ├─ AgentRunner.run(ctx)
  │    │
  │    ├─ ClaudeCodeRunner
  │    │    └─ ctx.resumeSessionId? → query({ options: { resume: id } })
  │    │    └─ fallback on error → query() without resume
  │    │
  │    ├─ CodexAgentRunner
  │    │    └─ ctx.resumeSessionId? → codex.resumeThread(id) + thread.run()
  │    │    └─ fallback on error → codex.startThread() + thread.run()
  │    │
  │    ├─ ManagedAgentRunner
  │    │    └─ ctx.resumeSessionId? → skip createSession, sendUserMessage(id, msg)
  │    │    └─ fallback on error → createSession() + sendUserMessage()
  │    │
  │    └─ DispatchingAgentRunner
  │         └─ delegate ctx unchanged
  │
  └─ finalizeStep() → pushStepResult() with new sessionId

Fixer buildMessage():
  │
  ├─ isFixerContinuation(state, stepName)?
  │    └─ YES: return buildContinuationMessage({ findingsPath, slug })
  │    └─ NO:  return existing full prompt
```

## Files Changed

| File | Change | Rationale |
|------|--------|-----------|
| `src/core/port/agent-runner.ts` | `AgentRunContext` に `resumeSessionId?: string` 追加 | D1 |
| `src/core/step/fixer-helpers.ts` | 新規作成。FIXER_STEP_NAMES, getPreviousSessionId, isFixerContinuation, buildContinuationMessage | D6 |
| `src/core/step/executor.ts` | runAgentStep で fixer の resumeSessionId を ctx に注入 | D2 |
| `src/adapter/claude-code/agent-runner.ts` | resume option 追加 + fallback | D3, D4 |
| `src/adapter/codex/agent-runner.ts` | resumeThread 分岐 + fallback | D3, D4 |
| `src/adapter/managed-agent/agent-runner.ts` | createSession skip 分岐 + fallback | D3, D4 |
| `src/core/step/spec-fixer.ts` | buildMessage に continuation 分岐追加 | D5 |
| `src/core/step/code-fixer.ts` | buildMessage に continuation 分岐追加 | D5 |
| `src/core/step/build-fixer.ts` | buildMessage に continuation 分岐追加 | D5 |
| `tests/core/step/fixer-helpers.test.ts` | 新規作成。helper のユニットテスト | テスト |
| `tests/unit/adapter/claude-code/agent-runner.test.ts` | resume / fallback テスト追加 | テスト |
| `tests/unit/adapter/managed-agent/agent-runner.test.ts` | resume / fallback テスト追加 | テスト |
| `tests/adapter/codex/agent-runner.test.ts` | resume / fallback テスト追加 | テスト |

## Scope Boundaries

- reviewer step の session 継続: スコープ外（reviewer は常に新規 session）
- resume コマンドからの session 継続: スコープ外（session 失効リスクが高い）
- config フィールド追加: スコープ外（固定動作、YAGNI）
- state schema 変更: スコープ外（StepRun 構造は変えない）
