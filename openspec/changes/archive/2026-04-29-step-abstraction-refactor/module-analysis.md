# Module Analysis — 2026-04-29-step-abstraction-refactor

Step 2.5 mechanical analysis of the proposed module structure. Scope is restricted to
testability / readability / cohesion / coupling / reusability / SRP. Extensibility,
deployment independence, security boundaries, and domain boundaries are out of scope
and intentionally not evaluated here.

This document is a **reference for the implementer**. Recommendations do not bind
implementer decisions.

---

## 1. 既存コードパターン一覧

観察対象: `src/core/steps/{propose,spec-review,spec-fixer}.ts`, `src/core/pipeline.ts`,
`src/core/loop.ts`, `src/core/session-runner.ts`, `src/core/session.ts`,
`src/core/tools/{registry,register-branch,types}.ts`, `src/state/{store,schema,helpers}.ts`.

### 繰り返しパターン

| Pattern | 観測箇所 | Note |
|---|---|---|
| **Session-create + try/catch + failJobState + appendHistory + `(err as ...).state = state` + throw** | `propose.ts:38-83`, `spec-review.ts:176-222`, `spec-fixer.ts` (実装は `runManagedAgentSession` に部分集約済) | propose と spec-review は完全コピペ。propose のみ独自 SSE 機構を持つ |
| **pollUntilComplete → catch → SESSION_TIMEOUT/SESSION_TERMINATED 分岐 → failJobState → pushStepResult → persist → throw** | `propose.ts:155-193`, `spec-review.ts:269-318` | `session-runner.ts:91-118` で部分的に集約、ただし呼び出し側でも同じ分岐を再実装 |
| **state mutation chain `state = await appendHistory(state, …)` の縦連結** | 全 step ファイル 30+ 箇所 | `appendHistory` が persist まで含むため I/O 順序は in-line に依存 |
| **`pushStepResult(state, name, { …, error: { … } })` の 6 箇所コピペ** | propose / spec-review に散在 | error 形状を 6 か所で構築 |
| **`agentId` resolve → CONFIG_INCOMPLETE 分岐** | `spec-review.ts:134-157`, `spec-fixer.ts:77-89` | 2 か所でほぼ同一の try/catch |
| **`(err as Record<string, unknown>)["state"] = state` イディオム** | propose / spec-review に 6+ 回 | runtime mutation で型を回避 |

### ファイル構成と命名

- `src/core/` 直下に `pipeline.ts` / `loop.ts` / `session.ts` / `session-runner.ts` / `completion.ts` / `types.ts` がフラットに置かれている
- `src/core/steps/` 配下は step 別のファイル分割（命名 = step name）
- `src/core/tools/` は registry + types + register-branch の 3 ファイル構成
- `src/state/` には schema / store / helpers の 3 ファイル構成。すでに「pure schema vs side-effectful store」分離あり
- 命名は概ね一貫: `runXxxStep` / `buildXxxMessage` / `parseXxxVerdict` / `xxxNotFoundError`

### Dependency 観察

- `src/core/pipeline.ts` が `state/store.ts` (`appendHistory`, `persistJobState`) と `state/helpers.ts` (`getLatestStepResult`) に直接依存
- `src/core/session.ts` が `core/tools/registry.ts:getHandler` をモジュールトップレベルで import → SSE dispatcher が global registry に固定
- 全 step ファイルが `@anthropic-ai/sdk` 派生の型を間接 import。直接 import は `core/types.ts:1` (`import type Anthropic from "@anthropic-ai/sdk"`) と `core/tools/types.ts:1` (`BetaManagedAgentsCustomToolParams`)
- `src/core/types.ts` の `PipelineDeps.client: Anthropic` が core 全体に SDK 型を漏洩

---

## 2. 共通化すべき箇所と理由

| # | 共通化対象 | 軸 | 観測根拠 | Recommended target module |
|---|---|---|---|---|
| C1 | session-create の try/catch + failJobState + history + step result の 50 行ブロック | **reusability / SRP** | `propose.ts:38-83`, `spec-review.ts:176-222` で 90% 同一 | `core/step/executor.ts` の `StepExecutor.createSession` private method として吸収 |
| C2 | poll 完了後のエラー分岐 (SESSION_TIMEOUT vs SESSION_TERMINATED) と stderrWrite + history + pushStepResult + persist + throw | **reusability** | `propose.ts:155-193`, `spec-review.ts:269-318`, `spec-fixer.ts:148-184` で 3 形態存在。`session-runner.ts:91-118` は spec-fixer 専用 | `StepExecutor.runLifecycle` の error path に集約。`session-runner.ts` の result 型 (`{ status: "idle" \| "terminated" \| "timeout", error? }`) を全 step に適用 |
| C3 | `getAgentId` の try/catch + CONFIG_INCOMPLETE への変換 | **reusability** | `spec-review.ts:134-157`, `spec-fixer.ts:77-89` | `StepExecutor.resolveAgentId(step.agent)` に隠蔽 or `Step.agent: AgentDefinition` を resolve 済み前提にする (D2 通り) |
| C4 | `pushStepResult(state, name, { session, verdict, findingsPath, completedAt, error })` の error path 6 か所コピペ | **DRY / reusability** | propose / spec-review に散在 | `StepExecutor.recordError(step, errorInfo)` という 1 method で `appendStepRun` + `failJobState` + `persist` を吸収 |
| C5 | `(err as Record<string, unknown>)["state"] = state; throw err;` イディオム | **readability / SRP** | propose / spec-review に 6+ 回 | `StepError` クラス or `decorateErrorWithState(err, state)` ヘルパー。type assertion を 1 箇所に閉じる |
| C6 | history `appendHistory(state, { ts: now, step, status, message })` の縦連結 (30+ 箇所) | **readability** | step ファイル群、pipeline.ts | EventBus への emit に置き換え + history 投影は subscriber 側へ。**ただし behavior invariance のため history 文字列の bit-for-bit 維持が条件**（D8 の制約）。短期的には維持 |
| C7 | poll fallback 分岐 (`needsPollingFallback`) | **cohesion** | `propose.ts:149-197` のみ。spec-review / spec-fixer は SSE を使わない | propose 固有のため共通化対象外。`ProposeStep.runSession` の私有ロジックとして残す（共通化しない判断を明示） |
| C8 | `runManagedAgentSession` の 119 行 | **cohesion / reusability** | `session-runner.ts` 全体。spec-review / spec-fixer に流用可だが spec-review は使っていない | `StepExecutor` がこの責務を吸収すれば session-runner.ts は削除候補 |

---

## 3. 既存ヘルパー/ユーティリティの活用候補

| Helper | 現状 | 提案モジュールでの取り扱い |
|---|---|---|
| `state/helpers.ts:pushStepResult` | StepResult[] への append + iteration auto-assign | **新 schema (StepRun[]) で `JobStateStore.appendStepRun` に移植**。pure transform 部分を残しつつ I/O は store 側に集約。helpers.ts は `getLatestStepRun` だけ pure transform として残すと再利用性が高い |
| `state/helpers.ts:getLatestStepResult` | 配列の最後を返す pure 関数 | StepRun に rename + pure 維持。`core/step/executor.ts` から query 用途で参照 |
| `state/schema.ts:appendHistoryEntry` | pure transform (state → state) | そのまま流用可。`appendHistory` (store) は persist を含むので、subscriber 経由の history 投影に切り替え可能 |
| `state/schema.ts:normalizeSteps` | object→array の legacy migration | **既存実装が "Legacy A" を扱える形になっている**。`JobStateStore.load` の normalization で再利用すべき。重複実装を避ける |
| `core/loop.ts:runLoopUntil` | iteration loop + verdict-based exit + onExceeded | Pipeline class が transition table 駆動になるため**廃止候補**。`maxIterations` ガードと `[iter N/M]` stdout 出力は Pipeline 内部に移植 |
| `core/session-runner.ts:runManagedAgentSession` | session create + send + poll の 3 ステップ集約。spec-fixer のみ使用 | StepExecutor に吸収して**削除**するのが coupling を下げる。残すなら propose の SSE 機構と二重実装になる |
| `core/tools/types.ts:defineCustomTool` factory | spec + handler の colocate を強制する factory | **保持して `Step.toolHandlers` の構築に流用**。step 同居化の主旨と一致。`registerBranchTool` の export shape をそのまま `ProposeStep` の `toolHandlers` フィールドに渡せる |
| `core/tools/register-branch.ts` | tool definition + handler colocate 済 | ファイルを `core/step/propose/` 配下（または `core/step/propose-tools.ts`）に移動。**新規実装は不要、git mv のみで足りる** |
| `state/store.ts:atomicWriteJson` 経由 persist | atomic-write は別ファイルだが store.ts が薄い wrapper | `JobStateStore` の private method に隠蔽。call site から `atomicWriteJson` の存在を見えなくする |

---

## 4. 分割単位の推奨（提案モジュールごとの 6 軸スコア + 観察）

スコア基準: 1-3 = 重大な懸念 / 4-5 = 改善余地大 / 6 = 最低限 / **7 = 承認閾値** / 8 = 良好 / 9-10 = 卓越

### 4.1 `core/pipeline/` (Pipeline class + Transition table + types)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 9 | Transition table が data なので table-driven test が書きやすい。`StepExecutor` 注入で step 実行を mock できる |
| readability | 9 | inline if 連鎖が宣言的 table に置換され、step 追加時の差分が table 1 行で済む |
| cohesion | 9 | state machine 駆動 1 責務に絞られる。`runLoopUntil` の loop guard も `maxIterations` field として class に内包 |
| coupling | 7 | `Map<StepName, Step>` / `Transition[]` / `StepExecutor` / `EventBus` の 4 依存。constructor 注入なので疎結合 |
| reusability | 8 | Pipeline class は test-double pipeline（少 step 構成）で再利用可 |
| SRP | 9 | 「state machine 駆動」「lifecycle event emit」「loop guard」の 3 責務が 1 軸（pipeline 進行）に揃う |

**懸念**:
- `[iter N/M]` stdout 出力の責務をどこに置くか（`loop.ts` で出していた）。Pipeline class 内で stdout する場合は I/O 副作用の明示 or stdout port 経由の注入を検討。**recommendation**: stdout は EventBus subscriber に逃がす形が cohesion 上有利だが、本 change は subscriber 0 のため、Pipeline class 内 stdout を許容しつつコメントで明示する
- transition table の lookup miss → escalation の挙動が spec で定義されているが、unit test で必ず固定すること

**Files**:
- `src/core/pipeline/pipeline.ts` — Pipeline class
- `src/core/pipeline/types.ts` — `Transition`, related types
- `src/core/pipeline/index.ts` — re-export

### 4.2 `core/step/` (Step interface + StepExecutor + step impls + tool 同居)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 8 | StepExecutor が constructor 注入なので mock 容易。Step は plain object で partial mock 可 |
| readability | 8 | step impl が 40 行に縮小、buildMessage / parseResult / resultFilePath だけになる |
| cohesion | 6 | **懸念**: `core/step/` ディレクトリに「Step interface」「StepExecutor (lifecycle)」「3 step 実装」「tool handler」の 4 種類が混在する。粒度が他の core/* より大きい |
| coupling | 7 | StepExecutor → `port/SessionClient`, `store/JobStateStore`, `core/event/EventBus` への依存は単方向 |
| reusability | 8 | StepExecutor は新 step 追加で再利用される第一義の class |
| SRP | 7 | StepExecutor は session create / send / poll / fetch / parse / persist / emit の 7 責務を持つが「lifecycle 管理」という上位責務で纏まる。妥当 |

**懸念 (cohesion = 6)**:
- `core/step/` 配下に 6 ファイル以上集まる: `types.ts` (Step interface), `executor.ts`, `propose.ts`, `spec-review.ts`, `spec-fixer.ts`, `propose-tools.ts` (register_branch handler), `index.ts`
- **recommendation**: 以下のサブディレクトリ分割を検討:
  ```
  core/step/
    ├── types.ts          # Step, StepDeps, StepOutcome
    ├── executor.ts       # StepExecutor class (lifecycle)
    ├── propose/
    │   ├── index.ts      # ProposeStep export
    │   ├── message.ts    # buildMessage
    │   ├── parse.ts      # parseResult (verdict 抽出ない、success のみ)
    │   └── tools.ts      # register_branch (toolHandlers)
    ├── spec-review/
    │   ├── index.ts
    │   ├── message.ts
    │   ├── parse.ts      # parseSpecReviewVerdict (regex)
    │   └── result-fetch.ts # fetchSpecReviewResult (GitHub fetch)
    └── spec-fixer/
        ├── index.ts
        └── message.ts    # buildSpecFixerInitialMessage
  ```
- ただしこれは **implementer の判断**であり、3 step を `core/step/` 直下にフラット配置（D7 通り）でも cohesion = 7 程度には保てる。複雑度が高い propose / spec-review のみサブディレクトリ化する hybrid も妥当
- **propose 固有の SSE 機構** (`startProposeSession` 等 `core/session.ts`) を `core/step/propose/` 配下に移植するか、`core/port/` interface 化して `adapter/anthropic/` に置くかは判断分岐。**recommendation**: SSE は SDK 詳細なので `adapter/anthropic/sse-stream.ts` に移し、`core/port/SessionClient` interface に `streamEvents` を追加する形のほうが core 層の SDK 直 import 排除（spec module-boundary 要件）と整合する

### 4.3 `core/agent/` (AgentDefinition interface のみ)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 9 | interface のみ。test 容易 |
| readability | 9 | 1 ファイル少行数 |
| cohesion | 9 | 単一責務 |
| coupling | 10 | 依存ゼロ |
| reusability | 8 | Step interface から参照、後続 request の AgentRegistry でも参照 |
| SRP | 10 | interface 定義のみ |

**懸念**:
- 後続 request で AgentRegistry / AgentSyncer がここに加わる前提だが、本 change ではほぼ空ディレクトリになる。**recommendation**: `index.ts` で `AgentDefinition` 型のみ export し、placeholder と感じさせない命名（`types.ts` でなく `agent-definition.ts` など実質ファイル名）にする

### 4.4 `core/event/` (EventBus + DomainEvent 型)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 9 | synchronous emit、handler 登録のみ。test trivial |
| readability | 9 | minimal class、Map<event, Set<handler>> |
| cohesion | 10 | 単一責務 (pub/sub) |
| coupling | 10 | 依存ゼロ。type のみ |
| reusability | 8 | Pipeline + StepExecutor の両方から使用。subscriber 0 でも emit 配線は普遍 |
| SRP | 10 | event dispatch 1 責務 |

**懸念**:
- subscriber 0 のまま merge することへの違和感（trade-off として proposal で受容済み）
- payload 型の strict union vs generic mapped type は Open Question Q2。**recommendation**: mapped type で strict union にしておくと downstream subscriber が safe。`Payload<E extends DomainEvent>` + 各 event を keyof マップ化

### 4.5 `core/port/` (SessionClient / GitHubClient interface)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 10 | interface のみ。in-memory fake が adapter 側と独立に書ける |
| readability | 9 | port = interface declaration のみ |
| cohesion | 9 | 「core が外界に対してどう話すか」という 1 軸 |
| coupling | 10 | 依存ゼロ |
| reusability | 9 | 全 step + Pipeline + composition root から参照 |
| SRP | 10 | adapter 反転点 |

**懸念**:
- `SessionClient` interface に何を含めるかの設計責任。`createSession` / `sendEvents` / `streamEvents` / `pollUntilComplete` を含めると、既存の `src/sdk/sessions.ts` と `src/core/completion.ts` がほぼそのまま adapter に移動できる。**recommendation**: SDK API surface を 1:1 で映す薄い interface ではなく、step lifecycle が要求する高レベル method (`startSession({agent, environment, github}): Promise<{sessionId}>`, `streamEvents(sessionId)`, `sendUserMessage(sessionId, text)`, `pollUntilIdle(sessionId, opts)`) を提示する。さもなくば core 層が SDK 形状に張り付く

### 4.6 `adapter/anthropic/` (SessionClient impl, SDK 唯一の import)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 7 | SDK mock が必要。core の test は port を mock して bypass 可能なので adapter 単体 test だけ重い |
| readability | 8 | SDK 呼び出しが集約され、core 側がきれいになる |
| cohesion | 8 | 「Anthropic SDK との橋渡し」1 責務 |
| coupling | 7 | `@anthropic-ai/sdk` への依存集中点（意図通り） |
| reusability | 6 | 1 application で 1 instance が標準。再利用性は構造上低い（spec通り） |
| SRP | 8 | port interface の実装 1 責務 |

**懸念**:
- `src/core/session.ts` の SSE dispatcher が `core/tools/registry.ts:getHandler` をモジュールトップレベル import している。これを `adapter/anthropic/sse-stream.ts` へ移すと、tool handler の dispatch をどう受け取るか（callback 注入 / port 拡張）の設計判断が必要。**recommendation**: `streamEvents(sessionId, { onCustomToolUse(event) }): AsyncIterator<DomainStreamEvent>` のように callback で外注する。SSE 内部の handler lookup は core/step 側が `Step.toolHandlers` から提供する
- `src/core/completion.ts` の `pollUntilComplete` も SDK 直接利用しているので `adapter/anthropic/` 配下に移動候補

### 4.7 `adapter/github/` (GitHubClient impl)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 8 | fetch 注入で test 可。既存 `deps.githubFetch` パターンは adapter constructor 注入に置換 |
| readability | 8 | propose / spec-review 内に散在する GitHub fetch ロジックが集約される |
| cohesion | 9 | GitHub REST 1 責務 |
| coupling | 8 | fetch 依存のみ、`core/port/GitHubClient` を実装 |
| reusability | 9 | `verifyBranch`, `verifyChangeFolder`, `getRawFile` の 3 method がほぼ全 step 横断で使える |
| SRP | 9 | GitHub I/O 1 責務 |

**懸念**:
- 既存 propose.ts には branch-verify / change-folder-verify の inline fetch が 80 行ほどある（`propose.ts:249-368`）。これを GitHubClient に切り出すのは spec module-boundary の境界線を強くする良い機会
- spec-review の `fetchSpecReviewResult` (`spec-review.ts:57-109`) も GitHubClient.getRawFile に統合可能。retry policy（404 で 3 回 retry）は GitHubClient 内に隠蔽すべきか callee 側に残すかは判断必要。**recommendation**: GitHubClient は薄く保ち、retry は呼び元（StepExecutor or step impl）で表現。adapter の責務肥大を避ける

### 4.8 `store/` (JobStateStore + ConfigStore)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 8 | class 化で fs を fixture で差し替え可。tmp dir パターンが既存テストで実績 |
| readability | 9 | `load` / `persist` / `appendHistory` / `appendStepRun` の 4 method で意図明確 |
| cohesion | 9 | 「JobState 永続化」1 責務 |
| coupling | 7 | `util/atomic-write`, `util/xdg`, `state/schema` への依存。schema は `core/` から独立しているため向き正常 |
| reusability | 8 | StepExecutor / Pipeline / CLI 全層から参照される |
| SRP | 9 | persistence authority 1 責務 |

**懸念**:
- 既存 `src/state/store.ts` の export を maintaining して内部委譲する戦略 (tasks 2.9) は段階的移行に有用だが、**deprecation marker（jsdoc `@deprecated`）を必ず付ける**。完全削除は最終 commit (8.3) で判断
- `validateJobState` + `normalizeSteps` を `JobStateStore.load` 内から呼ぶ責務移譲は理にかなう。`state/schema.ts` を pure（validator + transform のみ）に保ち、副作用なし state を維持
- `ConfigStore` への言及は spec にあるが本 change の scope outside（D6 後続 request）。**recommendation**: `store/job-state-store.ts` のみ実装し、`store/config-store.ts` は placeholder 化または非作成。spec scope と一致させる

### 4.9 `cli/` (composition root + argv parser)

| 軸 | Score | 観察 |
|---|---|---|
| testability | 6 | composition root は test しにくい層。end-to-end test で代替（本 change は e2e scope outside） |
| readability | 8 | DI の配線が 1 箇所に集まり、依存関係が読み取りやすい |
| cohesion | 7 | 「CLI 起動」「argv parse」「DI 配線」の 3 責務だが、composition root としては妥当な集約 |
| coupling | 5 | 全層を import するが、これは composition root の本質（許容） |
| reusability | 5 | application entry なので再利用性低（妥当） |
| SRP | 7 | 「entry + 配線」のみに絞れていれば OK。business logic の混入を防ぐ |

**懸念**:
- 既存 `src/cli/` 内に既存ハンドラがあるはずなので、composition root だけで肥大しないよう `cli/wire.ts`（DI 構築）と `cli/commands/`（subcommand handlers）を分けることを検討
- `cli/wire.ts` で `JobStateStore` / `EventBus` / `SessionClient` (anthropic adapter) / `GitHubClient` / 各 Step instance / `StepExecutor` / `Pipeline` を構築する順序は依存関係順に固定する

---

## モジュール間 import direction rules（implementer 向け）

spec module-boundary の宣言を 1 表に整理（参考）:

| from \ to | core/* | core/port | adapter/* | store | util | cli |
|---|---|---|---|---|---|---|
| **core/pipeline** | step, event のみ | OK | NG | OK | OK | NG |
| **core/step** | event, agent | OK | NG | OK | OK | NG |
| **core/agent** | — | — | NG | NG | OK | NG |
| **core/event** | — | — | NG | NG | — | NG |
| **core/port** | — | — | NG | NG | — | NG |
| **adapter/anthropic** | NG | OK | — | NG | OK | NG |
| **adapter/github** | NG | OK | — | NG | OK | NG |
| **store** | NG | NG | NG | — | OK | NG |
| **cli** | OK | OK | OK | OK | OK | — |

CI gate（recommendation）:
- `grep -rE "from ['\"]@anthropic-ai/sdk" src/core/ src/store/ src/cli/` → 0 行
  - ただし cli は composition root として SDK type 経由の DI を行う場合があるので、`cli/wire.ts` のみ例外を許容するか判断
- `grep -rE "from ['\"](\\.\\./)*adapter/" src/core/ src/store/` → 0 行
- `grep -rE "from ['\"](\\.\\./)*core/(pipeline|step|agent|event)" src/adapter/` → 0 行（adapter は core/port のみ）

---

## 責務漏れ・モジュール越境の懸念

| # | 懸念 | 軸 | 推奨対応 |
|---|---|---|---|
| L1 | Pipeline class が `[iter N/M]` stdout を直接書く場合、I/O 副作用が core 層に残る | coupling / SRP | EventBus subscriber に逃がす（subscriber 0 のため当面は Pipeline class 内 stdout 許容、コメント明示） |
| L2 | StepExecutor が `EventBus` / `JobStateStore` / `SessionClient` の 3 依存に加え `step.toolHandlers` を SessionClient に渡す配線責務を持つ → 責務 4 つ | SRP | 妥当範囲。「lifecycle 管理」という上位責務で集約できる |
| L3 | `parseSpecReviewVerdict` (regex) と `fetchSpecReviewResult` (GitHub) を `SpecReviewStep` の同一ファイルに置くと cohesion が下がる可能性 | cohesion | step ごとにサブディレクトリ化する hybrid を推奨（4.2 参照）。フラット配置の場合でも、1 ファイル < 200 行を目安 |
| L4 | propose 固有の SSE 機構を `core/step/propose.ts` 内に閉じ込めると、core 層に SDK 直接利用が残る危険 | coupling | SSE は `adapter/anthropic/sse-stream.ts` に移し、`core/port/SessionClient` interface 経由でアクセス |
| L5 | `register_branch` handler が SSE dispatch 経由で呼ばれる — handler の dispatch 経路が adapter にあるが、handler 本体は step に同居 | coupling | `SessionClient.streamEvents` の callback として `step.toolHandlers` を渡す形が clean。adapter は dispatch のみ、handler 本体は step が所有 |
| L6 | `state/helpers.ts` を `core/` 配下から参照することは module-boundary 上 OK だが、新 `store/` 配下に move すべきか判断 | cohesion | `getLatestStepRun` / `pushStepRun` は pure transform。`store/job-state-store.ts` 内に private static method として吸収するか、`store/helpers.ts` として並置するかの 2 択。**recommendation**: store 内 private に閉じ、外部からは `JobStateStore` method 経由のみアクセス |
| L7 | `loop.ts:runLoopUntil` が `[iter N/M]` を直接 stdout する責務を `Pipeline` に吸収する際、history append 30+ 箇所も整理対象 | SRP / cohesion | 本 change scope では history append の bit-for-bit 維持が必須。EventBus subscriber 化は次 request |
| L8 | `core/types.ts:PipelineDeps` の `client: Anthropic` が `core` 全層に SDK 型を漏洩 | coupling | `PipelineDeps` から `client` を除き、`core/port/SessionClient` interface 経由のみに変更。composition root が adapter 実装を注入 |

---

## Notes (Out-of-Scope acknowledgements)

以下は本エージェントの分析対象外。Step 3 の architect / spec-reviewer / security-reviewer に委ねる:

- **extensibility**: 「次に何 step 追加されても拡張容易か」は将来予測を伴う
- **deployment independence**: モノレポ vs マルチパッケージのリリース戦略
- **security boundary**: GitHub token / Anthropic API key / state file の信頼境界。`adapter/github`, `adapter/anthropic` の責務として認識するが境界判定は security-reviewer
- **business domain boundary**: 「propose / spec-review / spec-fixer」は SpecRunner のドメイン語彙であり、ドメイン分割の妥当性判定はこのエージェントの責務外

## Greenfield 判定

該当なし。既存 168 テストを持つ live codebase に対する mechanical refactor のため、本分析は「既存パターンの集約候補」と「提案構造の機械的妥当性」を主軸とする。
