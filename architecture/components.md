# Components — コンポーネント責務 + 公開インターフェース（Logical / C4 Component View）

> `model.md`（層・依存）の下の粒度。**各コンポーネントが何を担い、何を露出するか**を定義する。これが「実装が follow できる」レベル（interface-first）。
> **SoT 境界**: 正確な signature/型は **コードが正典**（各行の `→ src/...` 参照先）。本書はそれを陳腐化させないため、責務・契約の形・協調相手まで記す（C4 Code level は手書きしない方針）。
> 振る舞い（メソッドが何を *する* か）は specs。ここは contract の形（名前・in/out・事前事後）まで。
> **被覆スコープ**: 本書は pipeline orchestration の load-bearing component と拡張 seam（`Step` / port / `RuntimeStrategy` 等）を記す。`doctor` / `cancel` / `usage` / `verification` / `credentials` / `preflight` / `spec` / `pr-create` / `inbox` 等の運用 subsystem は層 mapping（`model.md` §2）＋コード正典で責務が一意に追えるため、individual component としては展開しない（意図的非カバー）。

---

## domain（core、runtime/port 除く）

### Pipeline — 実行オーケストレータ
- **責務**: step を実行し、transition 表を引いて次 step を決め、loop 枯渇を `LOOP_ERROR_CODES` で halt にする。収束予算は `ConvergenceBudget` に、custom reviewer 群の並列実行は `ParallelReviewRound`（coordinator。member は persist しない — B-13/B-15/B-16）に概念分解済み。
- **profile / 権限スコープ**: registry は `standard` / `design-only` / `fast`（記述子で選択、`dynamic-model.md`）。descriptor は任意で `permissionScope`（`domain-model.md`）を持ち、その `checkpoint`（judge step）で scope breach を評価する（→ Scope derivation）。`PipelineDescriptor.parallelReview` が並列 round の宣言。
- **協調**: StepExecutor（各 step 実行）/ Transition table（routing）/ CommitOrchestrator（state 永続）/ ConvergenceBudget / ParallelReviewRound。
- → `src/core/pipeline/`（`parallel-review-round.ts` / `convergence-budget.ts` を含む）

### Transition（routing data）
```ts
interface Transition { step: string; on: Verdict | string; to: string | "end" | "escalate"; when?: (state: JobState) => boolean }
```
- **責務**: 「step が verdict を出したらどこへ」をデータで宣言。`when` は型付き state のみ参照（`fileContent` を読んだら arch test 違反）。
- → `src/core/pipeline/types.ts`（`STANDARD_TRANSITIONS` / `FAST_TRANSITIONS`）

### Scope derivation — 権限スコープの breach 機械導出（pure）
- **責務**: `(permissionScope, 最終 diff の changed-files, state)` から forbidden surface の breach 有無と抵触面を導出し（`deriveScopeBreach`）、breach / 評価不能（UNKNOWN）を `origin:"scope"` の decision-needed finding に**決定的に合成**する（`synthesizeScopeFindings` / `synthesizeScopeUnverifiableFinding`）。agent 申告でない**第2の verdict 入力源**。
- **不変条件**: pure（`fs`/`child_process` を import しない＝B-5）。changed-files は RuntimeStrategy seam（`listChangedFiles`、`verifyFindingRefs` と同型）経由で受け取る。合成 finding は既存の `deriveJudgeVerdict` → escalation → decision-ledger を通り並行機構を作らない。`canDeriveChangedFiles?.() === false` の runtime では breach 評価を行わず UNKNOWN を合成（fail-closed）。導出能力のある runtime（`canDeriveChangedFiles()===true`）でも `listChangedFiles` が `unavailable` を返した場合（per-call 導出失敗）は同様に UNKNOWN を合成する（構造的非導出と per-call 失敗を相補で塞ぎ、`[]`=「変更なし」への暗黙 fold を型として不能にする）。
- **協調**: StepExecutor（checkpoint judge step で合成 findings を merge）/ RuntimeStrategy（diff seam）/ judge-verdict（導出）/ decision-ledger（蒸し返し封殺）。
- → `src/core/pipeline/scope.ts`（純関数）/ `src/core/step/scope-check.ts`（checkpoint での呼び出し）

### Reviewers — 宣言的レビューレンズ subsystem
- **責務**: `specrunner/reviewers/<name>.md`（frontmatter: name / maxIterations / model / paths / requestTypes、本文: 目的・観点・判定基準 + 自由欄）を job 開始時にロード・検証し、`JobState.reviewers` に snapshot する。pipeline 合成時に `composeReviewerDescriptor` が base descriptor を拡張: custom reviewer step 群を code-review の後に挿入し、チェーン全体の遷移を `buildReviewerChainTransitions` で再生成し、末尾に regression-gate（**新規退行の検出** — 台帳の findings を「未修正かもしれない」前提で再検証し、既知未修正の low severity は gate 出力から除外する）を付与する。snapshots 空のとき base を参照同一で返す（ゼロ overhead 不変条件）。
- **契約の所在**: reviewer の system prompt は CLI 所有の固定フレーム（judge 契約・findings 形式・結果ファイル義務）に md 内容をスロット注入して組む — ユーザー定義が契約を上書きできない。スロットには周回知識（前周 findings・operator 裁定・post-fix context。`Step.prepareRoundContext` hook で合成）も載る。verdict 導出・findings 実在検証・exhaustion は組み込み judge と同一機構。activation（paths / requestTypes）は実行時に StepExecutor が `RuntimeStrategy.listChangedFiles` の観測で決定論判定し、不一致は `verdict: "skipped"`（approved と別値）として記録する。
- **協調**: composeReviewerDescriptor（合成）/ reviewer-chain 純関数群（`deriveImplReviewerChain` / `resolveActiveReviewer` — 共用 code-fixer の戻り先・予算帰属の多対一解決）/ StepExecutor（activation gate）/ findings-ledger（regression-gate の入力）。
- → `src/core/reviewers/`（load / validate / definition）、`src/core/pipeline/compose-reviewers.ts`、`src/core/pipeline/reviewer-chain.ts`、`src/core/step/custom-reviewer.ts`、`src/core/step/regression-gate.ts`

### Step（filter 抽象）— discriminated union `AgentStep | CliStep`
- **責務**: pipeline の filter。1 step = 1 関心。
- **AgentStep 契約**（agent session で動く step）:
  ```ts
  kind: "agent"; name: string; agent: AgentDefinition;
  buildMessage(state, deps): string;        // pure（I/O 禁止）
  resultFilePath(state, deps): string | null;
  parseResult(content, deps): ParsedStepResult;  // pure（I/O 禁止）
  reads?(state, deps): IoRef[];             // pure — 入力宣言（util/paths 由来 path、{n} 解決済み）
  writes?(state, deps): IoRef[];            // pure — 出力宣言（IoRef.verify:false で検証除外）
  outputContracts?(state, deps): OutputContract[];  // pure — 追加出力契約（tasks-complete 等）
  reportTool?: ReportToolSpec; completionVerdict?: Verdict; ...
  ```
- **CliStep 契約**（deterministic に動く step）:
  ```ts
  kind: "cli"; name: string;
  run(state, deps: CliStepDeps): Promise<void>;   // 副作用あり（spawn 注入）
  resultFilePath(state, deps): string;            // 非 null
  parseResult(content, deps): ParsedStepResult;   // pure
  reads?(state, deps): IoRef[];             // pure — 入力宣言
  writes?(state, deps): IoRef[];            // pure — 出力宣言
  ```
- **不変条件**: `buildMessage`/`parseResult`/`reads`/`writes`/`outputContracts` は pure（I/O 禁止＝B-5）。CLI step だけ `spawn` を注入で受ける。
- **I/O 契約**: `reads` の required 入力は StepExecutor が実行前に `RuntimeStrategy.validateStepInputs` で存在を検証（欠落時 `STEP_INPUT_MISSING`）。`writes` の出力は実行後に `RuntimeStrategy.validateStepOutputs` で検証（欠落・空・scaffold 一致 → `STEP_OUTPUT_MISSING`）。`IoRef.verify:false` で個別除外可（条件付き出力等）。`outputContracts` は `tasks-complete`（全チェックボックス確認）等 kind-specific な追加契約。
- **周回 context hook**: `prepareRoundContext?` — review 系 step が周回知識（前周 findings / operator 裁定 / post-fix context）を prompt に合成するための optional hook。core 層が先に実行し spread-merge する。
- → `src/core/port/step-types.ts`（`Step` union の正典。`src/core/step/types.ts` は re-export shim）

### StepExecutor — step 実行エンジン（producer）
- **責務**: AgentStep なら `AgentRunner.run(ctx)` を呼び、CliStep なら `step.run()` を呼ぶ。結果を `StepRun` として finalize する — **state への永続化・FSM 遷移・halt 適用は行わない**（B-13 / B-14。すべて CommitOrchestrator に委譲し、guard は `StepHalt` 値を生成するだけ）。`reportTool` 登録・follow-up 制御・project.md 注入（`needsProjectContext`）。
- **出力契約ゲート**: runner 成功後・commit 前に、`writes()` 宣言 + `outputContracts()` を `RuntimeStrategy.validateStepOutputs` に渡して検証。violation あり → `STEP_OUTPUT_MISSING`。`follow-up` class の契約は `OutputVerificationPolicy`（`ctx.policy.outputVerification`）として adapter に注入し、同セッション内の repair loop を可能にする。
- **協調**: AgentRunner（port）/ Step / CommitOrchestrator（永続）/ EventBus / RuntimeStrategy（output gate）。
- → `src/core/step/executor.ts`

### CommitOrchestrator — step commit 適用の単一所有者（committer）
- **責務**: step 実行経路の状態書き込み・git 副作用の**唯一の適用点**（B-13 / B-14）。step 結果の commit（journal 追記・projection 永続・git commit/push・touched files 記録）、halt の適用（`commitHalt` — FSM 遷移・rethrow の一括担当）、並列 round の一括書き込み（`commitRound` — 宣言出力への scoped staging、B-15）。
- **staging containment**: commit 前の guarded staging — 除外 glob・staged 件数上限・staged バイト量上限の fail-closed 3 層 guard（違反は commit せず escalation halt）。生成物・肥大 artifact が branch に混入する経路を構造で塞ぐ。
- **協調**: StepExecutor / ParallelReviewRound（producer）/ JobStateStore（永続）/ RuntimeStrategy（git seam）/ EventBus。
- → `src/core/step/commit-orchestrator.ts` ／ `src/core/step/staging-containment.ts` ／ `src/core/step/round-git-scope.ts`

### AgentRegistry / AgentDefinition
```ts
interface AgentDefinition { readonly name: string; readonly role: AgentStepName; readonly model: string; readonly system: string; readonly tools: ToolSpec[]; capabilities? }
```
- **責務**: 各 agent step の定義（pure data）。SDK 型を import しない（B-2）。
- → `src/kernel/agent-definition.ts`（正典。`src/core/agent/definition.ts` は re-export shim）

### EventBus（Domain Event）
- **責務**: pipeline / step のイベントを型付き payload（`EventPayloadMap`）で発行。subscriber が集計・ログ・進捗表示。
- **実イベント（`DomainEvent` union = 16種）**: `pipeline:start|complete|fail|iteration:start|iteration:verdict|iteration:exhausted|summary|cli-step|fixer:budget-skipped` ／ `step:start|complete|error|progress|retry` ／ `verdict:parsed` ／ `commit:push`
- → `src/kernel/event-types.ts`（`DomainEvent` 正典）／ `src/core/event/types.ts`（`EventPayloadMap`）

### ArchiveOrchestrator — archive（client-closed な最終片づけ）編成
- **責務**: merge 済み change の片づけ。change folder を archive 配置・worktree を撤去・`awaiting-archive → archived` を確定。WorktreeManager / JobStateStore / git seam(spawn) を編成。
- **不変条件**: **client-closed** — GitHubClient(port) に依存しない（merge も PR status 問い合わせも持たない）。外部状態の待ち・polling を含まず決定的に完結する。`archived` は change が実際に archive 済みであることを含意（forward-only）。
- **merge の所在**: merge は CLI の片づけ責務の外（GitHub / 人が行う外部イベント・job status 遷移ではない）。opt-in の merge 便利経路のみ GitHubClient(port) に依存し、green 充足を前提に merge → archive を編成する（archive 本体とは別 path・client-closed 性はこの path を含まない）。
- **protected-path merge guard**: opt-in merge 経路は merge 直前に PR の変更ファイルを config の `archive.protectedPaths` glob と照合し、一致した場合は自動 merge せず escalation で停止する（fail-closed）。
- → `src/core/archive/orchestrator.ts`（archive 本体）／ `src/core/archive/merge-then-archive.ts`（opt-in merge 経路）

### WorktreeManager — 並列実行の isolation seam
- **責務**: job ごとに `.git/specrunner-worktrees/<slug>-<jobId>` の専用 worktree を作り（`create` / `remove` / `prune`）、main checkout を汚さない。lock 競合 retry・検出された PM の install コマンド実行・失敗時 cleanup を内包。
- **協調**: LocalRuntime（comp-root）/ finish / cancel が注入で受ける（**port ではない domain seam**）。
- → `src/core/worktree/manager.ts`（`WorktreeManager` / `createWorktreeManager` / `buildWorktreePath`）

### JobAccess — jobId → slug → state の解決レイヤ
- **責務**: sidecar index を経由し、jobId から slug を引き、適切な JobStateStore を構築して state を読み込む / 書き込み先を解決する。
- **公開インターフェース**:
  - `loadStateByJobId(repoRoot, jobId): NormalizedJobState` — read-only。sidecar → worktree slug dir → canonical → throw の順。
  - `resolveStateStoreByJobId(repoRoot, jobId): JobStateStore | null` — writable store 解決。null は degraded skip。
- **不変条件**: read-only（resolve 時に persist しない）。jobId が解決できなければ `JOB_NOT_FOUND` throw。
- **協調**: JobStateStore / resolveCanonicalStateDir / local-job-index（`store/local-job-index.ts`、sidecar 走査）。
- → `src/core/job-access/`

---

## ports（core/port — domain が要求する seam の interface）

> adapter がこれを実装する。core は実装を import しない（B-1）。SDK 型を露出しない（B-2）。

| port | 公開メソッド（要旨）| 実装 adapter |
|---|---|---|
| **AgentRunner** | `run(ctx: AgentRunContext): Promise<AgentRunResult>` —— agent step の全 lifecycle を1メソッドで | claude-code / managed-agent / dispatching / codex |
| **SessionClient** | `createSession` / `sendUserMessage` / `pollUntilComplete` / `streamEvents` / `getSessionUsage` …（managed session 操作）| managed-agent |
| **GitHubClient** | `verifyBranch` / `getRawFile` / `getRefSha` / `getIssue` / `createPullRequest` / `getPullRequest`（`mergeStateStatus`/`mergeable`/`headSha`）/ `listPullRequestFiles` / `mergePullRequest({mergeMethod:"squash"})` / `getCheckStatus` → `CheckRollup`（check runs + commit statuses を集約し success/pending/failure/none を返す）ほか issue comment / label 系 | github |
| **ConfigStore** | `load()` / `save()` / `getAgentId(role: AgentStepName)` / `upsertAgent` | config |
| **AnthropicClient** | managed agent 登録 | managed-agent |
| **IssueFidelityComparator** | `compare({issueTitle, issueBody, requestMd})` → undeclared drops —— issue↔request の宣言なき弱体化検出（**LLM 系 port の 4 本目** — B-18 の封じ込め対象）| claude-code |
| **QueryAbortRegistration** | `register(controller): unregister` —— in-flight agent query の中断 seam。adapter が core/lifecycle を import しないための port | 具象は domain の `QueryAbortHub`（`src/core/lifecycle/`）を comp-root が注入 |
| **ProviderReadinessProbe** | provider 実行前提（認証等）の着手前検証 | claude-code |
| **RuntimePrereqChecker / RuntimeCredentialsResolver** | runtime 前提・credential 解決 | comp-root 配線（`src/core/runtime/`）|

主要 DTO（port 契約に属する型）:
```ts
interface AgentRunContext { step; state; branch; slug; cwd; config; requestType?; writeScope?: AgentWriteScope;
  input: { requestContent; requestAdr?; requestBaseBranch?; dynamicContext?; projectContext? };
  session: { resumeSessionId?; resumePrompt?; logPath? };
  policy: { postWorkPrompts?; reportTool?; toolReportRetry?;
    outputVerification?: OutputVerificationPolicy };  // follow-up class の repair loop
  emit(event, payload) }
interface AgentRunResult { completionReason: "success"|"error"|"timeout"; resultContent: string|null;
  toolResult: BaseReportResult|null; followUpAttempts: number; transientRetryAttempts?; sessionId?; agentBranch?;
  error?; modelUsage?; invocationMetrics?: AgentInvocationMetrics;  // SDK 実測（turn 数 / 所要時間 / 実コスト）
  completionReportDiagnostics?; addedTurns?; touchedFiles?: string[] }  // touched files は CommitOrchestrator が state に記録
```
- → `src/core/port/*.ts`（**正典**）

### report_result tool（完了シグナルの契約）
```ts
interface ReportToolSpec<T=BaseReportResult> { name; description; zodSchema; parseInput(raw): {ok:true;value:T} | {ok:false;missingFields;rawInput} }
interface FollowUpPolicy { maxAttempts; buildPrompt(input): string }  // DEFAULT_TOOL_RETRY = 2
```
- **責務**: agent が tool 呼び出しで完了を能動宣言（散文検出をやめる）。step-class 別の typed outcome は domain-model.md 参照。
- → `src/core/port/report-result.ts`

---

## composition-root（cli/, core/runtime/, core/command/ — 実装を組み立て実行戦略を分岐）

> domain（filter）を組み上げ・runtime を選び・依存を注入する層。**adapters を new してよい唯一の層**（B-1）。生 SDK 型は持たない（B-2）。

### RuntimeStrategy — runtime 中立の実行基盤 seam
- **責務**: agent 実行基盤を runtime 非依存に抽象。workspace 管理・agent 実行・state 永続・finding 参照の実在検証・step 出力契約の検証・commit/round 系 git 面（scoped stage・commit 間 diff・revision 読み取り・commit 時テスト実行）・生存/重複 guard（`assertNoDuplicateLiveJob` / `assertProviderReadiness`）・cleanup の面を露出。
- **実装**: `LocalRuntime`（worktree or no-worktree + ClaudeCodeRunner + signal cleanup）/ `ManagedRuntime`（SessionClient + ManagedAgentRunner + no-op workspace）。
- **検証と導出の分担**: finding の file / line 参照の存在確認（I/O、runtime 差異＝local worktree fs / managed GitHub raw fetch）は本 seam（`verifyFindingRefs`）。verdict の導出（純関数）は domain（`core/step/judge-verdict.ts`）。判定を seam に、I/O を domain に置かない（B-5 / B-8 と同方向）。
- **出力検証（`validateStepOutputs`）**: step 実行後、`OutputContract[]` を受け取り `OutputCheckResult`（violations）を返す。no-throw 契約。`produced`（ファイル欠落 / 空 / scaffold 一致）と `tasks-complete`（未チェック `[ ]` 残存）の 2 kind を処理。LocalRuntime = ローカル fs 読み取り、ManagedRuntime = origin fetch 後 `getRawFile`（stdout 非汚染）。
- **変更ファイル観測（`listChangedFiles`）**: base branch との差分ファイル一覧を `ChangedFilesResult = {kind:"success"; files:string[]} | {kind:"unavailable"; reason:string}` の DU で返す。LocalRuntime = `git diff --name-only` 成功→`success`（`files` は空でも「変更なし」の意味）、失敗→`unavailable`（reason に exit code/エラー概要）。ManagedRuntime = 常に `unavailable`（local git なし。activation・scope-check の扱いは `canDeriveChangedFiles()===false` の短絡が先に決める）。DU により `success({files:[]})` と `unavailable` が型で区別され、`[]`=「変更なし」への暗黙 fold が表現不能になる。
- **能力 predicate（`canDeriveChangedFiles?(): boolean`）**: **構造的非導出**（runtime がそもそも git worktree を持たない）を表す optional メタ情報。LocalRuntime=`true` / ManagedRuntime=`false`。absent は`listChangedFiles`経路へフォールスルー。scope-check・reviewer activation gate（`executor.ts`）・runtime-capability-gate が参照する。`=== false` の runtime では `listChangedFiles` を呼ばず、activation は `changedFilesDerivable:false` を渡して paths 条件付き reviewer を活性化する（fail-closed）。**per-call 導出失敗**（canDerive=true だが呼び出し時に git diff が失敗）は DU の `unavailable` arm で表現し、consumers は predicate=false と同じ fail-closed 経路へ流す（相補関係）。具象 runtime は必須化交差型 `RealRuntimeStrategy` を implements する（B-11。必須化されるのは `canDeriveChangedFiles` / `assertNoDuplicateLiveJob` / `assertProviderReadiness` / `reloadJobState` / `snapshotMainCheckoutGuard` / `listWorktreeChanges` / round commit 系）。
- → `src/core/port/runtime-strategy.ts`（`RuntimeStrategy` / `RealRuntimeStrategy`。`local.ts` / `managed.ts` が implements）

### createRuntime — runtime factory（分岐集約点）
- **責務**: `config.runtime`（local / managed）の分岐を**ここ1箇所に閉じて** RuntimeStrategy を組む（B-8）。
- **不変条件**: runtime 分岐を domain / CLI に散らさない。※現状 `executor.ts` 等に分岐残存（`model.md` §5）。
- → `src/core/runtime/factory.ts`

### CommandRunner — pipeline 実行の Template Method
- **責務**: run / resume 共通の実行骨格。`assertProviderReadiness`（前置）→ `prepare`（subclass override の唯一点）→ `setupWorkspace` → `buildDeps` → `registerCleanup` → **issue fidelity gate**（Step 4b、`dynamic-model.md`）→ runPipeline → `handleResult` → `teardown`。
- **profile 選択 + 着手前 capability gate**: `PipelineRunCommand.prepare` が request.md Meta の `pipeline` から `pipelineId` を解決（absent=`standard`、未知 id は registry エラー）し、`permissionScope` を宣言する descriptor ＋ 非対応 runtime を **`bootstrapJob` の前に** reject する（`assertRuntimeSupportsScope` → `runtime-capability-gate.ts`、`dynamic-model.md` の capability gate）。判定は `permissionScope` の有無から導出し profile 名でハードコードしない。
- **resume preflight**: `ResumeCommand.prepare` は apply-canon / auto-quarantine / adopt-commits / reconcile の fail-closed gate 列を内包する（`dynamic-model.md` resume preflight）。判定純関数は `src/core/resume/`（`canon-provenance.ts` / `adopt-commits.ts`）。
- **実行所有権（detach / job wait）**: `--detach` の分岐は CommandRunner の**上流**（CLI dispatch 層 `src/cli/command-registry.ts`）にあり、`detachSelf` が自プロセスを再起動して pipeline の生存管理を CLI が所有する（起動 ack は `dynamic-model.md` liveness）。発見・待機の対は `job wait`（`src/cli/job-wait.ts`、process-death-gated）。
- **協調**: RuntimeStrategy（注入）/ EventBus / Pipeline / JobStateStore / KeepAlive / IssueFidelityComparator（factory 注入）。
- → `src/core/command/runner.ts`（`PipelineRunCommand` / `ResumeCommand` が extends）／ `src/core/pipeline/runtime-capability-gate.ts` ／ `src/core/command/detach.ts`

---

## persistence

### JobStateStore（standalone Repository）
- **責務**: `JobState`（Aggregate）の読み書き。整合性境界の唯一の出入口。state は作業単位（slug）ごとの branch-borne な分割（journal `events.jsonl` ＋ projection `state.json`、`changes/<slug>/`）として永続する。cost 集計（`usage.json`）は Aggregate 外（`usageStore` が state から導出して書く別管理）。liveness（worktreePath / pid / session）は state の machine-scoped 面と `.specrunner/local/<slug>/` sidecar の二面で持ち、解決は state 優先・sidecar は自 jobId 一致時の fallback（sidecar は detach 起動 ack の同期チャネルを兼ねる — `dynamic-model.md` liveness）。active job の列挙（`list`）は local＝worktree 走査、managed＝sidecar marker。**core/port を implements しない**（ruling D5、`architecture/adr` 2026-05-31）。
- **協調**: state schema（型）/ util（atomic write）/ git seam（branch 同伴の commit）。上位を import しない。
- → `src/store/job-state-store.ts`

---

## adapters（ports の実装。外部 SDK はここだけ）

| adapter | 実装する port | 外部依存 |
|---|---|---|
| claude-code | AgentRunner / IssueFidelityComparator / ProviderReadinessProbe | `@anthropic-ai/claude-agent-sdk` |
| managed-agent | AgentRunner / SessionClient / AnthropicClient | `@anthropic-ai/sdk` |
| codex | AgentRunner | `@openai/codex-sdk` |
| dispatching | AgentRunner（runtime 振り分け）| — |
| github | GitHubClient | REST |

- **不変条件**: SDK 型を返り値・引数で core に漏らさない（B-2）。port の DTO に変換する。
- → `src/adapter/*/`

> **provider SDK は optional + 動的ロード**: `@anthropic-ai/claude-agent-sdk` / `@openai/codex-sdk` は `optionalDependencies`（既定 install では入るが `--omit=optional` で外せる）。各 adapter は共有 seam `adapter/shared/provider-sdk-loader.ts` の動的 `import()` で SDK を遅延ロードし、未インストール時は PM 検出付きの install 案内エラー（`PROVIDER_SDK_MISSING`）で停止する。未使用 provider のバイナリを install から外せるようにしつつ、SDK 依存を adapter 内に封じる（B-2 の延長）。→ `src/adapter/shared/provider-sdk-loader.ts`

> **`adapter/shared/` は provider 横断の共有 seam**: per-step prompt の組み立ては各 adapter の agent-runner が行い、同梱内容の生成をこの seam で共有する — `artifact-bundle.ts`（change folder 入力 artifact の prompt 同梱・サイズ上限つき）／ `touched-files-bundle.ts`（先行 step の touched files 注入）／ session log・transient error 分類。prompt 注入の実在 seam がここにあることは `conformance.md` 消費点1 と対応する。

> **外部 API ↔ port DTO の変換（anti-corruption）**: REST/GraphQL の field を port DTO へ写す変換責務（例: `mergeable_state` → `mergeStateStatus` の正規化）は各 adapter（`src/adapter/github/github-client.ts` 等）が正典。SDK / API の breaking change の blast radius は B-2 で adapters に封じ込める。変換表は本書に複製しない（コード正典）。

> **host / endpoint も adapter-contained**: GitHub host / baseURL は config 駆動で composition-root から adapter に注入する（`createGitHubClient` の引数）。`GitHubClient` port interface は host を露出しない（host 非依存）。GHES 等への向け先変更の blast radius は adapter + comp-root 配線に閉じる（B-2 の延長 ＝ 外部 endpoint host も core に漏らさない）。**multi-provider 抽象（GitLab 等の別 port）は採らない**（未使用 port を避ける、`model.md` §1）。詳細は ADR `architecture/adr/2026-06-02-github-auth-host-decoupling.md`。

---

## 使い方（write / review の入口）

- **書く**: 新 step を足す → `Step`（AgentStep|CliStep）契約を実装。新 IO 先 → `core/port` に interface を足し adapter で実装（B-1）。型は domain-model.md。
- **レビューする**: この責務・interface に沿っているか（判断レビュー）＋ 依存方向（B-x 不変条件、決定的レビュー＝歯）。詳細は `conformance.md`。
