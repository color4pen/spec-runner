## 1. Phase 1 -- 型定義

- [x] 1.1 `src/state/lifecycle.ts` を新設し、`TransitionContext` 型を定義する
  ```typescript
  export interface TransitionContext {
    trigger: string;   // "pipeline", "signal-handler", "finish" 等
    reason: string;    // 人間可読な遷移理由
    patch?: Partial<Omit<JobState, "version" | "jobId" | "createdAt" | "status" | "history">>;
  }
  ```
- [x] 1.2 `src/state/lifecycle.ts`: `TransitionResult` 型を定義する
  ```typescript
  export interface TransitionResult {
    state: JobState;
    noop: boolean;     // 同一 status への遷移（冪等ケース）
  }
  ```

## 2. Phase 2 -- 遷移マップと定数

- [x] 2.1 `src/state/lifecycle.ts`: `VALID_TRANSITIONS` を定義する
  ```typescript
  export const VALID_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>> = new Map([
    ["running",         new Set(["awaiting-resume", "awaiting-merge", "failed", "terminated"])],
    ["awaiting-resume", new Set(["running", "canceled"])],
    ["awaiting-merge",  new Set(["archived"])],
    ["failed",          new Set(["running", "canceled"])],
    ["terminated",      new Set(["running", "canceled"])],
    ["archived",        new Set()],
    ["canceled",        new Set()],
  ]);
  ```
- [x] 2.2 `src/state/lifecycle.ts`: `TERMINAL_STATUSES` を export する
  ```typescript
  export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set(["archived", "canceled"]);
  ```
- [x] 2.3 `src/state/lifecycle.ts`: `ACTIVE_STATUSES` を export する
  ```typescript
  export const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set(["running", "awaiting-resume"]);
  ```

## 3. Phase 3 -- ガード関数

- [x] 3.1 `src/state/lifecycle.ts`: `canTransition` を実装する
  ```typescript
  export function canTransition(from: JobStatus, to: JobStatus): boolean {
    if (from === to) return true;  // noop は常に許可
    return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
  }
  ```
- [x] 3.2 `src/state/lifecycle.ts`: `isTerminal` を実装する
  ```typescript
  export function isTerminal(status: JobStatus): boolean {
    return TERMINAL_STATUSES.has(status);
  }
  ```

## 4. Phase 4 -- `transitionJob` 純粋関数

- [x] 4.1 `src/state/lifecycle.ts`: `transitionJob` を実装する
  ```typescript
  import { appendHistoryEntry } from "./schema.js";
  import type { JobState, JobStatus } from "./schema.js";

  export function transitionJob(
    state: JobState,
    to: JobStatus,
    ctx: TransitionContext,
  ): TransitionResult {
    // 同一 status → noop
    if (state.status === to) {
      return { state, noop: true };
    }

    // 遷移検証
    const allowed = VALID_TRANSITIONS.get(state.status);
    if (!allowed || !allowed.has(to)) {
      throw new Error(
        `Invalid transition: ${state.status} → ${to} (trigger: ${ctx.trigger}, reason: ${ctx.reason})`,
      );
    }

    // history 追記
    let updated = appendHistoryEntry(state, {
      ts: new Date().toISOString(),
      step: ctx.trigger,
      status: "ok",
      message: `${state.status} → ${to}: ${ctx.reason}`,
    });

    // patch マージ
    if (ctx.patch) {
      updated = { ...updated, ...ctx.patch };
    }

    // status 更新
    updated = { ...updated, status: to, updatedAt: new Date().toISOString() };

    return { state: updated, noop: false };
  }
  ```

## 5. Phase 5 -- 既存コード置換

- [x] 5.1 `src/core/finish/orchestrator.ts`: `isFullyFinished` import を削除し、`TERMINAL_STATUSES` を `../../state/lifecycle.js` から import する。`isFullyFinished(state)` を `TERMINAL_STATUSES.has(state.status)` に置換する
  ```typescript
  // Before:
  import { isFullyFinished } from "./idempotency.js";
  if (isFullyFinished(state)) {

  // After:
  import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
  if (TERMINAL_STATUSES.has(state.status)) {
  ```
- [x] 5.2 `src/core/finish/idempotency.ts` を削除する
- [x] 5.3 `src/cli/ps.ts`: ローカルの `ACTIVE_STATUSES` 定義を削除し、`../../state/lifecycle.js` から import する
  ```typescript
  // Before:
  const ACTIVE_STATUSES: Set<JobStatus> = new Set(["running", "awaiting-resume"]);

  // After:
  import { ACTIVE_STATUSES } from "../state/lifecycle.js";
  ```
  `JobStatus` の import は `../state/schema.js` から維持（`formatJobRow` の型注釈で使用）

## 6. Phase 6 -- テスト

- [x] 6.1 `tests/unit/state/lifecycle.test.ts` を新設する
- [x] 6.2 `VALID_TRANSITIONS` 網羅テスト: 全 `JobStatus`（7 値）× 全遷移先（7 値）の 49 組を検証する。許可された遷移は `canTransition` が `true` を返し、禁止された遷移は `false` を返すことを確認する
- [x] 6.3 `transitionJob` 正常遷移テスト: 許可された各遷移で `noop: false` が返り、`state.status` が更新され、history に遷移エントリが追記されることを検証する
- [x] 6.4 `transitionJob` noop テスト: 同一 status への遷移で `noop: true` が返り、state が変更されないことを検証する
- [x] 6.5 `transitionJob` 不正遷移テスト: 禁止された遷移（例: `archived` → `running`）で throw することを検証する。エラーメッセージに `from`, `to`, `trigger` が含まれることを確認する
- [x] 6.6 `transitionJob` patch マージテスト: `ctx.patch` で `error`, `resumePoint`, `step` 等が state にマージされることを検証する。`version`, `jobId`, `createdAt` が patch で上書きされないことを型レベルで保証（コンパイルエラー確認）
- [x] 6.7 `transitionJob` history ガードテスト: `MAX_HISTORY_SIZE` に達した state で遷移しても history が truncate されることを検証する
- [x] 6.8 `isTerminal` テスト: `archived` / `canceled` で `true`、それ以外で `false` を返すことを検証する
- [x] 6.9 `TERMINAL_STATUSES` / `ACTIVE_STATUSES` テスト: 期待値と一致することを検証する

## 7. Phase 7 -- 検証

- [x] 7.1 `bun run typecheck` が green であることを確認する
- [x] 7.2 `bun run test` が green であることを確認する（新規テスト + 既存テスト）
