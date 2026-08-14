# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コード主張のファクトチェック

**`src/adapter/shared/inactivity-watchdog.ts`**
- `formatInactivityTimeoutMessage(stepName, elapsedMs)` が line 80 に存在することを確認。
- 両 runner から import されていることを確認（claude-code:59 行目、codex:44 行目）。

**`src/adapter/claude-code/agent-runner.ts:342-358`**
- `emitToolProgress` 関数が line 341–358 に存在（コメント先頭が 341 行目、function 本体が 346 行目）。
- `isToolUse(msg)` で tool_use content block start を検出し、`step:progress {step, tool, target}` を emit することを確認。
- 両 main-work loop と repair loop から呼ばれていることを確認（line 658, 1021）。

**`src/adapter/codex/agent-runner.ts:224-232, 423`**
- `extractCodexProgress(item)` が line 227–255 に存在（request の "224-232" は関数直前の JSDoc コメントを含む範囲）。
- `item.started` イベントで呼ばれ `ctx.emit("step:progress", ...)` が line 423 に存在することを確認。
- `item.completed` イベントで items 配列に push している（line 429–433）。

**`src/cli/progress.ts:102`**
- `this.events.on("step:progress", (p) => this.onStepProgress(p))` が line 102 にあることを確認。現在の唯一の消費者であることを確認。

**`ErrorInfo` と events.jsonl の hint フィールド**
- `src/state/schema/types.ts:101-105`: `ErrorInfo { code, message, hint: string }` を確認。
- `src/core/step/step-halt.ts:128-132`: `makeTimeoutHalt` が `(err as Error & { hint?: string }).hint ?? ""` でエラーの hint を取得。
- STEP_TIMEOUT error は `.hint` を持たないため `hint: ""` (空文字列) として記録される。

**catch ブロックの STEP_TIMEOUT 生成**
- claude-code runner line 1118–1132: `watchdog.fired` 時に `formatInactivityTimeoutMessage` を呼んで `new Error(timeoutMessage)` を `STEP_TIMEOUT` コードで返す。
- codex runner line 765–778: 同構造。
- どちらも `error` オブジェクトに `.hint` プロパティを付与しない → hint は現状 `""` で到達する。

### 2. データフロー検証

`AgentRunResult.error` → `makeTimeoutHalt` → `ErrorInfo.{message, hint}` → `StepAttemptRecord.outcome.error` → events.jsonl

このパスを確認。lastTool 情報は `message` または `hint` のどちらかに埋め込めばそのまま events.jsonl に到達する。

### 3. 既存テストの影響範囲

- `src/adapter/shared/__tests__/inactivity-watchdog.test.ts` (TC-010〜TC-013)
  - TC-013: `formatInactivityTimeoutMessage` の出力を検証している。シグネチャ変更に伴い更新が必要になる可能性がある。
  - TC-010〜TC-012: watchdog 自体の動作テスト。変更なし。
- claude-code / codex runner の統合テストには STEP_TIMEOUT / watchdog シナリオが存在しないことを確認。

### 4. 受け入れ基準の実装可能性確認

全 5 シナリオ（tool_use後 timeout、item.started後 timeout、tool完了後 timeout、tool未観測、typecheck&&test green）はいずれも既存インフラで実装可能。tool_result 到着の検出は claude-code adapter で既存 type guard (`isToolUse`) に対応物がないが、`content_block_stop` イベントや後続 user メッセージで近似可能 — 受け入れ基準が「observable な出力」を問うているためこれは implementer の設計裁量の範囲。

## 検証できなかった項目

None — 該当なし。

## Findings 詳細

### Finding 1: "hint は null" の記述が不正確（低影響）

**箇所**: `request.md` 背景セクション「events.jsonl の step-attempt 記録は … 現状 hint は null」

**実際の挙動**: `src/core/step/step-halt.ts:131` の `?? ""` により hint は `null` ではなく空文字列 `""` として記録される。`ErrorInfo.hint` の型は `string`（非 nullable）なので null には成り得ない。

**影響**: 実装方針に影響しない（hint が空なのは同じ）。design step での混乱を防ぐ程度の訂正事項。
