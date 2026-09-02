# Code Review — Iteration 8
# refactor: RuntimeStrategy の whole-port 依存と移行 shim を撤去する

**Branch**: `refactor/runtime-strategy-convergence-b0074b66`
**Date**: 2026-09-02
**Reviewer**: automated code review (iteration 8)

---

## Executive Summary

Production コードの `RuntimeStrategy & PipelineDepsBuilder` whole-port 依存は完全に撤去されており、Command 層 (CommandRunner / PipelineRunCommand / ResumeCommand) はいずれも narrow capability intersection または RuntimeFacade に正しく移行されている。RuntimeStrategy の optional メソッドは全て required になり、RealRuntimeStrategy・Pick-based shim・`as unknown as RuntimeStrategy` も production/主要テスト領域から除去されている。ratchet テスト群も実装されており、TC-008～TC-012・TC-031・TC-032a-d によって主要な禁止パターンの再導入を防いでいる。

一方、`tests/unit/core/step/` ディレクトリが TC-032 ratchet のスコープ外となっており、同ディレクトリの 2 ファイルが `RuntimeStrategy & PipelineDepsBuilder` 全体型を使用し続けている。また `tests/attach/` については「known ratchet gap」として明示されているが修正されていない。受け入れ条件「test fakeはtyped builder/helperで必要contractを満たす」を満たすには、これら 2 つのディレクトリへの対応が必要である。

---

## Findings

### F-1: `tests/unit/core/step/` の 2 ファイルが whole-port 型を使用し ratchet 対象外

**Severity**: high
**File**: `tests/unit/core/step/executor-cli-entry-oid.test.ts:83`
**Also**: `tests/unit/core/step/verification-phase-outcome-executor.test.ts:87`

両ファイルに次のシグネチャを持つヘルパーが存在する。

```typescript
function makeRuntimeStrategy(
  overrides: Partial<RuntimeStrategy & PipelineDepsBuilder> = {},
): RuntimeStrategy & PipelineDepsBuilder
```

この whole-port 型 fake は受け入れ条件「test fakeはtyped builder/helperで必要contractを満たす」に違反する。

さらに問題なのは、ratchet (TC-032) がカバーするのは以下のみで、`tests/unit/core/step/` は一切含まれていない点である。

| TC-032 coverage | 対象ディレクトリ |
|---|---|
| TC-032 (本体) | `tests/unit/core/command/` |
| TC-032b | `tests/core/provider-readiness-gate.test.ts` |
| TC-032c | `tests/unit/core/runtime/` |
| TC-032d | `tests/unit/step/` |

`tests/unit/core/step/` に対する TC-032e が存在しないため、このディレクトリへの whole-port 型再導入は CI によって検出されない。

**修正方針**:
1. `makeRuntimeStrategy` ヘルパーを capability 単位の narrow 型（`StepIoValidationCapability`、`StepArtifactLifecycleCapability` 等）で組み直す
2. ratchet に TC-032e を追加し `tests/unit/core/step/` を guarded とする

---

### F-2: `tests/attach/attach-resume-e2e.test.ts` が ratchet gap として未修正

**Severity**: medium
**File**: `tests/attach/attach-resume-e2e.test.ts:154`

```typescript
function makeMachineAStrategy(
  machineADir: string,
  slug: string,
): RuntimeStrategy & PipelineDepsBuilder {
```

TC-032d のコメントに「tests/attach/ remains outside scope (E2E tests — tracked as a known ratchet gap)」と明記されているが、受け入れ条件「test fakeはtyped builder/helperで必要contractを満たす」は特定ディレクトリを除外していない。

この gap は以下のリスクを持つ。
- `tests/attach/` を足がかりに whole-port 型の使用が再拡大する可能性がある
- 受け入れ条件の定義との乖離が PR 本文に記載されていない（記載があれば許容判断できる）

**修正方針**:
1. `makeMachineAStrategy` を `RuntimeFacade` または `WorkspaceLifecycleCapability & JobStatePersistenceCapability & ...` の narrow intersection に変更する
2. ratchet を `tests/attach/` まで拡張する（少なくともコメントで remediation ticket を示す）

---

### F-3: `CommandRunner` ファイル先頭 JSDoc の実行順コメントに Step 0 が欠落

**Severity**: low
**File**: `src/core/command/runner.ts:9-21`

```
 * Execution sequence:
 *   1. prepare()               — subclass override (only override point)
 *   2. runtime.setupWorkspace()
 *   ...
 *   7. runtime.teardown()
```

`assertProviderReadiness` は prepare() より前（Step 0）に実行されるが、この sequence コメントには含まれていない。実際の `execute()` 内では「Step 0: provider readiness gate — must fire before prepare()」のインラインコメントが存在し、クラス JSDoc と不一致になっている。

また `Error handling` セクションに "prepare() failure → return 1" と記載されているが、provider readiness failure → return 1 のケースが未記載である。

**修正方針**:
```diff
  * Execution sequence:
+ *   0. assertProviderReadiness() — before any side effects (no job state yet)
  *   1. prepare()               — subclass override (only override point)
```

---

## 検証した項目

- `src/core/port/command-runtime.ts`: 4 つの named lifecycle capability interface が required メソッドのみで定義されていることを確認（TC-017）
- `src/core/runtime-facade.ts`: `RuntimeFacade` が 6 capability + PipelineDepsBuilder の intersection として定義されていることを確認（TC-018）
- `src/core/command/runner.ts`: コンストラクタが `RuntimeStrategy` を import せず narrow intersection を受け取ること、`assertProviderReadiness` が `prepare()` より前に呼ばれることを確認（TC-001, TC-002, TC-019）
- `src/core/command/pipeline-run.ts`: `pipelineRuntime: RuntimeFacade` で `assertNoDuplicateLiveJob` → `bootstrapJob` の順序が守られていることを確認（TC-003, TC-020）
- `src/core/command/resume.ts`: `RuntimeFacade` を使用し `RuntimeStrategy` import がないことを確認（TC-021）
- `src/core/port/runtime-strategy.ts`: 全メソッドが required（`?` なし）であることを確認（TC-022）
- `src/core/runtime/factory.ts`: `createRuntime()` 戻り値型が `RuntimeFacade` であることを確認（TC-023）
- `src/cli/bootstrap.ts`: `BootstrapResult.runtime` が `RuntimeFacade` 型であることを確認（TC-024）
- `src/core/pipeline/runtime-capability-gate.ts`: `canDeriveChangedFiles()` を optional chaining なしで直接呼び出していることを確認（TC-007）
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`: TC-008〜012, TC-031, TC-032a-d の ratchet assertions を確認（TC-015）
- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts`: TC-013/014（LocalRuntime/ManagedRuntime が RuntimeFacade を構造的に満たす）、TC-027〜030（assertProviderReadiness/assertNoDuplicateLiveJob/reloadJobState/canDeriveChangedFiles の Local/Managed 差異）を確認
- `tests/pipeline-sole-committer-e2e.test.ts`: `as unknown as RuntimeStrategy` が除去され typed capability object を使用していることを確認（TC-026）
- ratchet によって production src への `RuntimeStrategy & PipelineDepsBuilder`・`RealRuntimeStrategy`・`Pick<RuntimeStrategy`・`canDeriveChangedFiles?.`・derive shim・`as unknown as RuntimeStrategy` の再導入が CI で検出されることを確認（TC-015）
- `src/core/command/runner.ts` execute() の reload skip 条件（`workspaceOpts.existingWorktreePath === undefined`）が維持されていることを確認（TC-004, TC-005）

## 検証できなかった項目

- **TC-016 (manual)**: ユーザー向け挙動・出力・終了コードに差分がないこと — manual テストのためこのレビューでは検証不可
- **TC-032〜034 (gate)**: `bun run typecheck` / `bun run test` / `bun run lint` の実行結果 — CI 実行待ちのため確認不可
- `tests/unit/core/step/executor-cli-entry-oid.test.ts` および `tests/unit/core/step/verification-phase-outcome-executor.test.ts` の `makeRuntimeStrategy` が実際にどの capability slot に inject されているか（whole-port 型として CommandRunner に渡されているか、個別 slot に型安全に渡されているかの詳細）— +11 行の差分内容のみ確認
- managed runtime 新規 run での RELOAD_FAILED 挙動が実運用環境で問題を生じないかどうか — contract test (TC-029-managed) で throw することは確認済みだが実際の managed run での影響は未確認

---

## Coverage Assessment (test-cases.md 照合)

| Group | TC 範囲 | 状態 |
|---|---|---|
| 1: Lifecycle Execution Order | TC-001〜007 | 実装確認済み |
| 2: Structural Cleanup | TC-008〜012 | ratchet 実装済み。tests/unit/core/step/ はスコープ外 |
| 3: Runtime Contract Compliance | TC-013〜014 | command-lifecycle-contract.test.ts で確認済み |
| 4: Architecture Ratchet | TC-015 | 実装済み（F-1 の gap あり） |
| 5: Behavioral Invariants | TC-016 | manual（スコープ外） |
| 6: Interface Definition | TC-017〜022 | 実装確認済み |
| 7: Composition Root Types | TC-023〜024 | factory.ts / bootstrap.ts で確認済み |
| 8: Implementation Cleanup | TC-025〜026 | 確認済み |
| 9: Contract Tests | TC-027〜030 | command-lifecycle-contract.test.ts で確認済み |
| 10: Residual Cleanup | TC-031 | ratchet 確認済み |
| 11: Gate Checks | TC-032〜034 | gate（typecheck/test/lint） |

---

## 承認要件との照合

| 受け入れ条件 | 判定 |
|---|---|
| production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件 | ✅ |
| CommandRunner とサブクラスが full RuntimeStrategy に依存しない | ✅ |
| production の required lifecycle 処理に optional call/存在確認がない | ✅ |
| RealRuntimeStrategy が 0 件 | ✅ |
| Pick ベースの導出 shim が 0 件 | ✅ |
| `as unknown as RuntimeStrategy` が 0 件 | ✅ |
| test fake は typed builder/helper で必要 contract を満たす | ⚠️ F-1・F-2 (2 ディレクトリが未対応) |
| Local/Managed 双方の contract test がある | ✅ |
| architecture ratchet がある | ⚠️ F-1 (tests/unit/core/step/ が ratchet スコープ外) |
| VerificationがGreen | 未確認（CI 結果待ち） |
| ユーザー向け挙動・出力に差分がない | ✅（構造確認） |
