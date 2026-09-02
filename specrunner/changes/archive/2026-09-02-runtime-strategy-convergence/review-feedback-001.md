# Code Review Feedback — runtime-strategy-convergence — iter 1

## Scope

Reviewed implementation files changed in this branch against spec, design, tasks, and test-cases.md.
All must-priority TC results verified against the verification-result.md (passed, 97.5 s).

---

## Finding 1 — Critical / Fixable

**Title**: Architecture ratchet has off-by-one error in REPO_ROOT path — all assertions pass vacuously

**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`
**Line**: 117

### Detail

The comment above `REPO_ROOT` says "Repo root is 4 levels up from `__tests__`" but the code uses 5 `..` segments:

```ts
// Repo root is 4 levels up from __tests__: src/core/port/__tests__ → src/core/port → src/core → src → repo root
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");
//                                                   ^^^  ^^^  ^^^  ^^^  ^^^
//                                                   1    2    3    4    5  ← one too many
```

Tracing from `src/core/port/__tests__`:
1. `..` → `src/core/port`
2. `../..` → `src/core`
3. `../../..` → `src`
4. `../../../..` → **repo root** ← correct stop point
5. `../../../../..` → **parent of repo root** ← what the code actually resolves to

`SRC_DIR` and `TESTS_DIR` therefore point to non-existent paths (`<parent>/src`, `<parent>/tests`).
`collectTsFiles` catches the `readdir` error and returns `[]`.
Every call to `findOccurrences([], ...)` returns `[]`.
Every `expect([]).toHaveLength(0)` passes vacuously.

**All 8 ratchet tests pass without scanning a single file.** The ratchet provides zero protection against re-introduction of `RuntimeStrategy & PipelineDepsBuilder`, `RealRuntimeStrategy`, `Pick<RuntimeStrategy`, `as unknown as RuntimeStrategy`, `canDeriveChangedFiles?.`, or the derive shims.

**Secondary issue**: With the off-by-one fixed, the ratchet test file itself would appear in the SRC_DIR scan. Its content contains the forbidden strings (as test-description literals and as the `findOccurrences` pattern arguments). The self-referential scan would cause all forbidden-pattern assertions to find at least one hit in the ratchet file itself. The fix therefore requires:
1. Correcting `..` from 5 to 4.
2. Excluding the ratchet test file from its own scan (e.g. `files.filter(f => !f.endsWith("runtime-strategy-ratchet.test.ts"))`), OR using split-pattern construction to avoid literal self-matching.
3. Cleaning the stale `RealRuntimeStrategy` references in comments (see Finding 3) so the post-fix scan passes cleanly.

**Fix**:
```ts
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
//                                                   ^^^  ^^^  ^^^  ^^^
//                                                   1    2    3    4 ← correct
```

---

## Finding 2 — Medium / Fixable

**Title**: `JobBootstrapCapability` JSDoc documents managed `assertNoDuplicateLiveJob` as no-op, but implementation calls `assertSlugUnoccupied`

**File**: `src/core/port/command-runtime.ts`
**Line**: 50

### Detail

`command-runtime.ts` line 50:
```ts
 * - managed: assertNoDuplicateLiveJob is no-op. bootstrapJob creates in-memory JobState.
```

`managed.ts` line 618–622 (actual implementation):
```ts
async assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void> {
  await assertSlugUnoccupied(repoRoot, slug, {
    isAlive: (pid) => isProcessAlive(pid ?? 0),
  });
}
```

`ManagedRuntime.assertNoDuplicateLiveJob` is **not** a no-op; it calls `assertSlugUnoccupied` identically to `LocalRuntime`. The test TC-028-managed only checks that the method resolves without error on a fresh directory — it does not assert no-op behaviour (no spy to confirm zero calls to assertSlugUnoccupied).

**Related stale comment** in `managed.ts` line 627:
```ts
 * No-op — mirrors assertNoDuplicateLiveJob convention.
```
This comment (on `assertProviderReadiness`) says it "mirrors assertNoDuplicateLiveJob convention", implying that convention is no-op — but `assertNoDuplicateLiveJob` is not a no-op.

**Fix**: Either (a) align the JSDoc to reflect that managed also calls `assertSlugUnoccupied` and update the test to verify the actual call count, or (b) make managed `assertNoDuplicateLiveJob` actually a no-op and update both the implementation and the test. Either way, the JSDoc and implementation must match.

---

## Finding 3 — Low / Fixable

**Title**: Stale JSDoc comments reference removed concepts (`RealRuntimeStrategy`, old optional chaining)

### Instance A

**File**: `src/core/runtime/managed.ts`
**Lines**: 606–608

```ts
 * The optional-chaining call in runner.ts uses `?.`, so if this method were absent
 * the fallback would be used — but RealRuntimeStrategy requires it, so it must be
 * present. The safest production behavior for managed is to throw.
```

Both references are stale:
- "optional-chaining call in runner.ts uses `?.`" — `reloadJobState` is now a required method on `JobStatePersistenceCapability`; there is no optional chaining in runner.ts for this method.
- "RealRuntimeStrategy requires it" — `RealRuntimeStrategy` was deleted (TC-009).

### Instance B

**File**: `src/core/port/provider-readiness.ts`
**Line**: 5

```ts
 * Consumed by RuntimeStrategy (optional on base, required on RealRuntimeStrategy)
```

`RealRuntimeStrategy` no longer exists. This JSDoc should describe the current consumers.

**Fix**: Update both comments to reflect post-R2c reality. These comments also mean that after fixing Finding 1, TC-009 (the "RealRuntimeStrategy" ratchet) would detect `managed.ts:607` as a violation, so they must be cleaned before or alongside the ratchet fix.

---

## Finding 4 — Low / Fixable

**Title**: Test fakes in `runner.test.ts` still use `RuntimeStrategy & PipelineDepsBuilder` instead of the capability intersection or `RuntimeFacade`

**File**: `tests/unit/core/command/runner.test.ts`
**Lines**: 94, 148

```ts
// Line 94
} = {}): RuntimeStrategy & PipelineDepsBuilder {

// Line 148
runtime: RuntimeStrategy & PipelineDepsBuilder,
```

The acceptance criterion states: "test fake は typed builder/helper で必要 contract を満たす". Using `RuntimeStrategy & PipelineDepsBuilder` as the fake type exposes a full-port dependency in test infrastructure and is the same pattern that the refactoring aimed to remove. The fake should be typed as `RuntimeFacade` (or the capability intersection used by `CommandRunner`).

This is guarded only in production files by TC-008 (`collectProductionFiles` excludes `__tests__` dirs), so the ratchet does not catch it even when the path bug is fixed. Manual update is required.

**Fix**: Replace `RuntimeStrategy & PipelineDepsBuilder` with `RuntimeFacade` (imported from `core/port/command-runtime.ts`) in both the `makeRuntime()` return type and the `TestCommand` constructor parameter.

---

## Positive Observations

- Core refactoring goal achieved: `CommandRunner`, `PipelineRunCommand`, `ResumeCommand`, `BootstrapResult.runtime`, and `factory.ts` no longer reference `RuntimeStrategy & PipelineDepsBuilder` in production code.
- `RuntimeFacade` intersection type is well-documented with per-capability JSDoc in `command-runtime.ts`.
- `LocalRuntime` and `ManagedRuntime` satisfy `RuntimeFacade` structurally; compile-time proof in `command-lifecycle-contract.test.ts`.
- No optional methods remain in `RuntimeStrategy` (TC-022 satisfied).
- `as unknown as RuntimeStrategy` double casts are gone from `pipeline-sole-committer-e2e.test.ts` (TC-012 satisfied).
- `RealRuntimeStrategy`, `Pick<RuntimeStrategy`, `deriveCommitInspectionCapability`, and `deriveRevisionContentCapability` shims are absent from production source.
- `runtime-capability-gate.ts` now uses `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` (not `Pick<RuntimeStrategy>`), which is outside the ratchet scope and is an acceptable narrowing.
- Verification passes (build + typecheck + test + lint + changed-line-coverage) — behavioral invariants are preserved.

---

## 検証した項目

| TC | 優先度 | 検証方法 | 結果 |
|----|--------|----------|------|
| TC-008: production に RuntimeStrategy & PipelineDepsBuilder が存在しない | must | src/core/command/runner.ts, pipeline-run.ts, resume.ts, factory.ts, bootstrap.ts を直接読んで確認 | ✓ production ソースから排除済み |
| TC-009: src/ 配下に RealRuntimeStrategy が存在しない | must | grep で src/ を検索 | △ managed.ts:607 と provider-readiness.ts:5 のコメントに残存（Finding 3） |
| TC-012: as unknown as RuntimeStrategy がテストファイルに存在しない | must | grep で tests/ を検索 | ✓ 残存なし（as never のみ） |
| TC-013: LocalRuntime が RuntimeFacade を構造的に満たす | must | command-lifecycle-contract.test.ts を読んで確認 | ✓ コンパイル時証明あり |
| TC-014: ManagedRuntime が RuntimeFacade を構造的に満たす | must | command-lifecycle-contract.test.ts を読んで確認 | ✓ コンパイル時証明あり |
| TC-015: ratchet test が禁止パターンの再導入を検出する | must | runtime-strategy-ratchet.test.ts の実装を読んで確認 | ✗ REPO_ROOT off-by-one により全アサーションが vacuously pass（Finding 1） |
| TC-017: 4 capability interface が required メソッドのみで定義されている | should | command-runtime.ts を全読 | ✓ optional (`?:`) なし、Pick 不使用 |
| TC-018: RuntimeFacade が 5 要素 intersection である | should | command-runtime.ts:139–144 を確認 | ✓ 定義一致 |
| TC-019: CommandRunner が RuntimeStrategy import を持たない | must | runner.ts の import 文を確認 | ✓ RuntimeStrategy import なし |
| TC-020: PipelineRunCommand が RuntimeStrategy import を持たない | must | pipeline-run.ts の import 文を確認 | ✓ RuntimeStrategy import なし、RuntimeFacade を使用 |
| TC-021: ResumeCommand が RuntimeStrategy import を持たない | should | resume.ts の import 文を確認 | ✓ RuntimeStrategy import なし、RuntimeFacade を使用 |
| TC-022: RuntimeStrategy の全メソッドが required | must | runtime-strategy.ts を全読、`?:` を検索 | ✓ optional メソッドは 0 件 |
| TC-023: factory.ts の戻り値型が RuntimeFacade | should | factory.ts を直接読んで確認 | ✓ `RuntimeFacade` を返す |
| TC-024: BootstrapResult.runtime が RuntimeFacade 型 | should | bootstrap.ts を直接読んで確認 | ✓ `runtime: RuntimeFacade` |
| TC-027: assertProviderReadiness Local/Managed 差異 | should | command-lifecycle-contract.test.ts を読んで確認 | ✓ Local: probe 呼び出し確認、Managed: no-op 確認 |
| TC-028: assertNoDuplicateLiveJob Local/Managed 差異 | should | contract test + managed.ts 実装を確認 | △ テストは happy-path のみ。実装は no-op でなく assertSlugUnoccupied を呼ぶ（Finding 2） |
| TC-029: reloadJobState Local/Managed 差異 | should | command-lifecycle-contract.test.ts を読んで確認 | ✓ Local: store load、Managed: throw 確認 |
| TC-030: canDeriveChangedFiles Local/Managed 差異 | should | command-lifecycle-contract.test.ts を読んで確認 | ✓ Local: true、Managed: false |
| TC-031: RealRuntimeStrategy がテストファイルを含む全ファイルに存在しない | must | grep で tests/ を検索 | ✓ tests/ には残存なし |
| TC-032: typecheck が全エラー 0 件 | must | verification-result.md を確認 | ✓ 0 件 |
| TC-033: bun run test が全 green | must | verification-result.md を確認 | ✓ passed (97.5 s) |
| TC-034: bun run lint が新規エラーなし | should | verification-result.md を確認 | ✓ passed |

---

## 検証できなかった項目

| TC | 理由 |
|----|------|
| TC-001: provider readiness チェックが prepare() より前に無条件で呼ばれる | runner-fidelity-gate.test.ts の TC-001 は issue fidelity gate の別機能をテストしており、このTCに対応するライフサイクル順序テストの具体的なファイルを特定できなかった。verification-result.md が全テスト green であることで間接的に確認。 |
| TC-002: provider readiness が型的に required である | 型チェックで保証されるが、dedicated test が特定できなかった。typecheck passed (TC-032) で間接確認。 |
| TC-003: assertNoDuplicateLiveJob が bootstrapJob より前に無条件で呼ばれる | 順序テストの具体ファイルを特定できなかった。verification-result.md で間接確認。 |
| TC-004: run path では reloadJobState が無条件で呼ばれる | runner-reload-egress-e2e.test.ts が関連するが、当該 TC の直接対応テストを特定できなかった。 |
| TC-005: resume path では reloadJobState がスキップされる | 同上。 |
| TC-006: scope-check が canDeriveChangedFiles を直接呼ぶ | 対応テストの特定に至らなかった。 |
| TC-007: runtime-capability-gate が canDeriveChangedFiles を直接呼ぶ | runtime-capability-gate.test.ts が存在するが、当該 TC の直接確認まで調査時間が不足した。 |
| TC-016: ユーザー向け挙動に差分がない | Manual TC のため未検証。 |
| TC-025: buildDeps() が Pick-based shim を使わず直接 capability を構築する | local.ts/managed.ts の buildDeps() 実装を詳細確認できなかった。 |
| TC-026: pipeline-sole-committer-e2e.test.ts が typed capability object を使う | as unknown as RuntimeStrategy の不在は確認済みだが、RoundGitEffectsCapability/StepIoValidationCapability 型の注入が typed object として正しく構築されているかの詳細確認は限定的。 |
