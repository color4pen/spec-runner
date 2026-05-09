# Test Cases: SSE / ポーリングのセッション状態ハンドリング網羅

## Overview

変更対象: `sse-stream.ts`, `completion.ts`, `sdk/sessions.ts`, `errors.ts`, `core/port/session-client.ts`

対応する AC:
- AC1: SSE が新しい状態を適切にハンドリングする
- AC2: ポーリングが rescheduling を認識する
- AC3: ポーリングが stop_reason を区別する
- AC4: TerminationReason 型が新しい状態を表現できる
- AC5: `bun run typecheck && bun run test` が green

---

## Test Scenarios

### TC-SS-01: SSE — idle + requires_action でエラー終了

- **Category**: correctness
- **Priority**: must
- **Source**: T3, AC1, 要件1

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.status_idle` イベントで `stop_reason.type === "requires_action"` を受信した  
**THEN** `terminated` が `true` にセットされ、`terminationReason` が `"requires_action"` になり、ストリームループを break する

---

### TC-SS-02: SSE — idle + retries_exhausted でエラー終了

- **Category**: correctness
- **Priority**: must
- **Source**: T3, AC1, 要件2

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.status_idle` イベントで `stop_reason.type === "retries_exhausted"` を受信した  
**THEN** `terminated` が `true` にセットされ、`terminationReason` が `"retries_exhausted"` になり、ストリームループを break する

---

### TC-SS-03: SSE — session.error + retry_status: retrying は続行

- **Category**: correctness
- **Priority**: must
- **Source**: T3, AC1, 要件3

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.error` イベントで `error.retry_status.type === "retrying"` を受信した  
**THEN** `terminated` は `false` のまま、ストリームループを break せずに続行し、stderr にログを出力する

---

### TC-SS-04: SSE — session.error + retry_status: exhausted でエラー終了

- **Category**: correctness
- **Priority**: must
- **Source**: T3, AC1, 要件3

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.error` イベントで `error.retry_status.type === "exhausted"` を受信した  
**THEN** `terminated` が `true` にセットされ、`terminationReason` が `"session_error"` になり、ストリームループを break する

---

### TC-SS-05: SSE — session.error + retry_status: terminal でエラー終了

- **Category**: correctness
- **Priority**: must
- **Source**: T3, AC1, 要件3

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.error` イベントで `error.retry_status.type === "terminal"` を受信した  
**THEN** `terminated` が `true` にセットされ、`terminationReason` が `"session_error"` になり、ストリームループを break する

---

### TC-SS-06: SSE — session.deleted でエラー終了

- **Category**: correctness
- **Priority**: must
- **Source**: T3, AC1, 要件4

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.deleted` イベントを受信した  
**THEN** `terminated` が `true` にセットされ、`terminationReason` が `"session_deleted"` になり、ストリームループを break する

---

### TC-SS-07: SSE — session.status_rescheduled はログ出力して続行

- **Category**: correctness
- **Priority**: must
- **Source**: T3, AC1, 要件5

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.status_rescheduled` イベントを受信した  
**THEN** `terminated` は `false` のまま、ストリームループを break せずに続行し、stderr にログを出力する

---

### TC-SS-08: SSE — idle + end_turn は正常完了（リグレッション）

- **Category**: correctness
- **Priority**: must
- **Source**: T3, 既存 AC

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.status_idle` イベントで `stop_reason.type === "end_turn"` を受信した  
**THEN** `idleEndTurnDetected` が `true` にセットされ、`terminationReason` が `"end_turn"` になり、`terminated` は `false` のまま break する（変更前と同じ動作）

---

### TC-SS-09: SSE — terminated はエラー終了（リグレッション）

- **Category**: correctness
- **Priority**: must
- **Source**: T3, 既存 AC

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.status_terminated` イベントを受信した  
**THEN** `terminated` が `true` にセットされ、`terminationReason` が `"terminated"` になり、break する（変更前と同じ動作）

---

### TC-SS-10: SSE — 未知の stop_reason はログ出力して続行

- **Category**: correctness
- **Priority**: should
- **Source**: T3, 要件10

**GIVEN** SSE ストリームが実行中であり  
**WHEN** `session.status_idle` イベントで既知 (`end_turn`, `requires_action`, `retries_exhausted`) 以外の `stop_reason.type` を受信した  
**THEN** `terminated` は `false` のまま、break せずに続行し、stderr に unknown stop_reason をログ出力する

---

### TC-POLL-01: ポーリング — rescheduling が上限未満ならば続行

- **Category**: correctness
- **Priority**: must
- **Source**: T4, AC2, 要件6

**GIVEN** ポーリングが実行中であり、`reschedulingCount` が `MAX_RESCHEDULING_COUNT (10)` 未満であり  
**WHEN** `retrieve` が `status: "rescheduling"` のセッションを返した  
**THEN** `reschedulingCount` をインクリメントし、stderr にログを出力し、バックオフを挟んでポーリングを継続する

---

### TC-POLL-02: ポーリング — rescheduling が上限 (10 回) に達したらエラー throw

- **Category**: correctness
- **Priority**: must
- **Source**: T4, AC2, 要件6

**GIVEN** ポーリングが実行中であり  
**WHEN** `retrieve` が `status: "rescheduling"` のセッションを 10 回連続で返した  
**THEN** `SESSION_RESCHEDULING_EXHAUSTED` コードを持つ `SpecRunnerError` を throw する

---

### TC-POLL-03: ポーリング — rescheduling 後に idle へ遷移したら成功

- **Category**: correctness
- **Priority**: must
- **Source**: T4, T5, AC2

**GIVEN** ポーリングが実行中であり、rescheduling が 3 回続き  
**WHEN** 4 回目の `retrieve` が `status: "idle"` のセッションを返し、events.list() が `stop_reason: end_turn` を返した  
**THEN** rescheduling カウントがリセットされ、ポーリングがセッションを return する

---

### TC-POLL-04: ポーリング — idle + end_turn は成功 return

- **Category**: correctness
- **Priority**: must
- **Source**: T5, AC3, 要件7

**GIVEN** ポーリングが実行中であり  
**WHEN** `retrieve` が `status: "idle"` を返し、`events.list()` の最新 idle イベントが `stop_reason: end_turn` を返した  
**THEN** セッションを正常 return する

---

### TC-POLL-05: ポーリング — idle + requires_action はエラー throw

- **Category**: correctness
- **Priority**: must
- **Source**: T5, AC3, 要件7

**GIVEN** ポーリングが実行中であり  
**WHEN** `retrieve` が `status: "idle"` を返し、`events.list()` の最新 idle イベントが `stop_reason: requires_action` を返した  
**THEN** `SESSION_REQUIRES_ACTION` コードを持つ `SpecRunnerError` を throw する

---

### TC-POLL-06: ポーリング — idle + retries_exhausted はエラー throw

- **Category**: correctness
- **Priority**: must
- **Source**: T5, AC3, 要件7

**GIVEN** ポーリングが実行中であり  
**WHEN** `retrieve` が `status: "idle"` を返し、`events.list()` の最新 idle イベントが `stop_reason: retries_exhausted` を返した  
**THEN** `SESSION_RETRIES_EXHAUSTED` コードを持つ `SpecRunnerError` を throw する

---

### TC-POLL-07: ポーリング — idle + 未知 stop_reason は成功扱い（前方互換）

- **Category**: correctness
- **Priority**: should
- **Source**: T5, 要件10

**GIVEN** ポーリングが実行中であり  
**WHEN** `retrieve` が `status: "idle"` を返し、`events.list()` の最新 idle イベントが既知以外の `stop_reason` を返した  
**THEN** stderr にログを出力し、セッションを正常 return する（前方互換性）

---

### TC-POLL-08: ポーリング — events.list() が失敗した場合は end_turn 仮定で続行

- **Category**: correctness
- **Priority**: should
- **Source**: T5

**GIVEN** ポーリングが実行中であり、`retrieve` が `status: "idle"` を返し  
**WHEN** `events.list()` が例外を throw した  
**THEN** stderr にエラーログを出力し、`stop_reason` を `end_turn` と仮定してセッションを正常 return する

---

### TC-POLL-09: ポーリング — idle イベントが events 一覧に存在しない場合は成功扱い

- **Category**: correctness
- **Priority**: should
- **Source**: T5

**GIVEN** ポーリングが実行中であり、`retrieve` が `status: "idle"` を返し  
**WHEN** `events.list()` が idle イベントを含まない空のページネーションを返した  
**THEN** `stop_reason` を `"unknown"` として処理し、セッションを正常 return する

---

### TC-POLL-10: ポーリング — terminated はエラー throw（リグレッション）

- **Category**: correctness
- **Priority**: must
- **Source**: T4, 既存 AC

**GIVEN** ポーリングが実行中であり  
**WHEN** `retrieve` が `status: "terminated"` のセッションを返した  
**THEN** `SESSION_TERMINATED` コードを持つエラーを throw する（変更前と同じ動作）

---

### TC-NARROW-01: isStatusRescheduledEvent — rescheduled イベントを識別

- **Category**: correctness
- **Priority**: must
- **Source**: T2, T10-3

**GIVEN** `type: "session.status_rescheduled"` フィールドを持つイベントオブジェクトがあり  
**WHEN** `isStatusRescheduledEvent(event)` を呼び出した  
**THEN** `true` を返す

---

### TC-NARROW-02: isStatusRescheduledEvent — 他の type は false

- **Category**: correctness
- **Priority**: should
- **Source**: T2

**GIVEN** `type: "session.status_idle"` フィールドを持つイベントオブジェクトがあり  
**WHEN** `isStatusRescheduledEvent(event)` を呼び出した  
**THEN** `false` を返す

---

### TC-NARROW-03: isSessionErrorEvent — error イベントを識別

- **Category**: correctness
- **Priority**: must
- **Source**: T2, T10-3

**GIVEN** `type: "session.error"` フィールドを持つイベントオブジェクトがあり  
**WHEN** `isSessionErrorEvent(event)` を呼び出した  
**THEN** `true` を返す

---

### TC-NARROW-04: isSessionDeletedEvent — deleted イベントを識別

- **Category**: correctness
- **Priority**: must
- **Source**: T2, T10-3

**GIVEN** `type: "session.deleted"` フィールドを持つイベントオブジェクトがあり  
**WHEN** `isSessionDeletedEvent(event)` を呼び出した  
**THEN** `true` を返す

---

### TC-NARROW-05: isRetryStatusRetrying — retrying は true

- **Category**: correctness
- **Priority**: must
- **Source**: T2, T10-3

**GIVEN** `retry_status: { type: "retrying" }` を持つ error オブジェクトがあり  
**WHEN** `isRetryStatusRetrying(error)` を呼び出した  
**THEN** `true` を返す

---

### TC-NARROW-06: isRetryStatusRetrying — exhausted は false

- **Category**: correctness
- **Priority**: must
- **Source**: T2, T10-3

**GIVEN** `retry_status: { type: "exhausted" }` を持つ error オブジェクトがあり  
**WHEN** `isRetryStatusRetrying(error)` を呼び出した  
**THEN** `false` を返す

---

### TC-NARROW-07: isRetryStatusRetrying — terminal は false

- **Category**: correctness
- **Priority**: must
- **Source**: T2, T10-3

**GIVEN** `retry_status: { type: "terminal" }` を持つ error オブジェクトがあり  
**WHEN** `isRetryStatusRetrying(error)` を呼び出した  
**THEN** `false` を返す

---

### TC-NARROW-08: listEvents — order: desc でセッションイベントを取得

- **Category**: correctness
- **Priority**: should
- **Source**: T2

**GIVEN** 有効な `client` と `sessionId` があり  
**WHEN** `listEvents(client, sessionId)` を呼び出した  
**THEN** `client.beta.sessions.events.list(sessionId, { order: "desc" })` を呼び出す（最新イベントが先頭に来るソート順）

---

### TC-TYPE-01: TerminationReason 型に requires_action が含まれる

- **Category**: correctness
- **Priority**: must
- **Source**: T1, AC4

**GIVEN** `sse-stream.ts` の `TerminationReason` 型があり  
**WHEN** `terminationReason: TerminationReason = "requires_action"` と型アサインした  
**THEN** 型エラーが発生しない（`"requires_action"` が union に含まれている）

---

### TC-TYPE-02: TerminationReason 型に retries_exhausted が含まれる

- **Category**: correctness
- **Priority**: must
- **Source**: T1, AC4

**GIVEN** `sse-stream.ts` の `TerminationReason` 型があり  
**WHEN** `terminationReason: TerminationReason = "retries_exhausted"` と型アサインした  
**THEN** 型エラーが発生しない

---

### TC-TYPE-03: TerminationReason 型に session_error が含まれる

- **Category**: correctness
- **Priority**: must
- **Source**: T1, AC4

**GIVEN** `sse-stream.ts` の `TerminationReason` 型があり  
**WHEN** `terminationReason: TerminationReason = "session_error"` と型アサインした  
**THEN** 型エラーが発生しない

---

### TC-TYPE-04: TerminationReason 型に session_deleted が含まれる

- **Category**: correctness
- **Priority**: must
- **Source**: T1, AC4

**GIVEN** `sse-stream.ts` の `TerminationReason` 型があり  
**WHEN** `terminationReason: TerminationReason = "session_deleted"` と型アサインした  
**THEN** 型エラーが発生しない

---

### TC-TYPE-05: Port の terminationReason 型が新しい値を含む

- **Category**: architecture
- **Priority**: must
- **Source**: T7, AC4

**GIVEN** `core/port/session-client.ts` の `terminationReason` フィールドの型があり  
**WHEN** `"requires_action" | "retries_exhausted" | "session_error" | "session_deleted"` を代入した  
**THEN** 型エラーが発生しない

---

### TC-ERR-01: sessionRetriesExhaustedError — 正しいエラーコードとメッセージ

- **Category**: correctness
- **Priority**: must
- **Source**: T6

**GIVEN** `sessionRetriesExhaustedError("sess_001")` を呼び出した  
**WHEN** 返値の `SpecRunnerError` を検査した  
**THEN** `error.code` が `"SESSION_RETRIES_EXHAUSTED"` であり、`error.message` が空でない

---

### TC-ERR-02: sessionRequiresActionError — 正しいエラーコードとメッセージ

- **Category**: correctness
- **Priority**: must
- **Source**: T6

**GIVEN** `sessionRequiresActionError("sess_001")` を呼び出した  
**WHEN** 返値の `SpecRunnerError` を検査した  
**THEN** `error.code` が `"SESSION_REQUIRES_ACTION"` であり、`error.message` が空でない

---

### TC-ERR-03: sessionReschedulingExhaustedError — 正しいエラーコードとメッセージ

- **Category**: correctness
- **Priority**: must
- **Source**: T6

**GIVEN** `sessionReschedulingExhaustedError("sess_001")` を呼び出した  
**WHEN** 返値の `SpecRunnerError` を検査した  
**THEN** `error.code` が `"SESSION_RESCHEDULING_EXHAUSTED"` であり、`error.message` が空でない

---

### TC-ERR-04: 新規 SpecRunnerError は normalizeSessionError を通じて正しく伝搬する

- **Category**: correctness
- **Priority**: must
- **Source**: T9a, AC1

**GIVEN** `SESSION_RETRIES_EXHAUSTED` / `SESSION_REQUIRES_ACTION` / `SESSION_RESCHEDULING_EXHAUSTED` コードを持つ `SpecRunnerError` があり  
**WHEN** `normalizeSessionError(err)` を通じた  
**THEN** 返値の `error.code` が元のエラーコードを保持する（`"SESSION_RETRIES_EXHAUSTED"` 等が正しく伝搬される）

---

### TC-RENAME-01: isSessionIdle — status: idle を true と判定

- **Category**: correctness
- **Priority**: must
- **Source**: T4

**GIVEN** `status: "idle"` のセッションオブジェクトがあり  
**WHEN** `isSessionIdle(session)` を呼び出した  
**THEN** `true` を返す

---

### TC-RENAME-02: isSessionIdle — status: running を false と判定

- **Category**: correctness
- **Priority**: must
- **Source**: T4

**GIVEN** `status: "running"` のセッションオブジェクトがあり  
**WHEN** `isSessionIdle(session)` を呼び出した  
**THEN** `false` を返す

---

### TC-RENAME-03: isProposeComplete は削除または isSessionIdle にリネームされている

- **Category**: maintainability
- **Priority**: must
- **Source**: T4

**GIVEN** `completion.ts` の export を検査した  
**WHEN** `isProposeComplete` を import しようとした  
**THEN** `isProposeComplete` は export されておらず（`isSessionIdle` にリネーム済み）、TypeScript の型チェックでエラーになる

---

### TC-BUILD-01: bun run typecheck が green

- **Category**: correctness
- **Priority**: must
- **Source**: T11, AC5

**GIVEN** T1〜T9a の全タスクが実装された  
**WHEN** `bun run typecheck` を実行した  
**THEN** 型エラーゼロで exit 0 を返す

---

### TC-BUILD-02: bun test が全テスト green

- **Category**: testing
- **Priority**: must
- **Source**: T11, AC5

**GIVEN** T1〜T10 の全タスクが実装された  
**WHEN** `bun test` を実行した  
**THEN** 全テストが PASS し exit 0 を返す

---

### TC-BUILD-03: completion.test.ts の新規テストが全て pass

- **Category**: testing
- **Priority**: must
- **Source**: T10, AC1-AC3

**GIVEN** T10-1〜T10-6 のテストケースが実装された  
**WHEN** `bun test tests/completion.test.ts` を実行した  
**THEN** T10-1〜T10-6 の全テストが PASS する
