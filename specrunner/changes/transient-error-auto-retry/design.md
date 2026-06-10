# Design: transient-error-auto-retry

## Context

agent session が一過性のインフラエラー（API 接続失敗等）で落ちると、pipeline は即 halt し
人間が `job resume` を打つまで止まる。実例（観測値）:

- `Claude Code SDK query failed: ... API Error: Unable to connect to API (ConnectionRefused)`
- 同 `(FailedToOpenSocket)`

これらは local Claude Code adapter の `ClaudeCodeRunner.run()` の **throw 経路**で生成される
（`src/adapter/claude-code/agent-runner.ts:502-514`、`code: "CLAUDE_CODE_QUERY_FAILED"`）。
現挙動では:

1. `runQuery()`（SDK `query()` 反復）が接続エラーを throw する。
2. `run()` 末尾の `catch` がこれを `AgentRunResult { completionReason: "error", error }` に変換して返す。
3. `StepExecutor.runAgentStep()` の `runResult.completionReason !== "success"` 分岐が
   `recordFailedStepResult` + `store.fail` + rethrow を実行（`executor.ts:322-334`）。
4. `Pipeline.runInternal()` が throw を catch → `state.status === "failed"` →
   `getStepOutcome()` が `"error"` を返す → 遷移表が `escalate` → `awaiting-resume` +
   `resumePoint` 記録（`pipeline.ts:198-215`, `289-305`）。

つまり「素の `job resume` で落ちた step から再入して成功する」のが現状の復帰パターン。
本変更は、この throw を halt に直行させる前に**有限回・指数 backoff で自動再試行**し、
瞬断を無人で吸収する。予算を使い切ったら現行と同一の halt に落ちる。

### 既存の部品と前例

- `src/util/retry.ts` の `retryWithBackoff<T>`：指数 backoff、`maxAttempts`（総試行数、既定 4）、
  `isTransientError`（throw 経路）/ `shouldRetryResult`（戻り値経路）、`sleepFn` 注入、`onRetry` callback。
  exhausted 時は最後の error を re-throw する。
- **report_result follow-up retry**（`agent-runner.ts:356-382`）：adapter 内に閉じた有限 retry ループ。
  → 「有限 retry を adapter 内に置く」前例そのもの。
- `followUpAttempts`：adapter が試行回数を `AgentRunResult` で返し、executor が StepRun /
  events.jsonl に記録する既存の貫通経路。本変更の `transientRetryAttempts` はこれを 1:1 で踏襲する。
- `SESSION_RETRIES_EXHAUSTED` error code が既に存在（`errors.ts:81`）。

### 制約

- transient 分類はホワイトリストで定義し **fail-closed**（未知・その他は transient ではない＝即 halt）。
- escalation の脱出口（loop exhaustion → awaiting-resume の意味論）は変更しない。
- wall-clock の step timeout（`abortController` による abort）は transient ではない。
  これは既存の budget cap であり `completionReason: "timeout"` → awaiting-resume に振り分けられる。
  自動再試行の対象から明示的に除外する。
- managed runtime の session 再スケジューリングは scope 外（本変更は local adapter のみに作用する）。

## Goals / Non-Goals

**Goals**:

- transient エラー（接続失敗 / socket / 5xx 相当 / network timeout）を local adapter の
  main work turn で有限回・指数 backoff 自動再試行する。
- 予算は config 可変（既定 3、0 で機能無効＝現行挙動に完全一致）。
- 再試行回数を `StepRun.outcome` / `events.jsonl` に記録し、進捗 stdout に再試行中である旨を出す。
- 予算を使い切ったら現行と同一の halt（awaiting-resume + resumePoint）に落ちる。

**Non-Goals**:

- 外側からの見守り・自動 resume（inbox の責務）。
- transient 以外（agent 判断エラー・verification 失敗・max_turns 等）の再試行。
- managed runtime の session 再スケジューリング機構の変更。
- subtype エラー経路（`lastResult.subtype !== "success"`、`agent-runner.ts:322`）の再試行。
  observed transient は throw 経路で生成されるため、subtype 経路は fail-closed で即 halt のまま据え置く。

## Decisions

### D1: 再試行は ClaudeCodeRunner（local adapter）の main work turn 内に置く

要件 2 の「adapter 内 query 再試行 / executor による step 再実行」の選択は **adapter 内**とする。

**理由**:

- transient エラーは `ClaudeCodeRunner.run()` の throw 経路で生成される。発生源で吸収するのが最小ブラスト半径。
- report_result follow-up retry が既に adapter 内の有限ループとして存在する（同じループ規律の適用）。
- executor 再実行は `buildMessage` / `enrichContext` / `prepareStepArtifacts` を含む step 全体の
  再構築になり、状態機械の error 経路（`store.fail` / 遷移）も複雑化する。本変更が触りたいのは
  「SDK query の瞬断吸収」だけである。
- managed reschedule は scope 外であり、runtime-neutral 化の動機が薄い。

`run()` 内の main work turn（`runQuery()` + 既存の resume→新規 session fallback、`agent-runner.ts:284-303`）を
内部関数 `runMainWorkTurn()` として括り出し、`retryWithBackoff` で包む。redirect 判定・subtype 判定・
report_result follow-up・postWork prompts は retry の**外**（成功後）に据え置く。

```
budget = resolveTransientRetryConfig(ctx.config).maxRetries   // 既定 3
if budget === 0:
    queryResult = await runMainWorkTurn()                      // 現行と同一経路（ラップしない）
else:
    queryResult = await retryWithBackoff(runMainWorkTurn, {
      maxAttempts: budget + 1,                                 // 初回 1 + retry budget
      baseDelayMs,
      isTransientError: (err) => !abortController.signal.aborted && isTransientAgentError(err),
      sleepFn: this.sleepFn,                                   // 注入可（test で 0ms）
      onRetry: (attempt) => { transientRetryAttempts = attempt; ctx.emit("step:retry", {...}); },
    })
```

#### 再入セマンティクス

**session の連続性**: `runMainWorkTurn()` の retry は単一 `ClaudeCodeRunner.run()` の呼び出し内で行われる。
retry は `run()` の先頭に戻らず、失敗した `runMainWorkTurn()` 呼び出しを再実行するだけである。
各 `runMainWorkTurn()` は `query()` SDK 呼び出しを一から開始する。すなわち
**retry ごとに新規 Claude Code session が起動**される（既存 session を引き継がない）。
session ID・conversation history はリセットされ、新 session は step 開始時と同じ context（`buildMessage` 済みの `initialMessage`）から始まる。

**worktree 残留成果**: 失敗した attempt が worktree に部分的な成果物を書き出している場合、
次の retry 開始時にその成果物は残留している。`runMainWorkTurn()` のリセット範囲は SDK session だけであり、
worktree ファイルシステムはクリアされない。

**各 step class の安全性**: retry が安全に動作するためには、各 step class が残留成果の存在下で
べき等に再入できる必要がある。実際の根拠:

- **Implementer**: `tasks.md` のチェックボックス状態を読み取り、完了済みタスクをスキップして未完了から作業を再開する。
  部分的に作成されたファイルが残っていても、タスク完了判定はチェックボックスに基づくため二重作業は起きない。
- **Reviewer / Verifier**: 既存の成果物（差分・レポート等）を read-then-write するパターンで動作し、
  前回 attempt の残留物を上書きする。
- **一般原則**: 各 step の agent prompt は「現在の worktree 状態を観察してから作業する」設計になっており、
  残留成果は次 attempt の開始状態として適法に扱われる。残留が問題になる構造的な理由は存在しない。

#### 予算 = 単一 `run()` 内の in-memory カウンタ（reset-on-success の等価性）

要件 5「予算は step の成功でのみリセット／同一 step 内で失敗し続ける限り減る一方」は、
**新たな永続予算 state を導入せずに**、単一 `run()` 内の retry ループカウンタで満たす。等価性の根拠:

- transient な `completionReason: "error"` は pipeline を **halt** させる（escalate → awaiting-resume）。
  同一 pipeline 実行内で同じ step に**戻ってくる経路は存在しない**（loop は fixer 経由でのみ再入し、
  そこへ至るのは agent run が `success` で完了して verdict を出した場合に限られる）。
- したがって「transient で失敗し続ける step」は単一 pipeline 実行内で `run()` が再呼び出しされない。
  ループカウンタは attempt が増える一方（減る一方の予算）であり、success すればループを抜けて
  次の step / 次の `run()` は予算満タンから始まる。
- これは「step 成功でのみ予算がリセットされる永続予算」と**観測上同一**でありながら、最小依存
  （永続 state の追加なし）を保つ。
- exhaustion 後の人間 / inbox による `job resume` は本機能の自動予算とは別軸（scope 外）。無人の自動
  ループは budget で有限（無限再試行は構造的に起こさない）。

### D2: transient 分類はホワイトリスト（fail-closed）

新規 pure module `src/adapter/claude-code/transient-error.ts` に `isTransientAgentError(err: unknown): boolean`
を実装する。`err.message` と nested `err.cause`（再帰）を case-insensitive で走査し、ホワイトリスト
トークンのいずれかを含むときだけ `true`。未知・その他は `false`（即 halt）。

ホワイトリスト（接続失敗 / socket / network timeout / 5xx 相当）:

- 接続: `ConnectionRefused`, `ECONNREFUSED`, `ECONNRESET`, `EPIPE`, `ENETUNREACH`, `EHOSTUNREACH`, `EAI_AGAIN`
- socket: `FailedToOpenSocket`, `socket hang up`, `Unable to connect to API`
- fetch/network: `fetch failed`, `network error`
- timeout（network 層）: `ETIMEDOUT`, `request timed out`, `socket timeout`
- 5xx 相当: `500`, `502`, `503`, `504`, `529`, `Internal Server Error`, `Bad Gateway`,
  `Service Unavailable`, `Gateway Timeout`, `Overloaded`

> 5xx の数値トークン（`500` 等）は「HTTP status 503」型のメッセージにマッチする想定。誤検知を抑えるため
> `isTransientAgentError` は status 文脈（`status`/`HTTP`/`Error`/`API` 近傍）を伴う数値のみ拾う実装とし、
> 単独の桁列にはマッチさせない。最終トークン set と判定ロジックは実装で確定するが、原則は fail-closed を堅持する。

**abort timeout の除外**: wall-clock step timeout は `abortController.signal.aborted === true` で検出される。
D1 の `isTransientError` closure は `!abortController.signal.aborted` を前置し、abort 起因の throw は
分類器に渡さず即 re-throw させる。これにより既存の `completionReason: "timeout"` 振り分けが保たれる。

### D3: 予算 config — top-level `transientRetry`

`SpecRunnerConfig` に top-level `transientRetry?: TransientRetryConfig` を追加する:

```ts
interface TransientRetryConfig {
  /** 自動再試行の最大回数。0 = 無効（現行挙動）。既定 3。 */
  maxRetries?: number;
  /** 初回 retry の待機 ms（以降は指数 2 倍）。既定 1000。 */
  baseDelayMs?: number;
}
```

- `resolveTransientRetryConfig(config): Required<TransientRetryConfig>` を `resolveInboxConfig` と同型で追加
  （`DEFAULT_TRANSIENT_RETRY_MAX = 3`, `DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS = 1000`）。
- zod `configSchema` に `transientRetry` の構造検証を追加（`maxRetries`: int ≥ 0、`baseDelayMs`: int ≥ 0）。
- naming は provider 非依存（upstream provider 固有名を使わない）。`pipeline.maxRetries`
  （spec-review iteration）とは別 namespace で衝突しない。
- 上限は global（step 別解決チェーンには載せない）。要件 6 は「config 可変・既定 3・0 で無効」のみ要求。
- **`maxRetries === 0` のとき adapter は retry wrapper を一切通さない**（`runMainWorkTurn()` を直接呼ぶ）。
  `step:retry` event も `transientRetryAttempts` も出さない → 現行挙動とバイト単位で一致（要件 / AC5）。
- managed runtime では `transientRetry` は無視される（本変更は ClaudeCodeRunner にのみ実装）。

### D4: 観測可能性 — StepRun / events.jsonl + 進捗 event

`followUpAttempts` と同じ貫通経路で `transientRetryAttempts: number` を流す。

1. `AgentRunResult.transientRetryAttempts?: number`（port）— adapter → executor チャネル。
   0 = 再試行なし。`run()` の全 return 分岐で設定する（success / error / timeout）。
2. `StepOutcome.transientRetryAttempts?: number`（`state/schema.ts`）— projection。
3. `StepResultInput` + `pushStepResult`（`state/helpers.ts`）— write path（`followUpAttempts` と同様に
   `undefined` のとき省略）。
4. `StepAttemptRecord.outcome` + `stepRunToRecord` + `fold`（`store/event-journal.ts`）— events.jsonl への
   書き出しと read 復元。→ 要件 4「events.jsonl に記録」を満たす。
5. executor: `finalizeStep`（success 経路）と `recordFailedStepResult`（error / timeout 経路）の両方に
   `runResult.transientRetryAttempts` を渡す。→ 「N 回再試行の末の halt」と「即 halt（=0）」が後から区別できる。

**進捗 stdout**: 新 DomainEvent `"step:retry"` を追加する。

- `kernel/event-types.ts` の union に `"step:retry"` を追加。
- `core/event/types.ts` の `EventPayloadMap` に
  `"step:retry": { step: string; attempt: number; maxRetries: number; delayMs: number }` を追加。
- adapter の `onRetry` で `ctx.emit("step:retry", {...})` を発火。
- `cli/progress.ts` の `ProgressReporter` が購読し
  `[<step>] transient error — retrying (N/M)…` を stderr に出力。
- `logger/pipeline-logger.ts` も購読して per-job log に 1 行記録（best-effort）。

> events.jsonl（branch-borne journal）への記録は StepAttemptRecord.outcome の `transientRetryAttempts`
> （上記 4）で担保する。`step:retry` DomainEvent は live EventBus 経由の進捗 / per-job log 用であり、
> branch-borne events.jsonl とは別チャネル。

### D5: halt fallthrough は現行経路を再利用する

`retryWithBackoff` は exhausted 時に最後の transient error を re-throw する。これは `runMainWorkTurn` を
呼んでいた箇所に伝播し、`run()` 末尾の既存 `catch`（`agent-runner.ts:486-514`）が
`AgentRunResult { completionReason: "error", code: "CLAUDE_CODE_QUERY_FAILED" }`（このとき
`transientRetryAttempts = budget`）に変換して返す。以降は現行と同一:
executor が failed StepRun を記録 → pipeline が escalate → awaiting-resume + resumePoint。
**escalation の意味論・遷移表・error code は一切変更しない。**

### D6: test 用の sleep 注入

retry の backoff sleep を test で 0ms にするため、`ClaudeCodeRunnerDeps` に `_sleepFn?: (ms) => Promise<void>`
を追加し、`retryWithBackoff` の `sleepFn` に渡す。既定は `setTimeout` ベース。これにより persistent
transient の test が実時間 backoff を待たずに完走する。

## Risks / Trade-offs

- **誤分類リスク**: ホワイトリストが広すぎると非 transient を再試行してしまう。→ fail-closed を堅持し、
  5xx 数値トークンは status 文脈付きのみマッチ。判断に迷うものは transient に含めない。
- **resume との二重再試行**: exhaustion → 人間 / inbox resume → 新 `run()` で予算リセット。これは
  scope 外（inbox 責務）であり、無人ループ自体は budget で有限なため無限再試行にはならない。
- **後続 turn（follow-up / postWork）の transient**: 本変更は main work turn のみをラップする。後続 turn の
  瞬断は現行どおり（best-effort、最終的に CLAUDE_CODE_QUERY_FAILED）。観測実績が main work turn 起点で
  あるためスコープを絞り、ブラスト半径を最小化する。

## Migration / Backward Compatibility

- `transientRetry` 不在の既存 config → 既定 `maxRetries: 3` が適用される（瞬断吸収が有効化される）。
  完全な現行挙動を望むユーザーは `transientRetry.maxRetries: 0` を設定する。
- `transientRetryAttempts` は全レイヤで optional。既存 state.json / events.jsonl（フィールド不在）は
  `undefined` として読まれ、normalize / fold で素通りする。schema migration 不要。
