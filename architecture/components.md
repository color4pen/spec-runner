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

### Step（filter 抽象）— discriminated union `AgentStep | CliStep`
- **責務**: pipeline の filter。1 step = 1 関心。
- **AgentStep 契約**（agent session で動く step）:
  ```ts
  kind: "agent"; name: string; agent: AgentDefinition;
  buildMessage(state, deps): string;        // pure（I/O 禁止）
  resultFilePath(state, deps): string | null;
  parseResult(content, deps): ParsedStepResult;  // pure（I/O 禁止）
  reportTool?: ReportToolSpec; completionVerdict?: Verdict; phase?: "spec" | "impl"; ...
  ```
- **CliStep 契約**（deterministic に動く step）:
  ```ts
  kind: "cli"; name: string;
  run(state, deps: CliStepDeps): Promise<void>;   // 副作用あり（spawn 注入）
  resultFilePath(state, deps): string;            // 非 null
  parseResult(content, deps): ParsedStepResult;   // pure
  ```
- **不変条件**: `buildMessage`/`parseResult` は pure（判定系の I/O 禁止＝B-5）。CLI step だけ `spawn` を注入で受ける。
- → `src/core/step/types.ts`

### StepExecutor — step 実行エンジン
- **責務**: AgentStep なら `AgentRunner.run(ctx)` を呼び、CliStep なら `step.run()` を呼ぶ。結果を `StepRun` として finalize し state に記録。`reportTool` 登録・follow-up 制御・project.md 注入（`needsProjectContext`）。
- **協調**: AgentRunner（port）/ Step / JobStateStore / EventBus。
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

### FinishOrchestrator — finish（merge + archive）編成
- **責務**: `awaiting-merge` の PR を squash merge し、change folder を archive、delta spec を baseline へ merge（spec-merge）、`awaiting-merge → archived` を確定。Phase 構成で GitHubClient(port) / WorktreeManager / JobStateStore を編成。
- **不変条件**: merge は不可逆。成功直後に archived へ遷移（forward-only）。merge gate（branch protection）は bypass せず尊重する方針（draft `finish-respect-branch-protection`）。`specrunner/specs/` への書き込み点（spec-merge）＝ pipeline→specs の閉ループ点であり最も trust load-bearing。
- → `src/core/finish/orchestrator.ts`（`runFinishOrchestrator` / `FinishInput` / `FinishResult`）

### WorktreeManager — 並列実行の isolation seam
- **責務**: job ごとに `.git/specrunner-worktrees/<slug>-<jobId>` の専用 worktree を作り（`create` / `remove` / `prune`）、main checkout を汚さない。lock 競合 retry・`bun install`・失敗時 cleanup を内包。
- **協調**: LocalRuntime（comp-root）/ finish / cancel が注入で受ける（**port ではない domain seam**）。
- → `src/core/worktree/manager.ts`（`WorktreeManager` / `createWorktreeManager` / `buildWorktreePath`）

---

## ports（core/port — domain が要求する seam の interface）

> adapter がこれを実装する。core は実装を import しない（B-1）。SDK 型を露出しない（B-2）。

| port | 公開メソッド（要旨）| 実装 adapter |
|---|---|---|
| **AgentRunner** | `run(ctx: AgentRunContext): Promise<AgentRunResult>` —— agent step の全 lifecycle を1メソッドで | claude-code / managed-agent / dispatching / codex |
| **SessionClient** | `createSession` / `sendUserMessage` / `pollUntilComplete` / `streamEvents` / `getSessionUsage` …（managed session 操作）| managed-agent |
| **GitHubClient** | `verifyBranch` / `getRawFile` / `getRefSha` / `createPullRequest` / `getPullRequest`（`mergeStateStatus`/`mergeable`）/ `mergePullRequest({mergeMethod:"squash"})` | github |
| **ConfigStore** | `load()` / `save()` / `getAgentId(role: AgentStepName)` / `upsertAgent` | config |
| **AnthropicClient** / **OneShotQueryClient** | managed agent 登録 / 一発 query | managed-agent / claude-code |

主要 DTO（port 契約に属する型）:
```ts
interface AgentRunContext { step; state; branch; slug; cwd; config; requestType?;
  input: { requestContent; requestAdr?; dynamicContext?; projectContext? };
  session: { resumeSessionId?; resumePrompt?; logPath? };
  policy: { postWorkPrompts?; reportTool?; toolReportRetry? };
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
- **責務**: agent 実行基盤を runtime 非依存に抽象。`query` / `createAgentRunner` / `setupWorkspace` / `buildDeps` / `registerCleanup` / `teardown` の6面を露出。
- **実装**: `LocalRuntime`（worktree + ClaudeCodeRunner + signal cleanup）/ `ManagedRuntime`（SessionClient + ManagedAgentRunner + no-op workspace）。
- → `src/core/runtime/strategy.ts`（`local.ts` / `managed.ts` が implements）

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
- **責務**: `JobState`（Aggregate）の読み書き。整合性境界の唯一の出入口。**core/port を implements しない**（ruling D5、`architecture/adr` 2026-05-31）。
- **協調**: state schema（型）/ util（atomic write）。上位を import しない。
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
