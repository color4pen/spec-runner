# Test Cases: add-local-runtime-agentrunner-port

## Summary

- **Total**: 64 cases
- **Automated** (unit/integration/e2e): 61
- **Manual**: 3
- **Priority**: must: 42, should: 16, could: 6

## Test Cases

---

### TC-001: AgentRunner interface が単一メソッド run を持つ

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: AgentRunner interface が単一メソッドである

**GIVEN** `src/core/port/agent-runner.ts` の `AgentRunner` interface
**WHEN** interface のメソッド一覧を inspect する
**THEN** method は `run(context: AgentRunContext): Promise<AgentRunResult>` の 1 つのみである
**AND** `createSession` / `sendMessage` / `pollUntilComplete` / `getResult` のような lifecycle phase 別 method は存在しない

---

### TC-002: AgentRunContext のフィールドが runtime 非依存である

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: AgentRunContext が runtime 非依存である

**GIVEN** `src/core/port/agent-runner.ts` の `AgentRunContext` 型定義
**WHEN** 全フィールドを inspect する
**THEN** `step`, `state`, `branch`, `slug`, `cwd`, `requestContent`, `config`, `emit` の 8 フィールドのみで構成される
**AND** `sessionClient` / `claudeCodeQuery` のような runtime 固有 SDK 型は含まれない

---

### TC-003: completionReason が "success" のとき resultContent が取得済みである

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: AgentRunResult が resultContent を含む

**GIVEN** `step.resultFilePath(state)` が non-null path を返す
**WHEN** `runner.run(ctx)` が `completionReason: "success"` で resolve する
**THEN** `result.resultContent` が adapter 固有の手段で取得済みの string である
**AND** `StepExecutor` は `result.resultContent` をそのまま `step.parseResult` に渡せる

---

### TC-004: completionReason が "error" のとき StepExecutor が step:error を emit する

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: StepExecutor が completionReason !== "success" で step:error を emit する

**GIVEN** `runner.run(ctx)` が `{ completionReason: "error", error: <err> }` で resolve するモック
**WHEN** `StepExecutor.execute(step, state)` が処理する
**THEN** `step:error` event が emit される
**AND** `failJobState` および `appendHistory` の既存 semantics が保たれる

---

### TC-005: completionReason が "timeout" のとき StepExecutor が step:error を emit する

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Requirement: StepExecutor は AgentRunner port のみに依存する（timeout 分岐）

**GIVEN** `runner.run(ctx)` が `{ completionReason: "timeout" }` で resolve するモック
**WHEN** `StepExecutor.execute(step, state)` が処理する
**THEN** `step:error` event が emit される
**AND** `failJobState` および `appendHistory` の既存 semantics が保たれる

---

### TC-006: resultFilePath が null の step では resultContent も null

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: resultFilePath が null の step では resultContent も null

**GIVEN** `step.resultFilePath(state) === null`（spec-fixer / implementer / build-fixer / code-fixer に相当するモック step）
**WHEN** `runner.run(ctx)` が resolve する
**THEN** `result.resultContent === null` である
**AND** `StepExecutor` は `NULL_PARSE_RESULT` を生成する既存経路に従う

---

### TC-007: StepExecutor が SessionClient / SDK を直接 import しない

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: StepExecutor が SessionClient を直接 import しない

**GIVEN** `src/core/step/executor.ts` ソースファイル
**WHEN** `grep -rE "from ['\"](\\.\\./)*adapter/" src/core/step/executor.ts` を実行する
**THEN** マッチ行は 0 である
**AND** `grep -rE "@anthropic-ai/(sdk|claude-code)" src/core/step/executor.ts` も 0 マッチである

---

### TC-008: StepExecutor が AgentRunner.run を 1 回だけ呼ぶ

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: StepExecutor が AgentRunner.run を 1 回呼ぶ

**GIVEN** spy を注入した AgentRunner モックと任意の AgentStep
**WHEN** `executor.execute(step, state)` を呼ぶ
**THEN** `runner.run(ctx)` がちょうど 1 回 await される
**AND** ctx には `step`, `state`, `branch`, `slug`, `cwd`, `requestContent`, `config`, `emit` が設定されている

---

### TC-009: AgentStep の lifecycle events が正しい順序で発火する

**Category**: unit
**Priority**: must
**Source**: specs/step-execution-architecture/spec.md — Scenario: AgentStep lifecycle events fire in order

**GIVEN** 成功を返す AgentRunner モックと正常な AgentStep
**WHEN** `StepExecutor.execute(step, state)` が完了する
**THEN** イベントが `step:start` → `verdict:parsed` → `step:complete` の順で emit される
**AND** `step:error` は emit されない

---

### TC-010: CliStep では AgentRunner.run が呼ばれない

**Category**: unit
**Priority**: must
**Source**: specs/step-execution-architecture/spec.md — Scenario: CliStep lifecycle events fire in order

**GIVEN** `kind === "cli"` の CliStep モック
**WHEN** `StepExecutor.execute(step, state)` が完了する
**THEN** `runner.run` は 1 回も呼ばれない
**AND** イベントが `step:start` → `verdict:parsed` → `step:complete` の順で emit される

---

### TC-011: StepExecutor が step.kind のみで dispatch し step 名で分岐しない

**Category**: unit
**Priority**: must
**Source**: specs/step-execution-architecture/spec.md — Scenario: StepExecutor dispatch is on kind only

**GIVEN** `src/core/step/executor.ts` ソースファイル
**WHEN** `grep -E "step\\.name\\s*===|\"spec-review\"|\"verification\"|\"build-fixer\"" src/core/step/executor.ts` を実行する
**THEN** マッチ行は 0 である

---

### TC-012: CliStep の verdict null が escalation に正規化される

**Category**: unit
**Priority**: must
**Source**: specs/step-execution-architecture/spec.md — Scenario: CLI step verdict null is normalized to escalation

**GIVEN** `parseResult` が `{ verdict: null, findingsPath: <path> }` を返す CliStep モック
**WHEN** `StepExecutor.execute(step, state)` が処理する
**THEN** 永続化された `StepRun` の verdict は `"escalation"` である（`null` ではない）
**AND** pipeline が `verification --escalation→ escalate` 遷移を辿る

---

### TC-013: ManagedAgentRunner が AgentRunner interface に準拠する

**Category**: unit
**Priority**: must
**Source**: specs/managed-agent-runtime/spec.md — Scenario: ManagedAgentRunner が AgentRunner interface を実装する

**GIVEN** `src/adapter/managed-agent/agent-runner.ts`
**WHEN** TypeScript compiler が型チェックを実行する
**THEN** `ManagedAgentRunner` は `run(context: AgentRunContext): Promise<AgentRunResult>` を実装する
**AND** 型エラーは 0 件である

---

### TC-014: ManagedAgentRunner のコンストラクタが正しい依存を受け取る

**Category**: unit
**Priority**: must
**Source**: specs/managed-agent-runtime/spec.md — Scenario: ManagedAgentRunner が SessionClient を内部利用する

**GIVEN** `ManagedAgentRunner` クラス定義
**WHEN** constructor 引数を inspect する
**THEN** `sessionClient: SessionClient`, `githubClient: GitHubClient`, `configStore: ConfigStore` を受け取る
**AND** `SessionClient` interface 自体に変更がない

---

### TC-015: ManagedAgentRunner が既存 lifecycle と意味的に等価である

**Category**: integration
**Priority**: must
**Source**: specs/managed-agent-runtime/spec.md — Scenario: ManagedAgentRunner.run が既存 lifecycle と等価である

**GIVEN** `runtime: "managed"` config と SessionClient / GitHubClient のモック
**WHEN** `ManagedAgentRunner.run(ctx)` を全 step 種別（propose / spec-review / implementer / build-fixer / code-review / code-fixer / spec-fixer）で呼ぶ
**THEN** session 作成 / SSE 購読 / polling / register_branch dispatch / verifyBranch / getFileContent が呼ばれる
**AND** 各ステップが成功した場合の `AgentRunResult.completionReason === "success"` が返る

---

### TC-016: register_branch ファイルが managed-agent adapter 配下にある

**Category**: unit
**Priority**: must
**Source**: specs/managed-agent-runtime/spec.md — Scenario: register_branch ファイルの所在

**GIVEN** 変更適用後のリポジトリ
**WHEN** `find src/ -name "register-branch.ts"` を実行する
**THEN** `src/adapter/managed-agent/tools/register-branch.ts` に存在する
**AND** `src/core/tools/` および `src/core/step/` 配下に register_branch を import する行は存在しない

---

### TC-017: core が register_branch を参照しない

**Category**: unit
**Priority**: must
**Source**: specs/managed-agent-runtime/spec.md — Scenario: core が register_branch を知らない

**GIVEN** 変更適用後のリポジトリ
**WHEN** `grep -r "register_branch" src/core/` を実行する
**THEN** マッチ行は 0 である

---

### TC-018: ManagedAgentRunner が ProposeStep 実行時に register_branch を adapter 内部で注入する

**Category**: unit
**Priority**: must
**Source**: specs/managed-agent-runtime/spec.md — Scenario: ManagedAgentRunner が tool を adapter 内で注入する

**GIVEN** `step.agent.role === "propose"` の ProposeStep モックと SessionClient モック
**WHEN** session 作成時の custom_tools 配列を inspect する
**THEN** `register_branch` Custom Tool が custom_tools 配列に含まれる
**AND** その注入は `ManagedAgentRunner` 内部ロジックで行われる（ProposeStep の toolHandlers は参照されない）

---

### TC-019: register_branch の input_schema が変更前と同一である

**Category**: unit
**Priority**: must
**Source**: specs/step-execution-architecture/spec.md — Scenario: input_schema for register_branch is unchanged under managed runtime

**GIVEN** 変更前の register_branch input_schema（参照値）と変更後の `src/adapter/managed-agent/tools/register-branch.ts`
**WHEN** Custom Tool の definition を比較する
**THEN** `input_schema` の JSON が変更前と完全に一致する
**AND** tool name 文字列 `"register_branch"` が変更されていない

---

### TC-020: ManagedAgentRunner が CLI canonical branch を prompt に注入する

**Category**: unit
**Priority**: must
**Source**: specs/managed-agent-runtime/spec.md — Scenario: prompt に branch 指示が含まれる

**GIVEN** `ctx.branch === "feat/foo-bar"`
**WHEN** `ManagedAgentRunner` が agent に送る最終 prompt を inspect する
**THEN** prompt に `feat/foo-bar` という branch 名が含まれる
**AND** 「この branch を使え」という指示文が `additionalInstructions` として含まれる

---

### TC-021: agent が異なる branch を register_branch で報告した場合 warning を出して ctx.branch を保持

**Category**: unit
**Priority**: must
**Source**: specs/managed-agent-runtime/spec.md — Scenario: agent が異なる branch を register_branch で報告した

**GIVEN** `ctx.branch === "feat/foo-bar"` で agent が `register_branch({ branch: "feat/other" })` を呼ぶシミュレーション
**WHEN** `ManagedAgentRunner` が register_branch の結果を処理する
**THEN** stderr に branch mismatch を示す warning が出力される
**AND** `ctx.branch` は `"feat/foo-bar"` のまま保持される（"feat/other" で上書きされない）
**AND** verifyBranch は `"feat/foo-bar"` の存在を確認する

---

### TC-022: ClaudeCodeRunner が AgentRunner interface に準拠する

**Category**: unit
**Priority**: must
**Source**: specs/claude-code-runtime/spec.md — Scenario: ClaudeCodeRunner が AgentRunner interface を実装する

**GIVEN** `src/adapter/claude-code/agent-runner.ts`
**WHEN** TypeScript compiler が型チェックを実行する
**THEN** `ClaudeCodeRunner` は `run(context: AgentRunContext): Promise<AgentRunResult>` を実装する
**AND** 型エラーは 0 件である

---

### TC-023: ClaudeCodeRunner が query() に cwd を渡す

**Category**: unit
**Priority**: must
**Source**: specs/claude-code-runtime/spec.md — Scenario: query() に cwd が渡される

**GIVEN** `ctx.cwd === "/path/to/worktree"` と query() のモック
**WHEN** `ClaudeCodeRunner.run(ctx)` が `query()` を呼ぶ
**THEN** `query()` の引数の `cwd` プロパティが `"/path/to/worktree"` である

---

### TC-024: ClaudeCodeRunner が SessionClient / @anthropic-ai/sdk を import しない

**Category**: unit
**Priority**: must
**Source**: specs/claude-code-runtime/spec.md — Scenario: ClaudeCodeRunner が SessionClient を import しない

**GIVEN** `src/adapter/claude-code/` 配下のソースファイル
**WHEN** `grep -r "SessionClient" src/adapter/claude-code/` および `grep -r "@anthropic-ai/sdk" src/adapter/claude-code/` を実行する
**THEN** 両コマンドのマッチ行は 0 である

---

### TC-025: ClaudeCodeRunner が resultContent を fs.readFile で取得する

**Category**: unit
**Priority**: must
**Source**: specs/claude-code-runtime/spec.md — Scenario: resultContent は fs.readFile で取得される

**GIVEN** `ctx.step.resultFilePath(state)` が `"openspec/changes/<slug>/spec-review-result-001.md"` を返すモック step と fake fs
**WHEN** agent 完了後 `ClaudeCodeRunner` が結果を取得する
**THEN** `fs.readFile(path.join(ctx.cwd, "openspec/changes/<slug>/spec-review-result-001.md"))` が呼ばれる
**AND** GitHub API は 1 回も呼ばれない

---

### TC-026: ClaudeCodeRunner の additionalInstructions に branch checkout 指示が含まれる

**Category**: unit
**Priority**: must
**Source**: specs/claude-code-runtime/spec.md — Scenario: additionalInstructions に branch 指示が含まれる

**GIVEN** `ctx.branch === "feat/foo-bar"`, `ctx.slug === "foo-bar"`
**WHEN** `ClaudeCodeRunner` が `query()` に渡す additionalInstructions を inspect する
**THEN** instructions に `git checkout -b feat/foo-bar` 相当の指示が含まれる
**AND** `register_branch` Custom Tool への参照は含まれない

---

### TC-027: ClaudeCodeRunner が register_branch を import しない

**Category**: unit
**Priority**: must
**Source**: specs/claude-code-runtime/spec.md — Scenario: ClaudeCodeRunner は register_branch を import しない

**GIVEN** `src/adapter/claude-code/` 配下のソースファイル
**WHEN** `grep -r "register_branch" src/adapter/claude-code/` を実行する
**THEN** マッチ行は 0 である

---

### TC-028: ClaudeCodeRunner の requiresCommit guard — branch が advance していない場合 error

**Category**: unit
**Priority**: must
**Source**: specs/claude-code-runtime/spec.md — Scenario: branch が advance していない場合 error

**GIVEN** ProposeStep を実行後、fake git で `git rev-parse feat/foo-bar` が main と同一 SHA を返す
**WHEN** `ClaudeCodeRunner` が完了検証を行う
**THEN** `result.completionReason === "error"` である
**AND** `result.error.message` に「branch HEAD did not advance」相当の文言が含まれる

---

### TC-029: ClaudeCodeRunner の requiresCommit guard — 期待 branch が存在しない場合 error

**Category**: unit
**Priority**: must
**Source**: specs/claude-code-runtime/spec.md — Scenario: 期待 branch が存在しない場合 error（ClaudeCodeRunner）

**GIVEN** ProposeStep を実行後、fake git で `git branch --list feat/foo-bar` が空を返す
**WHEN** `ClaudeCodeRunner` が完了検証を行う
**THEN** `result.completionReason === "error"` である
**AND** GitHub API は呼ばれない（fs / git のみで検証する）

---

### TC-030: ManagedAgentRunner の verifyBranch — 期待 branch が存在しない場合 error

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: 期待 branch が存在しない場合 error を返す

**GIVEN** `ctx.branch` に対応する branch が GitHubClient.verifyBranch で見つからない（404）
**WHEN** `ManagedAgentRunner` が結果を組み立てる
**THEN** `result.completionReason === "error"` である
**AND** `result.error.message` に「branch not found」相当の診断情報が含まれる

---

### TC-031: managed adapter — result file が取得できない場合 error

**Category**: unit
**Priority**: must
**Source**: specs/agent-runner-port/spec.md — Scenario: 期待 result file が存在しない場合 error を返す

**GIVEN** agent 完了後、`step.resultFilePath(state)` が non-null で GitHubClient.getFileContent が 404 を返す
**WHEN** `ManagedAgentRunner` が結果を組み立てる
**THEN** `result.completionReason === "error"` である
**AND** `result.error.message` に「result file not found」相当の診断情報が含まれる

---

### TC-032: ConfigStore.load() が runtime 未設定の既存 config を "managed" に正規化する

**Category**: unit
**Priority**: must
**Source**: specs/cli-config-store/spec.md — Scenario: runtime field 未設定の既存 config

**GIVEN** `runtime` field を持たない既存形式の config JSON
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** in-memory `config.runtime` は `"managed"` に正規化される
**AND** `ConfigStore.save()` 後の永続 JSON にも `runtime: "managed"` が書き込まれる

---

### TC-033: ConfigStore.load() が "local" runtime を正常に load する

**Category**: unit
**Priority**: must
**Source**: specs/cli-config-store/spec.md — Scenario: local runtime の正常 load

**GIVEN** `{ "version": 1, "runtime": "local" }` のみを持つ config ファイル（apiKey も agents も無い）
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** `config.runtime === "local"` である
**AND** `CONFIG_INCOMPLETE` エラーは発生しない
**AND** `config.agents` は空オブジェクトのまま

---

### TC-034: ConfigStore.load() が不正な runtime 値を拒絶する

**Category**: unit
**Priority**: must
**Source**: specs/cli-config-store/spec.md — Scenario: 不正な runtime 値

**GIVEN** `{ "version": 1, "runtime": "remote" }` を持つ config ファイル
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** `CONFIG_INVALID` エラーが発生する
**AND** エラーメッセージに `runtime must be "managed" or "local"` が含まれる

---

### TC-035: managed runtime 起動時に SessionClient と GitHubClient の両方が生成される

**Category**: integration
**Priority**: must
**Source**: specs/runtime-selection/spec.md — Scenario: managed 起動時は両 client が生成される

**GIVEN** `config.runtime === "managed"` の config と有効な apiKey
**WHEN** CLI の composition root が wiring する
**THEN** `SessionClient` と `GitHubClient` の両方が生成される
**AND** `runner` には `ManagedAgentRunner` の instance が渡される
**AND** `ClaudeCodeRunner` のコンストラクタは呼ばれない

---

### TC-036: local runtime 起動時に SessionClient が生成されない

**Category**: integration
**Priority**: must
**Source**: specs/runtime-selection/spec.md — Scenario: local 起動時に SessionClient が生成されない

**GIVEN** `config.runtime === "local"` の config（apiKey 空）
**WHEN** CLI の composition root が wiring する
**THEN** `SessionClient` のコンストラクタは呼ばれない
**AND** `runner` には `ClaudeCodeRunner` の instance が渡される
**AND** apiKey が空でも startup error は発生しない

---

### TC-037: local runtime で getAgentId が呼ばれない

**Category**: integration
**Priority**: must
**Source**: specs/runtime-selection/spec.md — Scenario: local runtime で getAgentId が呼ばれない

**GIVEN** `config.runtime === "local"` で full pipeline を実行する（各 step をモック）
**WHEN** 全 step が処理される
**THEN** `getAgentId(config, ...)` の呼び出しは 0 回である
**AND** `config.agents` が空でもエラーは発生しない

---

### TC-038: AgentSyncer が local runtime の init 中に呼ばれない

**Category**: integration
**Priority**: must
**Source**: specs/agent-syncer/spec.md — Scenario: local runtime で init 中に syncAll が呼ばれない

**GIVEN** `AgentSyncer.syncAll` をスパイした状態で `specrunner init --runtime local` を実行する
**WHEN** init が処理される
**THEN** `AgentSyncer.syncAll()` の呼び出しは 0 回である
**AND** Anthropic API への HTTP リクエストは 0 件である

---

### TC-039: core 層が SDK を直接 import しない

**Category**: unit
**Priority**: must
**Source**: specs/module-boundary/spec.md — Scenario: grep finds no SDK imports in core

**GIVEN** `src/core/` 配下のすべてのソースファイル
**WHEN** `grep -rE "from ['\"]@anthropic-ai/(sdk|claude-code)" src/core/` を実行する
**THEN** マッチ行は 0 である

---

### TC-040: managed-agent adapter と claude-code adapter が相互 import しない

**Category**: unit
**Priority**: must
**Source**: specs/module-boundary/spec.md — Scenario: managed-agent and claude-code are independent

**GIVEN** `src/adapter/managed-agent/` および `src/adapter/claude-code/` のソースファイル
**WHEN** `grep -rE "from ['\"](\\.\\./)+adapter/claude-code" src/adapter/managed-agent/` および逆方向の grep を実行する
**THEN** 両コマンドのマッチ行は 0 である

---

### TC-041: --runtime local で apiKey 不在を許容する

**Category**: integration
**Priority**: must
**Source**: specs/runtime-selection/spec.md — Scenario: --runtime local で apiKey 不在を許容する

**GIVEN** `config.anthropic.apiKey` が未設定の状態
**WHEN** `specrunner init --runtime local` を実行する
**THEN** init は success で終わる
**AND** stderr / stdout に `apiKey required` のエラーが出ない
**AND** `config.anthropic.apiKey` は空のまま保持される

---

### TC-042: specrunner init --runtime local が API 呼び出しゼロで完了する

**Category**: e2e
**Priority**: must
**Source**: specs/runtime-selection/spec.md — Scenario: --runtime local で AgentSyncer が呼ばれない

**GIVEN** 未設定の config ディレクトリ
**WHEN** `specrunner init --runtime local` を実行する（ネットワーク通信をインターセプト）
**THEN** Anthropic API への HTTP リクエストは 1 件も発生しない
**AND** config ファイルに `runtime: "local"` が書き込まれる
**AND** `config.agents` は空オブジェクトのまま

---

### TC-043: prompts/ に runtime 固有指示が含まれない

**Category**: unit
**Priority**: should
**Source**: specs/claude-code-runtime/spec.md — Scenario: prompts/ に runtime 固有指示が含まれない

**GIVEN** `src/prompts/` 配下のすべての prompt ファイル
**WHEN** `grep -rE "register_branch|claude-code|@anthropic-ai/claude-code" src/prompts/` を実行する
**THEN** マッチ行は 0 である

---

### TC-044: 同じ Step の buildMessage が両 runtime で同じ runtime-neutral 部分を返す

**Category**: unit
**Priority**: should
**Source**: specs/claude-code-runtime/spec.md — Scenario: 同じ Step の buildMessage が両 runtime で同じ文字列を返す

**GIVEN** ProposeStep の `buildMessage(state, deps)` を managed / local 両モードの同等 state で呼ぶ
**WHEN** 両者の出力を比較する
**THEN** runtime-neutral な prompt 部分は完全に一致する
**AND** runtime ごとに異なる部分は adapter が append する additionalInstructions のみである

---

### TC-045: StepExecutor が verifyBranch / verifyPath helper を持たない

**Category**: unit
**Priority**: should
**Source**: specs/agent-runner-port/spec.md — Scenario: StepExecutor が verifyBranch / verifyPath helper を保持しない

**GIVEN** `src/core/step/executor.ts` ソースファイル
**WHEN** `grep -E "verifyBranch|verifyPath|getFileContent" src/core/step/executor.ts` を実行する
**THEN** マッチ行は 0 である

---

### TC-046: StepExecutor が config.runtime を読まない

**Category**: unit
**Priority**: should
**Source**: specs/runtime-selection/spec.md — Scenario: StepExecutor が runtime 値を読まない

**GIVEN** `src/core/step/executor.ts` ソースファイル
**WHEN** `grep -E "config\\.runtime|runtime\\s*===" src/core/step/executor.ts` を実行する
**THEN** マッチ行は 0 である

---

### TC-047: managed runtime で --runtime managed は既存 init 挙動を維持する

**Category**: integration
**Priority**: should
**Source**: specs/runtime-selection/spec.md — Scenario: --runtime managed は既存挙動

**GIVEN** `specrunner init --runtime managed`（または `--runtime` 未指定）の実行
**WHEN** init が完了する
**THEN** apiKey 入力 prompt が表示される
**AND** `AgentSyncer.syncAll()` が 1 回呼ばれる
**AND** config に `runtime: "managed"` が書き込まれる

---

### TC-048: managed runtime で apiKey 必須チェックが継続する

**Category**: unit
**Priority**: should
**Source**: specs/cli-config-store/spec.md — Scenario: managed runtime では apiKey 必須が継続する

**GIVEN** `config.runtime === "managed"` で `config.anthropic.apiKey` が空
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** `CONFIG_INCOMPLETE` エラーが発生する
**AND** エラーに `Run 'specrunner init' first.` が含まれる

---

### TC-049: managed runtime で AgentSyncer が既存挙動を維持する

**Category**: integration
**Priority**: should
**Source**: specs/agent-syncer/spec.md — Scenario: managed runtime では既存挙動を維持

**GIVEN** `specrunner init --runtime managed`（または `--runtime` 未指定）の実行
**WHEN** init が処理される
**THEN** `AgentSyncer.syncAll()` が 1 回呼ばれる
**AND** AgentSyncer のソース（`src/core/syncer/` 配下）の変更行は 0 である

---

### TC-050: managed runtime で getAgentId が呼ばれる

**Category**: integration
**Priority**: should
**Source**: specs/runtime-selection/spec.md — Scenario: managed runtime では従来通り getAgentId が呼ばれる

**GIVEN** `config.runtime === "managed"` で agent step を実行する（SessionClient モック）
**WHEN** `ManagedAgentRunner.run(ctx)` が走る
**THEN** adapter 内部で `ConfigStore.getAgentId(ctx.step.agent.role)` が呼ばれる
**AND** 解決失敗時は `CONFIG_INCOMPLETE` エラーが伝搬する

---

### TC-051: managed runtime で spec-review agent ID 欠落時に CONFIG_INCOMPLETE

**Category**: unit
**Priority**: should
**Source**: specs/cli-config-store/spec.md — Scenario: spec-review Agent ID 欠落（managed runtime のみ）

**GIVEN** `config.runtime === "managed"` で `config.agents["spec-review"]` が未設定
**WHEN** `specrunner run` を実行する
**THEN** `CONFIG_INCOMPLETE` エラーが発生する
**AND** エラーに `Run 'specrunner init' to create the spec-review agent.` が含まれる

---

### TC-052: local runtime で spec-review agent ID 欠落を許容する

**Category**: unit
**Priority**: should
**Source**: specs/cli-config-store/spec.md — Scenario: spec-review Agent ID 欠落（local runtime は許容）

**GIVEN** `config.runtime === "local"` で `config.agents["spec-review"]` が未設定
**WHEN** `specrunner run` を実行する
**THEN** `CONFIG_INCOMPLETE` エラーは発生しない
**AND** ClaudeCodeRunner 経由で spec-review step が処理される

---

### TC-053: local runtime で run 中に AgentSyncer が呼ばれない

**Category**: integration
**Priority**: should
**Source**: specs/agent-syncer/spec.md — Scenario: local runtime で run 中に syncAll が呼ばれない

**GIVEN** `config.runtime === "local"` で `specrunner run` を実行する（各 step をモック）
**WHEN** pipeline が起動する
**THEN** `AgentSyncer.syncAll()` の呼び出しは 0 回である

---

### TC-054: register_branch が local runtime では登録されない

**Category**: unit
**Priority**: should
**Source**: specs/step-execution-architecture/spec.md — Scenario: register_branch absent under local runtime

**GIVEN** `runtime: "local"` で ProposeStep を `ClaudeCodeRunner` で実行する
**WHEN** `query()` に渡す custom_tools を inspect する（または query 呼び出しをモック）
**THEN** `register_branch` Custom Tool は登録されない
**AND** additionalInstructions に `git checkout -b` 相当の指示が含まれる

---

### TC-055: local result file が存在しない場合に ClaudeCodeRunner が error を返す

**Category**: unit
**Priority**: should
**Source**: specs/agent-runner-port/spec.md — Scenario: 期待 result file が存在しない場合 error を返す（local 側）

**GIVEN** agent 完了後、`step.resultFilePath(state)` が non-null で fake fs で該当ファイルが存在しない（`fs.existsSync` false）
**WHEN** `ClaudeCodeRunner` が結果を組み立てる
**THEN** `result.completionReason === "error"` である
**AND** `result.error.message` に「result file not found」相当の診断情報が含まれる

---

### TC-056: `src/adapter/anthropic/` が存在しない

**Category**: unit
**Priority**: should
**Source**: specs/module-boundary/spec.md — Scenario: Required module directories exist

**GIVEN** 変更適用後のリポジトリ
**WHEN** `ls src/adapter/` を実行する
**THEN** `src/adapter/anthropic/` は存在しない
**AND** `src/adapter/managed-agent/` が存在する
**AND** `src/adapter/claude-code/` が存在する

---

### TC-057: local mode で propose → code-review の pipeline が完走する

**Category**: e2e
**Priority**: should
**Source**: design.md — Goals: local mode で propose → implementer → verification → code-review の pipeline が完走する

**GIVEN** `config.runtime === "local"` の dogfood 環境と有効な GitHub token
**WHEN** `specrunner run` で propose → implementer → verification → code-review → pr-create を実行する
**THEN** 全 step が error なく完走する
**AND** 最終的に PR が作成される

---

### TC-058: error path が step:error を emit して例外を伝搬する

**Category**: unit
**Priority**: should
**Source**: specs/step-execution-architecture/spec.md — Scenario: Error path emits step:error and decorates exception

**GIVEN** agent step の処理中に予期せぬ例外が発生するモック
**WHEN** `StepExecutor.execute(step, state)` が処理する
**THEN** `step:error` event が error payload とともに emit される
**AND** 例外が `err.state` フィールド付きで上位へ bubble up する
**AND** `failJobState` と `appendHistory` の既存 semantics が保たれる

---

### TC-059: ConfigStore migration が idempotent である

**Category**: unit
**Priority**: could
**Source**: specs/cli-config-store/spec.md — Requirement: 設定ファイルは runtime field を保持する（idempotent 記述）

**GIVEN** 既に `runtime: "managed"` を持つ config を 2 回 `ConfigStore.load()` する
**WHEN** 2 回目の load の結果を確認する
**THEN** `config.runtime` が `"managed"` のまま変わらない
**AND** save / load サイクルで余分なフィールドが追加されない

---

### TC-060: @anthropic-ai/sdk の import が managed-agent adapter 配下にのみ存在する

**Category**: unit
**Priority**: could
**Source**: specs/module-boundary/spec.md — Scenario: SDK imports concentrated in adapter directories

**GIVEN** 変更適用後のリポジトリ
**WHEN** ソースツリーで `@anthropic-ai/sdk` の import を全検索する（node_modules 除外）
**THEN** すべてのマッチが `src/adapter/managed-agent/` 配下に存在する
**AND** `src/core/`, `src/cli/`, `src/adapter/claude-code/` にマッチ行は 0 件である

---

### TC-061: @anthropic-ai/claude-code の import が claude-code adapter 配下にのみ存在する

**Category**: unit
**Priority**: could
**Source**: specs/module-boundary/spec.md — Scenario: Claude Code SDK imports concentrated in claude-code adapter

**GIVEN** 変更適用後のリポジトリ
**WHEN** ソースツリーで `@anthropic-ai/claude-code` の import を全検索する（node_modules 除外）
**THEN** すべてのマッチが `src/adapter/claude-code/` 配下に存在する
**AND** `src/core/`, `src/cli/`, `src/adapter/managed-agent/` にマッチ行は 0 件である

---

### TC-062: managed 完全 dogfood regression なし（managed mode で既存動作が変わらない）

**Category**: manual
**Priority**: could
**Source**: design.md — Goals: managed mode の動作は完全に regression-free

**GIVEN** 既存 dogfood スクリプトと `config.runtime === "managed"` の設定
**WHEN** Phase 1 適用後に既存 dogfood スクリプトを実行する
**THEN** 既存の propose → code-review → pr-create フローが動作する
**AND** 既存 dogfood 実行時と比べて挙動の差異が観察されない

---

### TC-063: specrunner init --runtime local の対話 UI 確認

**Category**: manual
**Priority**: could
**Source**: specs/runtime-selection/spec.md — Scenario: --runtime local で AgentSyncer が呼ばれない

**GIVEN** 未設定環境で `specrunner init --runtime local` を実行する
**WHEN** init の対話フローを操作する
**THEN** apiKey 入力 prompt が表示されない
**AND** AgentSyncer の実行 progress indicator が表示されない
**AND** config 書き込み完了のメッセージが適切に表示される

---

### TC-064: local mode pipeline の実際の git 操作確認

**Category**: manual
**Priority**: could
**Source**: design.md — Phase 4: local mode で propose → code-review の pipeline が完走する

**GIVEN** `config.runtime === "local"` の実環境で propose step を実行する
**WHEN** propose agent が Claude Code SDK 経由で動作する
**THEN** `feat/<slug>` ブランチが worktree 上に作成される
**AND** commit が実際にプッシュされる
**AND** register_branch Custom Tool の呼び出しが発生しない（ログ確認）
