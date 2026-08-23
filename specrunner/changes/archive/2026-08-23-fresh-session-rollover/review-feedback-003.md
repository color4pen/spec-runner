# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 実装ファイル（diff 全量確認）

| ファイル | 確認内容 |
|---|---|
| `src/adapter/claude-code/agent-runner.ts` | rollover ループ（lines 993–1292）、CONTEXT_WINDOW_EXHAUSTED_CODE、rollover throw 経路・result 経路、セッション状態リセット（resume/sessionId/capturedToolResult/contextObserver）、post-loop 処理、modelUsage 加算 |
| `src/adapter/claude-code/rollover-prompt.ts` | buildRolloverContinuationSection — 4 要素（git status/diff, tasks.md, 変更保持, completion report）、commit/push 禁止文言 |
| `src/core/port/agent-runner.ts` | AgentSessionRollover 型、sessionRollovers フィールド、makeTimeoutHalt シグネチャ更新 |
| `src/core/step/step-halt.ts` | 全 halt factory 関数への sessionRollovers 伝播（makeNonSuccessHalt, makeTimeoutHalt, makeDriftHalt, makeOutputGateHalt, makeCommitFailHalt）。makeAgentThrowHalt は意図的に除外 |
| `src/core/step/executor.ts` | sessionRollovers の StepExecutionResult (success) への転送、makeTimeoutHalt/makeDriftHalt/makeOutputGateHalt/makeCommitFailHalt への転送 |
| `src/core/step/commit-orchestrator.ts` | applySuccessPostPersistEffects — contextOnly エントリを success エントリ前に追記（best-effort try/catch）。commitHalt — halt 経路でも同様追記 |
| `src/config/schema/types.ts` | DEFAULT_CONTEXT_ROLLOVER_MAX=1、ContextRolloverConfig 型 |
| `src/config/schema/resolution.ts` | resolveContextRolloverConfig — maxRollovers デフォルト 1 |
| `src/config/schema/validation.ts` | Zod スキーマ: optional(object({ maxRollovers: optional(number.int.gte(0)) })) |
| `src/kernel/event-types.ts` | "step:rollover" を DomainEvent union に追加 |
| `src/core/event/types.ts` | EventPayloadMap に step:rollover payload 定義 |
| `src/logger/pipeline-logger.ts` | step:rollover サブスクリプション → JSONL 書き出し |
| `src/cli/progress.ts` | onStepRollover ハンドラ — "[step] context exhausted — starting fresh session (rollover N/M)…" |
| `docs/configuration.md` | contextRollover.maxRollovers の設定ドキュメント |
| `docs/operations.md` | CONTEXT_WINDOW_EXHAUSTED トラブルシューティング行 |

### テストファイル確認

| ファイル | 対応 TC |
|---|---|
| `tests/unit/adapter/claude-code/agent-runner-rollover.test.ts` | TC-001, 002, 003, 004, 005, 008, 010, 012, 013, 014, 022, 025, 026, 028, 035, 036, 037 |
| `tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts` | TC-007, TC-009 |
| `tests/unit/adapter/claude-code/rollover-prompt.test.ts` | TC-006, TC-023, TC-024 |
| `tests/unit/core/step/commit-orchestrator-rollover.test.ts` | TC-015, TC-030, TC-031, TC-032 |
| `src/config/__tests__/context-rollover-config.test.ts` | TC-016, TC-017, TC-018, TC-019, TC-020, TC-021 |
| `tests/unit/adapter/claude-code/agent-runner.test.ts`（既存・無変更） | TC-011 regression（transient retry テストが green＝TC-033/TC-034 gate で担保） |

### 設計判断（D1–D9）との照合

- **D1** (abort 時は rollover しない): `abortController.signal.aborted` チェックが rollover ループ先頭にある。TC-025 で確認済み。
- **D2** (isContextExhaustionError 単一判別): result 経路・throw 経路ともに既存の `isContextExhaustionError()` を呼ぶ。新しい classifier 不在。確認済み。
- **D3** (queryResult! 安全性): `rolloverExhausted` フラグが true のときのみ `continue` するため、post-loop コードに到達する時点で queryResult は必ず非 null。安全。
- **D4** (capturedToolResult リセット): ロールオーバー前に `capturedToolResult = null` する実装確認済み。TC-005 で確認済み。
- **D5** (rollover prompt): `currentPrompt` を let 宣言し、ロールオーバー時に buildRolloverContinuationSection() 付きに置換。TC-006 で確認済み。
- **D6** (modelUsage 加算): 破棄セッションの extractedModelUsage を rollover 前にローカル変数へ加算。TC-026 で確認済み。
- **D7** (contextMetrics 分離): `contextObserver` を let 宣言しロールオーバーごとに新規インスタンスへ置換。TC-013 で確認済み。
- **D8** (follow-up query は rollover しない): follow-up ターンは rollover ループ外で実行。TC-022 で確認済み。
- **D9** (double-call 防止): `!rolloverExhausted` ガードにより observeResult / markExhaustion の二重呼び出し防止確認済み。

### Acceptance Criteria（11 件全確認）

すべて満足していることを確認した。

### verification-result.md

build / typecheck / test / lint / changed-line-coverage すべて passed。

---

## 検証できなかった項目

None（すべての実装ファイルおよびテストファイルを直接読み確認した）

---

## Findings 詳細

### Finding 1: TC-029 の JSONL 出力が専用 unit test で検証されていない（should 優先度）

- **対象**: `src/logger/pipeline-logger.ts` の `step:rollover` サブスクリプションと JSONL 書き出しロジック
- **現状**: TC-014（`agent-runner-rollover.test.ts`）では `step:rollover` イベントが正しい payload で emit されることを確認しているが、pipeline-logger がそのイベントを受け取って JSONL ファイルに書き出すことを確認する unit test が存在しない。
- **影響**: should 優先度のため必須ではないが、将来の回帰リスクとなる。pipeline-logger.ts の `step:rollover` ハンドラは実装済みかつ軽量（4 行）であり、誤削除・変更に気づけないリスクがある。
- **対処**: `tests/unit/logger/pipeline-logger-rollover.test.ts`（または既存の pipeline-logger テストファイルへの追加）で、step:rollover イベントを emit した際に JSONL エントリが書き出されることを確認するテストを追加する。

### Finding 2: TC-027 の touchedFileMessages 蓄積テストが未実装（could 優先度）

- **対象**: ロールオーバー後も touchedFileMessages が 1 回目セッションのデータを保持すること
- **現状**: `agent-runner-rollover.test.ts` の TC list に TC-027 が含まれておらず、対応するテストケースが実装されていない。
- **影響**: could 優先度であり緊急性は低い。touchedFileMessages 蓄積は既存のストリーム処理ロジックが担っており、ロールオーバーによるリセットは行われていないことをコードで確認済み。
- **対処**: TC-027 テストを `agent-runner-rollover.test.ts` に追加して明示的に担保する。
