# Spec: RuntimeStrategy の whole-port 依存と移行 shim を撤去する

## Requirements

### Requirement: Provider readiness は副作用より前に無条件で実行される

`CommandRunner.execute()` SHALL call `assertProviderReadiness(env)` directly, without an existence check, before `prepare()` runs. これにより、ジョブ状態・ワークツリー・ブランチ・ジャーナルが生成される前に provider の準備不足が検出される。実装は `ProviderReadinessCapability` という named required interface として定義され、optional method による存在確認が不要になる。

`CommandRunner` の `runtime` 引数は `ProviderReadinessCapability` を含む intersection 型を要求する。`assertProviderReadiness` が存在しない型を渡した場合、TypeScript のコンパイル時エラーとなる。

#### Scenario: provider readiness チェックが prepare() より前に無条件で呼ばれる

**Given** `CommandRunner.execute()` が呼ばれる
**When** `ProviderReadinessCapability` を満たす runtime が渡されている
**Then** `assertProviderReadiness(env)` が `prepare()` より先に呼ばれ、if チェックや `?.` なしに await される

#### Scenario: provider readiness が型的に required である

**Given** `CommandRunner` コンストラクタに `assertProviderReadiness` を持たないオブジェクトを渡そうとする
**When** TypeScript コンパイルを実行する
**Then** コンパイルエラーが発生し、runtime 生成以前に設計違反が検出される

---

### Requirement: Duplicate live-job guard は bootstrapJob より前に無条件で実行される

`PipelineRunCommand.prepare()` MUST call `assertNoDuplicateLiveJob(repoRoot, slug)` without optional chaining, before `bootstrapJob(...)` is invoked. これにより、重複 job のチェックが常に行われ、ジョブ状態が生成される前に SLUG_OCCUPIED が検出される。

`JobBootstrapCapability` は `assertNoDuplicateLiveJob` と `bootstrapJob` を両方 required として定義する。`PipelineRunCommand` の `runtime` 引数はこの interface を含む intersection 型を要求する。

#### Scenario: assertNoDuplicateLiveJob が bootstrapJob より前に無条件で呼ばれる

**Given** `PipelineRunCommand.prepare()` が呼ばれる
**When** `JobBootstrapCapability` を満たす runtime が渡されている
**Then** `assertNoDuplicateLiveJob(repoRoot, slug)` が `bootstrapJob(...)` より先に `?.` なしに await される

---

### Requirement: setupWorkspace 後の state reload は skip 条件が維持されつつ無条件で呼ばれる

`CommandRunner.execute()` SHALL call `reloadJobState(jobId, slug, workspace)` directly after `setupWorkspace()` succeeds on the run path (`existingWorktreePath === undefined`), without a method-existence guard. resume path（`existingWorktreePath` が設定されている場合）では呼ばない。

`JobStatePersistenceCapability` は `persistJobState` と `reloadJobState` を両方 required として定義する。

#### Scenario: run path では reloadJobState が無条件で呼ばれる

**Given** `workspaceOpts.existingWorktreePath` が `undefined` である（新規 run path）
**When** `setupWorkspace()` が成功する
**Then** `reloadJobState(jobId, slug, workspace)` がメソッド存在確認なしに await される

#### Scenario: resume path では reloadJobState がスキップされる

**Given** `workspaceOpts.existingWorktreePath` が設定されている（resume path）
**When** `setupWorkspace()` が成功する
**Then** `reloadJobState` は呼ばれない

---

### Requirement: `canDeriveChangedFiles` は required method として直接呼ばれる

`ChangedFilesCapability.canDeriveChangedFiles` MUST be a required (non-optional) method. scope-check、executor、runtime-capability-gate のすべての呼び出し箇所で `?.` なしに呼ばれる。`changedFiles` フィールド自体が `undefined` の場合のガード（capability absence）はこれとは別に維持される。

#### Scenario: scope-check が canDeriveChangedFiles を直接呼ぶ

**Given** `deps.changedFiles` が `ChangedFilesCapability` を実装したオブジェクトである
**When** scope-check が changed-files derivation の可否を確認する
**Then** `deps.changedFiles.canDeriveChangedFiles()` が `?.` なしに呼ばれる

#### Scenario: runtime-capability-gate が canDeriveChangedFiles を直接呼ぶ

**Given** `descriptor.permissionScope` が設定されている
**When** `assertRuntimeSupportsScope(descriptor, runtime)` が呼ばれる
**Then** `runtime.canDeriveChangedFiles()` が `?.` なしに呼ばれ、結果が `false` なら `UnsupportedRuntimeCapabilityError` が throw される

---

### Requirement: production コードは `RuntimeStrategy & PipelineDepsBuilder` を参照しない

Production command-layer files (`CommandRunner`, `PipelineRunCommand`, `ResumeCommand`, `factory.ts`, `BootstrapResult`) SHALL NOT reference `RuntimeStrategy & PipelineDepsBuilder`. They MUST instead use explicit compositions of `ProviderReadinessCapability`、`JobBootstrapCapability`、`WorkspaceLifecycleCapability`、`JobStatePersistenceCapability`、`PipelineDepsBuilder`。

#### Scenario: production ソースに RuntimeStrategy & PipelineDepsBuilder が存在しない

**Given** リポジトリの `src/` 配下の TypeScript ファイルをすべてスキャンする
**When** `RuntimeStrategy & PipelineDepsBuilder` というテキストを grep する
**Then** 一致が 0 件である

---

### Requirement: `RealRuntimeStrategy` は production から撤去される

The `RealRuntimeStrategy` type alias MUST be removed from `runtime-strategy.ts`. optional hole 補完が必要だった理由は RuntimeStrategy interface 自体のメソッドを required にすることで解消される。

#### Scenario: RealRuntimeStrategy が存在しない

**Given** リポジトリの `src/` 配下の TypeScript ファイルをすべてスキャンする
**When** `RealRuntimeStrategy` というテキストを grep する
**Then** 一致が 0 件である

---

### Requirement: Pick-based derive shim が production から撤去される

`deriveCommitInspectionCapability` and `deriveRevisionContentCapability` SHALL be removed from `runtime-strategy.ts`. `buildDeps()` での capability 構築は直接 bound method から行われなければならない。`Pick<RuntimeStrategy, ...>` パターンは production ソースに存在してはならない。

#### Scenario: Pick-based derive shim が存在しない

**Given** リポジトリの `src/` 配下の TypeScript ファイルをすべてスキャンする
**When** `deriveCommitInspectionCapability` または `deriveRevisionContentCapability` を grep する
**Then** 一致が 0 件である

#### Scenario: Pick<RuntimeStrategy が存在しない

**Given** リポジトリの `src/` 配下の TypeScript ファイルをすべてスキャンする
**When** `Pick<RuntimeStrategy` を grep する
**Then** 一致が 0 件である

---

### Requirement: テスト fake の double cast が typed capability object で置換される

Test fakes injected into `PipelineDeps` capability slots MUST be typed directly against the capability interface they satisfy (`RoundGitEffectsCapability`、`StepIoValidationCapability` など). `as unknown as RuntimeStrategy` という double cast SHALL NOT appear in any test file.

#### Scenario: as unknown as RuntimeStrategy が存在しない

**Given** `tests/` および `src/**/__tests__/` 配下の TypeScript ファイルをすべてスキャンする
**When** `as unknown as RuntimeStrategy` を grep する
**Then** 一致が 0 件である

#### Scenario: step executor テストが slot ごとの typed object を注入する

**Given** `tests/unit/step/executor-activation.test.ts`、`executor-resume-context.test.ts`、`executor-verdict.test.ts`、`executor-no-op.test.ts`、`executor-drift-detection.test.ts` を検査する
**When** `stepArtifact` / `stepIo` / `changedFiles` slot への注入方法を確認する
**Then** 各 slot に `StepArtifactLifecycleCapability` / `StepIoValidationCapability` / `ChangedFilesCapability` 型として構築された typed object が注入されており、`RuntimeStrategy` の import、`any` 型の runtime 引数、slot への `as never` キャストが存在しない

#### Scenario: テストファイルに whole-port RuntimeStrategy import が存在しない

**Given** `tests/` および `src/**/__tests__/` 配下の TypeScript ファイルをすべてスキャンする（ratchet test 自身と `command-lifecycle-contract.test.ts` を除く）
**When** `RuntimeStrategy` を named import する import 文を検索する
**Then** 一致が 0 件である

---

### Requirement: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす

`LocalRuntime` and `ManagedRuntime` MUST structurally satisfy `RuntimeFacade` (the intersection of the four lifecycle capability interfaces, `PipelineDepsBuilder`, and `ChangedFilesCapability`). A compile-time type-assignment assertion SHALL exist in the contract test to enforce this.

#### Scenario: LocalRuntime が RuntimeFacade を満たす

**Given** `LocalRuntime` のインスタンスが構築される
**When** TypeScript コンパイラが `const _check: RuntimeFacade = localRuntimeInstance` を評価する
**Then** コンパイルエラーが発生しない

#### Scenario: ManagedRuntime が RuntimeFacade を満たす

**Given** `ManagedRuntime` のインスタンスが構築される
**When** TypeScript コンパイラが `const _check: RuntimeFacade = managedRuntimeInstance` を評価する
**Then** コンパイルエラーが発生しない

---

### Requirement: architecture ratchet が禁止パターンの再導入を防ぐ

An architecture ratchet test SHALL exist at `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` and MUST run in CI. It SHALL assert zero occurrences of all forbidden patterns (whole-port reference, `RealRuntimeStrategy`, Pick-based shims, double casts) so that any regression causes an immediate CI failure. It SHALL also assert zero whole-port `RuntimeStrategy` named imports in test files and zero `as never` injections into capability slots under `tests/unit/step/`, so that a whole-port fake cannot be re-introduced via a bare `RuntimeStrategy` import, `any`, or `as never`.

#### Scenario: ratchet test が禁止パターンの再導入を検出する

**Given** `src/` 配下に `RuntimeStrategy & PipelineDepsBuilder` が再び記述された production ファイルが存在する
**When** `bun run test` を実行する
**Then** ratchet test が失敗し、CI が赤になる

#### Scenario: ratchet test が test fake への whole-port 再導入を検出する

**Given** `tests/unit/step/` 配下に `RuntimeStrategy` を import した fake を `stepArtifact: fake as never` で注入するテストファイルが追加される
**When** `bun run test` を実行する
**Then** ratchet test が失敗し、CI が赤になる

---

### Requirement: 振る舞い不変条件が維持される

The structural refactoring MUST NOT alter any observable runtime behavior. 構造変更の前後で以下の実行順序と条件が変わらない:

- provider readiness は副作用を伴う prepare 処理より前に実行される
- duplicate live-job guard は bootstrapJob より前に実行される
- workspace setup、state persist/reload、deps build、cleanup registration、teardown の順序が変わらない
- 既存 worktree を使う resume 時の reload スキップ条件が変わらない
- setup 失敗時の state 記録と cleanup handle の扱いが変わらない
- teardown の実行回数・例外時挙動が変わらない
- Local / Managed 間の既存差異が変わらない
- CLI のユーザー向け振る舞い・出力・終了コードが変わらない

#### Scenario: ユーザー向け挙動に差分がない

**Given** 変更前後で同一の run / resume コマンドを実行する
**When** 正常系・エラー系の両方で実行結果を比較する
**Then** 出力・終了コード・エラーメッセージに差分がない
