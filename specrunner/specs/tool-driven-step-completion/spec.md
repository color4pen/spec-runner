## Purpose

TBD
## Requirements

### Requirement: report-result port の定義

`src/core/port/report-result.ts` を MUST 新設し、`BaseReportResult` / `ReportToolSpec` / `FollowUpPolicy` / `DEFAULT_TOOL_RETRY` / `parseBaseReportInput` を named export として提供しなければならない。

- `BaseReportResult`: `{ ok: boolean; reason?: string }` の最小 payload 型
- `ReportToolSpec<TResult>`: `name` / `description` / `zodSchema: ZodRawShape` / `parseInput` を持つ interface。`zodSchema` は `zod/v4-mini` で書かれた `ZodRawShape` とする
- `FollowUpPolicy`: `maxAttempts: number` と `buildPrompt(input)` を持つ retry 制御 interface
- `DEFAULT_TOOL_RETRY`: `maxAttempts: 2` の default `FollowUpPolicy` 実装。`no-tool-call` / `invalid-input` の 2 ケースでメッセージを MUST 分岐する

#### Scenario: port が export を揃えている

- **WHEN** `src/core/port/report-result.ts` を import する
- **THEN** `BaseReportResult` / `ReportToolSpec` / `FollowUpPolicy` / `DEFAULT_TOOL_RETRY` / `parseBaseReportInput` が named export として取得できる

### Requirement: AgentRunContext のグループ化リファクタ

既存の `AgentRunContext` のフラットフィールドを MUST `input` / `session` / `policy` の 3 subfield に整理しなければならない。

- `input`: `requestContent` / `requestAdr?` / `projectContext?` / `dynamicContext?`
- `session`: `resumeSessionId?` / `resumePrompt?` / `logPath?`
- `policy`: `postWorkPrompts?` (旧 `followUpPrompts` リネーム) / `reportTool?: ReportToolSpec` / `toolReportRetry?: FollowUpPolicy`
- トップレベルに残るフィールド: `step` / `state` / `branch` / `slug` / `cwd` / `config` / `requestType?` / `emit`
- 既存の `followUpPrompts` は MUST `policy.postWorkPrompts` にリネームし、旧フィールド名を残してはならない

#### Scenario: followUpPrompts が postWorkPrompts にリネームされている

- **WHEN** `AgentRunContext` の型を参照する
- **THEN** `policy.postWorkPrompts?: string[]` が存在し、`followUpPrompts` フィールドは存在しない

#### Scenario: policy.reportTool が利用可能

- **WHEN** step が `AgentRunContext.policy.reportTool` に `ReportToolSpec` を設定する
- **THEN** adapter はその spec を用いて tool 登録と結果検出を行う

### Requirement: AgentRunResult の拡張

`AgentRunResult` には `toolResult: BaseReportResult | null` と `followUpAttempts: number` を MUST 必須フィールドとして追加しなければならない。

- `toolResult`: `null` = tool が呼ばれなかった、`BaseReportResult` = tool の呼び出し結果。`undefined` は SHALL 許容しない
- `followUpAttempts`: `0` = 初回で tool が呼ばれた、正の整数 = follow-up retry 回数
- `completionReason` の既存 3 値 (`success` / `error` / `timeout`) は MUST 維持する

#### Scenario: toolResult が必須フィールドとして存在する

- **WHEN** `AgentRunResult` オブジェクトが返される
- **THEN** `toolResult` フィールドが必ず存在し、`undefined` にならない

#### Scenario: tool 未呼び出し時は null

- **WHEN** agent が `report_result` tool を呼ばずに end_turn した
- **THEN** `toolResult === null`、`followUpAttempts` は retry 回数を示す

### Requirement: requiresCommit guard の廃止

`AgentStep.requiresCommit` フィールドを MUST 削除し、`agent-runner.ts` の `guardCommit` 呼び出しおよび `preSessionHeadSha` snapshot 関連コードを削除しなければならない。

- `commit-push.ts` での変更なし検出時: `noCommitDetectedError` を MUST スローせず silently skip する
- HEAD 進行検知時 (agent 自己 commit): push-only path を SHALL 維持する
- 変更あり: 通常の commit + push を MUST 維持する（既存挙動）

#### Scenario: 変更なし時に silently skip する

- **WHEN** `git add` が変更なしを返し、`requiresCommit` guard が存在しない
- **THEN** `noCommitDetectedError` をスローせず処理を継続する

#### Scenario: requiresCommit フィールドが存在しない

- **WHEN** `AgentStep` 型を参照する
- **THEN** `requiresCommit` フィールドが存在しない

### Requirement: 全 agent step への reportTool 追加

`design` / `spec-review` / `spec-fixer` / `test-case-gen` / `implementer` / `build-fixer` / `code-review` / `code-fixer` / `adr-gen` / `delta-spec-fixer` の全 10 step は MUST `AgentStep.reportTool: ReportToolSpec<BaseReportResult>` を持たなければならない。各 step ファイル内で static const として定義し、`zodSchema` は SHALL `zod/v4-mini` で書く。

#### Scenario: 全 step が reportTool を持つ

- **WHEN** 各 step ファイルを参照する
- **THEN** `reportTool` に `ReportToolSpec` が設定されており、`zodSchema` が `{ ok, reason? }` の ZodRawShape として定義されている

### Requirement: ClaudeCodeRunner での tool 登録と follow-up retry

`ClaudeCodeRunner` は MUST `createSdkMcpServer` で `report_result` tool を登録し、tool 未呼び出し時は SHALL `query({ resume: sessionId, prompt })` で follow-up を送信しなければならない。

- `zodSchema` を MUST `inputSchema` にそのまま渡す（`AnyZodRawShape` を直接満たす）
- `message.type === "result"` 到達時に tool が呼ばれていなければ MUST `toolReportRetry.buildPrompt(...)` で follow-up を生成する
- `maxAttempts` 超過時は MUST `toolResult: null` + `followUpAttempts: maxAttempts` で返す
- tool が `ok: false` で呼ばれた場合は SHALL `toolResult: { ok: false, reason }` を返す

#### Scenario: tool が呼ばれた場合

- **WHEN** agent が `report_result` tool を `{ ok: true }` で呼び出す
- **THEN** `toolResult: { ok: true }`、`followUpAttempts: 0`、`completionReason: "success"` で返る

#### Scenario: tool 未呼び出しで follow-up retry

- **WHEN** agent が tool を呼ばずに end_turn し、maxAttempts = 2 の場合
- **THEN** 最大 2 回の follow-up を送信し、3 回目も呼ばれなければ `toolResult: null`、`followUpAttempts: 2` で返る

### Requirement: ManagedAgentRunner での tool 検出と応答

`ManagedAgentRunner` は agent setup-time で MUST `z.toJSONSchema(z.object(zodSchema))` により JSON Schema に変換した上で `agents.create` の `tools.input_schema` に登録し、runtime の `requires_action` 検出時に tool 呼び出しを取得して完了通知しなければならない。

- MUST `status === "idle"` + `stop_reason: "requires_action"` を検出する
- MUST `events.list()` で `agent.custom_tool_use` の input を取得し `parseInput()` を呼ぶ
- 成功時: MUST `user.custom_tool_result` を `events.send` で送り session を終了に導く
- 失敗時: SHALL `user.message` で follow-up を送信し、`maxAttempts` 超過で `toolResult: null` を返す

#### Scenario: requires_action で report_result を検出

- **WHEN** Managed runtime で `stop_reason: "requires_action"` が来て `report_result` の custom_tool_use がある
- **THEN** input を `parseInput()` で検証し、`user.custom_tool_result` で完了通知する

### Requirement: tool 検出対象ターンの限定

tool 呼び出しの検出対象は MUST main work ターン（initial `buildMessage` で開始した最初の作業ターン）のみとしなければならない。`postWorkPrompts` ターン中の `report_result` 呼び出しは SHALL 検出しない。

#### Scenario: postWorkPrompts ターン中の tool 呼び出しは無視

- **WHEN** main work で tool が正常に呼ばれた後、`postWorkPrompts` ターン中に再度 `report_result` が呼ばれる
- **THEN** その tool 呼び出しは無視され、最初の main work での結果が `toolResult` に使われる

### Requirement: halt 時の job status 遷移

`toolResult: null` で完了した agent step は MUST halt せず次の step へ proceed しなければならない。verdict は step-class に基づいて確定する:

- **judge** (spec-review / code-review): verdict = `"needs-fix"`（保守側。`"approved"` でも `"escalation"` でもない）。fixer に回り、loop 枯渇で grounded に halt する。
- **producer** (design / implementer / spec-fixer / delta-spec-fixer / code-fixer / build-fixer / test-case-gen / adr-gen): verdict = `completionVerdict`（通常 `"success"`）。下流の grounded step（verification 等）が裏取りする。

halt は adapter 内の malformed retry 枯渇（`invalid-input` reason で `maxAttempts` 超過）時のみ発生する。`no-tool-call` reason の場合は `toolResult: null` で executor に返り、executor が proceed する。

adapter が `reason` フィールドで `invalid-input` と `no-tool-call` を区別する既存の挙動は MUST 維持する。

#### Scenario: judge step の toolResult null で needs-fix として proceed

**Given** spec-review step が `reportTool` 付きで実行されている
**When** agent が `report_result` tool を呼ばずに session 完了し、adapter が `toolResult: null` で返す
**Then** executor は halt せず verdict `"needs-fix"` で次 step（spec-fixer）へ proceed する

#### Scenario: producer step の toolResult null で completionVerdict として proceed

**Given** implementer step が `completionVerdict: "success"` を持ち、`reportTool` 付きで実行されている
**When** agent が `report_result` tool を呼ばずに session 完了し、adapter が `toolResult: null` で返す
**Then** executor は halt せず verdict `"success"` で次 step（verification）へ proceed する

#### Scenario: malformed JSON は adapter 内で追撃後に halt

**Given** agent が `report_result` を不正な JSON で呼び出す（`reason: invalid-input`）
**When** adapter が `maxAttempts`（2回）の追撃を行い、3回目も不正
**Then** adapter は halt し、executor には到達しない（awaiting-resume 遷移は adapter/executor 既存経路で処理）

### Requirement: state schema の拡張

`StepOutcome` (`src/state/schema.ts`) には MUST `toolResult?: BaseReportResult | null` と `followUpAttempts?: number` を追加しなければならない。既存フィールド（`error: ErrorInfo | null` 等）は SHALL すべて保持する。`pipeline-logger.ts` は MUST `outcome.toolResult` と `outcome.followUpAttempts` を log 出力しなければならない。

#### Scenario: StepOutcome に新フィールドが追加されている

- **WHEN** `StepOutcome` 型を参照する
- **THEN** `toolResult` と `followUpAttempts` フィールドが存在し、既存フィールドが失われていない

### Requirement: zod 依存の明示と import 範囲の限定

`package.json` の `dependencies` には MUST `"zod": "^4.0.0"` を追加しなければならない。spec-runner 本体コードでの zod import は SHALL `zod/v4-mini`（schema 表現）と Managed adapter での `z.toJSONSchema` 変換のみとし、`parseInput` は MUST zod の parse API を使わず `unknown` を手書き check しなければならない。

#### Scenario: zod が dependencies に追加されている

- **WHEN** `package.json` の `dependencies` を参照する
- **THEN** `"zod": "^4.0.0"` が存在する

#### Scenario: 重い zod API を使用していない

- **WHEN** `grep -rE 'from "zod[/'\''\"]' src` でソースを検索する
- **THEN** `zod/v4-mini` および Managed adapter の `z.toJSONSchema` 以外の zod import が存在しない

### Requirement: 全 step の system prompt に report_result 指示を追加

各 step の system prompt (`src/prompts/*-system.ts`) の末尾には MUST「タスク完了時に必ず `report_result` tool を呼ぶこと。`{ok: true}` で正常完了、`{ok: false, reason}` で自発的失敗を宣言する」旨の指示を追加しなければならない。

#### Scenario: system prompt に report_result 指示が含まれる

- **WHEN** 各 step の system prompt を参照する
- **THEN** `report_result` tool の呼び出し指示が末尾に存在する

### Requirement: toolResult 存在時の verdict 導出

`toolResult` が存在する agent step では、executor は MUST `toolResult` の typed field から verdict を導出し、prose parse（`step.parseResult`）を verdict 確定に使用してはならない。

- **judge** (spec-review / code-review): `toolResult.approved === true` → `"approved"` / `toolResult.approved === false` or undefined → `"needs-fix"`
- **producer**: `toolResult.status === "success"` → `completionVerdict`（fallback `"success"`）/ `toolResult.status === "error"` → `"error"` / `status` undefined → `completionVerdict` fallback

grounded step（verification / delta-spec-validation / pr-create）は `report_result` を通らないため toolResult を持たず、従来の prose parse path を SHALL 維持する。

#### Scenario: judge step で toolResult.approved が true の場合

**Given** spec-review step が `toolResult: { ok: true, approved: true }` で完了する
**When** executor が verdict を確定する
**Then** verdict は `"approved"` になり、`parseReviewVerdict` は verdict 確定に使用されない

#### Scenario: judge step で toolResult.approved が false の場合

**Given** code-review step が `toolResult: { ok: true, approved: false, fixableCount: 0 }` で完了する
**When** executor が verdict を確定する
**Then** verdict は `"needs-fix"` になる

#### Scenario: judge step で toolResult.approved が未設定の場合

**Given** spec-review step が `toolResult: { ok: true }` で完了する（approved 未設定）
**When** executor が verdict を確定する
**Then** verdict は `"needs-fix"` になる（保守側 — golden case「空/壊れ→非 approved」と整合）

#### Scenario: producer step（completionVerdict: "success"）で toolResult.status から verdict を導出

**Given** design step が `completionVerdict: "success"` を持ち、`toolResult: { ok: true, status: "success" }` で完了する
**When** executor が verdict を確定する
**Then** verdict は `"success"` になる（`completionVerdict` 経由）

#### Scenario: approved-returning producer step で toolResult.status から verdict を導出

**Given** spec-fixer step が `completionVerdict: "approved"` を持ち、`toolResult: { ok: true, status: "success" }` で完了する
**When** executor が verdict を確定する
**Then** verdict は `"approved"` になり、遷移表の `on: "approved"` にマッチする

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
