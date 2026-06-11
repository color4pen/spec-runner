# Components — コンポーネント責務 + 公開インターフェース（Logical / C4 Component View）

> `model.md`（層・依存）の下の粒度。**各コンポーネントが何を担い、何を露出するか**を定義する。これが「実装が follow できる」レベル（interface-first）。
> **SoT 境界**: 正確な signature/型は **コードが正典**（各行の `→ src/...` 参照先）。本書はそれを陳腐化させないため、責務・契約の形・協調相手まで記す（C4 Code level は手書きしない方針）。
> 振る舞い（メソッドが何を *する* か）は specs。ここは contract の形（名前・in/out・事前事後）まで。
> **被覆スコープ**: 本書は pipeline orchestration の load-bearing component と拡張 seam（`Step` / port / `RuntimeStrategy` 等）を記す。`doctor` / `cancel` / `usage` / `validation` / `credentials` / `preflight` / `spec` / `pr-create` 等の運用 subsystem は層 mapping（`model.md` §2）＋コード正典で責務が一意に追えるため、individual component としては展開しない（意図的非カバー）。

---

## domain（core、runtime/port 除く）

### Pipeline — 実行オーケストレータ
- **責務**: step を実行し、`STANDARD_TRANSITIONS` を引いて次 step を決め、loop 枯渇を `LOOP_ERROR_CODES` で halt にする。
- **協調**: StepExecutor（各 step 実行）/ Transition table（routing）/ JobStateStore（state 永続）。
- → `src/core/pipeline/`

### Transition（routing data）
```ts
interface Transition { step: string; on: Verdict | string; to: string | "end" | "escalate"; when?: (state: JobState) => boolean }
```
- **責務**: 「step が verdict を出したらどこへ」をデータで宣言。`when` は型付き state のみ参照（`fileContent` を読んだら arch test 違反）。
- → `src/core/pipeline/types.ts`（`STANDARD_TRANSITIONS`）

### Reviewers — 宣言的レビューレンズ subsystem
- **責務**: `specrunner/reviewers/<name>.md`（frontmatter: name / maxIterations / model / paths / requestTypes、本文: 目的・観点・判定基準 + 自由欄）を job 開始時にロード・検証し、`JobState.reviewers` に snapshot する。pipeline 合成時に `composeReviewerDescriptor` が base descriptor を拡張: custom reviewer step 群を code-review の後に挿入し、チェーン全体の遷移を `buildReviewerChainTransitions` で再生成し、末尾に regression-gate（修正済み findings の台帳照合）を付与する。snapshots 空のとき base を参照同一で返す（ゼロ overhead 不変条件）。
- **契約の所在**: reviewer の system prompt は CLI 所有の固定フレーム（judge 契約・findings 形式・結果ファイル義務）に md 内容をスロット注入して組む — ユーザー定義が契約を上書きできない。verdict 導出・findings 実在検証・exhaustion は組み込み judge と同一機構。activation（paths / requestTypes）は実行時に StepExecutor が `RuntimeStrategy.listChangedFiles` の観測で決定論判定し、不一致は `verdict: "skipped"`（approved と別値）として記録する。
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
- → `src/core/step/types.ts`

### StepExecutor — step 実行エンジン
- **責務**: AgentStep なら `AgentRunner.run(ctx)` を呼び、CliStep なら `step.run()` を呼ぶ。結果を `StepRun` として finalize し state に記録。`reportTool` 登録・follow-up 制御・project.md 注入（`needsProjectContext`）。
- **出力契約ゲート**: runner 成功後・`finalizeStepArtifacts`（commit）前に、`writes()` 宣言 + `outputContracts()` を `RuntimeStrategy.validateStepOutputs` に渡して検証。violation あり → `STEP_OUTPUT_MISSING`。`follow-up` class の契約は `OutputVerificationPolicy`（`ctx.policy.outputVerification`）として adapter に注入し、同セッション内の repair loop を可能にする。
- **協調**: AgentRunner（port）/ Step / JobStateStore / EventBus / RuntimeStrategy（output gate）。
- → `src/core/step/`

### AgentRegistry / AgentDefinition
```ts
interface AgentDefinition { readonly name: string; readonly role: AgentStepName; readonly model: string; readonly system: string; readonly tools: ToolSpec[]; capabilities? }
```
- **責務**: 各 agent step の定義（pure data）。SDK 型を import しない（B-2）。
- → `src/core/agent/definition.ts`

### EventBus（Domain Event）
- **責務**: pipeline / step のイベントを型付き payload（`EventPayloadMap`）で発行。subscriber が集計・ログ・進捗表示。
- **実イベント（`DomainEvent` union = 14種）**: `pipeline:start|complete|fail|iteration:start|iteration:verdict|iteration:exhausted|summary|cli-step` ／ `step:start|complete|error|progress` ／ `verdict:parsed` ／ `commit:push`
- → `src/core/event/types.ts`（`DomainEvent` / `EventPayloadMap` が正典）

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
| **GitHubClient** | `verifyBranch` / `getRawFile` / `getRefSha` / `createPullRequest` / `getPullRequest`（`mergeStateStatus`/`mergeable`/`headSha`）/ `mergePullRequest({mergeMethod:"squash"})` / `getCheckStatus` → `CheckRollup`（check runs + commit statuses を集約し success/pending/failure/none を返す） | github |
| **ConfigStore** | `load()` / `save()` / `getAgentId(role: AgentStepName)` / `upsertAgent` | config |
| **AnthropicClient** / **OneShotQueryClient** | managed agent 登録 / 一発 query | managed-agent / claude-code |

主要 DTO（port 契約に属する型）:
```ts
interface AgentRunContext { step; state; branch; slug; cwd; config; requestType?;
  input: { requestContent; requestAdr?; requestBaseBranch?; dynamicContext?; projectContext? };
  session: { resumeSessionId?; resumePrompt?; logPath? };
  policy: { postWorkPrompts?; reportTool?; toolReportRetry?;
    outputVerification?: OutputVerificationPolicy };  // follow-up class の repair loop
  emit(event, payload) }
interface AgentRunResult { completionReason: "success"|"error"|"timeout"; resultContent: string|null;
  toolResult: BaseReportResult|null; followUpAttempts: number; sessionId?; agentBranch?; error?; modelUsage? }
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
- **責務**: agent 実行基盤を runtime 非依存に抽象。workspace 管理・agent 実行・state 永続・finding 参照の実在検証・step 出力契約の検証・cleanup の面を露出。
- **実装**: `LocalRuntime`（worktree or no-worktree + ClaudeCodeRunner + signal cleanup）/ `ManagedRuntime`（SessionClient + ManagedAgentRunner + no-op workspace）。
- **検証と導出の分担**: finding の file / line 参照の存在確認（I/O、runtime 差異＝local worktree fs / managed GitHub raw fetch）は本 seam（`verifyFindingRefs`）。verdict の導出（純関数）は domain（`core/step/judge-verdict.ts`）。判定を seam に、I/O を domain に置かない（B-5 / B-8 と同方向）。
- **出力検証（`validateStepOutputs`）**: step 実行後、`OutputContract[]` を受け取り `OutputCheckResult`（violations）を返す。no-throw 契約。`produced`（ファイル欠落 / 空 / scaffold 一致）と `tasks-complete`（未チェック `[ ]` 残存）の 2 kind を処理。LocalRuntime = ローカル fs 読み取り、ManagedRuntime = origin fetch 後 `getRawFile`（stdout 非汚染）。
- **変更ファイル観測（`listChangedFiles`）**: base branch との差分ファイル一覧を返す（reviewer activation の判定材料）。LocalRuntime = `git diff --name-only`、ManagedRuntime = `[]`（local git なし → paths 条件付き reviewer は安全側 skip、文書化済み制約）。
- → `src/core/port/runtime-strategy.ts`（`local.ts` / `managed.ts` が implements）

### createRuntime — runtime factory（分岐集約点）
- **責務**: `config.runtime`（local / managed）の分岐を**ここ1箇所に閉じて** RuntimeStrategy を組む（B-8）。
- **不変条件**: runtime 分岐を domain / CLI に散らさない。※現状 `executor.ts` 等に分岐残存（`model.md` §5）。
- → `src/core/runtime/factory.ts`

### CommandRunner — pipeline 実行の Template Method
- **責務**: run / resume 共通の実行骨格。`prepare`（subclass override の唯一点）→ `setupWorkspace` → `buildDeps` → `registerCleanup` → runPipeline → `handleResult` → `teardown` の固定7段。subclass は `prepare()` のみ override。
- **協調**: RuntimeStrategy（注入）/ EventBus / Pipeline / JobStateStore / KeepAlive。
- → `src/core/command/runner.ts`（`PipelineRunCommand` / `ResumeCommand` が extends）

---

## persistence

### JobStateStore（standalone Repository）
- **責務**: `JobState`（Aggregate）の読み書き。整合性境界の唯一の出入口。state は作業単位（slug）ごとの branch-borne な分割（journal `events.jsonl` ＋ projection `state.json`、`changes/<slug>/`）として永続する。cost（`usage.json`）は state でなく Aggregate 外（`usageStore` が書く別管理）。liveness（worktreePath / pid / session）と managed の enumeration marker は `.specrunner/local/<slug>/` sidecar に machine-local metadata（regenerable・truth でない）として持つ。active job の列挙（`list`）は local＝worktree 走査、managed＝sidecar marker。**core/port を implements しない**（ruling D5、`architecture/adr` 2026-05-31）。
- **協調**: state schema（型）/ util（atomic write）/ git seam（branch 同伴の commit）。上位を import しない。
- → `src/store/job-state-store.ts`

---

## adapters（ports の実装。外部 SDK はここだけ）

| adapter | 実装する port | 外部依存 |
|---|---|---|
| claude-code | AgentRunner / OneShotQueryClient | `@anthropic-ai/claude-agent-sdk` |
| managed-agent | AgentRunner / SessionClient / AnthropicClient | `@anthropic-ai/sdk` |
| codex | AgentRunner | `@openai/codex-sdk` |
| dispatching | AgentRunner（runtime 振り分け）| — |
| github | GitHubClient | REST |

- **不変条件**: SDK 型を返り値・引数で core に漏らさない（B-2）。port の DTO に変換する。
- → `src/adapter/*/`

> **外部 API ↔ port DTO の変換（anti-corruption）**: REST/GraphQL の field を port DTO へ写す変換責務（例: `mergeable_state` → `mergeStateStatus` の正規化）は各 adapter（`src/adapter/github/github-client.ts` 等）が正典。SDK / API の breaking change の blast radius は B-2 で adapters に封じ込める。変換表は本書に複製しない（コード正典）。

> **host / endpoint も adapter-contained**: GitHub host / baseURL は config 駆動で composition-root から adapter に注入する（`createGitHubClient` の引数）。`GitHubClient` port interface は host を露出しない（host 非依存）。GHES 等への向け先変更の blast radius は adapter + comp-root 配線に閉じる（B-2 の延長 ＝ 外部 endpoint host も core に漏らさない）。**multi-provider 抽象（GitLab 等の別 port）は採らない**（未使用 port を避ける、`model.md` §1）。詳細は ADR `architecture/adr/2026-06-02-github-auth-host-decoupling.md`。

---

## 使い方（write / review の入口）

- **書く**: 新 step を足す → `Step`（AgentStep|CliStep）契約を実装。新 IO 先 → `core/port` に interface を足し adapter で実装（B-1）。型は domain-model.md。
- **レビューする**: この責務・interface に沿っているか（判断レビュー）＋ 依存方向（B-1〜B-9、決定的レビュー＝歯）。詳細は `conformance.md`。
