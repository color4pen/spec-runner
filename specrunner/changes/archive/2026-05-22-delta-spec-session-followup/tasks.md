# Tasks: delta-spec-session-followup

## T-01: AgentRunContext に followUpPrompt field を追加

**File**: `src/core/port/agent-runner.ts`

`AgentRunContext` interface に `followUpPrompt?: string` を追加する。

```typescript
/**
 * 作業 turn 後に同一 session へ投げる follow プロンプト。
 * 指定時: adapter が作業 turn 完了後に同一 session で follow prompt を 1 本投げる。
 * 未指定時: adapter は作業 turn のみで返す (既存挙動)。
 */
followUpPrompt?: string;
```

`resumeSessionId` の直後に配置する (field group: session continuation 系)。

**Acceptance**:
- [x] `AgentRunContext.followUpPrompt` が `string | undefined` である
- [x] `bun run typecheck` が green

---

## T-02: AgentStep に followUpPrompt field を追加

**File**: `src/core/step/types.ts`

`AgentStep` interface に `followUpPrompt?: string` を追加する。

```typescript
/**
 * 作業 turn 完了後に同一 session で投げる follow プロンプト。
 * 未指定の step は従来通り作業 turn のみで実行される。
 * 汎用 field: 任意の AgentStep が primitive 改修なしで設定可能。
 */
followUpPrompt?: string;
```

`needsProjectContext` の直後に配置する (field group: step 宣言的フラグ系)。

**Acceptance**:
- [x] `AgentStep.followUpPrompt` が `string | undefined` である
- [x] 既存 step 実装 (followUpPrompt 未設定) が型エラーなし
- [x] `bun run typecheck` が green

---

## T-03: StepExecutor が followUpPrompt を ctx に転記

**File**: `src/core/step/executor.ts`

`runAgentStep` の `ctx` 構築部分 (L134-150 付近) に `followUpPrompt: step.followUpPrompt,` を追加する。

```typescript
const ctx = {
  step,
  state,
  branch: state.branch ?? "",
  // ... 既存 fields ...
  resumeSessionId,
  followUpPrompt: step.followUpPrompt,  // ← 追加
  emit: (event: string, payload: Record<string, unknown>) => {
    this.events.emit(event as Parameters<EventBus["emit"]>[0], payload as never);
  },
};
```

executor / finalizeStep のロジックは変更しない。`runner.run(ctx)` が内部 2 turn でも executor からは 1 回の await。

**Acceptance**:
- [x] `ctx.followUpPrompt` が `step.followUpPrompt` の値になっている
- [x] executor / finalizeStep に他の変更がない
- [x] pipeline の step 遷移 / FIXER_STEP_NAMES が無改修

---

## T-04: shared follow-up helper を作成

**File**: `src/adapter/shared/follow-up.ts` (新規)

runtime 非依存の純粋関数を 2 つ作成する:

```typescript
import type { AgentRunContext, AgentRunResult } from "../../core/port/agent-runner.js";

/**
 * follow turn を実行すべきか判定する。
 * ctx.followUpPrompt が truthy かつ作業 turn が success なら true。
 */
export function shouldRunFollowUp(
  ctx: Pick<AgentRunContext, "followUpPrompt">,
  baseCompletionReason: AgentRunResult["completionReason"],
): boolean {
  return !!ctx.followUpPrompt && baseCompletionReason === "success";
}

/**
 * follow turn の resultContent を base result にマージする。
 * sessionId は base (turn 1) を維持。resultContent は follow turn を採用。
 * modelUsage は呼び出し元 (adapter) が native で算出済みのものを base に反映してから呼ぶ。
 */
export function mergeFollowUpResult(
  baseResult: AgentRunResult,
  followUpResultContent: string | null,
): AgentRunResult {
  return {
    ...baseResult,
    resultContent: followUpResultContent,
  };
}
```

**設計意図**:
- shared は runtime 型 (AsyncGenerator / Turn / poll result) と usage 意味論を知らない
- 依存方向は adapter → shared 純粋関数の一方向
- usage の「一律加算」は shared に置かない (per-turn/cumulative の意味論差で leaky になるため)

**Acceptance**:
- [x] `shouldRunFollowUp` が followUpPrompt truthy + success で true を返す
- [x] `shouldRunFollowUp` が followUpPrompt undefined で false を返す
- [x] `shouldRunFollowUp` が completionReason !== "success" で false を返す
- [x] `mergeFollowUpResult` が sessionId を base から維持する
- [x] `mergeFollowUpResult` が resultContent を followUp の値に置き換える
- [x] shared が runtime 固有 import を含まない

---

## T-05: ClaudeCodeRunner に follow-up 2 段実行を実装

**File**: `src/adapter/claude-code/agent-runner.ts`

`run()` メソッドの result 組み立て部分 (L253 付近) の前に follow-up 実行を追加する。

概要:
1. 作業 turn 完了後、`shouldRunFollowUp(ctx, "success")` で判定
2. true なら `queryFn` を 2 回目で呼ぶ: `{ prompt: ctx.followUpPrompt, options: { ...queryOptions, resume: extractedSessionId } }`
3. follow turn の result から `modelUsage` を取得 (SDK cumulative → そのまま最終値)
4. follow turn の `session_id` で `extractedSessionId` を確認 (同一であるべき)
5. result file の読み出しは follow turn 完了後に 1 回だけ行う (作業 turn で読む必要なし)

既存の AbortController は変更しない (作業 turn + follow turn を 1 本でカバー)。

followUpPrompt 未指定時は既存コードパスのまま (早期 return で分離)。

follow turn で error/timeout が発生した場合は、作業 turn の result を破棄せず follow turn の error を返す (AbortController の abort は both turns に伝搬する)。

**Acceptance**:
- [x] followUpPrompt 指定時に queryFn が 2 回呼ばれる
- [x] 2 回目の queryFn が `resume: sessionId` option を含む
- [x] followUpPrompt 未指定時に queryFn が 1 回のみ
- [x] modelUsage が follow turn の SDK 累積値 (最終 result)
- [x] AbortController が作業 turn + follow turn 合算で timeout
- [x] result file の読み出しが follow turn 完了後に 1 回
- [x] `bun run typecheck` が green

---

## T-06: CodexAgentRunner に follow-up 2 段実行を実装

**File**: `src/adapter/codex/agent-runner.ts`

`run()` メソッドの result file 読み出し前に follow-up 実行を追加する。

概要:
1. 作業 turn 完了後、`shouldRunFollowUp(ctx, "success")` で判定
2. true なら同一 `thread` の `run(ctx.followUpPrompt!, { signal })` を呼ぶ
3. turn 2 の `usage` を turn 1 の `usage` に加算して session 総量にする
4. result file の読み出しは follow turn 完了後に 1 回だけ行う

**usage 加算** (adapter native):
```typescript
if (turn2.usage && turn1Usage) {
  turn1Usage.input_tokens += turn2.usage.input_tokens;
  turn1Usage.output_tokens += turn2.usage.output_tokens;
  turn1Usage.cached_input_tokens = (turn1Usage.cached_input_tokens ?? 0) + (turn2.usage.cached_input_tokens ?? 0);
}
```

AbortController は既存のものを共有 (signal は同一)。

**Acceptance**:
- [x] followUpPrompt 指定時に thread.run が 2 回呼ばれる (同一 thread)
- [x] 2 回目の thread.run が followUpPrompt を prompt として渡す
- [x] followUpPrompt 未指定時に thread.run が 1 回のみ
- [x] modelUsage が turn 1 + turn 2 の加算 (per-turn 加算)
- [x] AbortController の signal が follow turn にも渡される
- [x] `bun run typecheck` が green

---

## T-07: ManagedAgentRunner (SSE 経路) に follow-up 2 段実行を実装

**File**: `src/adapter/managed-agent/agent-runner.ts`

`runDesignStyle()` の GitHub verification 直前に follow-up 実行を追加する。

概要:
1. SSE が `end_turn` で完了した後、`shouldRunFollowUp(ctx, "success")` で判定
2. true なら `sendUserMessage(sessionId, ctx.followUpPrompt!)` で follow turn を送る
3. `pollUntilComplete(sessionId, { timeoutMs: remainingTimeout })` で完了を待つ
4. follow turn 完了後、既存の GitHub verification に進む

SSE が `end_turn` 以外で終了した場合 (terminated / polling fallback) は follow turn を実行しない。

**graceful degradation**: `sendUserMessage` が失敗した場合は warning を stderr に出力し、作業 turn の result をそのまま返す (follow turn 失敗は非致命的)。

**timeout**: SSE 経路の AbortController を follow turn にも引き継ぐ。polling fallback後に follow turn に入る場合は、effectiveTimeoutMs の残時間を使う。

ManagedAgentRunner は modelUsage を populate しないため、usage 関連の変更なし。

**Acceptance**:
- [x] SSE end_turn + followUpPrompt 指定時に sendUserMessage が follow turn で呼ばれる
- [x] pollUntilComplete が follow turn で呼ばれる
- [x] SSE terminated 時に follow turn が実行されない
- [x] followUpPrompt 未指定時に既存挙動
- [x] follow turn の sendUserMessage 失敗で graceful degradation (warning + 作業 turn result)
- [x] `bun run typecheck` が green

---

## T-08: ManagedAgentRunner (polling 経路) に follow-up 2 段実行を実装

**File**: `src/adapter/managed-agent/agent-runner.ts`

`runPollingStyle()` の artifact 検証前に follow-up 実行を追加する。

概要:
1. 作業 turn の polling が `idle` で完了した後、`shouldRunFollowUp(ctx, "success")` で判定
2. true なら `sendUserMessage(sessionId, ctx.followUpPrompt!)` で follow turn を送る
3. `pollUntilComplete(sessionId, { timeoutMs: remainingTimeout })` で完了を待つ
4. follow turn 完了後、既存の requiresCommit guard / result file fetch に進む

作業 turn が `idle` 以外の場合は follow turn を実行しない。

graceful degradation は T-07 と同型。

**Acceptance**:
- [x] polling idle + followUpPrompt 指定時に sendUserMessage が 2 回呼ばれる
- [x] pollUntilComplete が 2 回呼ばれる
- [x] polling terminated 時に follow turn が実行されない
- [x] follow turn の sendUserMessage 失敗で graceful degradation
- [x] `bun run typecheck` が green

---

## T-09: DesignStep に followUpPrompt を設定

**File**: `src/core/step/design.ts`

`DesignStep` object に `followUpPrompt` property を追加する。

```typescript
export const DesignStep: AgentStep = {
  // ... 既存 fields ...

  followUpPrompt: [
    "作業完了後の self-fix pass です。",
    "",
    "1. specrunner/changes/ 配下の rules.md を Read tool で読んでください",
    "2. 「delta spec 記法」セクションの以下の規律を確認してください:",
    "   - セクションヘッダーは ## Requirements / ## Removed / ## Renamed のみ",
    "     (## ADDED Requirements / ## MODIFIED Requirements 等の旧形式は禁止)",
    "   - 各 Requirement は ### Requirement: で始まる header を持つ",
    "   - 各 Requirement は少なくとも 1 つの #### Scenario: を含む",
    "   - Requirement 本文 (header 直後〜最初の Scenario の間) に英語の SHALL または MUST が含まれる",
    "   - ### Requirement: と最初の #### Scenario: の間にコードブロック (```) がない",
    "   - ## Removed は - \"requirement name\" のリスト形式",
    "   - ## Renamed は - \"old name\" → \"new name\" のリスト形式",
    "3. 今回書いた delta spec ファイルをすべて Read し、違反箇所があれば修正してください",
    "4. 違反がなければ変更せず end_turn してください",
  ].join("\n"),
};
```

rules.md の path は `specrunner/changes/` 配下の相対パスで指示する (slug 非依存)。agent は作業 turn で cwd を把握しているため、相対パスで rules.md を探せる。

**Acceptance**:
- [x] `DesignStep.followUpPrompt` が非 undefined の string
- [x] 文面に rules.md の Read 指示が含まれる
- [x] 文面に delta spec 記法の具体的な規律が含まれる
- [x] 文面に self-fix (修正) の action 指示が含まれる
- [x] 文面に「判定」「レビュー」等の検出ゲート的表現が含まれない
- [x] `bun run typecheck` が green

---

## T-10: unit test — shared follow-up helper

**File**: `tests/adapter/shared/follow-up.test.ts` (新規)

`shouldRunFollowUp` と `mergeFollowUpResult` のテストを書く。

テストケース:
- `shouldRunFollowUp`: followUpPrompt 有 + success → true
- `shouldRunFollowUp`: followUpPrompt 有 + error → false
- `shouldRunFollowUp`: followUpPrompt 有 + timeout → false
- `shouldRunFollowUp`: followUpPrompt undefined + success → false
- `shouldRunFollowUp`: followUpPrompt 空文字 + success → false
- `mergeFollowUpResult`: sessionId が base から維持される
- `mergeFollowUpResult`: resultContent が follow の値になる
- `mergeFollowUpResult`: modelUsage が base の値を維持する (adapter が事前に更新済み前提)

**Acceptance**:
- [x] 全テストケースが green
- [x] `bun run test` が green

---

## T-11: unit test — ClaudeCodeRunner follow-up

**File**: `tests/unit/adapter/claude-code/agent-runner.test.ts` (既存に追加)

テストケース:
- followUpPrompt 指定時に queryFn が 2 回呼ばれる
- 2 回目の queryFn options に `resume: sessionId` が含まれる
- 2 回目の queryFn prompt が followUpPrompt である
- followUpPrompt 未指定時に queryFn が 1 回のみ
- modelUsage が follow turn の SDK 累積値 (最終 result から取得)
- follow turn が error の場合 result.completionReason === "error"
- AbortController abort が both turns に伝搬

**Acceptance**:
- [x] 全テストケースが green
- [x] `bun run test` が green

---

## T-12: unit test — CodexAgentRunner follow-up

**File**: `tests/adapter/codex/agent-runner.test.ts` (既存に追加)

テストケース:
- followUpPrompt 指定時に thread.run が 2 回呼ばれる (同一 thread)
- 2 回目の thread.run prompt が followUpPrompt
- followUpPrompt 未指定時に thread.run が 1 回のみ
- modelUsage が turn 1 + turn 2 の加算
- signal が follow turn にも渡される

**Acceptance**:
- [x] 全テストケースが green
- [x] `bun run test` が green

---

## T-13: unit test — ManagedAgentRunner follow-up

**File**: `tests/unit/adapter/managed-agent/agent-runner.test.ts` (既存に追加)

テストケース (SSE 経路):
- SSE end_turn + followUpPrompt 指定 → sendUserMessage 呼び出し + pollUntilComplete 呼び出し
- SSE terminated + followUpPrompt 指定 → follow turn 不実行
- followUpPrompt 未指定 → sendUserMessage 未呼び出し (follow 用途)
- follow turn の sendUserMessage 失敗 → warning + 作業 turn result 返却

テストケース (polling 経路):
- polling idle + followUpPrompt 指定 → sendUserMessage 2 回 + pollUntilComplete 2 回
- polling terminated + followUpPrompt 指定 → follow turn 不実行
- follow turn の sendUserMessage 失敗 → graceful degradation

**Acceptance**:
- [x] 全テストケースが green
- [x] `bun run test` が green

---

## T-14: 全体検証

**Command**: `bun run typecheck && bun run test`

全タスク完了後に実行。

**Acceptance**:
- [x] typecheck green
- [x] test green
- [x] FIXER_STEP_NAMES 無改修 (`grep -n "FIXER_STEP_NAMES" src/core/step/fixer-helpers.ts` で確認)
- [x] executor / finalizeStep の変更が followUpPrompt 転記のみ
- [x] pipeline の step 遷移に変更なし

---

## Task Dependencies

```
T-01 ─┐
T-02 ─┤
      ├→ T-03 → T-09 ─┐
T-04 ─┤                │
      ├→ T-05 ─┐       │
      ├→ T-06 ─┤       │
      ├→ T-07 ─┤       │
      └→ T-08 ─┤       │
               ├→ T-10 ┤
               ├→ T-11 ┤
               ├→ T-12 ┤
               ├→ T-13 ┤
               └───────→ T-14
```

T-01, T-02, T-04 は並列可能。T-03 は T-01 + T-02 に依存。T-05〜T-08 は T-04 に依存 (shared helper を import)。T-09 は T-02 に依存。テスト (T-10〜T-13) は対応する実装タスクに依存。T-14 は全タスクに依存。
