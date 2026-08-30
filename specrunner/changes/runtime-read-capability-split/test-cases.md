# Test Cases: RuntimeStrategy の read-only consumer を consumer-owned capability へ分割する

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
-->

## Summary

- **Total**: 32 cases
- **Automated** (unit/integration): 31
- **Manual**: 1
- **Priority**: must: 24, should: 7, could: 1

---

## Capability Interface Export

### TC-001: ChangedFilesCapability の named export と import

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: capability interface は named export として port ファイルから取り込める > Scenario: ChangedFilesCapability の import

---

### TC-002: CommitInspectionCapability の named export と import

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: capability interface は named export として port ファイルから取り込める > Scenario: CommitInspectionCapability の import

---

### TC-003: RevisionContentCapability の named export と import

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: capability interface は named export として port ファイルから取り込める > Scenario: RevisionContentCapability の import

---

## no-op-detect — ChangedFilesCapability への絞り込み

### TC-004: ChangedFilesCapability のみで detectNoOp を呼び出せる（compile-time）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: no-op-detect は ChangedFilesCapability のみを依存型として受け取る > Scenario: ChangedFilesCapability のみで detectNoOp を呼び出せる

---

### TC-005: listChangedFiles が unavailable のとき no-op-detect が no-op とみなさない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: no-op-detect は ChangedFilesCapability のみを依存型として受け取る > Scenario: unavailable のとき変更ファイルは空として扱われる（動作の維持）

---

## finding-recency — RevisionContentCapability への絞り込み

### TC-006: RevisionContentCapability のみで computeFindingRecency を呼び出せる（compile-time）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: finding-recency は RevisionContentCapability のみを依存型として受け取る > Scenario: RevisionContentCapability のみで computeFindingRecency を呼び出せる

---

### TC-007: readRevisionContent が absent のとき全 finding が indeterminate になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: finding-recency は RevisionContentCapability のみを依存型として受け取る > Scenario: readRevisionContent が absent のとき全 finding が indeterminate になる（動作の維持）

---

### TC-008: priorOid が null のとき全 finding が indeterminate になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: finding-recency は RevisionContentCapability のみを依存型として受け取る > Scenario: priorOid が null のとき全 finding が indeterminate になる（動作の維持）

---

## commit inspection consumer — CommitInspectionCapability への絞り込み

### TC-009: CommitInspectionCapability のみで derivePriorRoundContext を呼び出せる（compile-time）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: commit inspection consumer は CommitInspectionCapability のみを依存型として受け取る > Scenario: CommitInspectionCapability のみで derivePriorRoundContext を呼び出せる

---

### TC-010: listCommitChangedFiles が absent のとき commit inspection consumer が null を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: commit inspection consumer は CommitInspectionCapability のみを依存型として受け取る > Scenario: listCommitChangedFiles が absent のとき null を返す（動作の維持）

---

### TC-011: custom-reviewer-round-context で as RuntimeStrategy cast が不要になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: commit inspection consumer は CommitInspectionCapability のみを依存型として受け取る > Scenario: custom-reviewer-round-context で as cast が不要になる

---

## scope-check — 最小型 deps への絞り込み

### TC-012: 最小型の deps で computeExtraScopeFindings を呼び出せる（compile-time）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scope-check は ChangedFilesCapability を含む最小型の deps を受け取る > Scenario: 最小型の deps で computeExtraScopeFindings を呼び出せる

---

### TC-013: PipelineDeps を渡した既存の呼び出し元が変更不要で動作する（structural typing）

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: scope-check は ChangedFilesCapability を含む最小型の deps を受け取る > Scenario: PipelineDeps を渡した既存の呼び出し元が変更不要で動作する

---

### TC-014: canDeriveChangedFiles が false のとき UNKNOWN finding が生成される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scope-check は ChangedFilesCapability を含む最小型の deps を受け取る > Scenario: canDeriveChangedFiles === false で UNKNOWN finding が生成される（動作の維持）

---

## AssuranceProvenanceRuntime — explicit interface への昇格

### TC-015: AssuranceProvenanceRuntime が explicit interface として定義されている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: AssuranceProvenanceRuntime が explicit interface として定義される > Scenario: AssuranceProvenanceRuntime が explicit interface で型付けされる

---

### TC-016: LocalRuntime インスタンスが AssuranceProvenanceRuntime として代入できる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: AssuranceProvenanceRuntime が explicit interface として定義される > Scenario: LocalRuntime インスタンスが AssuranceProvenanceRuntime として渡せる

---

## LocalRuntime / ManagedRuntime — capability 実装の compile-time 検証

### TC-017: LocalRuntime が ChangedFilesCapability を structural typing で満たす

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: LocalRuntime と ManagedRuntime が各 capability を structural typing で満たす > Scenario: LocalRuntime が ChangedFilesCapability を満たす（compile-time）

---

### TC-018: ManagedRuntime が CommitInspectionCapability を structural typing で満たす

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: LocalRuntime と ManagedRuntime が各 capability を structural typing で満たす > Scenario: ManagedRuntime が CommitInspectionCapability を満たす（compile-time）

---

## Test Fake の forced cast 除去

### TC-019: finding-recency のテスト fake が narrow 型で構築でき forced cast が不要

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 対象 consumer の test fake から forced cast が除去される > Scenario: finding-recency のテスト fake が narrow 型で構築できる

---

## 既存の観測可能な振る舞いの維持

### TC-020: listChangedFiles unavailable のとき no-op-detect が no-op とみなさない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の観測可能な振る舞いが維持される > Scenario: listChangedFiles が unavailable のとき no-op-detect が no-op とみなさない（動作の維持）

---

### TC-021: listCommitChangedFiles が unavailable のとき prior-round-context が null を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の観測可能な振る舞いが維持される > Scenario: CommitInspectionCapability の listCommitChangedFiles が unavailable のとき prior-round-context が null を返す（動作の維持）

---

### TC-022: runtimeStrategy が undefined のとき prior/post-fix context が null を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の観測可能な振る舞いが維持される > Scenario: runtime が undefined のとき prior/post-fix context が null を返す（動作の維持）

---

## 対象 Consumer の RuntimeStrategy import 除去（compile-time 検証）

### TC-023: 対象 leaf consumer が RuntimeStrategy を parameter type として import しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02, T-03, T-04, T-05, T-06

**GIVEN** `no-op-detect.ts`, `finding-recency.ts`, `prior-round-context.ts`, `post-fix-context.ts`, `custom-reviewer-round-context.ts` がリファクタリング済みである
**WHEN** 各ファイルの import 宣言および関数シグネチャを確認する
**THEN** `RuntimeStrategy` が import されておらず、各関数の runtime パラメータ型が対応する capability type（`ChangedFilesCapability`, `RevisionContentCapability`, `CommitInspectionCapability`）になっている

---

### TC-024: scope-check.ts が PipelineDeps と RuntimeStrategy を import しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `scope-check.ts` がリファクタリング済みで `computeExtraScopeFindings` の deps 引数型が最小構造型に変更されている
**WHEN** `scope-check.ts` の import 宣言を確認する
**THEN** `import ... PipelineDeps ...` および `import ... RuntimeStrategy ...` が存在せず、`ChangedFilesCapability` が import されている

---

### TC-025: achieved-assurance.ts が RuntimeStrategy を import しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `achieved-assurance.ts` の `AssuranceProvenanceRuntime` が explicit interface として再定義されている
**WHEN** `achieved-assurance.ts` の import 宣言を確認する
**THEN** `RuntimeStrategy` が import されておらず、`CommitFileResult` が `src/core/port/runtime-strategy.js` から import されている

---

### TC-026: runtime-capability-gate.ts が ChangedFilesCapability を参照し RuntimeStrategy を import しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 / design.md > D4

**GIVEN** `runtime-capability-gate.ts` の `assertRuntimeSupportsScope` 第 2 引数型が匿名 `Pick<RuntimeStrategy, ...>` から `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>` に変更されている
**WHEN** ファイルの import 宣言と関数シグネチャを確認する
**THEN** `RuntimeStrategy` が import されておらず、`ChangedFilesCapability` が参照され、関数本体の `runtime.canDeriveChangedFiles?.() === false` ガードが維持されている

---

### TC-027: derivePostFixContext が CommitInspectionCapability を依存型として受け取る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `post-fix-context.ts` がリファクタリング済みである
**WHEN** `derivePostFixContext` のパラメータ型を確認し、`{ listCommitChangedFiles: vi.fn().mockResolvedValue({ kind: "success", files: ["src/a.ts"] }) }` のような minimal オブジェクトで呼び出す
**THEN** TypeScript コンパイルエラーが発生せず、関数本体のガード `if (!runtimeStrategy?.listCommitChangedFiles) return null;` が維持されている

---

## Capability Contract Test の存在確認

### TC-028: capability-contracts.test.ts で LocalRuntime と ManagedRuntime の全 capability 実装を compile-time 検証する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** `tests/unit/core/runtime/capability-contracts.test.ts` が作成されている
**WHEN** テストファイルの内容を確認する
**THEN** `LocalRuntime` と `ManagedRuntime` のインスタンスがそれぞれ `ChangedFilesCapability`, `CommitInspectionCapability`, `RevisionContentCapability`, `AssuranceProvenanceRuntime` への型代入（`const _: XCapability = runtime`）を含み、`bun run typecheck` でコンパイルエラーが発生しない

---

## Leaf Consumer 非退行 compile-time テストの存在確認

### TC-029: capability-consumers.test.ts で leaf consumer が narrow 型のみで呼び出せることを compile-time に検証する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-10

**GIVEN** `tests/unit/core/step/capability-consumers.test.ts`（または既存テストへの追記）が整備されている
**WHEN** テストを確認する
**THEN** `detectNoOp`, `computeFindingRecency`, `derivePriorRoundContext`, `derivePostFixContext`, `deriveCustomReviewerPriorRound`, `computeExtraScopeFindings` がそれぞれ `RuntimeStrategy` 型を明示せずに narrow capability 型のオブジェクトのみで呼び出せることが型レベルで確認され、`bun run typecheck` が通る

---

## オーケストレーション層の非退行

### TC-030: PipelineDeps.runtimeStrategy が RuntimeStrategy | undefined のまま維持される

**Category**: unit
**Priority**: should
**Source**: design.md > D7

**GIVEN** executor.ts など orchestration 層が `PipelineDeps.runtimeStrategy: RuntimeStrategy | undefined` を使い続けている
**WHEN** `bun run typecheck` を実行する
**THEN** `executor.ts` および `PipelineDeps` 定義に対する型エラーが発生せず、orchestration 層への影響がないことが確認できる

---

## Architecture 文書の更新

### TC-031: architecture/components.md が実装後の責務と依存方向に一致している

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-11

**GIVEN** `architecture/components.md` がリファクタリング後に更新されている
**WHEN** ファイルを読みレビューする
**THEN** 以下が満たされている: (1) 「commit 時テスト実行」等の削除済み機能への言及がない, (2) `RuntimeStrategy` が composition root 向け facade であることが明示されている, (3) `ChangedFilesCapability` / `CommitInspectionCapability` / `RevisionContentCapability` などの consumer-owned capability パターンが説明されている, (4) concrete runtime が structural typing で capability を満たすことが記述されている, (5) 既存の他セクション（層の責務、不変条件等）への変更がない

---

## Build / Test Gate

### TC-032: build / typecheck / lint / full test が全 green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-12

Verification commands: `bun run build`, `bun run typecheck`, `bun run lint`, `bun run test`

---

## Result

```yaml
result: completed
total: 32
automated: 31
manual: 1
must: 24
should: 7
could: 1
blocked_reasons: []
```
