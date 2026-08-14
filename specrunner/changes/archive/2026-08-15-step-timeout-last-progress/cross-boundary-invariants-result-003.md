# Cross-Boundary-Invariants Review — step-timeout-last-progress

**Reviewer**: cross-boundary-invariants  
**Iteration**: 3  
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Prior-Round Findings: Resolution Status

Iteration 2 の全 finding（F-1 Medium, F-2 Low, F-3 Low）は解消済み。  
Iteration 3 では code-fixer による変更なし（prior-round context: "変更なし"）。  
解消状態に変化なし。

---

## Invariants Verified

### 1. `inactivity-watchdog.ts` byte-identical to main

`git diff main...HEAD -- src/adapter/shared/inactivity-watchdog.ts` → 0 lines.  
`formatInactivityTimeoutMessage` 出力・watchdog 閾値・bump/clear/fired 契約: 不変。  
**Invariant held.**

### 2. All six AC-#5 test files byte-identical to main and green

`git diff main...HEAD -- [6 files]` → 0 lines (実測)。  
6 ファイル: `inactivity-watchdog.test.ts`, `executor-sequential-regression.test.ts`, `commit-orchestrator.test.ts`, `executor-drift-detection.test.ts`, `no-op-detect-exemption.test.ts`, `agent-runner-transient-retry.test.ts`。  
テストスイート 768 files / 11473 tests / 1 skipped — all green。  
**Invariant held.**

### 3. `step:progress` terminal display unchanged at all three sites

`observeMessage` は `isReplay` guard の後、最初のアクションとして `emitToolProgress(msg, ctx.emit, step.name)` を呼ぶ。  
tracker 呼び出しはその後に続く。3 サイト（main query loop line 679, postWork line 966, output-repair loop line 1043）すべてで `observeMessage` 経由で到達する。  
`emitToolProgress` のシグネチャ・内部ロジックは無変更。  
**Invariant held.**

### 4. `makeTimeoutHalt` hint propagation unchanged

`step-halt.ts:131`: `hint: (err as Error & { hint?: string }).hint ?? ""` — no change.  
`step-halt.ts`, `event-journal.ts`, `types.ts` の diff: 0 lines (実測)。  
`tracker.timeoutHint()` が返す非空文字列は `?? ""` の右辺を使わず確実に保存される。  
**Invariant held.**

### 5. Awaiting-resume halt transition unchanged

`executor.ts` は diff ゼロ。`makeTimeoutHalt` の kind/reason/resumePoint ロジック: 不変。  
`hint`（従来 `""`）が非空になることを assert するテストは既存テストに存在しない（STEP_TIMEOUT の hint を assert するテストは今回追加のみ）。  
**Invariant held.**

### 6. `managed-agent` adapter unchanged

`git diff main...HEAD -- src/adapter/managed-agent/` → 0 lines (実測)。  
**Invariant held.**

### 7. `tracker` scope correctly bounded to `run()`

両アダプタとも `tracker = createLastToolTracker()` が `run()` 内・最初の `await` 前に宣言される。  
job 間でのトラッカー共有なし。  
**Invariant held.**

### 8. `isToolUse` and `isToolResult` mutually exclusive

`isToolUse` requires `type === "stream_event"`（SDKPartialAssistantMessage）。  
`isToolResult` requires `type === "user"`（SDKUserMessage）。  
SDK union 内で他に `type: "user"` を持つのは `SDKUserMessageReplay`（`isReplay: true`、`observeMessage` 先頭でガード済み）のみ。  
残りの全 SDK メッセージ型は `type: "system"` / `type: "result"` / `type: "assistant"` 等で、`isToolResult` を通過しない。  
**Invariant held.**

### 9. `isReplay` guard covers all three observation sites

- Site 1 (main query loop, line 679): `observeMessage(message)` — guard 先頭に配置 ✓  
- Site 2 (postWork, line 966): `runFollowUpQueryWithRetry(..., observeMessage)` — line 804 で呼ばれ guard 発火 ✓  
- Site 3 (output-repair, line 1043): `observeMessage(message)` — guard 先頭に配置 ✓  
**Invariant held.**

### 10. `tracker.reset()` placement preserves retry-attempt isolation

- claude-code: `runMainWorkTurn` 冒頭（line 748）— `runQuery()` の `watchdog.bump()` より前に実行 ✓  
- codex: `runMainWorkTurn` 冒頭（line 521）— `executeTurn()` の `watchdog.bump()` より前に実行 ✓  
`retryWithBackoff` 再試行ごとに `tracker.reset()` が確実に呼ばれる。  
**Invariant held.**

### 11. `onToolEnd` correlation asymmetry is correctly implemented

`last-tool-tracker.ts:53`: `const correlates = last.id === undefined || id === last.id;`

- id 付き start (`last.id = "A"`) + id なし end (`id = undefined`): `last.id === undefined` = false、`undefined === "A"` = false → correlate しない → in-flight 維持 ✓  
- id なし start (`last.id = undefined`) + 任意 end: `last.id === undefined` = true → correlate → done ✓  
TC-016 双方向でテスト済み。  
**Invariant held.**

---

## Findings

なし。

前周 finding（F-1, F-2, F-3）はすべて解消済み。  
Iteration 3 でのコード変更はなく、新たな cross-boundary 不変条件違反は検出されなかった。

---

## Observations

### O-1: `isToolUse` が tool_use メッセージごとに 2 回呼ばれる（iter 1/2 から継続）

`observeMessage` は `emitToolProgress`（内部で `isToolUse` を呼ぶ）を呼んだ後、再度 `isToolUse(msg)` を呼ぶ。  
純粋な述語関数であり副作用なし。正確性への影響なし。

### O-2: Resume fallback 内でトラッカーはリセットされない（iter 2 から継続）

`runMainWorkTurn` は `tracker.reset()` を先頭で 1 回呼ぶが、内部のレジューム失敗→フレッシュスレッド fallback の間にはリセットしない。  
レジュームセッションで観測されたツール状態がフレッシュスレッドに引き継がれる。  
設計 D2 の「retry attempt ごとにリセット」（= `retryWithBackoff` 呼び出しごと）と一致しており、想定内の近似。

### O-3: reportRetry follow-up パスは `observeMessage` を渡さない（iter 2 から継続）

Line 941: `runFollowUpQueryWithRetry(retryPrompt, retryOptions)` — `onMessage` なし（default `() => {}`）。  
設計 D3 の「3 サイト」記述と一致。reportRetry 中のタイムアウトは直前のメインまたは postWork フェーズのツール状態を示す。  
診断精度の限界として受容済み。

---

## Evidence

- `git diff main...HEAD` で inactivity-watchdog.ts・6 AC-#5 ファイル・step-halt.ts・event-journal.ts・types.ts・managed-agent/ の差分がすべてゼロであることを確認
- `bun run typecheck` → clean（出力なし）
- `bun run test` → 768 test files / 11473 tests passed / 1 skipped、all green
- `last-tool-tracker.ts`・`message-types.ts`・`agent-runner.ts`（claude-code / codex）を精読し、observeMessage 各サイト・isReplay guard・reset 位置を追跡
- SDK `sdk.d.ts` で `type: "user"` を持つメッセージ型（SDKUserMessage / SDKUserMessageReplay のみ）を確認
- `makeTimeoutHalt` の `hint: err.hint ?? ""` コピーパスを step-halt.ts で直接確認
