# Code Review Feedback — runtime-mutation-lifecycle-capability-split — iter 6

## Scope

Reviewed against: `design.md`, `tasks.md`, `test-cases.md`, and the full diff stat.
Verification result (iter 1): all phases passed (build / typecheck / test / lint / changed-line-coverage).
Prior finding (iter 5 Finding 1): `buildDeps()` returned `unknown`; `as PipelineDeps` cast remained in `runner.ts`.

Reference baseline: `main@660d48fb` (PR #1102 merge commit).

---

## Finding 1 — MEDIUM · fixable

**`TC-T15-05` title and comment block describe old behavior; test proves the inverse of AC-TC-021/TC-022**

`tests/unit/step/executor-lifecycle-ordering.test.ts` lines 253–278

The test title reads:
```
TC-T15-05: RuntimeStrategy.buildDeps() returns unknown at port boundary; caller casts to PipelineDeps (DSM §3)
```

And the comment block immediately above says:
```
// DSM §3 (ports-closure invariant): the `ports` layer (src/core/port/) may only
// import from shared-kernel and leaf.  PipelineDeps lives in src/core/types.ts
// which is classified as `domain`.  Therefore RuntimeStrategy.buildDeps() MUST
// declare its return type as `unknown` at the port boundary — importing
// PipelineDeps into the port file would be a DSM §3 violation
//
// The caller (domain code: runner.ts) casts the result with `as PipelineDeps`.
```

These statements are **factually wrong** in the current codebase. The iteration 5 finding (Finding 1) was fixed: `RuntimeStrategy.buildDeps()` now declares return type `PipelineDeps` in the port interface (`src/core/port/runtime-strategy.ts:395`), with a DSM allowlist entry (`src/core/port/runtime-strategy.ts` / `arch-allowlist.ts:302–313`) for the type-only import. The `as PipelineDeps` cast in `runner.ts` was removed. The architecture doc (`components.md:175`) correctly describes the new state.

The test body also uses a now-redundant cast:
```typescript
const deps = fake.buildDeps({} as never, {} as never, "", {} as never) as PipelineDeps;
```

Since `Pick<RuntimeStrategy, "buildDeps">` now resolves `buildDeps()` to return `PipelineDeps`, the `as PipelineDeps` cast is a no-op widening cast that TypeScript accepts without error — the test passes. However:

- **TC-021** (must): "the result is assigned directly to `deps: PipelineDeps` without `as PipelineDeps`; the TypeScript compiler accepts the assignment without a cast" — this is satisfied in production (`runner.ts`) but TC-T15-05 tests the opposite pattern.
- **TC-022** (must): "the return type is `PipelineDeps` (not `unknown`)" — satisfied in the interface, but TC-T15-05's description says `unknown`.

**Impact**: A future developer reading TC-T15-05 would conclude `buildDeps()` still returns `unknown` and the cast is required, contradicting the actual contract. The test also fails to prove the key acceptance criterion ("no cast required").

**Fix**: Rewrite TC-T15-05 to verify the new behavior:
1. The `RuntimeStrategy.buildDeps()` port returns `PipelineDeps` (no `unknown`).
2. The result can be assigned to a `PipelineDeps` variable without any cast.
3. Remove the comment block describing the old DSM §3 rationale for `unknown`.

Example replacement:
```typescript
it("TC-T15-05: RuntimeStrategy.buildDeps() returns PipelineDeps; no as-cast required", () => {
  const fake: Pick<RuntimeStrategy, "buildDeps"> = {
    buildDeps: () => makeBaseDeps(),
  };
  // Since buildDeps() now returns PipelineDeps directly (D3 / T-05 / T-12),
  // no `as PipelineDeps` cast is needed — the assignment is type-safe.
  const deps: PipelineDeps = fake.buildDeps({} as never, {} as never, "", {} as never);
  expect(deps.slug).toBe("test-slug");
});
```

---

## Finding 2 — MEDIUM · fixable

**TC-008 (must): `prepareStepArtifacts` ordering before agent run not covered by a spy test**

`tests/unit/step/executor-lifecycle-ordering.test.ts`

TC-008 specifies:
> **THEN** `deps.stepArtifact.prepareStepArtifacts` is invoked before the agent session starts; **a test spy confirms the ordering**

The lifecycle ordering test file (`executor-lifecycle-ordering.test.ts`) contains TC-T15-01 through TC-T15-04:
- TC-T15-01: verifies `finalizeStepArtifacts` receives `cwd:string` and `slug:string` primitives
- TC-T15-02: verifies `finalizeStepArtifacts` is not called when `roundOwnsGitEffects===true`
- TC-T15-03/TC-T15-04: verify `terminalState?.commitFinalState` guards

None of these tests verify that `prepareStepArtifacts` is called **before** `runner.run()`. In TC-T15-01, `prepareStepArtifacts` is a plain async no-op — not a `vi.fn()` spy — so no ordering assertion is possible:

```typescript
const stepArtifact = {
  async captureHeadSha(): Promise<string | null> { return null; },
  async prepareStepArtifacts(): Promise<void> {},  // ← plain no-op, no spy
  finalizeStepArtifacts: finalizeSpy,
  ...
};
```

**Impact**: The ordering invariant "prepare happens before agent runs" is not pinned by an executable test, as required by TC-008 (must priority). The implementation is correct, but the lifecycle contract is not verifiable by running the test suite.

**Fix**: Add a test in `executor-lifecycle-ordering.test.ts` that:
1. Wraps `prepareStepArtifacts` in a `vi.fn()` spy.
2. Also spies on `runner.run()` (or intercepts the agent runner).
3. Asserts that `prepareStepArtifacts` is called once, before `runner.run()` is called.

This can be done by recording call timestamps or using `mockImplementation` to append to an ordered call log, then asserting the order:
```typescript
const callOrder: string[] = [];
const stepArtifact = {
  async captureHeadSha() { return null; },
  prepareStepArtifacts: vi.fn(async () => { callOrder.push("prepare"); }),
  finalizeStepArtifacts: vi.fn(async () => {}),
  async digestArtifacts(refs: { path: string }[]) { return refs.map(r => ({ path: r.path, hash: null })); },
};
const runnerSpy = {
  run: vi.fn(async (): Promise<AgentRunResult> => {
    callOrder.push("runner.run");
    return { completionReason: "success" as const, resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 };
  }),
};
// ... execute ...
const prepareIdx = callOrder.indexOf("prepare");
const runIdx = callOrder.indexOf("runner.run");
expect(prepareIdx).toBeGreaterThanOrEqual(0);
expect(runIdx).toBeGreaterThan(prepareIdx);
```

---

## Finding 3 — LOW · fixable

**Stale `runtimeStrategy` references in comments within `step-types.ts` and `no-op-detect.ts`**

`src/core/port/step-types.ts` lines 63 and 310; `src/core/step/no-op-detect.ts` lines 27 and 36

**`step-types.ts` line 63** (JSDoc of `CliStepDeps`):
```
runtimeStrategy is optional — provided at runtime by PipelineDeps; may be absent in tests.
```
The `runtimeStrategy?: RuntimeStrategy | null` field was removed from `CliStepDeps` by this PR, but this comment was not updated. The comment now refers to a field that no longer exists.

**`step-types.ts` line 310** (JSDoc of `noOpDetect`):
```
Only effective when runtimeStrategy is available and headBeforeStep is non-null.
```
Post-R2b, the relevant condition is "when `deps.changedFiles` is available (not `undefined`) and headBeforeStep is non-null". The `runtimeStrategy` reference should be updated.

**`no-op-detect.ts` line 27** (precondition comment):
```
- runtimeStrategy is available (local runtime)
```
Should read "changedFiles capability is available" or similar.

**`no-op-detect.ts` line 36** (parameter name):
```typescript
export async function detectNoOp(
  step: AgentStep,
  runtimeStrategy: ChangedFilesCapability,
  ...
```
The parameter is typed as `ChangedFilesCapability` (correct) but named `runtimeStrategy` (stale). This was a pre-existing naming carryover from R2a. While this PR's scope is R2b, the file's JSDoc comments were updated by this PR (`step-types.ts` was modified), making these an opportunity for cleanup. Naming the parameter `changedFiles` would be consistent with the PipelineDeps field name.

**Impact**: Low — no runtime behavior affected. A developer reading these comments would be confused about which capability/field governs the behavior.

**Fix**: 
- Remove or rewrite the stale comment on `CliStepDeps` line 63.
- Update `noOpDetect` JSDoc line 310 to reference `changedFiles capability`.
- Update `no-op-detect.ts` precondition comment (line 27) and parameter name (`runtimeStrategy` → `changedFiles`).

---

## 検証した項目

| 項目 | 結果 | 根拠 |
|---|---|---|
| `buildDeps()` がポートインターフェースで `PipelineDeps` を返す | ✓ | `runtime-strategy.ts:395`; DSM allowlist エントリ |
| `runner.ts` から `as PipelineDeps` キャストが除去された | ✓ | grep: `src/core/command/runner.ts` に `as PipelineDeps` なし |
| `PipelineDeps.runtimeStrategy` が `types.ts` から除去された | ✓ | R2b コメントのみ（フィールド定義なし） |
| `finalizeStepArtifacts`・`commitFinalState`・`commitRoundArtifacts` が `RuntimeStrategy` インターフェースから除去された | ✓ | JSDoc のみ（メソッド宣言なし） |
| `StepArtifactLifecycleCapability` の全メソッドが required（`snapshotMainCheckoutGuard?` のみ例外） | ✓ | `step-capability.ts:36–94` |
| `StepIoValidationCapability` の全メソッドが required | ✓ | `step-capability.ts:108–139` |
| `TerminalStateCapability.commitFinalState` が具体型（`unknown` なし） | ✓ | `pipeline-capability.ts:65`; `cwd: string \| undefined` は具体型 |
| `RoundGitEffectsCapability` の全 5 メソッドが required | ✓ | `pipeline-capability.ts:82–143` |
| `executor.ts` に `deps.runtimeStrategy` 参照がゼロ | ✓ | grep 確認：0 件 |
| `pipeline.ts` が `deps.terminalState?.commitFinalState(cwd, slug, state)` を使用 | ✓ | lines 399, 623 |
| `parallel-review-round.ts` が `deps.roundGitEffects` を使用 | ✓ | `run()` メソッド全体 |
| `local.ts` の対象メソッドに `as CommitPushInfra` なし | ✓ | grep 確認：型付き `infra` パラメータ |
| `RoundEgressParams` が typed DTO（`unknown` なし） | ✓ | `pipeline-capability.ts:34–38` |
| 新たな `as unknown as RuntimeStrategy` の追加なし | ✓ | `src/` 配下で 0 件、既存 4 件は e2e テストのみ |
| R2a capabilities（`changedFiles`・`commitInspection`・`revisionContent`）が退行していない | ✓ | `PipelineDeps` に全フィールド存在 |
| derive helpers が capability interface と同ファイルに配置（D5） | ✓ | `step-capability.ts:161–199`、`pipeline-capability.ts:148–196` |
| capability 不在を field presence で表現、optional method ではない（D6） | ✓ | 全 consumer 呼び出しが `deps.stepArtifact?.method()` パターン |
| TC-T15-01: `finalizeStepArtifacts` が `cwd:string`・`slug:string` を受け取る | ✓ | `executor-lifecycle-ordering.test.ts:131–171` |
| TC-T15-02: `roundOwnsGitEffects=true` 時に `finalizeStepArtifacts` が呼ばれない | ✓ | `executor-lifecycle-ordering.test.ts:173–207` |
| TC-T15-03/04: `terminalState` guard のセマンティクス | ✓ | `executor-lifecycle-ordering.test.ts:217–249` |
| LocalRuntime の capability contract テスト（T-14） | ✓ | `local-runtime-capabilities.test.ts` |
| ManagedRuntime の capability contract テスト（T-14） | ✓ | `managed-runtime-capabilities.test.ts` |
| TC-028: ManagedRuntime.buildDeps が R2b capability フィールドを注入 | ✓ | `managed-runtime-capabilities.test.ts` |
| architecture doc が R2b 後の責務・依存方向に一致 | ✓ | `components.md:171–183` |
| 検証: build / typecheck / test / lint すべて pass | ✓ | `verification-result.md` iter 1 |

---

## 検証できなかった項目

| 項目 | 理由 |
|---|---|
| TC-042: `architecture/components.md` の手動レビュー | manual TC のため自動検証不可。内容は `components.md:171–183` で確認済み（R2b セクション・PipelineDeps 説明いずれも更新済み） |
| TC-T15-05 の実行時動作（Finding 1 関連） | テストは pass するが、記述が旧動作（`unknown` 返却）を証明している。実行時正確性は問題ないが、記述の正確性は確認できない |

---

## Confirmed Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| `buildDeps()` returns `PipelineDeps` in port interface | ✓ | `runtime-strategy.ts:395`; DSM allowlist entry |
| `as PipelineDeps` cast removed from `runner.ts` | ✓ | grep: no `as PipelineDeps` in `src/core/command/runner.ts` |
| `PipelineDeps.runtimeStrategy` removed from `types.ts` | ✓ | Only in R2b comment |
| `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` removed from `RuntimeStrategy` interface | ✓ | Only in JSDoc, not method declarations |
| `StepArtifactLifecycleCapability` all required methods (except `snapshotMainCheckoutGuard?`) | ✓ | `step-capability.ts:36–94` |
| `StepIoValidationCapability` all required methods | ✓ | `step-capability.ts:108–139` |
| `TerminalStateCapability.commitFinalState` typed (not `unknown`) | ✓ | `pipeline-capability.ts:65`; `cwd: string \| undefined` is concrete |
| `RoundGitEffectsCapability` all 5 methods required | ✓ | `pipeline-capability.ts:82–143` |
| `executor.ts` zero `deps.runtimeStrategy` references | ✓ | grep confirms 0 |
| `pipeline.ts` uses `deps.terminalState?.commitFinalState(cwd, slug, state)` | ✓ | lines 399, 623 |
| `parallel-review-round.ts` uses `deps.roundGitEffects` | ✓ | throughout `run()` method |
| No `as CommitPushInfra` in `local.ts` target methods | ✓ | grep confirms typed `infra` parameter |
| `RoundEgressParams` typed DTO (no `unknown`) | ✓ | `pipeline-capability.ts:34–38` |
| No new `as unknown as RuntimeStrategy` introduced | ✓ | Only 4 pre-existing occurrences in e2e test files |
| R2a capabilities (`changedFiles`, `commitInspection`, `revisionContent`) not regressed | ✓ | All present in `PipelineDeps` |
| Derive helpers co-located with capability interfaces (D5) | ✓ | `step-capability.ts:161–199`, `pipeline-capability.ts:148–196` |
| Capability absence via field presence, not optional methods (D6) | ✓ | All consumer calls use `deps.stepArtifact?.method()` pattern |
| TC-T15-01: `finalizeStepArtifacts` receives `cwd:string`, `slug:string` | ✓ | `executor-lifecycle-ordering.test.ts:131–171` |
| TC-T15-02: `finalizeStepArtifacts` skipped for `roundOwnsGitEffects=true` | ✓ | `executor-lifecycle-ordering.test.ts:173–207` |
| TC-T15-03/04: `terminalState` guard semantics | ✓ | `executor-lifecycle-ordering.test.ts:217–249` |
| Capability contract tests for LocalRuntime (T-14) | ✓ | `local-runtime-capabilities.test.ts` |
| Capability contract tests for ManagedRuntime (T-14) | ✓ | `managed-runtime-capabilities.test.ts` |
| TC-028: ManagedRuntime.buildDeps injects R2b capabilities | ✓ | `managed-runtime-capabilities.test.ts` |
| Architecture doc updated (R2b section, R2b-compliant `PipelineDeps` description) | ✓ | `components.md:171–183` |
| Verification: build / typecheck / test / lint all pass | ✓ | `verification-result.md` iter 1 |
