# Tasks: one-shot-query-wrapper

## T-01: QueryOneShotOptions / QueryOneShotResult interface 定義 [x]

**File**: `src/adapter/claude-code/query-one-shot.ts` (CREATE)

- `QueryOneShotOptions` interface を定義:
  - `systemPrompt: string` (MUST)
  - `prompt: string` (MUST)
  - `allowedTools?: string[]` (optional, default: `["Read", "Bash", "Grep", "Glob"]`)
  - `maxTurns?: number` (optional — config chain の stepDefaults に入る)
  - `timeoutMs?: number` (optional — config chain の stepDefaults に入る)
  - `cwd?: string` (optional, default: `process.cwd()`)
  - `stepName?: string` (optional, default: `"one-shot"` — config 解決の key)
  - `model?: string` (optional, default: `"claude-sonnet-4-5"` — config chain の stepDefaults.model)
- `QueryOneShotResult` interface を定義:
  - `text: string` (MUST — assistant の最終 text response)
  - `sessionId?: string` (optional — SDK result の `session_id`)
  - `turnCount?: number` (optional — 将来拡張用、現在は常に undefined)
  - `stopReason?: string` (optional — `SDKResultMessage.subtype`)

**Depends on**: なし
**Verify**: `bun run typecheck`

## T-02: queryOneShot 関数本体の実装 [x]

**File**: `src/adapter/claude-code/query-one-shot.ts` (T-01 の同一ファイルに追加)

```ts
export async function queryOneShot(
  opts: QueryOneShotOptions,
  config: SpecRunnerConfig,
  queryFn?: QueryFn,
): Promise<QueryOneShotResult>
```

実装内容:
1. `getStepExecutionConfig(config, opts.stepName ?? "one-shot", { model: opts.model ?? "claude-sonnet-4-5", maxTurns: opts.maxTurns, timeoutMs: opts.timeoutMs })` で config 解決
2. `resolvedConfig.maxTurns !== null` の場合のみ `maxTurns` を query options に含める
3. `new AbortController()` + `resolvedConfig.timeoutMs > 0` の場合 `setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs)`
4. query options 構築: `{ cwd, allowedTools, permissionMode: "bypassPermissions", ...maxTurnsOption, model, systemPrompt, abortController }`
5. `for await (const message of messages)` で `message.type === "result"` を capture
6. finally で `clearTimeout(timeoutId)`
7. success 判定: `lastResult.subtype === "success"` → `QueryOneShotResult` を構築
   - `text`: `(lastResult as SDKResultSuccess).result`
   - `sessionId`: `(lastResult as SDKResultSuccess).session_id`
   - `stopReason`: `lastResult.subtype`
8. 非 success: `SpecRunnerError("QUERY_ONE_SHOT_FAILED", ...)` を throw
9. timeout (abortController.signal.aborted): `SpecRunnerError("QUERY_ONE_SHOT_TIMEOUT", ...)` を throw

Import:
- `query` from `@anthropic-ai/claude-agent-sdk` (default queryFn)
- `SDKMessage`, `SDKResultMessage`, `SDKResultSuccess` from 同上
- `getStepExecutionConfig` from `../../config/step-config.js`
- `SpecRunnerError` from `../../errors.js`
- `QueryFn` 型は `agent-runner.ts` から re-export された型を import するか、同一定義を local に置く (circular dependency 回避のため local 定義を推奨)

**Depends on**: T-01
**Verify**: `bun run typecheck`

## T-03: error code 追加 [x]

**File**: `src/errors.ts` (MODIFY)

`ERROR_CODES` object に追加:
- `QUERY_ONE_SHOT_FAILED: "QUERY_ONE_SHOT_FAILED"`
- `QUERY_ONE_SHOT_TIMEOUT: "QUERY_ONE_SHOT_TIMEOUT"`

**Depends on**: なし
**Verify**: `bun run typecheck`

## T-04: reviewer.ts を queryOneShot 経由に置き換え [x]

**File**: `src/core/request/reviewer.ts` (MODIFY)

`runReview()` の L204-258 (config 解決 → AbortController → for await → success check → raw text 取得) を以下に置き換え:

```ts
import { queryOneShot } from "../../adapter/claude-code/query-one-shot.js";

// runReview() 内:
const result = await queryOneShot(
  {
    systemPrompt: REQUEST_REVIEW_SYSTEM_PROMPT,
    prompt: buildInitialMessage(content, projectContext),
    allowedTools: ["Read", "Bash", "Grep", "Glob"],
    maxTurns: 30,
    timeoutMs: 300_000,
    cwd,
    stepName: "request-review",
    model: "claude-opus-4-5",
  },
  config,
  queryFn as QueryFn | undefined,  // DI 透過
);
return parseReviewOutput(result.text);
```

削除対象 (reviewer.ts から):
- `getStepExecutionConfig` import
- `SDKMessage`, `SDKResultMessage`, `SDKResultSuccess` import (`parseReviewOutput` では不使用)
- config 解決コード (L204-208)
- maxTurns option 構築 (L211-212)
- AbortController + timeout 構築 (L215-219)
- for await loop (L223-244)
- success 判定 + SpecRunnerError throw (L247-254)
- raw text 取得 (L257)

残す:
- project context 読み込み (L195-201)
- `buildInitialMessage()` 呼び出し
- `parseReviewOutput()` 呼び出し
- `queryFn` パラメータ (DI を `queryOneShot` に透過)

**reviewer.ts の `queryFn` parameter の型変更**: 現在 `typeof query` → `QueryFn | typeof query` に。queryOneShot が QueryFn 型で受け取るため。

**Depends on**: T-02, T-03
**Verify**: `bun run typecheck && bun test tests/unit/command/request-review.test.ts`

## T-05: queryOneShot の unit test [x]

**File**: `tests/unit/adapter/claude-code/query-one-shot.test.ts` (CREATE)

テストケース:

### TC-OSQ-01: 正常系 — success result を QueryOneShotResult に変換

- mock queryFn: `SDKResultMessage { type: "result", subtype: "success", result: "hello", session_id: "sess-1" }` を yield
- assert: `result.text === "hello"`, `result.sessionId === "sess-1"`, `result.stopReason === "success"`

### TC-OSQ-02: timeout で SpecRunnerError("QUERY_ONE_SHOT_TIMEOUT") を throw

- mock queryFn: 永久に yield しない (AbortController.abort() で break するまで)
- `timeoutMs: 100` を設定
- assert: `SpecRunnerError` with `code === "QUERY_ONE_SHOT_TIMEOUT"` が throw される

### TC-OSQ-03: config 解決 — maxTurns / timeoutMs が query options に反映

- mock queryFn: options を capture して success を返す
- `config.steps["request-review"].maxTurns = 10` を設定
- assert: captured options に `maxTurns: 10` が含まれる

### TC-OSQ-04: session_id が result に伝播

- mock queryFn: `session_id: "managed-sess-42"` を含む success result
- assert: `result.sessionId === "managed-sess-42"`

### TC-OSQ-05: 非 success result で SpecRunnerError("QUERY_ONE_SHOT_FAILED") を throw

- mock queryFn: `subtype: "error_during_execution"` の result を yield
- assert: `SpecRunnerError` with `code === "QUERY_ONE_SHOT_FAILED"`

**Depends on**: T-02, T-03
**Verify**: `bun test tests/unit/adapter/claude-code/query-one-shot.test.ts`

## T-06: 全体 regression 確認 [x]

**Verify**: `bun run typecheck && bun run test`

- 既存 request-review test (TC-RR-001 ~ TC-RR-010) が green であること
- 新規 query-one-shot test (TC-OSQ-01 ~ TC-OSQ-05) が green であること
- agent-runner test に影響がないこと

**Depends on**: T-04, T-05
