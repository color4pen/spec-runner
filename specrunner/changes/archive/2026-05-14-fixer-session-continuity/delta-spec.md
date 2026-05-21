# Delta Spec: fixer-session-continuity

## Affected Capabilities

### MODIFIED: agent-runner-port

#### ADDED Requirement: AgentRunContext は fixer session 継続のための resumeSessionId を伝搬する

`AgentRunContext` は SHOULD optional フィールド `resumeSessionId?: string` を持つ。このフィールドが存在する場合、adapter は指定された session を継続して実行する。存在しない場合は従来通り新規 session を作成する。

`StepExecutor` は fixer ステップ（spec-fixer / code-fixer / build-fixer）の 2 回目以降の iteration で、前回の `StepRun.sessionId` を `resumeSessionId` に設定して `AgentRunner.run(ctx)` を呼ぶ。fixer 以外のステップでは `resumeSessionId` を設定しない。

#### Scenario: fixer ステップの 2 回目の iteration で resumeSessionId が設定される

- **GIVEN** state.steps["spec-fixer"] に sessionId "sess-001" を持つ StepRun が 1 件存在する
- **WHEN** StepExecutor が spec-fixer ステップの AgentRunContext を構築する
- **THEN** ctx.resumeSessionId === "sess-001" である

#### Scenario: fixer 以外のステップでは resumeSessionId が未設定

- **GIVEN** spec-review ステップを実行する
- **WHEN** StepExecutor が AgentRunContext を構築する
- **THEN** ctx.resumeSessionId === undefined である

#### Scenario: fixer ステップの初回 iteration では resumeSessionId が未設定

- **GIVEN** state.steps["spec-fixer"] が空または未定義
- **WHEN** StepExecutor が spec-fixer ステップの AgentRunContext を構築する
- **THEN** ctx.resumeSessionId === undefined である

### MODIFIED: claude-code-runtime

#### ADDED Requirement: ClaudeCodeRunner は resumeSessionId で session を継続する

`ClaudeCodeRunner.run()` は `ctx.resumeSessionId` が存在する場合、SDK `query()` の options に `resume: ctx.resumeSessionId` を追加して既存 session を継続する。

session 継続に失敗した場合（SDK エラー）、`resumeSessionId` を無視して新規 session で再実行する。エラーは warn ログに記録し、pipeline を停止しない。

#### Scenario: resumeSessionId あり → resume option で query を呼ぶ

- **GIVEN** ctx.resumeSessionId === "sess-abc"
- **WHEN** ClaudeCodeRunner.run(ctx) が query() を呼ぶ
- **THEN** options に resume: "sess-abc" が含まれる

#### Scenario: session 継続失敗時のフォールバック

- **GIVEN** ctx.resumeSessionId === "sess-expired"
- **AND** query({ resume: "sess-expired" }) がエラーを throw する
- **WHEN** ClaudeCodeRunner がエラーをキャッチする
- **THEN** warn ログを出力する
- **AND** resume なしで query() を再度呼ぶ
- **AND** 2 回目の query が成功すれば completionReason: "success" を返す

### MODIFIED: managed-agent-runtime

#### ADDED Requirement: ManagedAgentRunner は resumeSessionId で既存 session にメッセージを送る

`ManagedAgentRunner.runPollingStyle()` は `ctx.resumeSessionId` が存在する場合、`createSession()` をスキップし `sessionClient.sendUserMessage(ctx.resumeSessionId, message)` で既存 session にメッセージを送信する。

session 継続に失敗した場合（session not found / expired 等）、`createSession()` + `sendUserMessage()` の通常パスにフォールバックする。エラーは warn ログに記録し、pipeline を停止しない。

#### Scenario: resumeSessionId あり → createSession をスキップ

- **GIVEN** ctx.resumeSessionId === "sess-managed-001"
- **WHEN** ManagedAgentRunner.runPollingStyle() を実行する
- **THEN** sessionClient.createSession() は呼ばれない
- **AND** sessionClient.sendUserMessage("sess-managed-001", message) が呼ばれる
- **AND** sessionClient.pollUntilComplete("sess-managed-001") で完了を待つ

#### Scenario: session 継続失敗時のフォールバック

- **GIVEN** ctx.resumeSessionId === "sess-expired"
- **AND** sendUserMessage("sess-expired", ...) がエラーを throw する
- **WHEN** ManagedAgentRunner がエラーをキャッチする
- **THEN** warn ログを出力する
- **AND** createSession() で新規 session を作成する
- **AND** 新規 sessionId で sendUserMessage + pollUntilComplete を実行する

### MODIFIED: step-execution-architecture

#### ADDED Requirement: fixer ステップの buildMessage は session 継続時に短縮 prompt を返す

spec-fixer / code-fixer / build-fixer の `buildMessage(state, deps)` は、`state.steps[stepName]` に前回の run が存在し sessionId が非 null の場合（session 継続）、新しい reviewer findings のパスのみを伝える短縮 prompt を返す。

初回 iteration（前回 run なし）では現行の full prompt をそのまま返す。

Step interface の署名 `buildMessage(state: JobState, deps: StepDeps): string` は変更しない。

#### Scenario: spec-fixer の 2 回目 iteration で短縮 prompt が返る

- **GIVEN** state.steps["spec-fixer"] に sessionId 付きの StepRun が 1 件存在する
- **AND** state.steps["spec-review"] の最新 findingsPath が "specrunner/changes/my-slug/spec-review-result-002.md"
- **WHEN** SpecFixerStep.buildMessage(state, deps) を呼ぶ
- **THEN** 戻り値に "spec-review-result-002.md" が含まれる
- **AND** 戻り値に change folder パスの全説明や request.md の全文が含まれない

#### Scenario: spec-fixer の初回 iteration で full prompt が返る

- **GIVEN** state.steps["spec-fixer"] が未定義または空
- **WHEN** SpecFixerStep.buildMessage(state, deps) を呼ぶ
- **THEN** 戻り値は現行と同一の full prompt（change folder パス、branch 名、findings パス、修正手順を含む）

#### ADDED Requirement: fixer-helpers は共通の判定・生成ロジックを提供する

`src/core/step/fixer-helpers.ts` は以下を export する:

- `FIXER_STEP_NAMES: ReadonlySet<string>` — fixer ステップ名の集合（spec-fixer, build-fixer, code-fixer）
- `getPreviousSessionId(state, stepName): string | null` — 前回 session ID 取得
- `isFixerContinuation(state, stepName): boolean` — session 継続判定
- `buildContinuationMessage(opts): string` — 継続時の短縮 prompt 生成

#### Scenario: FIXER_STEP_NAMES は 3 fixer を含む

- **WHEN** FIXER_STEP_NAMES を inspect する
- **THEN** "spec-fixer", "build-fixer", "code-fixer" の 3 つを含む
- **AND** それ以外のステップ名を含まない
