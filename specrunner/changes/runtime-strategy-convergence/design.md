# Design: RuntimeStrategy の whole-port 依存と移行 shim を撤去する

## Context

R1〜R2b で pipeline-step 層の `RuntimeStrategy` 直接依存は capability 単位まで縮小できた。`PipelineDeps` は `stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`, `changedFiles`, `commitInspection`, `revisionContent` の named capability フィールドを持ち、各 step・executor は RuntimeStrategy を直接参照しない。

しかし Command 層と composition root には、まだ以下の whole-port 依存が残っている。

- `CommandRunner` コンストラクタ: `RuntimeStrategy & PipelineDepsBuilder`
- `PipelineRunCommand` コンストラクタ: 同上
- `ResumeCommand` コンストラクタ: 同上
- `factory.ts` 戻り値: 同上
- `BootstrapResult.runtime`: 同上

また、10 個の optional メソッドがテスト fake 都合でオプショナルのまま残っており、production コードに以下の fail-open ガードが生まれている。

- `if (this.runtime.assertProviderReadiness)` — runner.ts:110
- `await this.runtime.assertNoDuplicateLiveJob?.()` — pipeline-run.ts:141
- `if (this.runtime.reloadJobState && ...)` — runner.ts:195
- `runtime.canDeriveChangedFiles?.()` — scope-check, executor, runtime-capability-gate

`RealRuntimeStrategy` 交差型が concrete runtime (LocalRuntime, ManagedRuntime) に対してコンパイル時強制をかけているが、port interface 自体は弱いまま。

2 個の Pick-based shim（`deriveCommitInspectionCapability`, `deriveRevisionContentCapability`）が optional メソッドを required capability に変換しているが、optional が解消されれば不要になる。

e2e テスト（`tests/pipeline-sole-committer-e2e.test.ts`）に `as unknown as RuntimeStrategy` が 2 箇所あり、capability slot に `as never` で再キャストして注入している。

---

## Goals / Non-Goals

**Goals**:
- Command 層が必要とする lifecycle 責務を named required capability interface で明示する
- `RuntimeStrategy & PipelineDepsBuilder` を 5 箇所の production site からゼロにする
- 10 個の optional メソッドをそれぞれの責務 interface で required にする
- `RealRuntimeStrategy` を削除する（optional hole 補完が不要になるため）
- `Pick<RuntimeStrategy, ...>` ベースの derive shim を削除する
- `as unknown as RuntimeStrategy` を typed capability object で置き換える
- Local / Managed 双方について contract test を追加する
- 再導入を防ぐ architecture ratchet test を追加する

**Non-Goals**:
- `LocalRuntime` / `ManagedRuntime` クラスの物理分割
- provider SDK・session lifecycle の再設計
- CommandSpec の整理、handler 抽出（R3）
- agent adapter/lifecycle 整理（R4）
- 新規 DI framework やservice locator の導入

---

## Decisions

### D1: 4 つの named lifecycle capability interface を定義する

`Pick<RuntimeStrategy, ...>` は禁止（要件§1）。代わりに、実際の lifecycle フェーズに対応する 4 つの named required interface を `src/core/port/command-runtime.ts` に定義する。

```
ProviderReadinessCapability
  assertProviderReadiness(env): Promise<void>   // required

JobBootstrapCapability
  assertNoDuplicateLiveJob(repoRoot, slug): Promise<void>   // required
  bootstrapJob(repoRoot, params): Promise<JobState>          // required

WorkspaceLifecycleCapability
  setupWorkspace(slug, jobId, opts?): Promise<WorkspaceContext>
  registerCleanup(jobId, startStep): CleanupHandle
  teardown(handle, finalStatus): Promise<void>

JobStatePersistenceCapability
  persistJobState(jobId, slug, workspace, state): Promise<void>
  reloadJobState(jobId, slug, workspace): Promise<JobState>  // required (not optional)
```

**Rationale**: 4 フェーズはそれぞれ独立したテストと置換が可能で、発見可能性が高い。単一の `CommandRuntime` 巨大 interface にまとめると whole-port と本質的に変わらない。  
**Alternatives considered**: `Pick` による切り出し（禁止）、全メソッドを単一 interface にまとめる（whole-port に逆戻り）。

### D2: CommandRunner とサブクラスが受け取る型を intersection に変更する

`CommandRunner` コンストラクタ:
```
ProviderReadinessCapability &
WorkspaceLifecycleCapability &
JobStatePersistenceCapability &
PipelineDepsBuilder
```

`PipelineRunCommand` はさらに `JobBootstrapCapability` が必要（`bootstrapJob`, `assertNoDuplicateLiveJob` を呼ぶ）。

`ResumeCommand` は `CommandRunner` と同じ（prepare() 内で bootstrap 呼び出しなし）。`RuntimeFacade` は受け取らない（未使用の `JobBootstrapCapability` / `ChangedFilesCapability` まで露出するため）。

consumer ごとの契約は Command 層が named composition として所有する:

- `CommandRunnerRuntime`（`src/core/command/runner.ts` で export）= `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`。`CommandRunner` と `ResumeCommand` のコンストラクタはこれを受け取る。
- `PipelineRunRuntime`（`src/core/command/pipeline-run.ts` で export）= `CommandRunnerRuntime & JobBootstrapCapability`。`PipelineRunCommand` のコンストラクタはこれを受け取る。`PipelineRunCommand` は `ChangedFilesCapability` を直接呼ばないため含めない。

composition root（factory, bootstrap）用に `RuntimeFacade` という名前付きエイリアスを定義し、全 4 lifecycle capability + PipelineDepsBuilder + ChangedFilesCapability の intersection とする（定義場所は domain 層の `src/core/runtime-facade.ts`）。LocalRuntime / ManagedRuntime は構造的に `RuntimeFacade` を満たす（TypeScript structural subtyping。明示的 `implements` は不要だが contract test でコンパイル時検証する）。

**Rationale**: orchestrator が複数 capability を合成して受け取ること自体は許容（要件§2）。各部分は目的が明確で小規模。  
**Alternatives considered**: consumer 側も `RuntimeFacade` で統一 → `ResumeCommand` が未使用 capability を含む型に依存し、issue の「未使用メソッドまで露出する巨大 port に戻さない」に反する（PR #1107 再レビュー blocking 1）。`RuntimeFacade` は composition root（factory / bootstrap）の戻り値・保持型に限定する。

### D3: `RuntimeStrategy` の optional メソッドをすべて required にする

10 個すべての optional メソッドから `?` を除去する。production runtimes は `RealRuntimeStrategy` により既に全実装済みなのでコンパイルエラーは発生しない。

`RealRuntimeStrategy` は optional hole 補完が不要になるため削除する。

`RuntimeStrategy` 自体は Command 層・composition root から import されなくなる。LocalRuntime / ManagedRuntime は `RuntimeStrategy` を implements できるが、これは各クラスの実装保証（self-assertion）であって Command 層の依存型ではない。このプロジェクトは外部 library として公開されていないため、deprecation compatibility type は不要。

**Rationale**: optional メソッドが required になれば production code の `?.` 存在確認ガードが不要になり、契約が明確になる。  
**Alternatives considered**: `RuntimeStrategy` を削除 → 影響範囲のリスクあり。clean にした上で import されなくなるのを ratchet で保証する方が安全。

### D4: Pick-based shim を削除し、`buildDeps()` で直接 capability を構築する

`deriveCommitInspectionCapability` と `deriveRevisionContentCapability` は、optional な RuntimeStrategy メソッドを required な capability に変換するためだけに存在する。メソッドが required になれば、`buildDeps()` 内で直接 bound method から capability object を構築できる。

`LocalRuntime.buildDeps()`:
```
commitInspection: { listCommitChangedFiles: this.listCommitChangedFiles.bind(this) }
revisionContent: { readRevisionContent: this.readRevisionContent.bind(this) }
```

`ManagedRuntime.buildDeps()` でも同様に直接構築する（ManagedRuntime の `listCommitChangedFiles` は常に `unavailable` を返す実装済み）。

**Rationale**: shim は optional の副作用。required になれば不要。  
**Alternatives considered**: shim を型シグネチャだけ変更して継続利用 → 削除の方がシンプルかつゴールに合致。

### D5: `ChangedFilesCapability.canDeriveChangedFiles` を required にする

`ChangedFilesCapability` 内の `canDeriveChangedFiles?()` から `?` を除去し required にする。

影響箇所:
- `src/core/step/scope-check.ts` → `deps.changedFiles.canDeriveChangedFiles?.()` を `deps.changedFiles.canDeriveChangedFiles()` に変更
- `src/core/step/executor.ts` → 同上
- `src/core/pipeline/runtime-capability-gate.ts` → `runtime.canDeriveChangedFiles?.()` を `runtime.canDeriveChangedFiles()` に変更。コメント内の "absent (undefined) → treated as derivable" 記述も更新

**Rationale**: LocalRuntime / ManagedRuntime は両方とも `canDeriveChangedFiles()` を実装済み。optional にしておく理由はテスト fake の都合だけである。  
**Alternatives considered**: `ChangedFilesCapability` を別 interface に分割 → 不要な複雑性。

### D6: `as unknown as RuntimeStrategy` を typed capability object で置換する

`tests/pipeline-sole-committer-e2e.test.ts` の 2 箇所は、`captureHeadSha`, `listWorktreeChanges`, `listChangedFiles`, `digestArtifacts`, `validateStepInputs`, `validateStepOutputs` だけを実装した partial object を `as unknown as RuntimeStrategy` でキャストし、さらに capability slot に `as never` で注入している。

修正後は capability interface ごとに typed object を構築する:
```typescript
const roundGitEffectsImpl: RoundGitEffectsCapability = {
  captureHeadSha: ...,
  listWorktreeChanges: ...,
  listChangedFiles: ...,
  digestArtifacts: ...,
  commitRoundArtifacts: ...,   // noopまたはvi.fn()
};

const stepIoImpl: StepIoValidationCapability = {
  validateStepInputs: ...,
  validateStepOutputs: ...,
  verifyFindingRefs: ...,       // noopまたはvi.fn()
};
```

これにより `as unknown as RuntimeStrategy` も `as never` も不要になる。

**Rationale**: テスト fakeは capability interface に対して直接構築すべき（要件§6）。  
**Alternatives considered**: fake builder helper を共通化 → 現時点では 2 箇所のみのため inline typed object で十分。規模が増えたら共通 builder を導入する（R3 以降）。

同型の whole-port fake は step executor テストにも残る（PR #1107 再レビュー blocking 2）。`tests/unit/step/executor-activation.test.ts`（`any` で受けた同一 object を `as never` で `stepArtifact` / `stepIo` / `changedFiles` に注入）、`executor-resume-context.test.ts`、`executor-verdict.test.ts`、`executor-no-op.test.ts`、`executor-drift-detection.test.ts`（`RuntimeStrategy` を import して全メソッドを実装した fake を `as never` で slot に注入）が対象。これらも slot ごとに `StepArtifactLifecycleCapability` / `StepIoValidationCapability` / `ChangedFilesCapability` 型の typed object へ分離し、テストが使わない command lifecycle / commit inspection / revision content 系メソッドを fake に持たせない。5 ファイルで重複する fake は `tests/unit/step/` 配下の typed builder/helper に集約してよい（production src には置かない）。`tests/pipeline-integration.test.ts` の `RuntimeStrategy` import（`ReturnType<RuntimeStrategy["registerCleanup"]>` の型参照のみ）は capability interface 由来の型に置き換え、whole-port import を残さない。

### D7: Architecture ratchet test を追加する

`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` に以下を assert するテストを追加する:

1. `src/` 配下の production ファイルに `RuntimeStrategy & PipelineDepsBuilder` が 0 件
2. `src/` 配下に `RealRuntimeStrategy` が 0 件
3. `src/` 配下に `Pick<RuntimeStrategy` が 0 件
4. `tests/` および `src/` の `__tests__/` 配下に `as unknown as RuntimeStrategy` が 0 件
5. `src/` 配下に `deriveCommitInspectionCapability|deriveRevisionContentCapability` の import/call が 0 件
6. `src/` 配下の production ファイル（`__tests__/` 除外）に `canDeriveChangedFiles?.` が 0 件（TypeScript 型システムは外側 `?.` により内側 `?.` を型エラーにしないため、ratchet で明示的に禁止する必要がある）
7. LocalRuntime と ManagedRuntime が `RuntimeFacade` を構造的に満たすこと（コンパイル時型検査として型代入 assertion を記述）

リテラル `RuntimeStrategy & PipelineDepsBuilder` の検出だけでは、`RuntimeStrategy` 単体 import・`any`・`as never` で構築した実質的な whole-port fake を検知できない（PR #1107 再レビュー blocking 2）。以下を追加する:

8. テストファイル全体（`tests/**` および `src/**/__tests__/**`。ratchet test 自身と `command-lifecycle-contract.test.ts` は除外）で、`RuntimeStrategy` を named import する `import type { ... RuntimeStrategy ... }` / `import { ... RuntimeStrategy ... }` が 0 件
9. `tests/unit/step/` 配下で、`PipelineDeps` / `StepDeps` の capability slot（`stepArtifact`, `stepIo`, `changedFiles`, `roundGitEffects`, `terminalState`, `commitInspection`, `revisionContent`）への `<identifier> as never` 注入が 0 件

**Rationale**: structural refactoring は時間経過で回帰しやすい。ratchet があれば CI が防衛線になる。  
**Alternatives considered**: ESLint custom rule → 導入コストが高い。ソースを読む vitest テストの方が軽量で実行可能。

---

## Risks / Trade-offs

**[Risk] ManagedRuntime.reloadJobState は throw を維持する**
`reloadJobState` を required にするが、ManagedRuntime の実装は引き続き `throw new Error("not implemented for managed runtime")` である。runner.ts の条件 `workspaceOpts.existingWorktreePath === undefined` は **新規 run** の条件（resume 時は `existingWorktreePath !== undefined`）であり、managed 新規 run では `reloadJobState` が実装済み（throw する）かつ `existingWorktreePath === undefined` が true になるため、現行コードでは既に throw が発生する経路が存在する。この throw は catch ブロックで捕捉され RELOAD_FAILED で job が失敗する。T-04 の変更はこの挙動に対して behavior-preserving である（`this.runtime.reloadJobState &&` の存在確認ガードを除去するだけで、スキップ条件 `workspaceOpts.existingWorktreePath === undefined` は維持される）。なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった。
*Mitigation*: managed runtime での新規 run は reloadJobState throw → RELOAD_FAILED となる挙動を contract test (T-12) で明示する。managed resume の実装時に reloadJobState の managed 対応（store から読み込む実装）も必要。

**[Risk] 広い surface 変更**
CommandRunner / PipelineRunCommand / ResumeCommand / factory / bootstrap / local / managed / runtime-strategy / e2e test を同時に変更する。型エラーが連鎖しやすい。
*Mitigation*: タスクの順序を「interface 定義 → factory/bootstrap → CommandRunner → subclasses → RuntimeStrategy optional 除去 → shim 削除 → test 修正」とし、各タスクで typecheck が通ることを確認する。

**[Risk] テスト fake が RuntimeStrategy 型を使っている箇所が T-01 の audit で追加判明する可能性**
既知の 2 件以外にも `as unknown as RuntimeStrategy` や `as RuntimeStrategy` のキャストがあった場合、T-10 の作業量が増える。
*Mitigation*: T-01 で全 grep を事前に実施し、実際の影響ファイルを確定してから T-04 以降に着手する。

---

## Open Questions

なし。要件が具体的で、すべての実装判断（命名、ファイル分割、shim の置換方法）は上記決定で解決済み。
