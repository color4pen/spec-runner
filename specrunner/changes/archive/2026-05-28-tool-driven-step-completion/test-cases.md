# Test Cases: tool-driven-step-completion

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could

  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 47 cases
- **Automated** (unit/integration): 43
- **Manual**: 4
- **Priority**: must: 34, should: 12, could: 1

---

## Port / Interface (T-01)

### TC-001: BaseReportResult の型エクスポート

**Category**: unit
**Priority**: must
**Source**: T-01, request.md Req 1

**GIVEN** `src/core/port/report-result.ts` が作成されている
**WHEN** `BaseReportResult` をインポートする
**THEN** `ok: boolean` と `reason?: string` を持つ interface が得られる

---

### TC-002: ReportToolSpec の型エクスポートと構造

**Category**: unit
**Priority**: must
**Source**: T-01, request.md Req 1

**GIVEN** `src/core/port/report-result.ts` が作成されている
**WHEN** `ReportToolSpec` をインポートする
**THEN** `name: string`, `description: string`, `zodSchema: ZodRawShape`, `parseInput: (raw: unknown) => ...` フィールドを持つ interface が得られる

---

### TC-003: DEFAULT_TOOL_RETRY のデフォルト挙動 — no-tool-call

**Category**: unit
**Priority**: must
**Source**: T-01, request.md Req 8

**GIVEN** `DEFAULT_TOOL_RETRY` をインポートし `maxAttempts === 2` である
**WHEN** `buildPrompt({ attempt: 1, reason: "no-tool-call" })` を呼ぶ
**THEN** `report_result` tool を呼ぶよう促すメッセージ文字列が返される（`attempt 1/2` を含む）

---

### TC-004: DEFAULT_TOOL_RETRY のデフォルト挙動 — invalid-input

**Category**: unit
**Priority**: should
**Source**: T-01, request.md Req 8

**GIVEN** `DEFAULT_TOOL_RETRY` をインポートしている
**WHEN** `buildPrompt({ attempt: 2, reason: "invalid-input", missingFields: ["ok"] })` を呼ぶ
**THEN** 不足フィールド名 `ok` を含む再試行促進メッセージが返される（`attempt 2/2` を含む）

---

### TC-005: parseBaseReportInput — 有効な入力

**Category**: unit
**Priority**: must
**Source**: T-01, design.md D6

**GIVEN** `parseBaseReportInput` ヘルパーをインポートしている
**WHEN** `{ ok: true }` を渡す
**THEN** `{ ok: true, value: { ok: true } }` が返される

---

### TC-006: parseBaseReportInput — ok: false + reason

**Category**: unit
**Priority**: must
**Source**: T-01, design.md D6

**GIVEN** `parseBaseReportInput` ヘルパーをインポートしている
**WHEN** `{ ok: false, reason: "design was rejected" }` を渡す
**THEN** `{ ok: true, value: { ok: false, reason: "design was rejected" } }` が返される

---

### TC-007: parseBaseReportInput — ok フィールドが欠如

**Category**: unit
**Priority**: must
**Source**: T-01, request.md Req 1

**GIVEN** `parseBaseReportInput` ヘルパーをインポートしている
**WHEN** `{ reason: "something" }` を渡す（ok フィールドなし）
**THEN** `{ ok: false, missingFields: ["ok"], rawInput: { reason: "something" } }` が返される

---

### TC-008: parseBaseReportInput — ok が boolean でない型

**Category**: unit
**Priority**: should
**Source**: T-01, design.md D11

**GIVEN** `parseBaseReportInput` ヘルパーをインポートしている
**WHEN** `{ ok: "true" }` を渡す（string 型の ok）
**THEN** `{ ok: false, missingFields: ["ok"], rawInput: ... }` が返される

---

## package.json (T-02)

### TC-009: zod の直接依存が package.json に追加されている

**Category**: manual
**Priority**: must
**Source**: T-02, request.md Req 15

**GIVEN** `package.json` を確認する
**WHEN** `dependencies` フィールドを参照する
**THEN** `"zod": "^4.0.0"` が存在する

---

## AgentRunContext / AgentRunResult リファクタ (T-03)

### TC-010: AgentRunContext の input サブフィールド

**Category**: unit
**Priority**: must
**Source**: T-03, request.md Req 2

**GIVEN** `AgentRunContext` の型定義を参照する
**WHEN** `input` サブフィールドを確認する
**THEN** `requestContent`, `requestAdr?`, `projectContext?`, `dynamicContext?` が存在する。トップレベルに `requestContent` は存在しない

---

### TC-011: AgentRunContext の session / policy サブフィールド

**Category**: unit
**Priority**: must
**Source**: T-03, request.md Req 2

**GIVEN** `AgentRunContext` の型定義を参照する
**WHEN** `session` と `policy` サブフィールドを確認する
**THEN** `session: { resumeSessionId?, resumePrompt?, logPath? }` と `policy: { postWorkPrompts?, reportTool?, toolReportRetry? }` が存在する。`followUpPrompts` はトップレベルにも policy にも存在しない

---

### TC-012: AgentRunResult に toolResult / followUpAttempts が必須追加

**Category**: unit
**Priority**: must
**Source**: T-03, request.md Req 3

**GIVEN** `AgentRunResult` の型定義を参照する
**WHEN** フィールド一覧を確認する
**THEN** `toolResult: BaseReportResult | null`（optional でない）と `followUpAttempts: number`（optional でない）が存在する

---

## requiresCommit guard 廃止 (T-05)

### TC-013: AgentStep.requiresCommit フィールドが削除されている

**Category**: unit
**Priority**: must
**Source**: T-05, request.md Req 4

**GIVEN** `src/core/step/types.ts` の `AgentStep` 型を確認する
**WHEN** フィールド一覧を参照する
**THEN** `requiresCommit` フィールドが存在しない

---

### TC-014: commit-push — 変更なし時に silently skip

**Category**: unit
**Priority**: must
**Source**: T-05, design.md D5

**GIVEN** `commit-push.ts` の `commitAndPush` を呼ぶ。`git add` の結果として staging エリアに変更がなく HEAD も進んでいない状態
**WHEN** `commitAndPush` を実行する
**THEN** エラーをスローせず正常に戻る（`noCommitDetectedError` がスローされない）

---

### TC-015: commit-push — HEAD 進行時は push-only path

**Category**: unit
**Priority**: should
**Source**: T-05, design.md D5, request.md Req 4

**GIVEN** staging 変更はないが、ローカル HEAD が remote より進んでいる状態
**WHEN** `commitAndPush` を実行する
**THEN** 新規 commit を作らず `git push` のみが呼ばれる。authority spec violation 警告ロジックが実行される

---

### TC-016: commit-push — 変更あり時は通常 commit + push

**Category**: unit
**Priority**: must
**Source**: T-05, design.md D5

**GIVEN** staging に変更ファイルが存在する状態
**WHEN** `commitAndPush` を実行する
**THEN** `git commit` と `git push` が順に呼ばれる

---

## state schema 拡張 (T-06)

### TC-017: StepOutcome に toolResult / followUpAttempts が追加されている

**Category**: unit
**Priority**: must
**Source**: T-06, request.md Req 9

**GIVEN** `src/state/schema.ts` の `StepOutcome` 型を確認する
**WHEN** フィールド一覧を参照する
**THEN** `toolResult?: BaseReportResult | null` と `followUpAttempts?: number` が存在する。既存フィールド（`verdict`, `findingsPath`, `fileContent`, `error` 等）が保持されている

---

## ClaudeCodeRunner (Local runtime) (T-07)

### TC-018: report_result MCP tool の登録

**Category**: integration
**Priority**: must
**Source**: T-07, request.md Req 5, design.md D1

**GIVEN** `ctx.policy.reportTool` に `ReportToolSpec` が設定された `AgentRunContext` を構築する。`createSdkMcpServer` と `query` をモックする
**WHEN** ClaudeCodeRunner の `run()` を呼ぶ
**THEN** `createSdkMcpServer` が `name: "report_result"` を含む tool 定義で呼ばれる。`query()` の `mcpServers` オプションに `specrunner_report` server が含まれる

---

### TC-019: report_result tool が ok:true で呼ばれた場合の正常完了

**Category**: integration
**Priority**: must
**Source**: T-07, request.md Req 5

**GIVEN** ClaudeCodeRunner を使用し、`_queryFn` mock が `report_result` tool を `{ ok: true }` で呼ぶメッセージシーケンスを返す
**WHEN** `run()` を実行する
**THEN** `AgentRunResult.toolResult` が `{ ok: true }` であり、`followUpAttempts === 0` である。`completionReason === "success"` が維持される

---

### TC-020: report_result tool が ok:false で呼ばれた場合

**Category**: integration
**Priority**: should
**Source**: T-07, request.md Req 5

**GIVEN** ClaudeCodeRunner を使用し、`_queryFn` mock が `report_result` tool を `{ ok: false, reason: "spec not ready" }` で呼ぶ
**WHEN** `run()` を実行する
**THEN** `AgentRunResult.toolResult` が `{ ok: false, reason: "spec not ready" }` であり、`completionReason === "success"` が維持される（エラーにならない）

---

### TC-021: tool 未呼び出し → 1 回目 follow-up retry

**Category**: integration
**Priority**: must
**Source**: T-07, request.md Req 11

**GIVEN** ClaudeCodeRunner を使用し、`_queryFn` mock が tool を呼ばずに `result` メッセージを返す（1 回目）
**WHEN** `run()` の main work ターンが完了する
**THEN** `query({ resume: sessionId, prompt: ... })` が呼ばれ、follow-up prompt に `attempt 1/2` が含まれる。`followUpAttempts` がまだ最終値でない

---

### TC-022: tool 未呼び出し 2 回 → 2 回目 follow-up retry

**Category**: integration
**Priority**: must
**Source**: T-07, request.md Req 11

**GIVEN** ClaudeCodeRunner を使用し、`_queryFn` mock が 2 回連続で tool を呼ばずに `result` を返す
**WHEN** `run()` を実行する
**THEN** 2 回目の `query({ resume, prompt })` が呼ばれ、follow-up prompt に `attempt 2/2` が含まれる

---

### TC-023: maxAttempts 超過 → toolResult:null, followUpAttempts:2 で halt

**Category**: integration
**Priority**: must
**Source**: T-07, request.md Req 11

**GIVEN** ClaudeCodeRunner を使用し、`_queryFn` mock が 3 回連続で tool を呼ばずに `result` を返す（maxAttempts=2）
**WHEN** `run()` を実行する
**THEN** `AgentRunResult.toolResult === null` かつ `followUpAttempts === 2` かつ `completionReason === "success"` で返る

---

### TC-024: postWorkPrompts ターン中の tool 呼び出しは無視される

**Category**: integration
**Priority**: must
**Source**: T-07, request.md Req 11, design.md D7

**GIVEN** ClaudeCodeRunner を使用し、main work ターンで `{ ok: true }` を呼んだ後、`postWorkPrompts` ターン中に再度 `report_result` tool を `{ ok: false }` で呼ぶシーケンスをモックする
**WHEN** `run()` を実行する
**THEN** `AgentRunResult.toolResult` が main work ターンの `{ ok: true }` であり、postWork ターンの `{ ok: false }` が toolResult に上書きされない

---

### TC-025: zodSchema が inputSchema にそのまま渡される（型整合）

**Category**: unit
**Priority**: should
**Source**: T-07, request.md Req 5

**GIVEN** `ReportToolSpec.zodSchema` が `{ ok: boolean(), reason: optional(string()) }` の ZodRawShape である
**WHEN** ClaudeCodeRunner が `createSdkMcpServer` に tool 定義を渡す
**THEN** `inputSchema` が `zodSchema` と同一オブジェクト参照で渡されている（JSON Schema への変換がされていない）

---

## ManagedAgentRunner (Managed runtime) (T-08)

### TC-026: requires_action + report_result 検出 → user.custom_tool_result 送信

**Category**: integration
**Priority**: must
**Source**: T-08, request.md Req 6, design.md D1

**GIVEN** ManagedAgentRunner を使用し、`sessionClient` mock が `requires_action` stop_reason を返す。`events.list()` が `agent.custom_tool_use { name: "report_result", input: { ok: true } }` を返す
**WHEN** polling loop が `requires_action` を検出する
**THEN** `events.send({ type: "user.custom_tool_result", content: "ok" })` が呼ばれる。最終的に `AgentRunResult.toolResult === { ok: true }` が返る

---

### TC-027: requires_action + report_result が見つからない → sessionRequiresActionError

**Category**: integration
**Priority**: should
**Source**: T-08, request.md Req 6

**GIVEN** ManagedAgentRunner を使用し、`requires_action` が発生するが `events.list()` に `report_result` の `agent.custom_tool_use` がない
**WHEN** polling loop が `requires_action` を処理する
**THEN** `sessionRequiresActionError` がスローされる（既存の挙動を維持）

---

### TC-028: Managed runtime — tool 未呼び出し → follow-up メッセージ送信

**Category**: integration
**Priority**: must
**Source**: T-08, request.md Req 11

**GIVEN** ManagedAgentRunner を使用し、session が `end_turn` で完了したが `report_result` 呼び出しが検出されなかった
**WHEN** polling が完了を検出する
**THEN** `events.send({ type: "user.message", content: <follow-up prompt> })` が呼ばれ、polling が再開される

---

### TC-029: Managed runtime — maxAttempts 超過 → toolResult:null

**Category**: integration
**Priority**: must
**Source**: T-08, request.md Req 11

**GIVEN** ManagedAgentRunner を使用し、`maxAttempts=2` で 3 回連続 tool 未呼び出しをシミュレートする
**WHEN** `run()` を実行する
**THEN** `AgentRunResult.toolResult === null` かつ `followUpAttempts === 2` で返る

---

### TC-030: runDesignStyle SSE path — sessionRequiresActionError を catch して report_result パスへ分岐

**Category**: integration
**Priority**: should
**Source**: T-08, request.md Req 6

**GIVEN** ManagedAgentRunner の `runDesignStyle` を使用し、SSE stream が `terminationReason: requires_action` で終わる。`events.list()` が `report_result` の tool use を返す
**WHEN** SSE stream 処理が完了する
**THEN** `sessionRequiresActionError` が catch され、polling path と同一の `extractReportResult` ロジックに合流し、`AgentRunResult.toolResult` が正しく設定される

---

## Codex adapter の frozen behavior (T-09)

### TC-031: Codex adapter は toolResult:null を返す

**Category**: unit
**Priority**: must
**Source**: T-09, request.md Req 12

**GIVEN** `src/adapter/codex/agent-runner.ts` の実装を参照する
**WHEN** `run()` を実行する
**THEN** `AgentRunResult.toolResult === null` かつ `followUpAttempts === 0` が返る（reportTool の有無によらず）

---

### TC-032: Codex adapter は policy.reportTool を無視する

**Category**: unit
**Priority**: should
**Source**: T-09, request.md Req 12

**GIVEN** `ctx.policy.reportTool` に `ReportToolSpec` が設定された `AgentRunContext` を Codex adapter に渡す
**WHEN** `run()` を実行する
**THEN** MCP server が作成されない。既存の markdown + regex parse 経路が維持される

---

### TC-033: DispatchingAgentRunner は内部 adapter の結果を透過する

**Category**: unit
**Priority**: should
**Source**: T-09, tasks.md T-09

**GIVEN** `DispatchingAgentRunner` が内部に Codex adapter を持つ設定
**WHEN** `run()` を実行する
**THEN** 内部 adapter の `AgentRunResult`（`toolResult: null`, `followUpAttempts: 0`）がそのまま返される

---

## 全 step の reportTool 定義 (T-10)

### TC-034: 全 10 step ファイルに REPORT_TOOL static const が定義されている

**Category**: unit
**Priority**: must
**Source**: T-10, request.md Req 7

**GIVEN** 10 step ファイル（design, spec-review, spec-fixer, test-case-gen, implementer, build-fixer, code-review, code-fixer, adr-gen, delta-spec-fixer）を確認する
**WHEN** 各ファイルで `reportTool` フィールドを参照する
**THEN** 全 10 ファイルに `REPORT_TOOL` static const が定義されており、`name: "report_result"`, `zodSchema` が `zod/v4-mini` で記述されている

---

### TC-035: AgentStep 型に reportTool フィールドが追加されている

**Category**: unit
**Priority**: must
**Source**: T-10, tasks.md T-10

**GIVEN** `src/core/step/types.ts` の `AgentStep` 型を確認する
**WHEN** フィールド一覧を参照する
**THEN** `reportTool?: ReportToolSpec` が存在する

---

### TC-036: reportTool.zodSchema の zod import は zod/v4-mini のみ

**Category**: manual
**Priority**: must
**Source**: T-10, request.md Req 15, design.md D11

**GIVEN** `src/` 配下の全ファイルを確認する（`grep -rE 'from "zod[/'"'"'"]' src`）
**WHEN** zod import を列挙する
**THEN** `zod/v4-mini` および `zod/v4`（type-only）以外の zod import が存在しない。`z.parse`, `z.refine`, `z.transform` 等の重い API の呼び出しがない

---

## AgentDefinition.tools への CustomToolSpec 追加 (T-11)

### TC-037: 全 10 step の AgentDefinition.tools に report_result CustomToolSpec が含まれている

**Category**: unit
**Priority**: must
**Source**: T-11, request.md Req 13

**GIVEN** 全 10 step ファイルの `AgentDefinition` を確認する
**WHEN** `agent.tools` 配列を参照する
**THEN** `{ type: "custom", name: "report_result", ... }` の CustomToolSpec が含まれている

---

### TC-038: AnthropicClientAdapter が CustomToolSpec を BetaManagedAgentsCustomToolParams にマッピングする

**Category**: unit
**Priority**: should
**Source**: T-11, request.md Req 13

**GIVEN** `AgentDefinition.tools` に `{ type: "custom", name: "report_result", description: "...", input_schema: {...} }` が含まれる
**WHEN** `AnthropicClientAdapter.createAgent` / `updateAgent` が呼ばれる
**THEN** Anthropic API への `agents.create` 呼び出しの `tools` パラメータに `BetaManagedAgentsCustomToolParams` 形式の `report_result` が含まれる

---

## system prompt 指示追加 (T-12)

### TC-039: 全 10 step の system prompt に report_result 呼び出し指示が含まれている

**Category**: manual
**Priority**: must
**Source**: T-12, request.md Req 14

**GIVEN** 全 10 system prompt ファイル（`src/prompts/*-system.ts`）を確認する
**WHEN** prompt 内容を参照する
**THEN** 各 prompt に「作業完了時に `report_result` tool を呼ぶこと」「`{ok: true}` で正常完了」「`{ok: false, reason}` で自発的失敗」の旨が記載されている

---

## StepExecutor の halt 処理 (T-13)

### TC-040: toolResult:null + reportTool 設定あり → stepHaltedNoToolCallError

**Category**: integration
**Priority**: must
**Source**: T-13, request.md Req 11, design.md D10

**GIVEN** `executor.ts` の `runAgentStep` を呼び、`ctx.policy.reportTool` が設定されていて `runResult.toolResult === null` が返る
**WHEN** `runAgentStep` が実行される
**THEN** `stepHaltedNoToolCallError` がスローされる（または同等の SpecRunnerError）

---

### TC-041: toolResult:null halt → job status が awaiting-resume に遷移

**Category**: integration
**Priority**: must
**Source**: T-13, request.md Req 11, design.md D10

**GIVEN** `stepHaltedNoToolCallError` が throw されてパイプラインの catch ロジックに到達する
**WHEN** `pipeline.ts` の既存 catch ロジック（`pipeline.ts:91-94`）が処理する
**THEN** job status が `awaiting-resume` に遷移する（`failed` にならない）

---

### TC-042: toolResult:null + reportTool 未設定（Codex path） → halt しない

**Category**: integration
**Priority**: must
**Source**: T-13, request.md Req 12, tasks.md T-13

**GIVEN** `ctx.policy.reportTool` が undefined（Codex adapter の frozen behavior）かつ `runResult.toolResult === null`
**WHEN** `runAgentStep` が実行される
**THEN** `stepHaltedNoToolCallError` がスローされない。step 処理が通常フローで続行される

---

### TC-043: StepOutcome に toolResult / followUpAttempts が記録される

**Category**: integration
**Priority**: should
**Source**: T-13, tasks.md T-13, request.md Req 9

**GIVEN** `runAgentStep` が `toolResult: { ok: true }`, `followUpAttempts: 1` の `AgentRunResult` を受け取る
**WHEN** `pushStepResult` / `finalizeStep` が呼ばれる
**THEN** 永続化された `StepOutcome` に `toolResult: { ok: true }` と `followUpAttempts: 1` が含まれる

---

### TC-044: executor が step.reportTool を policy.reportTool として AgentRunContext に設定する

**Category**: unit
**Priority**: should
**Source**: T-13, tasks.md T-13

**GIVEN** `AgentStep.reportTool` が設定された step を使用する
**WHEN** `executor.ts` が `AgentRunContext` を構築する
**THEN** `ctx.policy.reportTool` が `step.reportTool` と同一の値になる。`ctx.policy.toolReportRetry` が `DEFAULT_TOOL_RETRY` になる

---

## pipeline-logger 拡張 (T-14)

### TC-045: pipeline-logger が toolResult / followUpAttempts をログ出力する

**Category**: unit
**Priority**: could
**Source**: T-14, request.md Req 10

**GIVEN** `pipeline-logger.ts` の `step:complete` イベントハンドラが `outcome.toolResult` と `outcome.followUpAttempts` を受け取る
**WHEN** ログ出力が呼ばれる
**THEN** ログに `toolResult: { ok: true }` と `followUpAttempts: 0`（または `null` / 数値）が含まれる

---

## 統合 / 回帰 (T-15)

### TC-046: fetchResultFile — file not found 時に throw せず fileContent:null を返す

**Category**: integration
**Priority**: must
**Source**: request.md Req 4, tasks.md T-15

**GIVEN** `fetchResultFile` を呼び、対象ファイルが GitHub raw fetch で 404 を返す
**WHEN** `fetchResultFile` を実行する
**THEN** エラーをスローせず `outcome.fileContent === null` で返る

---

### TC-047: typecheck + lint が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-15, request.md 受け入れ基準

**GIVEN** 全実装変更が完了した状態
**WHEN** `bun run typecheck && bun run test && bun run lint` を実行する
**THEN** すべてが green で終了する

---

## Result

```yaml
result: completed
total: 47
automated: 43
manual: 4
must: 34
should: 12
could: 1
blocked_reasons: []
```
