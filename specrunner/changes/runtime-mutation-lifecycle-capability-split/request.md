# RuntimeStrategy の mutation / lifecycle consumer を use-case capability へ分割する

## Meta

- **type**: refactoring
- **slug**: runtime-mutation-lifecycle-capability-split
- **base-branch**: main
- **adr**: false

## 前提

R2a の Issue #1101 / PR #1102 は `main@660d48fb` にマージ済みである。

R2a では read-only leaf consumer を `ChangedFilesCapability`、`CommitInspectionCapability`、`RevisionContentCapability` 等へ分割した。一方、mutation / lifecycle を扱う orchestration consumer は、引き続き `RuntimeStrategy` facade 全体へ依存している。

## 背景

現在の `RuntimeStrategy` は、少なくとも次の異なる責務を同じ契約で提供している。

- provider readiness / duplicate-job guard
- job bootstrap / persist / reload
- workspace setup / cleanup registration / teardown
- agent runner / pipeline dependency assembly
- step artifact prepare / validation / finalize
- pipeline terminal commit
- parallel round の worktree inspection / scoped commit

その結果、`CommandRunner`、`PipelineRunCommand`、`PipelineDeps`、`StepExecutor`、`ParallelReviewRound`、terminal pipeline などが、実際に使用する能力より広い facade を認識している。

また、port→domain import cycle を避けるために次の mutation 境界が `unknown` と cast に依存している。

- `buildDeps(...): unknown` と caller の `as PipelineDeps`
- `finalizeStepArtifacts(step: unknown, deps: unknown, commitPushInfra: unknown)`
- `commitFinalState(deps: unknown, state: unknown)`
- `commitRoundArtifacts(..., commitPushInfra: unknown, egressParams?: unknown)`
- Local runtime 側の `CommitPushInfra` / egress params への復元 cast

これは「どの use case が何を変更できるか」と「runtime が実際に必要とする入力」を型で表現できず、test fake と変更影響を広げる。

## 目的

mutation / lifecycle を使う production consumer が、巨大な `RuntimeStrategy` 全体ではなく、自身の use case に必要な最小 capability に依存する構造へ変更する。

同時に、domain object を port 層へ `unknown` として渡して runtime 実装内で復元する境界を、consumer-owned interface または domain-neutral DTO に置き換える。

`LocalRuntime` / `ManagedRuntime` は composition root 向け facade として維持する。今回、facade 自体の廃止や全 production import の除去までは行わない。

## Requirements

### 1. mutation / lifecycle の利用箇所を use case 単位で分割する

少なくとも以下の consumer と呼び出し経路を調査し、必要な最小 capability を定義する。

- command lifecycle
  - `src/core/command/runner.ts`
  - `src/core/command/pipeline-run.ts`
  - run / resume / attach / archive の workspace entrypoint
- pipeline dependency assembly
  - `RuntimeStrategy.buildDeps`
  - `src/core/types.ts` の `PipelineDeps.runtimeStrategy`
- step lifecycle
  - `src/core/step/executor.ts`
- pipeline terminal state
  - `src/core/pipeline/pipeline.ts`
  - halt/finalize path からの `commitFinalState`
- coordinator-owned git effects
  - `src/core/pipeline/parallel-review-round.ts`

capability の名称・個数・配置は consumer の責務境界から決めること。例として以下の境界が考えられるが、単一の `MutationRuntimeStrategy` に全メソッドを詰め替えてはならない。

- provider readiness
- job state lifecycle
- workspace lifecycle
- pipeline dependency / agent runner construction
- step I/O validation
- step artifact lifecycle
- terminal state publication
- round-owned git effects

### 2. capability は consumer-owned な required contract とする

- capability の method は原則 required とする
- 能力不在が既存の意味として必要な箇所は、method optional ではなく注入値の `Capability | undefined` で表現する
- facade から capability を導出する場合は、R2a と同様に bind 済み helper または明示 adapter を使用する
- production contract を test fake の都合で optional にしない
- `Pick<RuntimeStrategy, ...>` を増やして facade 依存を隠さない
- 新しい capability を合成する箇所でも、実際に不要な method を consumer に見せない

### 3. mutation 境界の `unknown` を具体的な入力へ置き換える

少なくとも以下の対象 signature から、domain payload を表す `unknown` と復元 cast を除去する。

- `buildDeps`
- `finalizeStepArtifacts`
- `commitFinalState`
- `commitRoundArtifacts`

実装方針は次のいずれか、または同等に依存方向を守るものとする。

- consumer 側が必要最小限の interface を所有する
- port 層が domain-neutral DTO を受け取る
- orchestration を consumer 側へ戻し、runtime には狭い mutation primitive だけを渡す
- composition root で typed builder / adapter を組み立てる

以下は禁止する。

- `AgentStep` / `PipelineDeps` / `CommitPushInfra` 全体を別名の `unknown` や broad object として渡す
- `as unknown as RuntimeStrategy` や同等の二段 cast を追加する
- port→domain value import cycle を作る
- Local/Managed の差を consumer 側の runtime kind 分岐として再導入する

`query(): AsyncGenerator<unknown>` など、mutation lifecycle の domain payload ではない `unknown` は本Issueで一律ゼロにしなくてよい。対象と非対象をPR本文で区別すること。

### 4. `PipelineDeps` に facade 全体を再注入しない

`PipelineDeps.runtimeStrategy?: RuntimeStrategy` をそのまま mutation consumer の共有サービスロケータとして使い続けない。

step executor、terminal pipeline、parallel round 等には、それぞれ必要な capability だけを注入する。複数 capability が必要な orchestration では明示的に合成してよいが、R2a の read-only capability を再び full facade に戻さないこと。

### 5. command lifecycle の順序と失敗境界を維持する

次の観測可能な振る舞いを変えない。

- provider readiness は `prepare()` より前に評価され、失敗時は job state / worktree / branch / journal を作らない
- duplicate-job guard は `bootstrapJob` より前に評価される
- `bootstrapJob` 自体は永続化せず、初期永続化は workspace setup 後に行う
- 新規 run は setup 後に canonical store から reload し、resume の existing-worktree path は現在どおり reload を省略する
- workspace setup failure は cleanup handle 作成前に failed state を persist する
- dependency assembly と cleanup registration の順序を維持する
- cleanup handle の登録・解除、signal handling、terminal status に応じた teardown の意味を変えない
- setup / teardown の実行回数と error handling を変えない

### 6. step / commit lifecycle の順序と所有権を維持する

次を executable test で固定する。

- output template prepare、required-input validation、agent execution、output validation、finalize の現在の順序
- main-checkout guard の before/after snapshot と現在の fail-open 条件
- sequential step の finalize は現在どおり serialize される
- `roundOwnsGitEffects` の member step は `finalizeStepArtifacts` を呼ばない
- step finalize は output template cleanup 後に commit/push する
- synthesized commit は push より前に persist される
- push failure 後も egress ledger が resume を妨げない
- terminal commit の checkpoint / finalize message、管理対象 path、best-effort/no-throw semantics
- parallel round は worktree inspection 後、declared output のみを scoped stage/commit する
- `stagingExcludePatterns`、write-scope violation、HEAD advancement、round commit OID 記録の意味を変えない
- Managed runtime の既存 no-op / unavailable / fail-closed semantics を変えない

### 7. runtime facade と concrete runtime の接続を維持する

- `LocalRuntime` / `ManagedRuntime` は composition root で既存 facade と必要な capability を提供する
- runtime factory / provider selection を変更しない
- Local/Managed contract test で capability ごとの意味を固定する
- capability 不在を許容する経路には negative contract test または同等の compile-time proof を置く
- test fake は対象 capability だけで構築できるようにする

### 8. アーキテクチャ文書を追従させる

`architecture/components.md` 等を更新し、以下を明示する。

- `RuntimeStrategy` は composition root 向け facade
- read-only leaf capability は R2a、mutation / lifecycle capability は本Issueの consumer が所有する
- `PipelineDeps` は runtime facade の service locator ではない
- mutation port は domain-neutral input だけを受け取る
- Local/Managed の振る舞い差は concrete runtime / adapter 側に閉じる

新レイヤーや外部公開契約が必要にならない限り ADR は不要とする。

## Non-goals

- `RuntimeStrategy` facade の廃止（R2c）
- production の全 `RuntimeStrategy` import をゼロにすること（R2c）
- runtime class の物理的な全面分割
- provider SDK / dependency version の変更
- agent runner の session/retry/lifecycle 再設計
- Local/Managed の機能差の解消
- CLI/UI の機能追加またはユーザー向け挙動変更
- unused method の一括削除
- bite-evidence / isolated test execution の再導入
- R2a capability の再設計

## Acceptance Criteria

- [ ] 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない
- [ ] `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない
- [ ] capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない
- [ ] capability method は required で、能力不在は注入値で表現される
- [ ] `buildDeps` / `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` の対象 payload signature に domain object を表す `unknown` が残らない
- [ ] 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される
- [ ] 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない
- [ ] R2a の read-only leaf consumer が full facade 依存へ戻っていない
- [ ] command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される
- [ ] Local/Managed capability contract test、または同等の executable proof がある
- [ ] architecture 文書が実装後の責務と依存方向に一致する
- [ ] SpecRunner verification が green（PR上の既存証跡を正本とし、同一の test / lint / typecheck をレビュー側で重複実行しない）
- [ ] 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない

## 実測

PR本文に、集計条件とともに before/after を記録する。

基準: `main@660d48fb`（PR #1102 merge commit）

R2a完了時点の既知 baseline:

- `src/core/port/runtime-strategy.ts`: 875 lines
- base `RuntimeStrategy`: 28 methods
- 同ファイル内の `unknown` token: 21
- production の `RuntimeStrategy` import: 12 files
- `as unknown as RuntimeStrategy`: 4 occurrences（すべて対象外の full-pipeline e2e mock）

追加で少なくとも以下を計測する。

- mutation / lifecycle 対象の full-interface consumer 数
- `PipelineDeps.runtimeStrategy` を参照する production consumer 数
- 対象4 signature 内の domain-payload `unknown` 数
- `as PipelineDeps` / `as CommitPushInfra` / egress params 復元 cast 数
- capability ごとの production consumer 数
- capability ごとの test fake / contract test 数

本Issueで facade method 数や全 production import をゼロにすることは要求しない。ただし、対象 consumer の full-interface 依存、domain-payload `unknown`、対象 cast は単調減少し、追加しないこと。

## Stop Conditions

以下が必要になった時点で実装を止め、Issueへ観測事実・影響・選択肢を報告する。

- lifecycle の順序、永続化 authority、cleanup ownership を変更しないと分割できない
- Local/Managed の既存 semantics を変更する必要がある
- domain-neutral DTO では情報を保てず、domain ownership 自体の移動が必要
- `RuntimeStrategy` facade の廃止を同時に行わないと成立しない
- agent runner の provider/session/retry lifecycle 変更が必要
- 新しい architecture layer、public API、plugin contract、ADR が必要
- scope 外の機能不具合または仕様矛盾が見つかった
