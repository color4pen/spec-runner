# Conformance Result 002 — fresh-session-rollover

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 概要

git diff main...HEAD --stat: 48 files, 9517 insertions, 61 deletions。下記の実装ファイルを直接 Read して確認した。

- `src/adapter/claude-code/agent-runner.ts` — rollover loop・typed 判別・rollover prompt 組み立て・session 状態リセット
- `src/adapter/claude-code/rollover-prompt.ts` — rollover 継続 prompt 内容
- `src/core/port/agent-runner.ts` — `AgentSessionRollover` 型・`sessionRollovers` フィールド
- `src/core/step/step-halt.ts` — `sessionRollovers` の `StepHalt` への転記・factory 関数群
- `src/core/step/executor.ts` — `sessionRollovers` passthrough
- `src/core/step/commit-orchestrator.ts` — rollover contextOnly エントリの usage.json 追記（success/halt 双方）
- `src/config/schema/types.ts`, `resolution.ts`, `validation.ts` — `contextRollover.maxRollovers` config
- `src/kernel/event-types.ts`, `src/core/event/types.ts` — `step:rollover` domain event
- `src/logger/pipeline-logger.ts`, `src/cli/progress.ts` — `step:rollover` subscriber
- `src/adapter/claude-code/context-observer.ts` — `isContextExhaustionError()` 実装確認（既存）

テストファイル確認:
- `tests/unit/adapter/claude-code/agent-runner-rollover.test.ts`
- `tests/unit/adapter/claude-code/rollover-prompt.test.ts`
- `tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts`
- `tests/unit/core/step/commit-orchestrator-rollover.test.ts`
- `tests/unit/logger/pipeline-logger-rollover.test.ts`
- `src/config/__tests__/context-rollover-config.test.ts`

### R-01: context exhaustion の typed 判別 (error result 経路)

MUST: `isContextExhaustionError()` を唯一の正本として使用。新規 classifier なし。

- `joinErrorsFromResult()` が `errors[]` を join → `isContextExhaustionError()` に渡す（agent-runner.ts L76–78, 1133）
- 新規文字列 allowlist / 正規表現は追加されていない
- 非 exhaustion result は `CLAUDE_CODE_QUERY_FAILED` のまま

**verified**: TC-001 (errors[] exhaustion → CONTEXT_WINDOW_EXHAUSTED), TC-002 (非 exhaustion → CLAUDE_CODE_QUERY_FAILED)

### R-02: SDK throw 経路でも同じ context exhaustion 判別

MUST: `collectCauseText()` で cause チェーンを辿り `isContextExhaustionError()` で判定。

- rollover ループ内側 catch (L1035–1036): `collectCauseText(iterErr)` → `isContextExhaustionError()`
- 外側 outer catch (L1619–1620): `collectCauseText(cause)` → `throwIsExhaustion` → `CONTEXT_WINDOW_EXHAUSTED_CODE`

**verified**: TC-003 (cause chain に exhaustion 文字列), TC-035 (cause chain 保全), TC-036 (throw 経路 rollover ルーティング), TC-037 (throw 経路 budget 超過)

### R-03: context exhaustion 時に同一 worktree で fresh session を開始する

MUST: 同じ cwd、`resume` に失敗 session ID を渡さない、枯渇 session 固有状態を破棄する。

rollover 時の状態リセット（L1061–1067 / L1174–1181）:
- `delete queryOptions["resume"]` — 失敗 session ID を渡さない
- `extractedSessionId = undefined` — ただし capturedSessionId で先に退避してから
- `capturedToolResult = null` — 枯渇 session の report tool result を破棄
- `contextObserver = createContextObserver(...)` — 新しい observer に差し替え
- `resumeFallbackDone = true` — resume→fresh fallback の二重発火防止

**verified**: TC-004 (query 2回・success・resume なし・cwd 同一), TC-005 (tool result 引き継ぎなし)

### R-04: rollover prompt は既存変更の保持と続行を指示する

MUST: 4点（git diff、tasks.md、既存変更保持、completion report）を含む。独自 resume state を埋め込まない。completion directive が末尾に来る配置を維持。

`rollover-prompt.ts` に明示的に含まれる内容:
1. `git status および git diff を確認し、worktree 上の既存変更を把握する`
2. `tasks.md を確認し、未完了のタスクを特定する`
3. `既存の変更を保持したまま、未完了タスクの続きを実装する`
4. `全タスクが完了したら、通常どおり completion report を返す`
5. `git commit を実行しないでください。git push も実行しないでください。` (COMMIT_DISCIPLINE)

prompt 組み立て: `${baseFullPrompt}${promptRulesSection}${rolloverSection}${firstTurnCompletionDirective}` — completion directive が末尾を維持。

**verified**: TC-006 (4 要素), TC-023 (git commit 禁止), TC-024 (attempt/maxRollovers 反映), TC-004 で元 task 本文保持確認

### R-05: rollover 後に成功した step は通常の success として完了する

MUST: `completionReason: "success"` かつ `finalizeStepArtifacts` は 1 回のみ。rollover は追加 commit を発生させない。

rollover ループ後の後続処理（agent redirect 判定・success 抽出・follow-up・outputVerification・commit）はループ外で 1 回だけ実行される。

**verified**: TC-007 (finalizeStepArtifacts spy で 1 回呼び出し確認, executor-integration.test.ts)

### R-06: rollover 回数は bounded で、超過時は typed halt になる

MUST: `resolveContextRolloverConfig(ctx.config).maxRollovers` を上限とする。超過時は `CONTEXT_WINDOW_EXHAUSTED` で halt。

- ループ: `for (let rolloverAttempt = 0; rolloverAttempt <= maxRollovers; rolloverAttempt++)` — 合計 maxRollovers + 1 session
- 超過時: `rolloverExhausted = true; break;` → 後続の error 経路が `CONTEXT_WINDOW_EXHAUSTED_CODE` を付与
- `makeNonSuccessHalt` が `error.code` を `ErrorInfo.code` として転記（step-halt.ts L199–200）

**verified**: TC-008 (maxRollovers=1 → 2 回, maxRollovers=0 → 1 回), TC-009 (halt.code === CONTEXT_WINDOW_EXHAUSTED, state.json に記録)

### R-07: context exhaustion 以外の失敗は fresh session で再実行しない

MUST: 非 exhaustion error / abort 発火中は rollover しない。transient retry は変えない。

- 内側 catch: `throwIterIsExhaustion = false` → `throw iterErr`（for ループ脱出、outer catch へ）
- 結果経路: `isExhaustion = false` または `abortController.signal.aborted = true` → `break` without rollover
- abort 発火時: 内側 catch で先に `abortController.signal.aborted` を確認してから exhaustion を判定
- `retryWithBackoff` は rollover ループの内側に配置 → transient retry 回数・event・delay は不変

**verified**: TC-010 (非 exhaustion → query 1 回, CLAUDE_CODE_QUERY_FAILED), TC-025 (timeout/watchdog → completionReason=timeout, sessionRollovers=undefined), 既存 agent-runner-transient-retry.test.ts（rollover 対象外ファイル変更なし）

### R-08: error result の詳細が generic subtype だけに潰れない

MUST: `error.message` は `subtype` + `errors[]` 本文（truncate 可）を含む。

実装（L1268–1271）:
```typescript
const errorBody = errorJoined ? `: ${truncateText(errorJoined)}` : "";
const errorMessage = rolloverExhausted
  ? `Claude Code SDK query failed: context window exhausted after ${sessionRollovers.length} rollover(s)...`
  : `Claude Code SDK query failed: ${errorResult.subtype}${errorBody}`;
```

- **非 rolloverExhausted 経路**: subtype + errors[] を含む → TC-012 で検証 ✅
- **rolloverExhausted = true 経路**: subtype + errors[] を含まないカスタムメッセージ → **FINDING F-001**

TC-012 は非 exhaustion エラー（"something unexpected"）のみで検証しており、spec の normative Scenario で指定された exhaustion エラー（"Prompt is too long"）でのメッセージ内容が未検証。

### R-09: 複数 session の context metrics を合成せず rollover を observation として残す

MUST: `contextMetrics` は最終 session のみ。各ロールオーバーの観測は `sessionRollovers[]` に保存。`step:rollover` event を emit。`CommitOrchestrator` が contextOnly エントリを usage.json に追記。

- `contextObserver` を rollover 時に `createContextObserver(...)` で差し替え（per-session 分離）
- 旧 observer の `snapshot()` を `sessionRollovers` に push（`markExhaustion()` 後）
- `ctx.emit("step:rollover", { step, attempt, maxRollovers, reason: "context-exhaustion" })`
- `PipelineLogger.subscribe` が `step:rollover` を購読し JSONL に書き出し
- `ProgressDisplay` が `step:rollover` を購読し 1 行表示
- `CommitOrchestrator.applySuccessPostPersistEffects`: rollover 分の contextOnly エントリを先行追記
- `commitHalt`: 同様に rollover 分を best-effort 追記

**verified**: TC-013 (peak 分離), TC-014 (event payload), TC-015 / TC-031 (usage.json エントリ), TC-029 (pipeline-logger JSONL), TC-028 (rollover なし → sessionRollovers undefined)

### R-10: rollover 上限は config で解決される

MUST: 非負整数として validated、未指定時 default = 1。

- Zod schema: `optional(number.check(int, gte(0)))` → 負値・非整数・非 object が CONFIG_INVALID
- `resolveContextRolloverConfig(config)` → `config.contextRollover?.maxRollovers ?? 1`
- 既存 config（`contextRollover` なし）は valid のまま

**verified**: config test TC-016 (default = 1), TC-017 (-1 → CONFIG_INVALID), TC-018 (0 → valid), TC-019 (1.5 → CONFIG_INVALID), TC-020 ("1" → CONFIG_INVALID), TC-021 (contextRollover なし → valid)

---

## 検証できなかった項目

- **既存テストの実行 green**: `git diff --name-only` で `agent-runner-transient-retry.test.ts` / `agent-runner-inactivity-timeout.test.ts` / `agent-runner-report-settles.test.ts` 等の既存テストファイルが変更されていないことは確認済み。CI 実行結果は本 conformance step では参照できないため unverified とする。

---

## Findings 詳細

### F-001: `rolloverExhausted` 経路の `error.message` が spec の MUST を満たさない

**Requirement**: R-08「error result の詳細が generic subtype だけに潰れない」

**Scenario**: 「errors[] の本文が error message に残る」
- Given: `subtype: "error_during_execution"` かつ `errors: ["API Error: Prompt is too long"]`
- Then: `error.message` は `"error_during_execution"` を含む AND `"Prompt is too long"` を含む

**実装の実際の動作**: `rolloverExhausted = true` となる経路（`maxRollovers: 0` や全 rollover 消費後）では、error.message が次の合成文字列になる:
```
"Claude Code SDK query failed: context window exhausted after N rollover(s). Consider splitting this request into smaller tasks."
```
この文字列には `"error_during_execution"` も `"Prompt is too long"` も含まれず、spec の MUST 要件を満たさない。

**テストギャップ**: TC-012 は非 exhaustion エラー（"something unexpected"）でテストしており、exhaustion エラー（"Prompt is too long"）でのメッセージ内容を検証していない。

**修正方針**: `rolloverExhausted = true` 経路でも subtype と errors[] 本文をメッセージに含めるよう変更する。例:
```typescript
const errorMessage = rolloverExhausted
  ? `Claude Code SDK query failed: ${errorResult.subtype}${errorBody} (context window exhausted after ${sessionRollovers.length} rollover(s). Consider splitting this request into smaller tasks.)`
  : `Claude Code SDK query failed: ${errorResult.subtype}${errorBody}`;
```
TC-012 に exhaustion 入力のテストケースを追加して spec Scenario をカバーする。

**緩和要因**: `error.code` は `CONTEXT_WINDOW_EXHAUSTED_CODE` で typed 化されており、exhaustion の事実は伝わる。rollover が発生した場合は `sessionRollovers[i].errorMessage` に元の errors[] テキストが保存されている。ただし、spec の MUST は `error.message` への包含を求めている。
