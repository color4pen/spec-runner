# Tasks: tool-driven-step-completion

## T-01: 新規 port `report-result.ts` の作成

- [ ] `src/core/port/report-result.ts` を新規作成する
- [ ] `BaseReportResult` interface を定義する (`ok: boolean`, `reason?: string`)
- [ ] `ReportToolSpec<TResult = BaseReportResult>` interface を定義する:
  - `name: string` — 第 1 段は `"report_result"` 固定
  - `description: string`
  - `zodSchema: ZodRawShape` — `zod/v4-mini` で定義。type-only import で `zod/v4` の `ZodRawShape` を参照
  - `parseInput: (raw: unknown) => { ok: true; value: TResult } | { ok: false; missingFields: string[]; rawInput: unknown }`
- [ ] `FollowUpPolicy` interface を定義する (`maxAttempts: number`, `buildPrompt: (input) => string`)
- [ ] `DEFAULT_TOOL_RETRY: FollowUpPolicy` を export する（`maxAttempts: 2`、`no-tool-call` / `invalid-input` の 2 パターン対応）
- [ ] `parseBaseReportInput(raw: unknown)` ヘルパーを export する — `typeof raw.ok === "boolean"` 等の手書き check。zod の `parse` API は使わない

**Acceptance Criteria**:
- `ReportToolSpec` / `BaseReportResult` / `FollowUpPolicy` / `DEFAULT_TOOL_RETRY` / `parseBaseReportInput` が export されている
- `bun run typecheck` が green
- zod の import は `import type { ZodRawShape } from "zod/v4"` のみ（type-only）

## T-02: `package.json` に zod 直接依存を追加

- [ ] `package.json` の `dependencies` に `"zod": "^4.0.0"` を追加する
- [ ] `bun install` を実行して lock file を更新する

**Acceptance Criteria**:
- `package.json` の `dependencies` に `"zod": "^4.0.0"` が存在する
- `bun install` が成功する

## T-03: `AgentRunContext` のグループ化リファクタ

- [ ] `src/core/port/agent-runner.ts` の `AgentRunContext` を以下の subfield に再構造化する:
  - `input`: `{ requestContent, requestAdr?, projectContext?, dynamicContext? }`
  - `session`: `{ resumeSessionId?, resumePrompt?, logPath? }` — 旧 `sessionLogPath` は `logPath` にリネーム
  - `policy`: `{ postWorkPrompts?, reportTool?, toolReportRetry? }` — 旧 `followUpPrompts` は `postWorkPrompts` にリネーム
  - トップレベル残留: `step`, `state`, `branch`, `slug`, `cwd`, `config`, `emit`, `requestType`
- [ ] `ReportToolSpec` と `FollowUpPolicy` を T-01 の port から import する
- [ ] `AgentRunResult` に以下の必須フィールドを追加する:
  - `toolResult: BaseReportResult | null` — null = tool 呼ばれなかった
  - `followUpAttempts: number` — 0 = 初回成功
- [ ] `src/adapter/shared/follow-up.ts` の `shouldRunFollowUp` を `ctx.policy?.postWorkPrompts` に更新する
- [ ] `mergeFollowUpResult` の引数を新しい `AgentRunResult` 型に合わせる

**Acceptance Criteria**:
- `AgentRunContext` が `input` / `session` / `policy` の subfield を持つ
- `followUpPrompts` が `policy.postWorkPrompts` にリネームされている
- `AgentRunResult.toolResult` と `AgentRunResult.followUpAttempts` が必須フィールドとして定義されている
- `bun run typecheck` が green

## T-04: `AgentRunContext` 参照箇所の機械的更新

- [ ] `src/core/step/executor.ts`: ctx 構築部分を新 subfield 構造に更新する
  - `requestContent` → `input.requestContent`, `requestAdr` → `input.requestAdr`, `projectContext` → `input.projectContext`, `dynamicContext` → `input.dynamicContext`
  - `resumeSessionId` → `session.resumeSessionId`, `resumePrompt` → `session.resumePrompt`, `sessionLogPath` → `session.logPath`
  - `followUpPrompts` → `policy.postWorkPrompts`
- [ ] `src/adapter/claude-code/agent-runner.ts`: `ctx.requestContent` → `ctx.input.requestContent` 等の field access を更新する。`ctx.followUpPrompts` → `ctx.policy?.postWorkPrompts`
- [ ] `src/adapter/managed-agent/agent-runner.ts`: 同様の field access 更新。`ctx.followUpPrompts` → `ctx.policy?.postWorkPrompts`
- [ ] `src/adapter/codex/agent-runner.ts`: 同様の field access 更新
- [ ] `src/adapter/dispatching/agent-runner.ts`: 透過的なので変更不要だが型整合を確認
- [ ] `src/adapter/shared/prompt-builder.ts`: `buildAdditionalInstructions` が参照する field を更新
- [ ] 全 adapter の `AgentRunResult` 返却箇所に `toolResult: null, followUpAttempts: 0` を追加する（T-07 / T-08 で本実装するまでの暫定値）
- [ ] テストファイルの ctx 構築も新構造に合わせて更新する

**Acceptance Criteria**:
- 全 adapter / executor / テストが新 `AgentRunContext` 構造を参照している
- `bun run typecheck && bun run test` が green

## T-05: `requiresCommit` guard 廃止

- [ ] `src/core/step/types.ts`: `AgentStep.requiresCommit` フィールドを削除する
- [ ] 各 step ファイルから `requiresCommit: true` / `requiresCommit: false` の記述を削除する:
  - `src/core/step/spec-fixer.ts`
  - `src/core/step/implementer.ts`
  - `src/core/step/build-fixer.ts`
  - `src/core/step/code-fixer.ts`
  - `src/core/step/delta-spec-fixer.ts`
- [ ] `src/adapter/managed-agent/agent-runner.ts`:
  - `guardCommit` private method を削除する
  - `preparePollingMessage` から `preSessionHeadSha` snapshot ロジックを削除する
  - `runPollingStyle` から `guardCommit` 呼び出しを削除する
  - `noCommitDetectedError` の import を削除する
- [ ] `src/core/step/commit-push.ts` を新挙動に整理する:
  - `step.requiresCommit` の参照をすべて削除する
  - git add 失敗 + 変更なし → silently return（`noCommitDetectedError` スローを廃止）
  - 変更なし + HEAD 進行検知時 → push-only path を維持（authority spec violation 警告ロジックは残す）
  - 変更あり → 通常の commit + push（既存挙動維持）
  - 関数シグネチャから `step: AgentStep` の代わりに必要な情報（`step.name` のみ）を受け取る形に整理するか、型の変更に追従する
- [ ] `src/core/step/executor.ts` の `commitAndPush` 呼び出しが新シグネチャに合っていることを確認する

**Acceptance Criteria**:
- `AgentStep.requiresCommit` フィールドが存在しない
- 全 step ファイルから `requiresCommit` の記述が削除されている
- `commit-push.ts` が `step.requiresCommit` を参照していない
- `noCommitDetectedError` が `commit-push.ts` からスローされない
- `bun run typecheck && bun run test` が green

## T-06: state schema 拡張

- [ ] `src/state/schema.ts` の `StepOutcome` に以下を追加する:
  - `toolResult?: BaseReportResult | null` — null = tool 呼ばれなかった
  - `followUpAttempts?: number` — 0 = 初回成功
  - 既存フィールド（`verdict`, `findingsPath`, `fileContent`, `error`）はすべて保持する
- [ ] `BaseReportResult` を `src/core/port/report-result.ts` から import する

**Acceptance Criteria**:
- `StepOutcome` に `toolResult` と `followUpAttempts` が追加されている
- 既存フィールドが保持されている
- `bun run typecheck` が green

## T-07: ClaudeCodeRunner の `report_result` tool 登録と follow-up retry

- [ ] `src/adapter/claude-code/agent-runner.ts` の `run` method に以下を追加する:
  - `ctx.policy?.reportTool` が存在する場合、`createSdkMcpServer` で `report_result` tool を登録する
  - `zodSchema` を `inputSchema` にそのまま渡す（`SdkMcpToolDefinition.inputSchema: AnyZodRawShape` を直接満たす）
  - `mcpServers: { specrunner_report: <sdkMcpServer> }` を `queryOptions` に追加する
  - handler 内で `reportTool.parseInput(args)` を呼び、`ok: true` の value を closure 経由で外に渡す
- [ ] main work ターン完了時の tool 検出ロジックを実装する:
  - `message.type === "result"` 到達時、tool が呼ばれていなければ `toolReportRetry.buildPrompt(...)` で follow-up を生成
  - `query({ resume: sessionId, prompt })` で再起動する
  - `maxAttempts` 超過時は `toolResult: null` + `followUpAttempts: maxAttempts` で返す
  - tool が `ok: false` で呼ばれた場合は `toolResult: { ok: false, reason }` を返す（`completionReason: "success"` は維持）
- [ ] tool 検出は main work ターンのみ。`postWorkPrompts` ターン中の `report_result` 呼び出しは無視する
- [ ] `AgentRunResult` の返却値に `toolResult` と `followUpAttempts` を正しく設定する

**Acceptance Criteria**:
- `createSdkMcpServer` で `report_result` tool が登録されている
- `zodSchema` が `inputSchema` にそのまま渡されている
- tool 未呼びで result message 着いたら follow-up retry が実行される
- `maxAttempts` 超過で `toolResult: null` が返される
- `postWorkPrompts` ターン中の tool 呼び出しは無視される
- `bun run typecheck` が green

## T-08: ManagedAgentRunner の runtime ハンドリング

- [ ] `src/adapter/managed-agent/agent-runner.ts` の `runPollingStyle` に以下を追加する:
  - poll 結果が `requires_action` + `report_result` tool 呼び出しの場合をハンドリングする:
    - `events.list()` で `agent.custom_tool_use` の `input` を取得 → `parseInput()`
    - 成功時: `events.send({ type: "user.custom_tool_result", custom_tool_use_id, content: "ok" })` で完了通知 → 次の idle (end_turn) で session 終了
    - 失敗時: `events.send({ type: "user.message", content: followUpPrompt })` で follow-up 送信、polling 再開
  - 現状の `requires_action` → `sessionRequiresActionError` の throw に `report_result` パスを branch する
  - `maxAttempts` 超過時は `toolResult: null` で返す
- [ ] `AgentRunResult` の返却値に `toolResult` と `followUpAttempts` を正しく設定する
- [ ] `runDesignStyle` にも同様の `report_result` 検出ロジックを追加する（SSE stream での tool 呼び出し検出）

**Acceptance Criteria**:
- `requires_action` 検出時に `report_result` tool 呼び出しをハンドリングする
- `user.custom_tool_result` で完了通知が送信される
- follow-up retry が Managed runtime でも動作する
- `runDesignStyle` (SSE path) でも `sessionRequiresActionError` を catch して `report_result` パスへ branch し、polling path と同一の処理ロジックに合流することが確認されている
- `bun run typecheck` が green

## T-09: Codex adapter の frozen behavior 対応

- [ ] `src/adapter/codex/agent-runner.ts`: `AgentRunResult` の返却値に `toolResult: null, followUpAttempts: 0` を設定する
- [ ] `ctx.policy?.reportTool` は無視する（コメントで frozen behavior である旨を記載）
- [ ] `src/adapter/dispatching/agent-runner.ts`: 内部 adapter の結果をそのまま透過する（変更不要のはずだが型整合を確認）

**Acceptance Criteria**:
- Codex adapter が `toolResult: null` の frozen behavior を返す
- DispatchingAgentRunner が新形式の `AgentRunResult` を透過する
- `bun run typecheck` が green

## T-10: 全 10 step に `reportTool` を追加

- [ ] 各 step ファイルに `ReportToolSpec<BaseReportResult>` の static const `REPORT_TOOL` を定義する:
  - `name: "report_result"`
  - `description: "Report the completion of this step."`
  - `zodSchema: { ok: boolean(), reason: optional(string()) }` — `zod/v4-mini` から import
  - `parseInput: parseBaseReportInput` — T-01 の shared ヘルパーを使用
- [ ] `AgentStep` interface に `reportTool?: ReportToolSpec` を追加する（`src/core/step/types.ts`）
- [ ] 以下の 10 ファイルで `reportTool: REPORT_TOOL` を設定する:
  - `src/core/step/design.ts`
  - `src/core/step/spec-review.ts`
  - `src/core/step/spec-fixer.ts`
  - `src/core/step/test-case-gen.ts`
  - `src/core/step/implementer.ts`
  - `src/core/step/build-fixer.ts`
  - `src/core/step/code-review.ts`
  - `src/core/step/code-fixer.ts`
  - `src/core/step/adr-gen.ts`
  - `src/core/step/delta-spec-fixer.ts`

**Acceptance Criteria**:
- 全 10 step で `reportTool` が定義されている
- `zodSchema` が `zod/v4-mini` で書かれている
- `parseInput` が shared ヘルパーを使用している
- `bun run typecheck` が green

## T-11: `AgentDefinition.tools` への CustomToolSpec 追加（Managed setup-time 対応）

- [ ] 各 step ファイルの `AgentDefinition.tools` 配列に `report_result` の `CustomToolSpec` を追加する:
  ```ts
  { type: "custom", name: "report_result", description: "...", input_schema: { type: "object", properties: { ok: { type: "boolean" }, reason: { type: "string" } }, required: ["ok"] } }
  ```
- [ ] `AnthropicClientAdapter.createAgent` / `updateAgent` が `AgentDefinition.tools` の CustomToolSpec を Anthropic API の `BetaManagedAgentsCustomToolParams` 形式にマッピングする経路が存在することを確認する（既存の custom tool マッピングロジックがあれば再利用、なければ追加）

**Acceptance Criteria**:
- 全 10 step の `AgentDefinition.tools` に `report_result` CustomToolSpec が含まれている
- Managed runtime で agent 起動時に tool が登録される経路が存在する
- `bun run typecheck` が green

## T-12: 全 step の system prompt に `report_result` 指示を追加

- [ ] 以下の各 prompt ファイルの末尾に「タスク完了時に `report_result` tool を呼ぶこと」の指示を追加する:
  - `src/prompts/design-system.ts`
  - `src/prompts/spec-review-system.ts`
  - `src/prompts/spec-fixer-system.ts`
  - `src/prompts/test-case-gen-system.ts`
  - `src/prompts/implementer-system.ts`
  - `src/prompts/build-fixer-system.ts`
  - `src/prompts/code-review-system.ts`
  - `src/prompts/code-fixer-system.ts`
  - `src/prompts/adr-gen-system.ts`
  - delta-spec-fixer の prompt（定義場所を確認して追加）
- [ ] 指示内容: 「作業完了時は必ず `report_result` tool を呼び出してください。正常完了は `{ok: true}`、自発的失敗は `{ok: false, reason: "理由"}` で宣言してください。tool を呼ばずに turn を終了しないでください。」
- [ ] 既存の format 制約（verdict 行、Findings table 等）は削除しない（第 3 段で対応）

**Acceptance Criteria**:
- 全 10 step の system prompt に `report_result` tool 呼び出し指示が含まれている
- 既存の format 制約が維持されている

## T-13: StepExecutor の halt 処理

- [ ] `src/core/step/executor.ts` の `runAgentStep` で halt 処理を追加する:
  - halt 判定条件: `if (ctx.policy?.reportTool && runResult.toolResult === null)` — `reportTool` が設定されている step のみ halt 対象とする（Codex adapter など `reportTool` を持たない context では halt しない）
  - `stepHaltedNoToolCallError` を throw する（新規エラー型を `src/errors.ts` に追加）
  - pipeline の既存 catch ロジック (`pipeline.ts:91-94`) で `awaiting-resume` に遷移する
- [ ] `finalizeStep` に `toolResult` / `followUpAttempts` を伝搬し、`pushStepResult` で StepOutcome に記録する
- [ ] `src/core/port/agent-runner.ts` の `AgentRunContext` 構築時に `policy.reportTool` と `policy.toolReportRetry` を step から取得して設定する（`step.reportTool` → `policy.reportTool`、`DEFAULT_TOOL_RETRY` → `policy.toolReportRetry`）

**Acceptance Criteria**:
- `toolResult: null` 時に `stepHaltedNoToolCallError` が throw される
- halt 時に job status が `awaiting-resume` に遷移する
- `StepOutcome` に `toolResult` / `followUpAttempts` が記録される
- `bun run typecheck` が green

## T-14: pipeline-logger 拡張

- [ ] `src/logger/pipeline-logger.ts` の `step:complete` / `verdict:parsed` イベントのログ出力に `toolResult` と `followUpAttempts` を追加する
- [ ] `outcome.toolResult` が null の場合は `toolResult: null` を、値がある場合は `toolResult: { ok, reason }` を出力する

**Acceptance Criteria**:
- `pipeline-logger.ts` が `toolResult` と `followUpAttempts` をログ出力する
- `bun run typecheck` が green

## T-15: テストの作成

- [ ] Local runtime の代表テスト: `report_result` tool 経由での step 完了を検証する
  - ClaudeCodeRunner の `_queryFn` mock で tool 呼び出しをシミュレート
  - `AgentRunResult.toolResult` が `{ ok: true }` であることを検証
- [ ] Managed runtime の代表テスト: `requires_action` 経由の `report_result` 取得を検証する
  - `sessionClient` mock で `requires_action` stop reason をシミュレート
  - `events.list()` / `events.send()` の呼び出しを検証
- [ ] tool 未呼び出し時の follow-up retry テスト:
  - 2 回 retry → 3 回目で halt を検証
  - `toolResult: null`, `followUpAttempts: 2` を検証
  - halt 時に job status が `awaiting-resume` に遷移することを検証
- [ ] `postWorkPrompts` ターン中の tool 無視テスト:
  - main work ターンで tool 呼び出し → postWorkPrompts ターンで tool 呼び出し → main work の結果のみが使用されることを検証
- [ ] `commit-push.ts` の新挙動テスト:
  - `requiresCommit` 参照が削除された状態で既存テストが green
  - 変更なし時に silently skip することを検証

**Acceptance Criteria**:
- Local runtime で 1 step の `report_result` tool 経由完了が検証されている
- Managed runtime で 1 step の `requires_action` 経由取得が検証されている
- follow-up retry（2 回 → halt）が検証されている
- halt 時に `awaiting-resume` 遷移が検証されている
- `postWorkPrompts` ターン中の tool 呼び出し無視が検証されている
- `bun run typecheck && bun run test && bun run lint` が green

## T-16: delta spec の作成

- [ ] 以下の baseline spec に対する delta spec を作成する:
  - `specrunner/specs/agent-runner-port/spec.md` — `AgentRunContext` の subfield 化、`AgentRunResult` の `toolResult` / `followUpAttempts` 追加、`requiresCommit` guard 関連 Requirement の変更
  - `specrunner/specs/step-execution-architecture/spec.md` — `AgentStep.reportTool` 追加、`requiresCommit` 削除、StepExecutor の halt 処理追加
  - `specrunner/specs/claude-code-runtime/spec.md` — `report_result` MCP tool 登録、follow-up retry
  - `specrunner/specs/managed-agent-runtime/spec.md` — `requires_action` ハンドリング
  - その他影響を受ける spec があれば追加する
- [ ] delta spec は `specrunner/changes/tool-driven-step-completion/specs/<capability>/spec.md` に配置する

**Acceptance Criteria**:
- 影響を受ける全 baseline spec に対して delta spec が作成されている
- delta spec が delta-spec-template.md のフォーマットに従っている
