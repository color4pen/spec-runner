# Tasks: transient-error-auto-retry

> 実装は implementer が行う。本ファイルは作業単位と受け入れ条件のみを定義する。
> 既存の `followUpAttempts` の貫通経路（port → state → journal → executor）を 1:1 で踏襲すること。

## T-01: transient 分類モジュールを追加する（fail-closed ホワイトリスト）

- [x] `src/adapter/claude-code/transient-error.ts` を新規作成する。
- [x] `isTransientAgentError(err: unknown): boolean` を実装する:
  - `err`（および nested `err.cause` を再帰的に）から message 文字列を集約し、case-insensitive で
    ホワイトリストトークンのいずれかを含むときだけ `true` を返す。
  - ホワイトリスト: 接続（`ConnectionRefused`/`ECONNREFUSED`/`ECONNRESET`/`EPIPE`/`ENETUNREACH`/
    `EHOSTUNREACH`/`EAI_AGAIN`）、socket（`FailedToOpenSocket`/`socket hang up`/`Unable to connect to API`）、
    network（`fetch failed`/`network error`/`ETIMEDOUT`/`request timed out`/`socket timeout`）、
    5xx 相当（`502`/`503`/`504`/`529`/`Internal Server Error`/`Bad Gateway`/`Service Unavailable`/
    `Gateway Timeout`/`Overloaded`、および status 文脈を伴う `500`）。
  - 未知・その他は `false`（fail-closed）。
- [x] このモジュールは pure（I/O / SDK import なし）であること。

**Acceptance Criteria**:
- `isTransientAgentError(new Error("...Unable to connect to API (ConnectionRefused)"))` === `true`
- `isTransientAgentError(new Error("...(FailedToOpenSocket)"))` === `true`
- `isTransientAgentError(new Error("something unexpected happened"))` === `false`
- nested `cause` に transient トークンを持つ error も `true` になる
- 5xx の単独数字列（status 文脈なし）には誤マッチしない

## T-02: 予算 config を追加する（top-level `transientRetry`）

- [x] `src/config/schema.ts`: `TransientRetryConfig { maxRetries?: number; baseDelayMs?: number }` を追加する。
- [x] `SpecRunnerConfig` に `transientRetry?: TransientRetryConfig` を追加する。
- [x] `DEFAULT_TRANSIENT_RETRY_MAX = 3` / `DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS = 1000` const を追加する。
- [x] `resolveTransientRetryConfig(config): Required<TransientRetryConfig>` を `resolveInboxConfig` と同型で追加する。
- [x] zod `configSchema`（`schema.ts:464` の `object({...})`）に `transientRetry` の構造検証を追加する:
  `maxRetries`（int ≥ 0）、`baseDelayMs`（int ≥ 0）、いずれも optional、object でなければエラー。

**Acceptance Criteria**:
- `resolveTransientRetryConfig({})` が `{ maxRetries: 3, baseDelayMs: 1000 }` を返す
- `resolveTransientRetryConfig({ transientRetry: { maxRetries: 0 } })` の `maxRetries` が 0
- `transientRetry.maxRetries: -1` の config が CONFIG_INVALID で弾かれる
- 既存 config（`transientRetry` 不在）が引き続き valid

## T-03: AgentRunResult に transientRetryAttempts を追加する（port）

- [x] `src/core/port/agent-runner.ts`: `AgentRunResult` に `transientRetryAttempts?: number`
  （0 = 再試行なし）を `followUpAttempts` 近傍に追加し、doc コメントを付ける。

**Acceptance Criteria**:
- 型追加のみで `typecheck` が green（既存の return 箇所は optional なので壊れない）

## T-04: ClaudeCodeRunner に main work turn の自動再試行を実装する

- [x] `src/adapter/claude-code/agent-runner.ts`:
  - main work turn（`runQuery()` + 既存の resume→新規 session fallback、現 `:284-303`）を内部関数
    `runMainWorkTurn()` として括り出す（redirect 判定・subtype 判定・report_result follow-up・
    postWork は retry の外＝成功後に据え置く）。
  - `resolveTransientRetryConfig(ctx.config)` で `maxRetries` / `baseDelayMs` を解決する。
  - `maxRetries === 0`: `runMainWorkTurn()` を直接呼ぶ（wrapper なし・event なし・attempts 記録なし）。
  - `maxRetries > 0`: `retryWithBackoff(runMainWorkTurn, { maxAttempts: maxRetries + 1, baseDelayMs,
    isTransientError: (err) => !abortController.signal.aborted && isTransientAgentError(err),
    sleepFn: this.sleepFn, onRetry: (attempt) => { transientRetryAttempts = attempt;
    ctx.emit("step:retry", { step: step.name, attempt, maxRetries, delayMs }); } })` で包む。
  - exhausted 時は `retryWithBackoff` が最後の transient error を re-throw → 既存末尾 `catch`
    （`:486-514`）が `completionReason: "error"` に変換する経路を維持する。
  - `run()` の **全 return 分岐**（success / error / timeout / redirect-limit / result-file-not-found）に
    `transientRetryAttempts`（既定 0、exhausted 時は `maxRetries`）を載せる。
- [x] `ClaudeCodeRunnerDeps` に `_sleepFn?: (ms: number) => Promise<void>` を追加し、constructor で
  `this.sleepFn` に束ねる（既定は `setTimeout` ベース）。`retryWithBackoff` の `sleepFn` に渡す。

**Acceptance Criteria**:
- 1 回 transient → 2 回目 success の mock で `completionReason: "success"`、`transientRetryAttempts === 1`
- 毎回 transient の mock で `queryFn` 呼び出しが正確に `maxRetries + 1` 回、`completionReason: "error"`、
  `code: "CLAUDE_CODE_QUERY_FAILED"`、`transientRetryAttempts === maxRetries`
- 未知 error の mock で `queryFn` 呼び出し 1 回・即 `error`（backoff sleep を経ない）
- `abortController.signal.aborted` 起因の throw は再試行されず `completionReason: "timeout"`
- `maxRetries: 0` で `queryFn` 1 回・即 `error`・`step:retry` 未発火・`transientRetryAttempts` 不記録
- `_sleepFn` 注入により persistent transient の test が実時間 backoff を待たずに完走する

## T-05: step:retry DomainEvent と payload を追加する

- [x] `src/kernel/event-types.ts`: `DomainEvent` union に `"step:retry"` を追加する。
- [x] `src/core/event/types.ts`: `EventPayloadMap` に
  `"step:retry": { step: string; attempt: number; maxRetries: number; delayMs: number }` を追加する。

**Acceptance Criteria**:
- `typecheck` が green（emit/on が新 event を型として認識する）

## T-06: 進捗 stdout / per-job log に再試行を表示する

- [x] `src/cli/progress.ts`: `ProgressReporter` が `step:retry` を購読し、
  `[<step>] transient error — retrying (<attempt>/<maxRetries>)…` を stderr に出力する（quiet 時は抑制可）。
- [x] `src/logger/pipeline-logger.ts`: `step:retry` を購読し per-job log に 1 行記録する（best-effort）。

**Acceptance Criteria**:
- `step:retry` 発火時に stderr に再試行行が出る（mock event で検証）
- quiet モードでの抑制ポリシーが既存の他 event と整合する

## T-07: transientRetryAttempts を state projection に通す

- [x] `src/state/schema.ts`: `StepOutcome` に `transientRetryAttempts?: number` を `followUpAttempts` 近傍に追加する。
- [x] `src/state/helpers.ts`: `StepResultInput` に `transientRetryAttempts?: number` を追加し、
  `pushStepResult` の `outcome` 構築で `followUpAttempts` と同様に「undefined のとき省略」で書く。

**Acceptance Criteria**:
- `pushStepResult(state, "design", { ..., transientRetryAttempts: 2 })` の StepRun.outcome に値が入る
- `transientRetryAttempts` 未指定時は `outcome` に当該キーが現れない（backward compat）

## T-08: transientRetryAttempts を events.jsonl journal に通す

- [x] `src/store/event-journal.ts`:
  - `StepAttemptRecord.outcome` に `transientRetryAttempts?: number` を追加する。
  - `stepRunToRecord()` の outcome 構築に「undefined のとき省略」で追加する。
  - `fold()` の StepRun 復元（`:183-195`）に同フィールドを「undefined のとき省略」で追加する。

**Acceptance Criteria**:
- `stepRunToRecord("design", run)`（run.outcome.transientRetryAttempts = 2）が record に値を持つ
- `fold(content)` が journal の `transientRetryAttempts` を StepRun.outcome に復元する
- フィールド不在の旧 journal 行も従来どおり fold できる（backward compat）

## T-09: executor から transientRetryAttempts を貫通させる

- [x] `src/core/step/executor.ts`:
  - success 経路: `finalizeStep(...)` の `agentResult` に `transientRetryAttempts: runResult.transientRetryAttempts`
    を載せ、`finalizeStep` 内の `pushStepResult` 呼び出しに通す（`followUpAttempts` と同じ箇所）。
  - error 経路（`runResult.completionReason !== "success"`、`:322-334`）: `recordFailedStepResult(state,
    step.name, errorInfo, { completedAt, startedAt, transientRetryAttempts: runResult.transientRetryAttempts })`。
  - timeout 経路（`:288-320`）: 同様に `transientRetryAttempts`（通常 0）を `recordFailedStepResult` に渡す。
- [x] `src/core/step/executor.ts` の `finalizeStep` シグネチャ（`agentResult` object）に
  `transientRetryAttempts?: number` を追加する。
- [x] `recordFailedStepResult`（`executor-helpers.ts`）は `partial` 経由で受けるため、T-07 の
  `StepResultInput` 追加で透過的に通る（追加実装は不要、`partial` に値を渡すだけ）。

**Acceptance Criteria**:
- success-after-retry で `StepRun.outcome.transientRetryAttempts` が記録される
- halt-after-retry（error 経路）の failed `StepRun` にも `transientRetryAttempts` が記録され、
  「N 回再試行の末の halt」と「即 halt（0/不在）」が後から区別できる

## T-10: テストを追加する

- [x] `transient-error.ts` の unit test（T-01 の Acceptance を網羅、nested cause / fail-closed / 5xx 誤マッチ抑制）。
- [x] `resolveTransientRetryConfig` と zod 検証の test（既定値 / 0 / 負値 reject）。
- [x] ClaudeCodeRunner の adapter test（`_queryFn` / `_sleepFn` 注入）:
  - 1 回 transient → success（halt せず完走、`transientRetryAttempts === 1`）。← AC1
  - persistent transient → `queryFn` 呼び出し `maxRetries + 1` 回 → `completionReason: "error"`
    （無限ループしないことの直接検証）。← AC2
  - 非 transient（未知文字列）→ 呼び出し 1 回・即 error。← AC3
  - `maxRetries: 0` → 呼び出し 1 回・即 error・event 未発火（現行一致）。← AC5
  - abort timeout → 再試行されず `timeout`。
- [x] executor / state / journal の test:
  - success-after-retry で StepRun / events.jsonl に `transientRetryAttempts` が載る。← AC4
  - error 経路（persistent transient）で pipeline が `awaiting-resume` に到達し、failed StepRun に
    attempts が記録される（integration、無限ループしないことの確認）。← AC2 / AC4
- [x] `step:retry` の進捗出力 test（mock event で stderr 行を検証）。← AC4

**Acceptance Criteria**:
- request の受け入れ基準 6 項目すべてに対応する test が存在し green
- persistent transient の test が `queryFn` 呼び出し回数の上限を assert している（boundedness の直接検証）

## T-11: 検証

- [x] `typecheck` が green。
- [x] `test` が green。

**Acceptance Criteria**:
- `typecheck && test` が green（request 受け入れ基準）
