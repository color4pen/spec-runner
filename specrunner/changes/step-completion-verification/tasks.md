# Tasks: step 完了時に宣言された契約を機械検証し、不足は follow-up で修復させる

## T-01: 出力契約の port DTO と error code を定義する

- [ ] `src/core/port/` に出力契約の DTO を追加する（新規ファイル例 `src/core/port/output-contract.ts`、または `runtime-strategy.ts` 内）。domain 非依存にする:
  - `type OutputContractKind = "produced" | "tasks-complete"`
  - `type OutputPolicy = "halt" | "follow-up"`
  - `interface OutputContract { kind; path: string; policy: OutputPolicy; scaffold?: string }`
  - `interface OutputViolation { kind; path: string; policy: OutputPolicy; detail: string[] }`
  - `interface OutputCheckResult { violations: OutputViolation[] }`
- [ ] `src/errors.ts` の `ERROR_CODES` に `STEP_OUTPUT_MISSING: "STEP_OUTPUT_MISSING"` を追加する（`EXIT_CODE_MAP` 追加は不要＝既定 GENERAL_ERROR(1)、`STEP_INPUT_MISSING` と同じ）。

**Acceptance Criteria**:
- DTO が型として参照可能で、adapter（`src/adapter/`）から `OutputViolation` 等を import しても adapter→domain back-edge を生まない（port 配置）。
- `STEP_OUTPUT_MISSING` が `ERROR_CODES` に存在し、`bun run typecheck` が通る。

## T-02: 検出ロジックの純関数モジュールを実装する

- [ ] 新規 domain モジュール（例 `src/core/step/output-verify.ts`）に純関数を実装する（I/O 禁止）:
  - `parseIncompleteTaskLabels(tasksMd: string): string[]` — `- [ ]`（未チェック）行のラベルを抽出。`- [x]` / `- [X]` は除外する。
  - `producedContractsFromWrites(writes: IoRef[], scaffolds: Record<string, string>): OutputContract[]` — `artifact !== "gitState"` かつ `verify !== false` の write を `kind:"produced"`, `policy:"halt"`, `scaffold: scaffolds[path]` で導出。
  - `buildOutputFollowUpPrompt(violations: OutputViolation[]): string` — 未完了タスク名 / 欠落 path を列挙した条件付き prompt（静的文ではない）。
  - `partitionByPolicy(result: OutputCheckResult): { followUp: OutputViolation[]; halt: OutputViolation[] }`。
- [ ] follow-up 予算の既定定数を定義する（例 `OUTPUT_FOLLOWUP_MAX_ATTEMPTS = 2`）。

**Acceptance Criteria**:
- `parseIncompleteTaskLabels` が `[ ]` を拾い `[x]`/`[X]` を拾わない（unit）。
- `buildOutputFollowUpPrompt(violations)` の本文に各 violation の `detail`（未完了タスク名）/ `path` が含まれ、violations が空なら呼び出されない設計になっている。
- すべて純関数（I/O / state mutation なし）で、`bun run typecheck` が通る。

## T-03: RuntimeStrategy に validateStepOutputs seam を実装する（local / managed）

- [ ] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` に `validateStepOutputs(contracts: OutputContract[], cwd: string, branch: string | null): Promise<OutputCheckResult>` を追加する（throw しない契約を doc comment に明記）。
- [ ] `src/core/runtime/local.ts` に実装する:
  - `produced`: `fs.readFile(join(cwd, path))`。欠落 / 内容 trim 0 長 / `contract.scaffold` と byte 一致 → violation（`detail: []`）。
  - `tasks-complete`: `fs.readFile` → `parseIncompleteTaskLabels` が非空なら violation（`detail` に未完了ラベル）。
  - 空契約は空 result を返す。
- [ ] `src/core/runtime/managed.ts` に実装する:
  - 検証前に `git fetch origin <branch>`（branch 非 null 時、stdout 非汚染、失敗は無視）。
  - `produced`: 存在は `git cat-file -e origin/<branch>:<path>`、内容は `githubClient.getRawFile(owner, repo, branch, path)`。null / 空 / （`scaffold` 提供時）一致 → violation。
  - `tasks-complete`: `getRawFile` → `parseIncompleteTaskLabels` 非空で violation。
  - `branch` が null のとき produced/tasks-complete は欠落として violation に積む。
- [ ] 両 runtime とも no-throw（violation を返すのみ）。

**Acceptance Criteria**:
- local: 実体付き file → violation なし、欠落 / 空 / scaffold 一致 → produced violation。`tasks.md` に `[ ]` 残 → tasks-complete violation（ラベル含む）。
- managed: branch git state 上に実体付き file → violation なし、欠落 → violation。両 runtime が同一宣言 path を対象にする。
- managed の検証経路が stdout を汚さない。`bun run typecheck` が通る。

## T-04: Step / policy 契約に出力検証フィールドを追加し implementer が宣言する

- [ ] `src/core/port/step-types.ts` の `IoRef` に optional `verify?: boolean`（writes 用、既定 true）を追加し doc comment を付す。
- [ ] `AgentStep` 契約に optional `outputContracts?(state: JobState, deps: StepDeps): OutputContract[]`（pure）を追加する。
- [ ] `src/core/port/agent-runner.ts` の `AgentRunPolicy` に optional `outputVerification?: OutputVerificationPolicy` を追加する（`{ detect: () => Promise<OutputCheckResult>; maxAttempts: number; buildPrompt: (violations: OutputViolation[], attempt: number) => string }`）。
- [ ] `src/core/step/implementer.ts` に `outputContracts` を実装し、`[{ kind: "tasks-complete", path: \`${changeFolderPath(slug)}/tasks.md\`, policy: "follow-up" }]` を返す。

**Acceptance Criteria**:
- `outputContracts` / `outputVerification` を実装しない既存 step / テストダブルがコンパイルエラーにならない（optional）。
- implementer の `outputContracts` が `tasks.md` を対象に `policy: "follow-up"` で返す。
- `bun run typecheck` が通る。

## T-05: agent-runner に同一セッション follow-up 修復ループを追加する

- [ ] `src/adapter/claude-code/agent-runner.ts`: `report_result` retry ループと `postWorkPrompts` turn の後に、`ctx.policy.outputVerification` がある場合のループを追加する。各 attempt で `detect()` → violation 空なら break → `buildPrompt` を `resume: extractedSessionId` で 1 turn 送る → `followUpAttempts++`。`maxAttempts` で打ち切る。session 未確立時は skip。
- [ ] `src/adapter/managed-agent/agent-runner.ts` の `runPollingStyle`（implementer 経路）: `postWorkPrompts` 後に同様のループを `executeFollowUpTurn(sessionId, step, prompt, timeoutMs)` ベースで追加する。`detect()` で再判定し violation 空で break。
- [ ] 修復ループの失敗（resume / poll 失敗）は best-effort（warning）に留め、work turn 結果を保持する。

**Acceptance Criteria**:
- `ctx.policy.outputVerification` が無い step は従来通り（追加 turn なし、挙動不変）。
- implementer で tasks-complete violation がある場合、同一 session に未完了タスクを列挙した prompt が送られ、`followUpAttempts` が加算される（mock で確認）。
- 修復ループ未実装の adapter でも step 自体は失敗しない（gate に縮退）。

## T-06: StepExecutor に出力検証の配線と halt gate を追加する

- [ ] `runAgentStep` で `runner.run()` 呼び出し前に、`ctx.policy.outputVerification` を構築する: follow-up-class 契約（`step.outputContracts?.()` の `policy: "follow-up"`）から `detect = () => runtimeStrategy.validateStepOutputs(followUpContracts, cwd, branch)` を束縛し、`maxAttempts` / `buildPrompt`（`buildOutputFollowUpPrompt`）を載せる。follow-up 契約 0 件 / `runtimeStrategy` 未注入時は未設定（後方互換）。
- [ ] `runner.run()` が success で返った後・`finalizeStepArtifacts` の**前**に gate を追加する:
  - 全契約を組む: `producedContractsFromWrites(step.writes?.(state, deps), scaffolds)`（`scaffolds` は `getOutputTemplates(step.name, slug, state)` から該当 path の内容を引く）＋ `step.outputContracts?.(state, deps)`。
  - `runtimeStrategy.validateStepOutputs(allContracts, cwd, branch)` を呼び `partitionByPolicy` で分割。
  - `halt` violation が 1 件以上、または `follow-up` violation が残る場合、`STEP_OUTPUT_MISSING` で停止する（`validateRequiredInputs` と同一: `recordFailedStepResult` + `store.fail` + `appendHistory` + `attachStateAndRethrow`、error は欠落 path / 未完了タスクを含む）。
- [ ] `runtimeStrategy` 未注入 / 契約 0 件 / violation 0 件は素通り。gate は agent step のみ（CLI / judge step には追加しない）。

**Acceptance Criteria**:
- produced 契約欠落（design が scaffold のまま完了）で `finalizeStepArtifacts`（commit）到達前に `STEP_OUTPUT_MISSING` で halt し、failed StepRun が記録され `step:error` が emit される。
- follow-up 予算枯渇後も `tasks.md` に `[ ]` が残る場合 halt する。
- 全契約充足時は gate を素通りし step 実行順序・commit が不変。`bun run typecheck` が通る。

## T-07: 全 12 step の produced 契約を正常経路と突き合わせ監査する

- [ ] 各 step の `writes()` file エントリ（`artifact !== "gitState"`）が、標準 pipeline の正常経路で**必ず実体を産出する**かを確認する。scaffold 配置 step（design / spec-review / test-case-gen / code-review / conformance）は agent が overwrite する前提を確認。
- [ ] 正常経路で欠落し得る条件付き file write には `verify: false` を付して produced 契約から除外し、理由を当該 step の doc comment に簡潔に記す。
- [ ] gitState write（implementer / build-fixer / code-fixer の source 等）は produced 契約に入らない（`artifact: "gitState"`）ことを確認する。

**Acceptance Criteria**:
- 標準 pipeline の各 agent step が、自 step の produced 契約をすべて充足する（gate が halt を起こさない）。
- `verify: false` を付けた write は正常経路で欠落し得る根拠が doc comment にある。
- 既存テストが produced gate により赤化しない。

## T-08: テスト（検出・修復・停止・回帰）

- [ ] unit: `parseIncompleteTaskLabels` / `buildOutputFollowUpPrompt` / `producedContractsFromWrites` / `partitionByPolicy` の純関数挙動。
- [ ] unit: `LocalRuntime.validateStepOutputs` — 実体付き → 空、欠落 / 空 / scaffold 一致 → produced violation、`tasks.md` `[ ]` 残 → tasks-complete violation（`tests/unit/runtime/` に `validate-step-inputs.test.ts` と対の形で追加）。
- [ ] unit: `ManagedRuntime.validateStepOutputs` — `cat-file` / `getRawFile` mock で存在 / 欠落 / 空を網羅、fetch が stdout 非汚染。
- [ ] unit: executor gate — produced 欠落で `finalizeStepArtifacts` 到達前 halt（mock runner / mock strategy）、follow-up 残存で halt、全充足で素通り（`tests/unit/step/executor-input-validation.test.ts` と対の形）。
- [ ] unit: claude-code / managed-agent adapter — `outputVerification` 設定時に同一 session へ follow-up が送られ `followUpAttempts` が加算、violation 解消で打ち切り（mock queryFn / sessionClient）。
- [ ] snapshot: 標準 pipeline の stdout が不変（`tests/cli-stdout-snapshot.test.ts` 等）。

**Acceptance Criteria**:
- 上記が green。両 runtime の検証を mock で網羅。
- stdout snapshot に差分が無い。

## T-09: ドキュメント反映と全体検証

- [ ] `architecture/components.md` の Step / RuntimeStrategy セクションに、出力契約（`outputContracts` / produced 自動導出）と `validateStepOutputs`（検出 seam、no-throw、`validateStepInputs` と対称）を追記する。契約記述の精緻化に留め、層 / DSM / 不変条件は変えない。
- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green。

**Acceptance Criteria**:
- `components.md` に出力検証 seam が `validateStepInputs` と対の形で記載される。
- `bun run typecheck && bun run test` が green。
- 受け入れ基準（produced 欠落で commit 前 halt・implementer 未完了で同一 session follow-up・予算枯渇後 halt・全充足で既存テスト無変更 green・両 runtime で機能）をすべて満たす。
