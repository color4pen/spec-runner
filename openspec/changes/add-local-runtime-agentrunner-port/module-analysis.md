# Module Analysis: add-local-runtime-agentrunner-port

機械的軸（testability / readability / cohesion / coupling / reusability / SRP）による Step 2.5 分析。設計（design.md）と既存コード（`src/core/step/executor.ts`, `src/core/step/executor-helpers.ts`, `src/core/port/session-client.ts`, `src/core/tools/register-branch.ts`）を対象とする。

## 1. 既存コードパターン一覧

- **Port/Adapter パターン (hexagonal-lite)**: `src/core/port/session-client.ts` / `src/core/port/github-client.ts` が interface、`src/adapter/anthropic/`, `src/adapter/github/` が実装。`module-boundary` spec が `grep -rE "from ['\"](\.\./)*adapter/" src/core/` 0 マッチを invariant 化済み。
- **StepExecutor の kind 分岐 → 内部 3 ヘルパー**: `runStepInternal` が `step.kind === "cli"` / propose-style（`toolHandlers` 有り）/ polling-style に dispatch する 3 経路構造。propose-style と polling-style は session 作成 → message 送信 → 完了待機 → result fetch のステップ列が概ね一致するが、別関数として展開され重複する。
- **error-handling 一貫パターン**: `executor-helpers.ts` の 5 ヘルパー（`createSessionWithHistory`, `recordFailedStepResult`, `attachStateAndRethrow`, `throwWrappedError`, `failStepWithError`）に集約済み。executor 本体内では `try → store.fail → recordFailedStepResult → store.persist → attachStateAndRethrow / throwWrappedError` の 4 ステップが反復。
- **history append のテンプレート化**: `await store.appendHistory(state, { ts, step, status, message })` が executor.ts 内で 20+ 箇所、毎回 ISO timestamp / step ラベル / status を組み立てる。共通ヘルパー化されていない。
- **Custom Tool 定義**: `defineCustomTool` factory + colocated handler （`src/core/tools/register-branch.ts`）。SSE callback (`onBranchRegistered`, `onSlugRegistered`) 経由で executor に通知される間接インターフェース。
- **PipelineDeps による依存注入**: `core/types.ts` の `PipelineDeps` が `client / githubClient / config / repo / request / slug / sleepFn / cwd` を bundle。step.buildMessage / step.parseResult / step.run / step.resultFilePath すべてに同じ deps が流れる。

## 2. 共通化すべき箇所と理由

| # | 対象 | 軸 | 観測根拠 | 推奨 |
|---|------|---|---------|------|
| C1 | propose-style と polling-style の session lifecycle | reusability | `executor.ts:205-431` (propose) と `:503-782` (polling) は両方 `createSession → sendMessage/SSE → poll → fetch resultFile → parseResult` を実装。session 確立と branch 検証以外は同じ骨格 | `ManagedAgentRunner.run()` への移植時に、内部を `createSession → exchange (SSE or polling) → verify → fetchResult` の単一フロー＋ exchange 戦略の差し替えにまとめる。propose / polling の 2 関数並列維持は cohesion を下げる |
| C2 | `appendHistory` 呼び出しテンプレート | readability | executor.ts 内 20+ 箇所で同一 shape の object literal | `store.appendHistory(state, stepLabel, status, message)` の薄い helper（または Logger-style facade）を `executor-helpers.ts` に追加。adapter 移植時に history label の owner が adapter 側になるため、helper を adapter 側にも露出する設計が必要 |
| C3 | result file fetch の runtime 分岐 | reusability + coupling | `verifyChangeFolderViaPort` / `getRawFile` が GitHub API 前提。local では `fs.readFile` になる。design.md D2 で AgentRunResult.resultContent に集約済みだが、両 adapter 内に「path 解決 → 取得 → null 判定 → not-found error 構築」が重複しがち | `AgentRunner` 直下に共通の `ResultFetcher` 内部 helper を切り出すか、最低限「`step.resultFilePath(state, deps)` の null 判定と not-found error 構築」は port / type レベル（`agent-runner.ts` 内 utility）に上げる |
| C4 | branch 検証 vs change folder 検証 | SRP | `executor.ts:436-497` 両 helper は GitHub API 1 回打つだけだが、`verifyChangeFolderViaPort` 内で `appendHistory` + `store.fail` + `attachStateAndRethrow` が混在し、純粋検証関数 + 副作用関数が癒合 | adapter 移植時に「pure check (branch exists?: bool)」「diagnostic build (error info)」「state mutation (fail/append)」の 3 層に分離する。pure check 部分は両 adapter で署名共通化可能 |
| C5 | Branch validation under both runtimes | reusability | managed: `githubClient.verifyBranch` (HTTP) / local: `git branch --list <name>` + `fs.existsSync`。intent は同じ「期待 branch / file 存在確認」 | `AgentRunner` interface とは別に、内部 `BranchVerifier` / `PathVerifier` を adapter ごとに実装する小 port を切る案を検討。design.md は `D2` で「将来 helper 抽出可能」と明記しており、最初から helper にしておく方が test 容易 |

## 3. 既存ヘルパー / ユーティリティの活用候補

- **`executor-helpers.ts` の 5 ヘルパーは AgentRunner adapter から再利用すべき**（reusability）。Phase 1 の rename / move に伴い、helper の所属層を再検討する必要がある:
  - `createSessionWithHistory` は **propose-style 専用**（`stepLabel: "session-create"` 固定）。polling-style では別 inline 実装になっており非対称。adapter 移植時に「propose / polling 共通の session ヘルパー」に書き直す機会
  - `recordFailedStepResult` / `attachStateAndRethrow` / `throwWrappedError` / `failStepWithError` は core 側 step lifecycle に閉じる責務。adapter からは原則使わず、adapter は `AgentRunResult { completionReason: "error", error }` を返して core 側で error path を回す（design.md D5 の趣旨と整合）
- **`stripBranchPrefix` (`src/state/job-slug.ts`)**: register_branch handler 内で slug 派生に使用。local runtime では branch CLI 主導なので不要だが、agent 申告 branch との不一致 detection 時に再利用可能
- **`defineCustomTool` factory**: managed-agent adapter に register_branch を移しても継続利用可能。tool definition の input_schema 不変性（spec の "input_schema for register_branch is unchanged" Scenario）を担保するため、factory 経由で定義する規律は維持
- **`PipelineDeps`**: `AgentRunContext` の field 群と高い重複（`config` / `slug` / `cwd` など）。design.md D1 では separate type だが、`AgentRunContext` を `PipelineDeps & { step, branch, requestContent, emit }` の交差型にすれば DRY。ただし AgentRunContext は port 層の型であり、cli 層の `PipelineDeps` を import すると依存方向が逆転する点に注意（推奨: 共通の base type を `core/port/types.ts` 等に切り出す）

## 4. 分割単位の推奨

### 4-A. AgentRunner port の interface design（cohesion / SRP）

**懸念**: `AgentRunner.run()` 単一メソッド設計（D1）は cohesion を高める一方、**run() 内で「session 確立 / message 送信 / 完了待機 / branch 検証 / path 検証 / result fetch / register_branch 注入」の 7 責務が adapter 内部に閉じてしまう**。design.md は "trade-off: AgentRunner の責務は若干広い" と認識しているが、`ManagedAgentRunner.run()` は ~250 LOC 規模になる見込みで、現状 executor.ts が抱えている cohesion 問題が単純に adapter に移動するだけになるリスク。

**推奨**:
- adapter 内部で run() を **private 4-stage helper** に分割: `prepareSession` / `exchange` (SSE or polling) / `verifyArtifacts` (branch + path) / `fetchResult`。これは port の interface ではなく adapter 内部実装の分割なので公開 API は単一メソッドのまま、internal cohesion を担保
- ClaudeCodeRunner も同じ 4-stage 構造で書く（exchange は `query()` 1 回 / verifyArtifacts は git + fs / fetchResult は fs.readFile）と、両 adapter の **構造的相同性** が保たれ、後で sub-port 抽出が容易

### 4-B. register_branch を managed-agent adapter に閉じ込めることの testability 影響（testability）

**懸念**: design.md D3 で register_branch を `src/adapter/managed-agent/tools/` に移動するが、現状 `src/core/tools/register-branch.ts` の単体テスト（TC-127, TC-128, TC-146 言及あり）は core 配下で書かれている可能性が高い。adapter 配下に移動した時点で:
1. core 層のテストから tool handler を直接 import する経路が `module-boundary` 違反 (`core` from `adapter`) になる
2. tool definition の input_schema 不変性 Scenario（"input_schema for register_branch is unchanged"）の検証は **adapter の単体テスト** として書く必要があるが、adapter 配下のテストは現状少ない

**推奨**:
- register_branch の単体テスト（input validation / slug derivation / last-write-wins）は adapter 配下にコロケート（`src/adapter/managed-agent/tools/register-branch.test.ts`）。move と同 PR で test も同居 move
- input_schema 不変性は **snapshot test**（JSON serialize → 期待値比較）として明示的に書く。tasks.md には対応する task が無く、Phase 1.5 として追加推奨

### 4-C. AgentRunContext の `state` field と `branch` field の重複（SRP / readability）

**懸念**: `AgentRunContext.state: JobState` は `state.branch` を持ち得るが、別途 `AgentRunContext.branch: string` がある。design.md D4 は「CLI 主導 branch を canonical」とするためだが、adapter 実装で `ctx.state.branch` と `ctx.branch` の優先順位が混乱しやすい。

**推奨**:
- spec の `branch-registration` Scenario「CLI canonical branch (feat/foo) differs from agent-reported branch (feat/other)」を実装する際、**adapter は `ctx.branch` のみを使う、`ctx.state.branch` は読み取らない（CLI 値が canonical）** をコメントとして明文化
- 可能なら `AgentRunContext` から `state.branch` を露出しない subset 型（`Omit<JobState, "branch">` 相当）を渡す案も検討。ただし現状 history append で state 全体が必要なので過剰設計の懸念あり

### 4-D. StepExecutor から SessionClient 直接依存撤去（coupling / SRP）

**懸念**: tasks.md 1.6「SessionClient の直接依存を撤去」が `PipelineDeps` 型からの `client: SessionClient` 削除まで及ぶか不明。`PipelineDeps` は `core/types.ts` に定義され step.buildMessage / step.parseResult にも流れるが、step 実装は通常 client を使わない。**`PipelineDeps` の `client` field は executor からは使わなくなるが、step / 他経路で参照される場合 grep ベース invariant が漏れる**。

**推奨**:
- Phase 1.6 で `PipelineDeps` を `client` 必須から optional に変更（`client?: SessionClient`）し、`runtime === "local"` で undefined を許容
- もしくは `PipelineDeps` から `client` を削除し、必要な adapter（managed の AgentSyncer など）には個別に注入する構造に変更
- **invariant**: `grep -rE "deps\.client" src/core/step/` で executor / step 配下で 0 マッチを CI gate に追加

### 4-E. Phase 4 の guard 重複（cohesion）

**懸念**: tasks.md 4.6 で `ClaudeCodeRunner` に `requiresCommit` guard（`git rev-parse` で HEAD 不変検出）を実装する。しかし executor.ts:677-701 に既に **管理側** の `requiresCommit` guard が存在し、`githubClient.getRefSha` で同等チェックをしている。

**推奨**:
- design.md は AgentRunner adapter 内に branch / path verification を吸収（D5）するため、**`requiresCommit` guard も adapter に移すべき**。executor.ts:677-701 のロジックは ManagedAgentRunner 内に移動し、ClaudeCodeRunner は同等を `git rev-parse` で実装する
- 現状の executor.ts の guard が core 層に残ったまま新 guard が adapter 側に追加されると、**同じ責務が 2 層に分裂**し SRP 違反かつ将来の保守性を悪化させる
- `step.requiresCommit` フラグは port を跨いで両 adapter が読む共通契約として残す（AgentStep 型上で維持）

## Notes

- **Out-of-Scope**: extensibility / business domain boundary / security boundary / deployment independence は本分析の対象外（architect / security-reviewer 領域）

## 主要懸念点（要約）

1. AgentRunner.run() の責務集約による cohesion リスク → adapter 内部で 4-stage 分割を推奨
2. register_branch の testability 影響 → 単体テストを adapter 配下にコロケート、input_schema snapshot test を Phase 1.5 として追加
3. `requiresCommit` guard の二重化リスク → 両 adapter 内に集約、executor.ts:677-701 を移動
4. PipelineDeps.client の coupling 残存 → optional 化または削除 + grep invariant 追加
5. propose-style と polling-style の重複展開を adapter に持ち越すリスク → 単一フロー + exchange 戦略差し替えに統合推奨
