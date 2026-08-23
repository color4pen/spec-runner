# Regression Gate Result — Iteration 004

**Change**: fresh-session-rollover  
**Date**: 2026-08-23  
**Branch**: feat/fresh-session-rollover-99eec99c

## Evidence Summary

- **Checked**: 14
- **Skipped**: 0
- **Unverified**: 0

## Findings Verification

### [1] `50ac5402` — T-04 Acceptance Criteria が存在しないテストパスを参照している

**Status**: FIXED  
`tasks.md` T-04 Acceptance Criteria（line 75）は現在 `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` と `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts` を参照しており、両ファイルとも実在する（`src/adapter/claude-code/__tests__/` ディレクトリ内に確認）。

---

### [2] `5c9da054` — T-04 と T-05 にまたがる rollover 実行シーケンスの暗黙的な順序依存

**Status**: FIXED  
`tasks.md` T-04 の rollover 実行内容の記述（line 62）に「まず **T-05 の `snapshot()` と sessionId キャプチャを先行させてから**（順序依存: T-05 参照）」が追加されており、T-05（line 82）にも「**この `snapshot()` および `extractedSessionId` からの sessionId キャプチャは、T-04 の `extractedSessionId = undefined` リセットより必ず前に実行すること**」と明示。実装コード（`agent-runner.ts`）でも正しい順序で実装済み（`capturedSessionId = extractedSessionId` → `snapshot()` → `extractedSessionId = undefined`）。

---

### [3] `25102dba` — throw 経路の error 詳細保全を検証する TC が存在しない

**Status**: FIXED  
`test-cases.md` に TC-035「throw 経路で exhaustion と判定された場合 error.message と cause チェーンが保全される」が追加（line 427）。`tests/unit/adapter/claude-code/agent-runner-rollover.test.ts` に TC-035 describe ブロック（line 904）と実装が存在する。`error.message` 保全および `cause` チェーン保持をアサートする。

---

### [4] `7d4bb838` — executor.ts の agent step 成功経路に sessionRollovers の pass-through が欠落

**Status**: FIXED  
`src/core/step/executor.ts` の `runAgentStep()` 成功 return ブロック（line 535）に：
```typescript
...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0 ? { sessionRollovers: runResult.sessionRollovers } : {}),
```
が追加されており、`contextMetrics` と同じ「非 undefined のときのみ spread」パターンで実装されている。

---

### [5] `204050f7` — TC-029: pipeline-logger の step:rollover JSONL 書き出しを検証する unit test が存在しない

**Status**: FIXED  
`tests/unit/logger/pipeline-logger-rollover.test.ts` が存在し（ディレクトリ確認済み）、TC-029 として `PipelineLogger が step:rollover イベントを JSONL に書き出す` を検証する describe/it ブロックを持つ。

---

### [6] `784e4c31` — TC-027: rollover 後の touchedFileMessages 蓄積継続テストが未実装

**Status**: FIXED  
`tests/unit/adapter/claude-code/agent-runner-rollover.test.ts` の line 1182 に `describe("TC-027: rollover 後も 1 回目セッションの touchedFileMessages が保持され最終 touchedFiles に含まれる", ...)` が実装されており、session 1 と session 2 それぞれの touchedFiles が最終結果に含まれることをアサートする複数 it ブロックが存在する。

---

### [7] `fb5eacfa` — SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする

**Status**: FIXED  
`src/adapter/claude-code/agent-runner.ts` の rollover for ループ（line 1003）内に inner try-catch（lines 1007–1125）が追加されており、`runMainWorkTurn()` / `retryWithBackoff(runMainWorkTurn, …)` が throw した場合をキャッチし、abort 未発火 + context exhaustion throw の場合は rollover 分岐（同一の sessionRollovers push → 状態リセット → 新 observer → 継続 prompt 差替え → continue）へルーティングする。budget 枯渇時は即座に `CONTEXT_WINDOW_EXHAUSTED` で return。非 exhaustion throw または abort 発火中は `throw iterErr` で outer catch に再伝播。

---

### [8] `0e1ba369` — rollover budget 枯渇時に contextObserver.observeResult + markExhaustion が二重呼出しされる

**Status**: FIXED  
`agent-runner.ts` post-loop error handler（lines 1255–1259）が `if (!rolloverExhausted)` ガードを追加しており、budget 枯渇（`rolloverExhausted = true; break`）後は `observeResult` と `markExhaustion` を重複呼び出ししない。ループ内での呼出し（lines 1137–1138）は維持され、コメントにも「Skip when rolloverExhausted=true: … avoids double-write to observer」と明記。

---

### [9] `83c09936` — sessionLogWriter.writeSummary がロールオーバー済みセッションの usage を最終 session ID に紐付ける

**Status**: FIXED  
`agent-runner.ts` lines 1503–1509 の `writeSummary` 呼出しで：
```typescript
sessionId: sessionRollovers.length > 0 ? undefined : extractedSessionId,
```
rollover 発生時は `sessionId` を `undefined` に設定し、マルチセッションコストを単一 session ID に誤帰属しない。コメントに「passing undefined avoids misattributing multi-session cost to a single session ID」と明記。

---

### [10] `11515924` — SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする（未修正）

**Status**: FIXED（finding [7] と同一の修正で解決）  
上記 [7] と同一修正。inner try-catch が throw 経路の exhaustion を捕捉し rollover 分岐へルーティングする。

---

### [11] `c8c4a458` — rollover budget 枯渇時に contextObserver.observeResult + markExhaustion が二重呼出しされる（未修正）

**Status**: FIXED（finding [8] と同一の修正で解決）  
上記 [8] と同一修正。`!rolloverExhausted` ガードで二重呼出しを回避。

---

### [12] `cf5ad0dd` — sessionLogWriter.writeSummary がロールオーバー済みセッションの usage を最終 session ID に紐付ける（未修正）

**Status**: FIXED（finding [9] と同一の修正で解決）  
上記 [9] と同一修正。`sessionRollovers.length > 0 ? undefined : extractedSessionId` パターンで解決。

---

### [13] `f404ce08` — post-success halt 3 種が runResult.sessionRollovers を転記しない

**Status**: FIXED  
`src/core/step/executor.ts` の各 halt 生成箇所：
- `makeDriftHalt`（line 405）に `runResult.sessionRollovers` を渡す
- `makeOutputGateHalt`（line 426）に `runResult.sessionRollovers` を渡す
- `makeCommitFailHalt`（lines 465–471）に `runResult.sessionRollovers` を渡す

`src/core/step/step-halt.ts` の各 factory 関数に `sessionRollovers?: AgentSessionRollover[]` パラメータが追加され（lines 243, 336, 393）、spread で `StepHalt` へ転記する（lines 288, 373, 410）。

---

### [14] `b3c359eb` — commitRound の halt メンバーが sessionRollovers の contextOnly エントリを usage.json に書かない

**Status**: FIXED  
`src/core/step/commit-orchestrator.ts` の `commitRound()` に halt メンバー用のループ（lines 785–809）が追加されており、`haltEntries` を iterate し各 `halt.sessionRollovers` の要素について `appendInvocation` に `contextOnly: true` / `modelUsage: null` を書き込む（best-effort、失敗は silently swallowed）。D7 invariant 「rollover 発生は usage.json の contextOnly エントリとして必ず残る」が並列ラウンドハルトパスでも成立する。

---

## Verdict

All 14 ledger findings are fixed. No regressions detected.
