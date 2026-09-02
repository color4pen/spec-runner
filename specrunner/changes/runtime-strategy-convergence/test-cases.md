# Test Cases: RuntimeStrategy の whole-port 依存と移行 shim を撤去する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```
-->

## Summary

- **Total**: 34 cases
- **Automated** (unit/integration): 33
- **Manual**: 1
- **Priority**: must: 22, should: 11, could: 1

---

## Group 1: Lifecycle Execution Order

### TC-001: provider readiness チェックが prepare() より前に無条件で呼ばれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Provider readiness は副作用より前に無条件で実行される > Scenario: provider readiness チェックが prepare() より前に無条件で呼ばれる

---

### TC-002: provider readiness が型的に required である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Provider readiness は副作用より前に無条件で実行される > Scenario: provider readiness が型的に required である

---

### TC-003: assertNoDuplicateLiveJob が bootstrapJob より前に無条件で呼ばれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Duplicate live-job guard は bootstrapJob より前に無条件で実行される > Scenario: assertNoDuplicateLiveJob が bootstrapJob より前に無条件で呼ばれる

---

### TC-004: run path では reloadJobState が無条件で呼ばれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: setupWorkspace 後の state reload は skip 条件が維持されつつ無条件で呼ばれる > Scenario: run path では reloadJobState が無条件で呼ばれる

---

### TC-005: resume path では reloadJobState がスキップされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: setupWorkspace 後の state reload は skip 条件が維持されつつ無条件で呼ばれる > Scenario: resume path では reloadJobState がスキップされる

---

### TC-006: scope-check が canDeriveChangedFiles を直接呼ぶ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `canDeriveChangedFiles` は required method として直接呼ばれる > Scenario: scope-check が canDeriveChangedFiles を直接呼ぶ

---

### TC-007: runtime-capability-gate が canDeriveChangedFiles を直接呼ぶ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `canDeriveChangedFiles` は required method として直接呼ばれる > Scenario: runtime-capability-gate が canDeriveChangedFiles を直接呼ぶ

---

## Group 2: Structural Cleanup — Forbidden Patterns

### TC-008: production ソースに RuntimeStrategy & PipelineDepsBuilder が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: production コードは `RuntimeStrategy & PipelineDepsBuilder` を参照しない > Scenario: production ソースに RuntimeStrategy & PipelineDepsBuilder が存在しない

---

### TC-009: src/ 配下に RealRuntimeStrategy が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `RealRuntimeStrategy` は production から撤去される > Scenario: RealRuntimeStrategy が存在しない

---

### TC-010: Pick-based derive shim が src/ 配下に存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Pick-based derive shim が production から撤去される > Scenario: Pick-based derive shim が存在しない

---

### TC-011: Pick<RuntimeStrategy が src/ 配下に存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Pick-based derive shim が production から撤去される > Scenario: Pick<RuntimeStrategy が存在しない

---

### TC-012: as unknown as RuntimeStrategy がテストファイルに存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: テスト fake の double cast が typed capability object で置換される > Scenario: as unknown as RuntimeStrategy が存在しない

---

## Group 3: Runtime Contract Compliance

### TC-013: LocalRuntime が RuntimeFacade を構造的に満たす

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす > Scenario: LocalRuntime が RuntimeFacade を満たす

---

### TC-014: ManagedRuntime が RuntimeFacade を構造的に満たす

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす > Scenario: ManagedRuntime が RuntimeFacade を満たす

---

## Group 4: Architecture Ratchet

### TC-015: ratchet test が禁止パターンの再導入を検出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: architecture ratchet が禁止パターンの再導入を防ぐ > Scenario: ratchet test が禁止パターンの再導入を検出する

---

### TC-035: Command / step / runtime / attach / pipeline テストに RuntimeStrategy & PipelineDepsBuilder が存在しない

**Category**: unit
**Priority**: must
**Source**: request.md > 受け入れ基準 > test fake は typed builder/helper で必要 contract を満たす / spec.md > Requirement: architecture ratchet が禁止パターンの再導入を防ぐ

**GIVEN** `tests/unit/core/command/`, `tests/core/provider-readiness-gate.test.ts`, `tests/unit/core/runtime/`, `tests/unit/step/`, `tests/unit/core/step/`, `tests/attach/`, `tests/unit/pipeline/` 配下の TypeScript テストファイルを検査する
**WHEN** `RuntimeStrategy & PipelineDepsBuilder` というテキストを grep する
**THEN** 一致が 0 件であり、テスト fake が whole-port intersection ではなく Command 層の narrow capability contract（`ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` など）で構築されている

---

### TC-036: step executor テストが slot ごとの typed capability object を注入する

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D6: `as unknown as RuntimeStrategy` を typed capability object で置換する / spec.md > Requirement: テスト fake の double cast が typed capability object で置換される / tasks.md > T-15

**GIVEN** `tests/unit/step/executor-activation.test.ts`、`executor-resume-context.test.ts`、`executor-verdict.test.ts`、`executor-no-op.test.ts`、`executor-drift-detection.test.ts` を検査する
**WHEN** `stepArtifact` / `stepIo` / `changedFiles` slot への注入方法と import 文を確認する
**THEN** 各 slot に `StepArtifactLifecycleCapability` / `StepIoValidationCapability` / `ChangedFilesCapability` 型として構築された typed object が注入されており、`RuntimeStrategy` の import、`any` 型の runtime 引数、slot への `as never` キャストが存在せず、fake がテストの使わない command lifecycle / commit inspection / revision content 系メソッドを持たず、テストが正常に実行される

---

### TC-037: ratchet がテスト fake への whole-port 再導入を検知する

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D7: Architecture ratchet test を追加する / spec.md > Requirement: architecture ratchet が禁止パターンの再導入を防ぐ / tasks.md > T-16

**GIVEN** `tests/**` および `src/**/__tests__/**` 配下の TypeScript テストファイルを検査する（ratchet test 自身と `command-lifecycle-contract.test.ts` を除く）
**WHEN** (a) `RuntimeStrategy` を named import する import 文、(b) `tests/unit/step/` 配下で capability slot（`stepArtifact`, `stepIo`, `changedFiles`, `roundGitEffects`, `terminalState`, `commitInspection`, `revisionContent`）へ `<identifier> as never` で注入する箇所を検索する
**THEN** (a) (b) ともに 0 件であり、ratchet test がこの 2 条件を assert している

---

## Group 5: Behavioral Invariants

### TC-016: ユーザー向け挙動に差分がない

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 振る舞い不変条件が維持される > Scenario: ユーザー向け挙動に差分がない

---

## Group 6: Interface Definition

### TC-017: 4 つの lifecycle capability interface が required メソッドのみで定義されている

**Category**: unit
**Priority**: should
**Source**: design.md > Decisions > D1: 4 つの named lifecycle capability interface を定義する / tasks.md > T-02

**GIVEN** `src/core/port/command-runtime.ts` が作成されている
**WHEN** `ProviderReadinessCapability`、`JobBootstrapCapability`、`WorkspaceLifecycleCapability`、`JobStatePersistenceCapability` の各 interface を検査する
**THEN** 各 interface は定義された全メソッドが `?` なしの required であり、`Pick<RuntimeStrategy, ...>` パターンを使用していない

---

### TC-018: RuntimeFacade が 5 capability と PipelineDepsBuilder の intersection として定義されている

**Category**: unit
**Priority**: should
**Source**: design.md > Decisions > D2: CommandRunner とサブクラスが受け取る型を intersection に変更する / tasks.md > T-02

**GIVEN** `src/core/runtime-facade.ts` に `RuntimeFacade` type alias が定義されている
**WHEN** `RuntimeFacade` の型定義を検査する
**THEN** `ProviderReadinessCapability & JobBootstrapCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder & ChangedFilesCapability` の intersection であり、すべての構成要素が named interface として参照されている

---

### TC-019: CommandRunner コンストラクタが適切な capability intersection を要求する

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D2: CommandRunner とサブクラスが受け取る型を intersection に変更する / tasks.md > T-04

**GIVEN** `CommandRunner` のコンストラクタシグネチャを TypeScript コンパイラが評価する
**WHEN** `assertProviderReadiness` を欠いたオブジェクトを `runtime` 引数として渡そうとする
**THEN** TypeScript コンパイルエラーが発生し、`RuntimeStrategy` 型の import が `runner.ts` に存在しない

---

### TC-020: PipelineRunCommand コンストラクタが JobBootstrapCapability を含む型を要求する

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D2: CommandRunner とサブクラスが受け取る型を intersection に変更する / tasks.md > T-05

**GIVEN** `PipelineRunCommand` のコンストラクタシグネチャを TypeScript コンパイラが評価する
**WHEN** `assertNoDuplicateLiveJob` を欠いたオブジェクトを `runtime` 引数として渡そうとする
**THEN** TypeScript コンパイルエラーが発生し、`pipeline-run.ts` に `RuntimeStrategy` の import が存在せず、コンストラクタ引数型が `PipelineRunRuntime`（= `CommandRunnerRuntime & JobBootstrapCapability & ChangedFilesCapability`）である

---

### TC-021: ResumeCommand コンストラクタが CommandRunnerRuntime のみを要求する

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D2: CommandRunner とサブクラスが受け取る型を intersection に変更する / tasks.md > T-06

**GIVEN** `src/core/command/resume.ts` を検査する
**WHEN** コンストラクタ引数の型定義と import 文を確認する
**THEN** `RuntimeStrategy` および `RuntimeFacade` の import が存在せず、コンストラクタ引数型が `CommandRunnerRuntime`（= `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`、`src/core/command/runner.ts` で export）であり、`JobBootstrapCapability` / `ChangedFilesCapability` を含まない

---

### TC-022: RuntimeStrategy interface のすべてのメソッドが required である

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D3: `RuntimeStrategy` の optional メソッドをすべて required にする / tasks.md > T-07

**GIVEN** `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` interface を検査する
**WHEN** 全メソッド定義を確認する
**THEN** `?` 付きの optional メソッドが 0 件であり、以下の 10 メソッドがすべて required として定義されている: `listWorktreeChanges`、`canDeriveChangedFiles`、`assertNoDuplicateLiveJob`、`assertProviderReadiness`、`reloadJobState`、`listCommitChangedFiles`、`readFileAtCommit`、`snapshotMainCheckoutGuard`、`readRevisionContent`、`lastCommitTouchingPath`

---

## Group 7: Composition Root Types

### TC-023: factory.ts の createRuntime() 戻り値型が RuntimeFacade である

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `src/core/runtime/factory.ts` を検査する
**WHEN** `createRuntime()` 関数のシグネチャを確認する
**THEN** 戻り値型が `RuntimeFacade` であり、`RuntimeStrategy & PipelineDepsBuilder` が存在しない

---

### TC-024: BootstrapResult.runtime が RuntimeFacade 型である

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `src/cli/bootstrap.ts` の `BootstrapResult` 型定義を検査する
**WHEN** `runtime` フィールドの型を確認する
**THEN** `runtime` が `RuntimeFacade` 型であり、`RuntimeStrategy & PipelineDepsBuilder` が存在しない

---

## Group 8: Implementation Cleanup

### TC-025: buildDeps() が Pick-based shim を使わず直接 capability を構築する

**Category**: unit
**Priority**: could
**Source**: design.md > Decisions > D4: Pick-based shim を削除し、`buildDeps()` で直接 capability を構築する / tasks.md > T-09

**GIVEN** `src/core/runtime/local.ts` と `src/core/runtime/managed.ts` の `buildDeps()` 実装を検査する
**WHEN** `commitInspection` および `revisionContent` capability の構築方法を確認する
**THEN** `deriveCommitInspectionCapability` / `deriveRevisionContentCapability` の呼び出しが存在せず、`this.listCommitChangedFiles.bind(this)` および `this.readRevisionContent.bind(this)` などの直接 bound method が使われている

---

### TC-026: pipeline-sole-committer-e2e.test.ts が typed capability object を使う

**Category**: integration
**Priority**: should
**Source**: design.md > Decisions > D6: `as unknown as RuntimeStrategy` を typed capability object で置換する / tasks.md > T-10

**GIVEN** `tests/pipeline-sole-committer-e2e.test.ts` を検査する
**WHEN** `roundGitEffects` および `stepIo` capability slot への注入方法を確認する
**THEN** `as unknown as RuntimeStrategy` および `as never` キャストが存在せず、各 slot に `RoundGitEffectsCapability` / `StepIoValidationCapability` 型として明示的に構築された typed object が注入されており、テストが正常に実行される

---

## Group 9: Contract Tests — Local / Managed Behavior

### TC-027: contract test が assertProviderReadiness の Local / Managed 差異を検証する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-12

**GIVEN** `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` が作成されている
**WHEN** `assertProviderReadiness` の振る舞いを Local / Managed それぞれで実行する
**THEN** LocalRuntime はプローバーを呼び出す振る舞いを検証し、ManagedRuntime は no-op（または managed 固有の振る舞い）を検証するテストが含まれている

---

### TC-028: contract test が assertNoDuplicateLiveJob の Local / Managed 差異を検証する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-12

**GIVEN** `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` が作成されている
**WHEN** `assertNoDuplicateLiveJob` の振る舞いを Local / Managed それぞれで実行する
**THEN** LocalRuntime / ManagedRuntime とも `assertSlugUnoccupied` へ委譲して slug 占有チェックを行う振る舞いを検証するテストが含まれている

---

### TC-029: contract test が reloadJobState の Local / Managed 差異を検証する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-12

**GIVEN** `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` が作成されている
**WHEN** `reloadJobState` の振る舞いを Local / Managed それぞれで実行する
**THEN** LocalRuntime はストアから state を読み込む振る舞いを検証し、ManagedRuntime は `throw` することを記録するテストが含まれている（managed runtime の resume 経路では呼ばれないことをコメントで明示する）

---

### TC-030: contract test が canDeriveChangedFiles の Local / Managed 差異を検証する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-12

**GIVEN** `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` が作成されている
**WHEN** `canDeriveChangedFiles()` の振る舞いを Local / Managed それぞれで実行する
**THEN** LocalRuntime は boolean 値（true または false）を返す振る舞いを検証し、ManagedRuntime は `false` を返すことを検証するテストが含まれている

---

## Group 10: Residual Reference Cleanup

### TC-031: RealRuntimeStrategy がテストファイルを含む全ファイルに存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-11

**GIVEN** リポジトリの `src/` 配下および `tests/` 配下の全 TypeScript ファイルを検査する
**WHEN** `RealRuntimeStrategy` というテキストを grep する
**THEN** 一致が 0 件であり、`src/core/runtime/__tests__/last-commit-touching-path.test.ts` を含むすべてのテストファイルから参照が除去されている

---

## Group 11: Gate Checks

### TC-032: typecheck が全エラー 0 件

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-14

`bun run typecheck` を実行し、型エラーが 0 件であること。

---

### TC-033: bun run test が全 green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-14

`bun run test` を実行し、既存テスト・新規テスト（contract test / ratchet test / e2e test 含む）がすべて pass すること。

---

### TC-034: bun run lint が新規エラーなし

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-14

`bun run lint` を実行し、この変更によって新たに導入された lint エラーが 0 件であること。

---

## Result

```yaml
result: completed
total: 37
automated: 36
manual: 1
must: 26
should: 10
could: 1
blocked_reasons: []
```
