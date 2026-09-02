# Tasks: RuntimeStrategy の whole-port 依存と移行 shim を撤去する

## T-01: 変更前の影響範囲を監査し、before-state メトリクスを記録する

- [x] `RuntimeStrategy` を import している production ファイルを grep して一覧化する
- [x] `RealRuntimeStrategy` を参照しているファイルをすべて列挙する
- [x] `deriveCommitInspectionCapability` / `deriveRevisionContentCapability` を使っているファイルを列挙する
- [x] `as unknown as RuntimeStrategy` を grep して全ファイルと行番号を記録する
- [x] `assertProviderReadiness` / `assertNoDuplicateLiveJob` / `reloadJobState` / `canDeriveChangedFiles` の optional 呼び出し（`?.`、存在確認 `if`）を列挙する
- [x] `RuntimeStrategy & PipelineDepsBuilder` の出現箇所を全列挙する
- [x] `Pick<RuntimeStrategy` の出現箇所を全列挙する
- [x] runtime-strategy.ts の行数と RuntimeStrategy メソッド数（required / optional 別）を記録する
- [x] production の full-interface import/reference 件数を記録する

**Acceptance Criteria**:
- before-state メトリクスがすべて記録されており、実装タスクの実行前に参照できる
- 予期しない影響ファイルがある場合は設計と差分を確認できる

---

## T-02: `src/core/port/command-runtime.ts` を新規作成し、4 つの lifecycle capability interface を定義する

- [x] `src/core/port/command-runtime.ts` を新規作成する
- [x] `ProviderReadinessCapability` interface を定義する（`assertProviderReadiness(env: Record<string, string | undefined>): Promise<void>` を required で含む）
- [x] `JobBootstrapCapability` interface を定義する（`assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void>` と `bootstrapJob(repoRoot: string, params: { request: RequestInfo; repository: RepositoryInfo; pipelineId?: string }): Promise<JobState>` を required で含む）
- [x] `WorkspaceLifecycleCapability` interface を定義する（`setupWorkspace`, `registerCleanup`, `teardown` を required で含む。型は `runtime-strategy.ts` の既存シグネチャと合わせる）
- [x] `JobStatePersistenceCapability` interface を定義する（`persistJobState`, `reloadJobState` を required で含む。型は `runtime-strategy.ts` の既存シグネチャと合わせる）
- [x] `RuntimeFacade = ProviderReadinessCapability & JobBootstrapCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder & ChangedFilesCapability` を type alias として export する（定義場所は `src/core/runtime-facade.ts`）
- [x] 必要な import（`JobState`, `RequestInfo`, `RepositoryInfo`, `WorkspaceContext`, `CleanupHandle`, `WorkspaceOptions` など）を `runtime-strategy.ts` や `state/schema.ts` から引く
- [x] `bun run typecheck` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `src/core/port/command-runtime.ts` が存在し、4 interface + 1 type alias がすべて export されている
- 各 interface のメソッドがすべて required（`?` なし）である
- typecheck が通る
- 新規 circular import が発生していない

---

## T-03: `factory.ts` と `BootstrapResult` の型を `RuntimeFacade` に更新する

- [x] `src/core/runtime/factory.ts` で `createRuntime()` の戻り値型を `RuntimeStrategy & PipelineDepsBuilder` から `RuntimeFacade` に変更する
- [x] `src/cli/bootstrap.ts` で `BootstrapResult.runtime` の型を `RuntimeFacade` に変更する
- [x] 両ファイルの import を更新する（`src/core/runtime-facade.ts` の `RuntimeFacade` を import し、`RuntimeStrategy` / `PipelineDepsBuilder` の import を削除するか確認する）
- [x] `LocalRuntime` と `ManagedRuntime` が構造的に `RuntimeFacade` を満たすことを typecheck で確認する（コンパイルエラーが出た場合は当該クラスを先に修正する）
- [x] `bun run typecheck` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `factory.ts` の `createRuntime()` 戻り値型が `RuntimeFacade` である
- `BootstrapResult.runtime` が `RuntimeFacade` 型である
- 両ファイルに `RuntimeStrategy & PipelineDepsBuilder` が残っていない
- typecheck が通る

---

## T-04: `CommandRunner` を更新し、optional call ガードを除去する

- [x] `src/core/command/runner.ts` のコンストラクタ引数 `runtime` の型を、以下の intersection に変更する:
  `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`
- [x] runner.ts:110 の `if (this.runtime.assertProviderReadiness)` 存在チェックを削除し、`await this.runtime.assertProviderReadiness(process.env as Record<string, string | undefined>)` を直接呼ぶ形に変更する
- [x] runner.ts:195 の `if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined)` を `if (workspaceOpts.existingWorktreePath === undefined)` に変更する（メソッド存在確認のみ削除し、スキップ条件 `existingWorktreePath === undefined` は維持する）
- [x] import を更新する（`RuntimeStrategy` の import を削除し、新 interface を import する）
- [x] `bun run typecheck` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `runner.ts` に `if (this.runtime.assertProviderReadiness)` が存在しない
- `runner.ts` に `if (this.runtime.reloadJobState` が存在しない
- `runner.ts` に `RuntimeStrategy` の import が存在しない（`PipelineDepsBuilder` 型の import は除く）
- typecheck が通る

---

## T-05: `PipelineRunCommand` を更新し、optional chaining を除去する

- [x] `src/core/command/pipeline-run.ts` のコンストラクタ引数 `runtime` の型を以下に変更する:
  `ProviderReadinessCapability & JobBootstrapCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`
  （または `RuntimeFacade` を使い、親 class と型を合わせる）
- [x] pipeline-run.ts:141 の `await this.runtime.assertNoDuplicateLiveJob?.(cwd, slug)` の `?.` を除去し `await this.runtime.assertNoDuplicateLiveJob(cwd, slug)` にする
- [x] pipeline-run.ts:141 付近のコメント「Optional on the port (test fakes may omit it)」を削除する
- [x] import を更新する（`RuntimeStrategy` を削除し、新 interface/alias を import する）
- [x] `bun run typecheck` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `pipeline-run.ts` に `assertNoDuplicateLiveJob?.` が存在しない
- `pipeline-run.ts` に `RuntimeStrategy` の import が存在しない
- typecheck が通る

---

## T-06: `ResumeCommand` を更新する

- [x] `RuntimeStrategy` の import を削除し、新 interface/alias に差し替える
- [x] `src/core/command/runner.ts` に `export type CommandRunnerRuntime = ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` を定義し、`CommandRunner` のコンストラクタ引数型をこれに置き換える
- [x] `src/core/command/resume.ts` のコンストラクタ引数 `runtime` の型を `RuntimeFacade` から `CommandRunnerRuntime` に変更し、`RuntimeFacade` の import を削除する
- [x] `src/core/command/pipeline-run.ts` に `export type PipelineRunRuntime = CommandRunnerRuntime & JobBootstrapCapability` を定義し、コンストラクタ引数と `pipelineRuntime` フィールドの型を `RuntimeFacade` から `PipelineRunRuntime` に変更する（`ChangedFilesCapability` は直接呼ばないため含めない）
- [x] `RuntimeFacade` の production consumer が composition root（`src/core/runtime/factory.ts`, `src/cli/bootstrap.ts`）のみになっていることを確認する
- [x] `bun run typecheck` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `resume.ts` に `RuntimeStrategy` / `RuntimeFacade` の import が存在せず、コンストラクタ引数型が `CommandRunnerRuntime` である
- `pipeline-run.ts` のコンストラクタ引数型が `PipelineRunRuntime` である
- typecheck が通る

---

## T-07: `RuntimeStrategy` の optional メソッドをすべて required にし、`RealRuntimeStrategy` を削除する

以下の 10 メソッドから `?` を除去する:

- [x] `listWorktreeChanges?` → `listWorktreeChanges`（JSDoc の "Optional on the port so RuntimeStrategy-typed test fakes may omit it" を削除）
- [x] `canDeriveChangedFiles?` → `canDeriveChangedFiles`（JSDoc 更新）
- [x] `assertNoDuplicateLiveJob?` → `assertNoDuplicateLiveJob`（JSDoc 更新）
- [x] `assertProviderReadiness?` → `assertProviderReadiness`（JSDoc 更新）
- [x] `reloadJobState?` → `reloadJobState`（JSDoc 更新）
- [x] `listCommitChangedFiles?` → `listCommitChangedFiles`（JSDoc 更新）
- [x] `readFileAtCommit?` → `readFileAtCommit`（JSDoc 更新）
- [x] `snapshotMainCheckoutGuard?` → `snapshotMainCheckoutGuard`（JSDoc 更新）
- [x] `readRevisionContent?` → `readRevisionContent`（JSDoc 更新）
- [x] `lastCommitTouchingPath?` → `lastCommitTouchingPath`（JSDoc 更新）
- [x] `RealRuntimeStrategy` 型エイリアスを `runtime-strategy.ts` から削除する
- [x] `LocalRuntime` が `implements RuntimeStrategy` を維持していれば typecheck で全メソッド実装が確認できることを確認する（同様に `ManagedRuntime`）
- [x] `bun run typecheck` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `runtime-strategy.ts` に `RealRuntimeStrategy` が存在しない
- `runtime-strategy.ts` の RuntimeStrategy interface に `?` 付きメソッドが存在しない
- typecheck が通る（LocalRuntime / ManagedRuntime はすでに全メソッドを実装しているため型エラーは発生しないはず）

---

## T-08: `ChangedFilesCapability.canDeriveChangedFiles` を required にし、optional chaining を除去する

- [x] `src/core/port/runtime-strategy.ts` の `ChangedFilesCapability` 内で `canDeriveChangedFiles?(): boolean` を `canDeriveChangedFiles(): boolean` に変更する
- [x] `src/core/step/scope-check.ts` の `deps.changedFiles.canDeriveChangedFiles?.()` を `deps.changedFiles.canDeriveChangedFiles()` に変更する（`changedFiles` フィールド自体が `undefined` の場合の guard は維持する）
- [x] `src/core/step/executor.ts` の `deps.changedFiles?.canDeriveChangedFiles?.()` の内側の `?.` を除去し `deps.changedFiles?.canDeriveChangedFiles()` にする
- [x] `src/core/pipeline/runtime-capability-gate.ts` の `runtime.canDeriveChangedFiles?.() === false` を `runtime.canDeriveChangedFiles() === false` に変更する
- [x] `runtime-capability-gate.ts` のコメント内 "canDeriveChangedFiles is optional on RuntimeStrategy. absent (undefined) → treated as 'does not block'" という記述を実態に合わせて更新する
- [x] `bun run typecheck` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- production ソースに `canDeriveChangedFiles?.()` が存在しない
- `ChangedFilesCapability` 内で `canDeriveChangedFiles` が required である
- typecheck が通る

---

## T-09: Pick-based shim を削除し、`buildDeps()` で直接 capability を構築する

- [x] `src/core/port/runtime-strategy.ts` から `deriveCommitInspectionCapability` 関数を削除する
- [x] `src/core/port/runtime-strategy.ts` から `deriveRevisionContentCapability` 関数を削除する
- [x] `src/core/port/runtime-strategy.ts` の `CommitInspectionCapability` / `RevisionContentCapability` の JSDoc から shim 関数への参照（"derive from a facade via derive\*"）を削除する
- [x] `src/core/runtime/local.ts` の `buildDeps()` で `deriveCommitInspectionCapability(this)` を `{ listCommitChangedFiles: this.listCommitChangedFiles.bind(this) }` に差し替える
- [x] `src/core/runtime/local.ts` の `buildDeps()` で `deriveRevisionContentCapability(this)` を `{ readRevisionContent: this.readRevisionContent.bind(this) }` に差し替える
- [x] `src/core/runtime/managed.ts` の `buildDeps()` で shim 呼び出しを直接構築に差し替える（ManagedRuntime は `listCommitChangedFiles` が常に `unavailable` を返す実装済みのため、同様に bind または `undefined` を適切に設定する）
- [x] `local.ts` / `managed.ts` から `deriveCommitInspectionCapability` / `deriveRevisionContentCapability` の import を削除する
- [x] `bun run typecheck` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `deriveCommitInspectionCapability` がどのファイルにも存在しない
- `deriveRevisionContentCapability` がどのファイルにも存在しない
- `Pick<RuntimeStrategy` がどの production ファイルにも存在しない
- typecheck が通る

---

## T-10: `tests/pipeline-sole-committer-e2e.test.ts` の double cast を typed capability object で置換する

対象: pipeline-sole-committer-e2e.test.ts 行 382 と 541（2 件の `as unknown as RuntimeStrategy`）

- [x] 行 367-382 のブロックを分析し、`roundGitEffects` slot に注入している partial object をリストアップする（`captureHeadSha`, `listWorktreeChanges`, `listChangedFiles`, `digestArtifacts`）
- [x] `roundGitEffects` 用の typed object を `RoundGitEffectsCapability` 型として構築する（不足メソッド `commitRoundArtifacts` は `vi.fn().mockResolvedValue(...)` で補完する）
- [x] `stepIo` 用の typed object を `StepIoValidationCapability` 型として構築する（`validateStepInputs`, `validateStepOutputs`, 不足の `verifyFindingRefs` を `vi.fn().mockResolvedValue([])` で補完する）
- [x] deps 構築時の `roundGitEffects: runtimeStrategy as never` を `roundGitEffects: roundGitEffectsImpl`（typed 変数）に置き換える
- [x] deps 構築時の `stepIo: runtimeStrategy as never` を `stepIo: stepIoImpl`（typed 変数）に置き換える
- [x] 行 534-541 の 2 件目の `as unknown as RuntimeStrategy` も同様に修正する
- [x] `RuntimeStrategy` の import がテストファイルで使われなくなった場合は import を削除する
- [x] `bun run typecheck` および `bun run test tests/pipeline-sole-committer-e2e.test.ts` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `tests/pipeline-sole-committer-e2e.test.ts` に `as unknown as RuntimeStrategy` が存在しない
- capability slot（`roundGitEffects`, `stepIo`）に `as never` キャストが存在しない
- テストが通る

---

## T-11: `RealRuntimeStrategy` への参照が残るテストファイルを更新する

- [x] `src/core/runtime/__tests__/last-commit-touching-path.test.ts` の `RealRuntimeStrategy` 参照（describe/comment 含む）を確認する
- [x] TC-011 が「concrete runtime に lastCommitTouchingPath が必須実装されていること」を検証する意図を保ちつつ、`RealRuntimeStrategy` 型なしで同等の検証を記述し直す（例: `LocalRuntime` が `RuntimeStrategy` を implements するとコンパイル時に確認できる型アサーションに差し替える）
- [x] T-01 で見つかった他の `RealRuntimeStrategy` 参照ファイルをすべて更新する
- [x] `bun run typecheck` および `bun run test` を実行してエラーがないことを確認する

**Acceptance Criteria**:
- `RealRuntimeStrategy` がすべてのファイルに存在しない
- 影響を受けたテストがすべて通る

---

## T-12: Local / Managed 双方について command lifecycle contract test を追加する

`src/core/runtime/__tests__/command-lifecycle-contract.test.ts` を新規作成する:

- [x] LocalRuntime が `RuntimeFacade` を構造的に満たすことをコンパイル時に検証する型代入アサーションを書く（例: `const _: RuntimeFacade = new LocalRuntime(...)` が型エラーなしでコンパイルされること）
- [x] ManagedRuntime が `RuntimeFacade` を構造的に満たすことを同様に検証する
- [x] `assertProviderReadiness`: LocalRuntime はプローブを呼ぶ / ManagedRuntime は no-op であることを単体テストで確認する
- [x] `assertNoDuplicateLiveJob`: LocalRuntime / ManagedRuntime とも `assertSlugUnoccupied` へ委譲して slug 占有チェックをすることを確認する
- [x] `reloadJobState`: LocalRuntime はストアから読み込む / ManagedRuntime は throw することを確認する（managed 新規 run では `existingWorktreePath === undefined` が true のため reloadJobState が呼ばれ throw → RELOAD_FAILED となる。この挙動を正として記録する。managed resume 実装時には reloadJobState の managed 対応が別途必要）
- [x] `canDeriveChangedFiles()`: LocalRuntime は boolean を返す / ManagedRuntime は false を返すことを確認する
- [x] `bun run test src/core/runtime/__tests__/command-lifecycle-contract.test.ts` を実行してすべて通ることを確認する

**Acceptance Criteria**:
- contract test が Local / Managed の両方を対象として存在する
- `RuntimeFacade` の構造的適合がコンパイル時に検証される
- テストがすべて通る

---

## T-13: Architecture ratchet test を追加する

`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` を新規作成する:

- [x] `src/` 配下のすべての `.ts` ファイルを再帰的に読み込むユーティリティを実装する（fs.readdir + readFile）
- [x] 以下の各パターンが production ソース（`src/` 配下、`__tests__/` ディレクトリは除外）に 0 件であることを assert する:
  - `RuntimeStrategy & PipelineDepsBuilder`
  - `RealRuntimeStrategy`
  - `Pick<RuntimeStrategy`
  - `deriveCommitInspectionCapability`（import および呼び出し）
  - `deriveRevisionContentCapability`（import および呼び出し）
  - `canDeriveChangedFiles?.`（scope-check / executor / runtime-capability-gate の `?.` 再導入を防ぐ。TypeScript 型システムは外側 `?.` の存在により内側 `?.` を型エラーにしないため ratchet で明示禁止する）
- [x] 以下が test ファイル（`src/**/__tests__/` および `tests/`）に 0 件であることを assert する:
  - `as unknown as RuntimeStrategy`
- [x] LocalRuntime と ManagedRuntime が `RuntimeFacade` を満たすコンパイル時型アサーションを test ファイルに含める（T-12 で書いたものと重複する場合は参照するか共通化する）
- [x] `bun run test src/core/port/__tests__/runtime-strategy-ratchet.test.ts` を実行してすべて通ることを確認する

**Acceptance Criteria**:
- ratchet test が存在し、すべての pattern について 0 件を assert している
- テストが通る
- CI 上で `bun run test` を実行すれば ratchet が回帰検出装置として機能する

---

## T-14: 全体 verification と after-state メトリクスの記録

- [x] `bun run typecheck` — エラー 0 件
- [x] `bun run test` — 既存テストすべて通ること
- [x] `bun run lint` — 新規 lint エラーなし
- [x] 以下の after-state メトリクスを記録する（PR 本文用）:
  - `runtime-strategy.ts` 行数
  - `RuntimeStrategy` メソッド数（required のみ、optional は 0 になっているはず）
  - production の full-interface import/reference 数（target: 0）
  - `RuntimeStrategy & PipelineDepsBuilder` 件数（target: 0）
  - fake 都合 optional メソッド数（target: 0）
  - `RealRuntimeStrategy` 件数（target: 0）
  - `Pick<RuntimeStrategy` 件数（target: 0）
  - `as unknown as RuntimeStrategy` 件数（target: 0）
  - capability ごとの production consumer 数 / test fake 数

**Acceptance Criteria**:
- 全 verification が green
- すべての target メトリクスが 0
- after-state メトリクスが PR 本文に掲載可能な形で揃っている

---

## T-15: step executor テストの whole-port fake を slot ごとの typed object に分離する

対象: `tests/unit/step/executor-activation.test.ts`, `executor-resume-context.test.ts`, `executor-verdict.test.ts`, `executor-no-op.test.ts`, `executor-drift-detection.test.ts`

- [x] 各テストの `makeRuntimeStrategy()` / `any` 型の runtime 引数を廃止し、`stepArtifact` 用 `StepArtifactLifecycleCapability`、`stepIo` 用 `StepIoValidationCapability`、`changedFiles` 用 `ChangedFilesCapability` の typed object をそれぞれ構築する（テストが使わないメソッドは `vi.fn()` / noop で最小実装し、command lifecycle / commit inspection / revision content 系メソッドは持たせない）
- [x] `stepArtifact: x as never` / `stepIo: x as never` / `changedFiles: x as never` を typed 変数の直接代入に置き換える
- [x] 5 ファイルで重複する fake は `tests/unit/step/` 配下の typed builder/helper に集約してよい（production src には置かない）
- [x] `tests/pipeline-integration.test.ts` の `import type { RuntimeStrategy }` を capability interface 由来の型参照に置き換え、whole-port import を削除する
- [x] `bun run test tests/unit/step tests/pipeline-integration.test.ts` が通ることを確認する

**Acceptance Criteria**:
- 対象 5 ファイルに `RuntimeStrategy` の import、`any` 型の runtime 引数、capability slot への `as never` が存在しない
- `tests/` および `src/**/__tests__/` に `RuntimeStrategy` の named import が存在しない（ratchet test 自身と `command-lifecycle-contract.test.ts` を除く）
- テストが通る

---

## T-16: ratchet を test fake への whole-port 再導入検知に拡張する

`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` に追加する:

- [x] `tests/**` および `src/**/__tests__/**`（ratchet test 自身と `command-lifecycle-contract.test.ts` を除く）で、`RuntimeStrategy` を named import する `import type { ... RuntimeStrategy ... }` / `import { ... RuntimeStrategy ... }` が 0 件であることを assert する（`RuntimeStrategy &` リテラルではなく import 文を対象にする）
- [x] `tests/unit/step/` 配下で、capability slot（`stepArtifact`, `stepIo`, `changedFiles`, `roundGitEffects`, `terminalState`, `commitInspection`, `revisionContent`）への `<identifier> as never` 注入が 0 件であることを assert する
- [x] `tests/unit/step/` 配下の既存テストで上記に該当する箇所（T-15 対象外のファイルを含む）を typed object に置き換え、ratchet が green になることを確認する
- [x] `bun run test src/core/port/__tests__/runtime-strategy-ratchet.test.ts` が通ることを確認する

**Acceptance Criteria**:
- ratchet が whole-port `RuntimeStrategy` import と slot への `as never` 注入の再導入で fail する
- 現行コードで ratchet が green
