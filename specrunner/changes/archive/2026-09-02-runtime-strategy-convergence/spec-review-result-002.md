# Spec Review Result 002: runtime-strategy-convergence

## 検証した項目

### Architecture

- **D1 — 4 lifecycle capability interface の分離**: `ProviderReadinessCapability`・`JobBootstrapCapability`・`WorkspaceLifecycleCapability`・`JobStatePersistenceCapability` の責務境界を `runner.ts`・`pipeline-run.ts`・`managed.ts` の実際の呼び出し箇所と照合した。各 interface は独立フェーズに対応しており、依存方向（port → core）に問題はない。`Pick<RuntimeStrategy, ...>` 禁止の決定（D1）と ratchet（D7）の整合も確認した。

- **D2 — CommandRunner 型の更新**: `CommandRunner` が要求する intersection は `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`。`PipelineRunCommand` は `JobBootstrapCapability` を追加。`runner.ts` の `execute()` で呼ばれる `assertProviderReadiness`・`persistJobState`・`reloadJobState`・`setupWorkspace`・`registerCleanup`・`teardown` がすべて当該 intersection に含まれることを確認した。サブクラスの型拡張は TypeScript の structural subtyping で整合する。

- **D7 — architecture ratchet**: 禁止パターン 5 種（`RuntimeStrategy & PipelineDepsBuilder`・`RealRuntimeStrategy`・`Pick<RuntimeStrategy`・`as unknown as RuntimeStrategy`・`deriveCommit/RevisionCapability`）と型代入 assertion が定義されていることを確認した。

### Correctness

- **前周 [High] finding の解消確認**: 前周指摘「Risk 節の reloadJobState 推論が事実と逆」について、`runner.ts:195` の現在のコードを直接読んで検証した。
  ```
  if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined)
  ```
  `ManagedRuntime.reloadJobState` はメソッドとして存在する（throw する実装）のため `&&` の左辺は truthy。managed 新規 run では `existingWorktreePath === undefined` も true。したがって現行コードで既に `reloadJobState` が呼ばれ throw → RELOAD_FAILED に遷移する経路が存在する。T-04 は存在確認 `this.runtime.reloadJobState &&` を除去するだけであり、throw 経路は除去前後で同一。design.md の Risk 節の記述（「なお従来の Risk 節の根拠…は逆であり誤りだった」）は事実と一致し、**前周 finding は適切に修正されている**。

- **T-04 の behavior-preservation 分析**: run path / resume path / test fake（型強制後）の 3 経路について前後の振る舞いを照合した。resume path（`existingWorktreePath !== undefined`）では `reloadJobState` は呼ばれないままであることを確認した。

- **`canDeriveChangedFiles` の call site 網羅**: 現ソースでの optional chaining 呼び出し箇所を grep で確認した。
  - `src/core/step/scope-check.ts:54` — `deps.changedFiles.canDeriveChangedFiles?.()` （内側 `?.`）
  - `src/core/step/executor.ts:279` — `deps.changedFiles?.canDeriveChangedFiles?.()` （外側・内側とも `?.`）
  - `src/core/pipeline/runtime-capability-gate.ts:83` — `runtime.canDeriveChangedFiles?.()` （`?.`）

  T-08 は 3 箇所すべての変更を指定している（`changedFiles` フィールド自体への外側 `?.` は維持）。変更後の意図は spec 要件と整合する。

- **ratchet が `canDeriveChangedFiles?.` をカバーしないこと（→ Finding）**: D7/T-13 の ratchet 定義に `canDeriveChangedFiles\?\.` は含まれていない。`ChangedFilesCapability.canDeriveChangedFiles` を required にしても、呼び出し側の `deps.changedFiles?.canDeriveChangedFiles?.()` は TypeScript 上でコンパイルエラーにならない。理由は外側の `deps.changedFiles?.` が `undefined` を返す型として評価されるため、内側 `?.()` は引き続き合法だから。結果として、将来 executor.ts や scope-check.ts が optional chaining に戻っても CI は検出できない。

### Completeness（タスク分解カバレッジのみ）

- 要件 §1（lifecycle 契約明示）→ T-02 ✓
- 要件 §2（Command 層 whole-port 除去）→ T-04・T-05・T-06 ✓
- 要件 §3（composition root 型更新）→ T-03 ✓
- 要件 §4（fake 都合 optional 撤去）→ T-07・T-08 ✓
- 要件 §5（移行 shim 収束）→ T-09 ✓
- 要件 §6（double cast ゼロ）→ T-10・T-11 ✓
- 要件 §7（公開互換性）→ D3 で RuntimeStrategy は内部から参照されなくなると明示、ratchet で保証 ✓
- 受け入れ条件（contract test / ratchet / verification）→ T-12・T-13・T-14 ✓

タスクから漏れている受け入れ条件の項目はなかった。

## 検証できなかった項目

- `src/core/runtime/factory.ts`・`src/cli/bootstrap.ts`・`src/core/command/pipeline-run.ts`・`src/core/command/resume.ts`・`tests/pipeline-sole-committer-e2e.test.ts` の現行実装詳細（T-03・T-05・T-06・T-10 の実施前状態のみ確認）。実装後の動作は verification gate が保証する。
- LocalRuntime の `reloadJobState` 実装の詳細（store からの読み込みロジック）。T-12 の contract test で検証される。

## Findings 詳細

### [Medium] D7/T-13 ratchet に `canDeriveChangedFiles\?\.` 禁止パターンが欠落している

**ファイル**: `specrunner/changes/runtime-strategy-convergence/design.md`（D7 節）および `specrunner/changes/runtime-strategy-convergence/tasks.md`（T-13）

**問題**:
spec 要件「`canDeriveChangedFiles` は required method として直接呼ばれる」は scope-check・executor・runtime-capability-gate の 3 箇所すべての `?.` 除去を要求する。T-08 がこれを実装タスクとして規定しているが、architecture ratchet（D7/T-13）の禁止パターン一覧にこのパターンが含まれていない。

TypeScript の型システムはこの回帰を検出できない。`deps.changedFiles?.canDeriveChangedFiles?.()` は `changedFiles` フィールド自体が optional であるため、`canDeriveChangedFiles` を required にした後も合法な式として型チェックを通過する。したがって将来 executor.ts（または scope-check.ts）が `?.` 付きに戻っても CI は赤にならない。

**修正方法（fixable）**:
D7・T-13 に以下のパターンを production 禁止リストとして追加する:
- `canDeriveChangedFiles\?\.` — `src/` 配下の production ファイル（`__tests__/` を除く）に 0 件であること

なお `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290` には `deps.changedFiles?.canDeriveChangedFiles?.()` が現在存在する。ratchet のスコープを `src/**/__tests__/` にも拡張する場合はこのテストファイルの更新も対象タスクに含める必要がある（または `__tests__/` を除外する）。
