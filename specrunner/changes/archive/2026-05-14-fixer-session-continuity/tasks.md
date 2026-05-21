# Tasks: fixer-session-continuity

## [x] T-01: AgentRunContext に resumeSessionId フィールドを追加する

**Design ref**: D1

**File**: `src/core/port/agent-runner.ts`

**Changes**:
- `AgentRunContext` interface に `resumeSessionId?: string` フィールドを追加する
- JSDoc: "前回の fixer session ID。存在する場合 adapter は既存 session を継続する。未指定時は新規 session を作成する。"

**Verification**:
- `bun run typecheck` が green
- 既存テストが全 pass（フィールドは optional なので breaking change なし）

---

## [x] T-02: fixer-helpers.ts を新規作成する

**Design ref**: D6

**File**: `src/core/step/fixer-helpers.ts`（新規作成）

**Changes**:

```ts
import { STEP_NAMES } from "./step-names.js";
import type { JobState } from "../../state/schema.js";

/** fixer ステップ名の集合 */
export const FIXER_STEP_NAMES: ReadonlySet<string> = new Set([
  STEP_NAMES.SPEC_FIXER,
  STEP_NAMES.BUILD_FIXER,
  STEP_NAMES.CODE_FIXER,
]);

/**
 * 前回の fixer session ID を取得する。
 * 初回実行（前回 run なし）または前回 sessionId が null の場合は null を返す。
 */
export function getPreviousSessionId(
  state: JobState,
  stepName: string,
): string | null {
  const runs = state.steps?.[stepName];
  if (!runs || runs.length === 0) return null;
  const lastRun = runs[runs.length - 1];
  return lastRun?.sessionId ?? null;
}

/**
 * session 継続判定。前回の run が存在し sessionId が非 null であれば true。
 */
export function isFixerContinuation(
  state: JobState,
  stepName: string,
): boolean {
  return getPreviousSessionId(state, stepName) !== null;
}

/**
 * 継続時の短縮 prompt を生成する。
 * session 内に前回のコンテキストが残っているため、新しい findings パスのみを伝える。
 */
export function buildContinuationMessage(opts: {
  stepName: string;
  findingsPath: string;
  /** @reserved 将来のテンプレート拡張（例: ログ出力やパス解決）のために保持。現在は出力文字列には使用しない。 */
  slug: string;
}): string {
  // build-fixer は verification（CLI ステップ）からの findings、それ以外は reviewer からの findings
  const STEP_NAMES_BUILD_FIXER = "build-fixer";
  const source =
    opts.stepName === STEP_NAMES_BUILD_FIXER ? "verification" : "reviewer";
  return `<user-request>
前回の修正に対して ${source} から新しい findings が出ました。

新しい findings: ${opts.findingsPath}

前回のセッションの文脈を踏まえて、新しい findings の指摘事項を修正してください。
前回試みたアプローチで不十分だった箇所は別のアプローチを検討してください。

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
</user-request>`;
}
```

**Verification**:
- `bun run typecheck` が green

---

## [x] T-03: fixer-helpers のユニットテストを作成する

**Design ref**: D6

**File**: `tests/core/step/fixer-helpers.test.ts`（新規作成）

**Test cases**:

1. `FIXER_STEP_NAMES` が spec-fixer, build-fixer, code-fixer の 3 つを含む
2. `getPreviousSessionId` — state.steps が undefined → null
3. `getPreviousSessionId` — state.steps[stepName] が空配列 → null
4. `getPreviousSessionId` — 前回 run の sessionId が "sess-abc" → "sess-abc"
5. `getPreviousSessionId` — 前回 run の sessionId が null → null
6. `isFixerContinuation` — 前回 run あり + sessionId あり → true
7. `isFixerContinuation` — 前回 run なし → false
8. `isFixerContinuation` — 前回 run あり + sessionId null → false
9. `buildContinuationMessage` — findingsPath が出力に含まれる
10. `buildContinuationMessage` — `<user-request>` タグで囲まれている
11. `buildContinuationMessage` — request.md の全文や project.md の再注入が含まれない

**Verification**:
- `bun test tests/core/step/fixer-helpers.test.ts` が green

---

## [x] T-04: StepExecutor に resumeSessionId の注入ロジックを追加する

**Design ref**: D2

**File**: `src/core/step/executor.ts`

**Changes**:

`runAgentStep()` 内の ctx 構築箇所（L116-130 付近）を変更:

1. `fixer-helpers.ts` から `FIXER_STEP_NAMES` と `getPreviousSessionId` を import する
2. ctx 構築時に以下を追加:
   ```ts
   const resumeSessionId = FIXER_STEP_NAMES.has(step.name)
     ? getPreviousSessionId(state, step.name)
     : undefined;
   ```
3. ctx オブジェクトに `resumeSessionId` を含める（`undefined` の場合は adapter 側で無視される）

**注意**: Pipeline は変更しない。StepExecutor のみが state.steps を解釈する。

**Verification**:
- `bun run typecheck` が green
- 既存テストが全 pass

---

## [x] T-05: ClaudeCodeRunner に session 継続を実装する

**Design ref**: D3, D4

**File**: `src/adapter/claude-code/agent-runner.ts`

**Changes**:

1. `run()` 内の `this.queryFn()` 呼び出し箇所（L122-132 付近）で、`ctx.resumeSessionId` がある場合に `options.resume` を追加:
   ```ts
   const resumeOption: Record<string, unknown> =
     ctx.resumeSessionId ? { resume: ctx.resumeSessionId } : {};
   ```
   `options` に `...resumeOption` を spread する。

2. フォールバック: `queryFn` がエラーを throw した場合、`ctx.resumeSessionId` が設定されていればリトライする。catch ブロックで `ctx.resumeSessionId` を確認し、存在する場合は warn ログを出力して `resume` なしで再度 `queryFn` を呼ぶ。タイムアウトの場合はフォールバックしない（abort は session 継続の問題ではない）。

**Verification**:
- `bun run typecheck` が green

---

## [x] T-06: ClaudeCodeRunner の resume テストを追加する

**Design ref**: D3, D4

**File**: `tests/unit/adapter/claude-code/agent-runner.test.ts`

**Test cases**:

1. `resumeSessionId` あり → `queryFn` に `resume: "sess-abc"` が渡される
2. `resumeSessionId` なし → `queryFn` に `resume` フィールドが含まれない
3. `resumeSessionId` あり + session 継続エラー → warn ログ + resume なしでリトライ → 成功
4. `resumeSessionId` あり + timeout エラー → フォールバックせずそのまま timeout 返却

**Verification**:
- `bun test tests/unit/adapter/claude-code/agent-runner.test.ts` が green

---

## [x] T-07: CodexAgentRunner に session 継続を実装する

**Design ref**: D3, D4

**File**: `src/adapter/codex/agent-runner.ts`

**Changes**:

1. `CodexThread` interface に `id: string` プロパティを追加:
   ```ts
   interface CodexThread {
     id: string;
     run(prompt: string): Promise<string>;
     // ... existing properties
   }
   ```

2. `CodexInstance` interface に `resumeThread` を追加:
   ```ts
   resumeThread(threadId: string): CodexThread;
   ```

3. `run()` 内の thread 作成箇所（L122-128 付近）で、`ctx.resumeSessionId` がある場合に分岐:
   ```ts
   const thread = ctx.resumeSessionId
     ? codex.resumeThread(ctx.resumeSessionId)
     : codex.startThread({ ... });
   ```

4. `run()` の return に `sessionId: thread.id` を追加（StepRun への永続化に必須）:
   ```ts
   return {
     ...,
     sessionId: thread.id,
   };
   ```

5. フォールバック: `resumeThread` またはその後の `thread.run()` がエラーを throw した場合、`ctx.resumeSessionId` が設定されていれば warn ログを出力して `startThread` で新規作成し再実行。

**Verification**:
- `bun run typecheck` が green

---

## [x] T-08: CodexAgentRunner の resume テストを追加する

**Design ref**: D3, D4

**File**: `tests/adapter/codex/agent-runner.test.ts`

**Test cases**:

1. `resumeSessionId` あり → `codex.resumeThread(id)` が呼ばれる（`startThread` は呼ばれない）
2. `resumeSessionId` なし → `codex.startThread()` が呼ばれる（`resumeThread` は呼ばれない）
3. `resumeSessionId` あり + resumeThread エラー → fallback to startThread → 成功
4. `resumeSessionId` あり → `run()` の戻り値に `sessionId` が含まれ `thread.id` と一致する（sessionId が StepRun に永続化されることを保証）

**Verification**:
- `bun test tests/adapter/codex/agent-runner.test.ts` が green

---

## [x] T-09: ManagedAgentRunner に session 継続を実装する

**Design ref**: D3, D4

**File**: `src/adapter/managed-agent/agent-runner.ts`

**Changes**:

`runPollingStyle()` 内で `ctx.resumeSessionId` が存在する場合の分岐を追加:

1. `resumeSessionId` がある場合:
   - `createSession()` をスキップ
   - `sessionId` に `ctx.resumeSessionId` を使う
   - `sendUserMessage(ctx.resumeSessionId, message)` で既存 session にメッセージを送る
   - 以降の `pollUntilComplete` は同じ sessionId で実行

2. `resumeSessionId` がない場合: 現行の `createSession()` + `sendUserMessage()` パス

3. フォールバック: `sendUserMessage` がエラーを throw した場合（session not found / expired 等）、warn ログを出力して `createSession()` → `sendUserMessage()` の通常パスにフォールバック。

4. `preSessionHeadSha` の取得タイミングは変更しない（session 継続でも agent 開始前に取る）。

**Verification**:
- `bun run typecheck` が green

---

## [x] T-10: ManagedAgentRunner の resume テストを追加する

**Design ref**: D3, D4

**File**: `tests/unit/adapter/managed-agent/agent-runner.test.ts`

**Test cases**:

1. `resumeSessionId` あり → `createSession` が呼ばれない + `sendUserMessage` が resumeSessionId で呼ばれる
2. `resumeSessionId` なし → `createSession` が呼ばれる（従来動作）
3. `resumeSessionId` あり + sendUserMessage エラー → fallback to createSession → 成功

**Verification**:
- `bun test tests/unit/adapter/managed-agent/agent-runner.test.ts` が green

---

## [x] T-11: spec-fixer の buildMessage に continuation 分岐を追加する

**Design ref**: D5

**File**: `src/core/step/spec-fixer.ts`

**Changes**:

`buildMessage` の先頭で `isFixerContinuation` を呼び、true の場合は `buildContinuationMessage` を返す:

```ts
buildMessage(state: JobState, deps: StepDeps): string {
  if (!state.branch) throw branchNotSetError(STEP_NAMES.SPEC_FIXER);

  // Session 継続の場合は短縮 prompt
  if (isFixerContinuation(state, STEP_NAMES.SPEC_FIXER)) {
    const specReviewResult = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW);
    const findingsPath = specReviewResult?.findingsPath ?? specReviewResultPath(deps.slug, 1);
    return buildContinuationMessage({
      stepName: STEP_NAMES.SPEC_FIXER,
      findingsPath,
      slug: deps.slug,
    });
  }

  // 初回は現行の full prompt
  const specReviewResult = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW);
  const findingsPath = specReviewResult?.findingsPath ?? specReviewResultPath(deps.slug, 1);
  return buildSpecFixerInitialMessage({ ... });
},
```

import 追加: `isFixerContinuation`, `buildContinuationMessage` from `./fixer-helpers.js`

**Verification**:
- `bun run typecheck` が green

---

## [x] T-12: code-fixer の buildMessage に continuation 分岐を追加する

**Design ref**: D5

**File**: `src/core/step/code-fixer.ts`

**Changes**:

`buildMessage` の先頭（branch guard の後、review result 取得の後）で `isFixerContinuation` を呼び、true の場合は `buildContinuationMessage` を返す。

review result の存在チェック（`CODE_FIXER_NO_REVIEW_RESULT` throw）は初回・継続問わず実行する（前提条件の検証は常に必要）。

import 追加: `isFixerContinuation`, `buildContinuationMessage` from `./fixer-helpers.js`

**Verification**:
- `bun run typecheck` が green

---

## [x] T-13: build-fixer の buildMessage に continuation 分岐を追加する

**Design ref**: D5

**File**: `src/core/step/build-fixer.ts`

**Changes**:

`buildMessage` の先頭（branch guard の後、verification result 取得の後）で `isFixerContinuation` を呼び、true の場合は `buildContinuationMessage` を返す。

verification result の存在チェック（`BUILD_FIXER_NO_VERIFICATION_RESULT` throw）は初回・継続問わず実行する。

import 追加: `isFixerContinuation`, `buildContinuationMessage` from `./fixer-helpers.js`

**Verification**:
- `bun run typecheck` が green

---

## [x] T-14: 全体の typecheck + test を実行する

**Design ref**: 受け入れ基準

**Verification**:
- `bun run typecheck` が green
- `bun run test` が green（全テスト pass）

---

## Dependency Graph

```
T-01 (port)
  │
  ├─── T-02 (helpers) ──── T-03 (helper tests)
  │       │
  │       ├─── T-04 (executor) ──────────────────────────────┐
  │       │                                                   │
  │       ├─── T-11 (spec-fixer buildMessage)                 │
  │       ├─── T-12 (code-fixer buildMessage)                 │
  │       └─── T-13 (build-fixer buildMessage)                │
  │                                                           │
  ├─── T-05 (claude-code) ── T-06 (claude-code tests)        │
  ├─── T-07 (codex) ──────── T-08 (codex tests)              │
  └─── T-09 (managed) ────── T-10 (managed tests)            │
                                                              │
                                               T-14 (final verify)
```

**Critical path**: T-01 → T-02 → T-04 → T-14
**Parallelizable**: T-05/T-07/T-09 (adapters) are independent of each other and of T-11/T-12/T-13 (fixer steps), but all depend on T-01.
