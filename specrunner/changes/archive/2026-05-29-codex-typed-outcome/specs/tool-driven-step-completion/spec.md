## Delta Spec: codex-typed-outcome

Baseline: `specrunner/specs/tool-driven-step-completion/spec.md`

---

## Removed

- "Codex adapter の frozen behavior"

## Requirements

### Requirement: Codex adapter の outputSchema 経由 typed outcome

`src/adapter/codex/agent-runner.ts` の `CodexAgentRunner` は、`ctx.policy.reportTool` が設定されている場合、
MUST `CodexThread.run()` の第 2 引数に `outputSchema` を渡して model に structured JSON 出力を要求し、
`finalResponse` を `reportTool.parseInput()` で parse して `toolResult` に載せなければならない。

- `CodexThread.run()` の型定義は SHALL `outputSchema?: unknown` オプションを受け付けるように拡張する
- `outputSchema` は MUST `toJSONSchema(object(reportTool.zodSchema))` で生成する（`zod/v4-mini` 経由）
- main work ターン完了後、`finalResponse` を `JSON.parse` → `reportTool.parseInput()` で validate する
- parse 成功（`parseResult.ok === true`）: `toolResult = parseResult.value`、`followUpAttempts = 0`
- parse 失敗 or `JSON.parse` 失敗: follow-up retry ループへ（下記）
- `ctx.policy.reportTool` 未設定の場合は `outputSchema` を SHALL 渡さず、`toolResult: null`、`followUpAttempts: 0` のまま（後方互換）

#### Scenario: reportTool set 時に outputSchema が渡される

**Given** `ctx.policy.reportTool` に `ReportToolSpec` が設定されている
**When** `CodexAgentRunner.run()` が main work ターンを実行する
**Then** `CodexThread.run()` の opts に `outputSchema` が含まれ、その値は `reportTool.zodSchema` から
生成した JSON Schema object である

#### Scenario: finalResponse が valid JSON → toolResult populated

**Given** Codex adapter が `reportTool` 付きの producer step を実行している
**When** agent が `outputSchema` に準拠した JSON（`{ "ok": true, "status": "success" }`）を `finalResponse` として返す
**Then** `toolResult` は `{ ok: true, status: "success" }` が载り、`followUpAttempts` は `0` で返る

### Requirement: Codex adapter の follow-up retry ループ

`capturedToolResult === null` かつ `ctx.policy.reportTool` が設定されている場合、
`CodexAgentRunner` は SHALL `ctx.policy.toolReportRetry`（未設定時は `DEFAULT_TOOL_RETRY`）の
`maxAttempts` 回まで follow-up retry を実行しなければならない。

- 各 retry: `activeThread.run(retryPrompt, { signal, outputSchema })` で同一 thread に follow-up を送信する
- retry prompt: `retryPolicy.buildPrompt({ attempt, reason: "no-tool-call" })` で MUST 生成する
- 各 retry 後に `finalResponse` を parse し、成功なら即 break する
- 全 retry 枯渇: `toolResult: null`、`followUpAttempts: maxAttempts` で MUST 返す
- usage は retry 分を含めて累積する（Codex per-turn 加算モデルを維持）

#### Scenario: parse 失敗時に follow-up retry が実行される

**Given** Codex adapter が `reportTool` 付きの step を実行し、`DEFAULT_TOOL_RETRY`（`maxAttempts: 2`）を使用している
**When** main work ターンの `finalResponse` が JSON parse 不能で、1 回目の retry で valid JSON が返る
**Then** `toolResult` が populated され、`followUpAttempts` は `1` で返る

#### Scenario: 全 retry 枯渇時は toolResult null で degrade

**Given** Codex adapter が `reportTool` 付きの step を実行し、`maxAttempts` が 2 に設定されている
**When** main work ターンと 2 回の retry 全てで `finalResponse` の parse に失敗する
**Then** `toolResult` は `null`、`followUpAttempts` は `2` で返る

### Requirement: postWorkPrompts ターンは outputSchema を受け取らない

`postWorkPrompts` ターンの `CodexThread.run()` 呼び出しには SHALL `outputSchema` を渡してはならない。
tool 呼び出し検出は main work ターンのみに MUST 限定する（既存 contract を維持）。

#### Scenario: postWorkPrompts ターンに outputSchema が渡らない

**Given** `ctx.policy.reportTool` が設定されており、`ctx.policy.postWorkPrompts` に 1 件以上のプロンプトがある
**When** `CodexAgentRunner.run()` が postWorkPrompts ターンを実行する
**Then** そのターンの `CodexThread.run()` 呼び出しの opts に `outputSchema` が含まれない

### Requirement: reportTool 未設定時は後方互換を維持

`ctx.policy.reportTool` が未設定の場合、`CodexAgentRunner` は MUST `outputSchema` を `thread.run()` に渡さず、
`toolResult: null`、`followUpAttempts: 0` を返さなければならない。

#### Scenario: reportTool 未設定時は従来挙動を維持

**Given** Codex adapter が `reportTool` 未設定の step を実行している
**When** step が正常完了する
**Then** `toolResult` は `null`、`followUpAttempts` は `0` で返り、`outputSchema` は `thread.run()` に渡されない
