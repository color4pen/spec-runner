# Review Feedback — Iteration 12

**Branch**: refactor/runtime-strategy-convergence  
**Reviewer**: code-review (iteration 12)  
**Scope**: R2c — RuntimeStrategy whole-port dependency and migration shim removal

---

## Summary

The implementation broadly achieves all stated acceptance criteria. Production code is clean: `RuntimeStrategy & PipelineDepsBuilder` intersection is gone from all 5 production sites, all 10 formerly-optional methods are now required, `RealRuntimeStrategy` is removed, `Pick`-based shims are eliminated, and `as unknown as RuntimeStrategy` double-casts are gone from test files. The architecture ratchet and Local/Managed contract tests are in place.

Two findings remain. Both are in test files only. Neither blocks the merge, but the ratchet gap (Finding 2) means re-introduction of the pattern guarded by TC-038 is possible without detection.

---

## Findings

### Finding 1 — TC-038 violation: local `CommandRunnerRuntime` re-definition in two test files

**Severity**: low  
**Resolution**: fixable

**Files**:
- `tests/core/provider-readiness-gate.test.ts` (line 80)
- `tests/unit/core/command/runner-fidelity-gate.test.ts` (line 64)

Both files locally re-define `CommandRunnerRuntime` as a structural type alias instead of importing it from `src/core/command/runner.ts`:

```typescript
// Both files define this locally:
type CommandRunnerRuntime = ProviderReadinessCapability
  & WorkspaceLifecycleCapability
  & JobStatePersistenceCapability
  & PipelineDepsBuilder;
```

TC-038 requires:
> runtime 引数は `src/core/command/runner.ts` から import した `CommandRunnerRuntime` 型で構築され… ローカルな `CommandRunnerRuntime` 再定義 が存在しない

Today the local alias matches `runner.ts`'s exported `CommandRunnerRuntime` exactly, so tests compile and pass. However, if `CommandRunnerRuntime` in `runner.ts` gains or loses a capability, the local aliases will silently drift: no type error, no test failure — the local alias just keeps its old shape.

**Fix**: In both files, replace the local type alias and its component imports with a single import:
```typescript
import type { CommandRunnerRuntime } from "../../../../src/core/command/runner.js";
// (adjust relative depth for provider-readiness-gate.test.ts)
```

---

### Finding 2 — Ratchet gap: TC-039 does not guard against local `CommandRunnerRuntime` re-definitions

**Severity**: low  
**Resolution**: fixable

The architecture ratchet (`src/core/port/__tests__/runtime-strategy-ratchet.test.ts`) enforces:
- TC-039a: no `RuntimeFacade` named imports in test files
- TC-039b: no `as never` in the runtime argument of constructor calls

It does **not** enforce:
- TC-038: no local `type CommandRunnerRuntime = …` re-definitions in test files

Because TC-039 does not check for this pattern, the two files identified in Finding 1 cannot be caught by the ratchet, and future re-introductions of the same drift-prone pattern would also go undetected.

**Fix**: Add a TC-039c assertion to the ratchet test:

```typescript
it("TC-039c: local CommandRunnerRuntime re-definitions absent from test files", async () => {
  const allTestFiles = (await collectTestFiles(SRC_DIR, TESTS_DIR))
    .filter((f) => f !== SELF_FILE);
  // Match: `type CommandRunnerRuntime` or `interface CommandRunnerRuntime` defined locally
  const hits = await findOccurrencesRegex(
    allTestFiles,
    /\btype\s+CommandRunnerRuntime\s*=|\binterface\s+CommandRunnerRuntime\b/,
  );
  expect(
    hits,
    `Found local CommandRunnerRuntime definitions in test files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
  ).toHaveLength(0);
});
```

This must be added after Finding 1 is fixed to avoid a failing ratchet test on the corrected files.

---

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件 | ✅ confirmed by ratchet TC-008 + grep |
| `CommandRunner` と subclass が full `RuntimeStrategy` に依存しない | ✅ runner.ts, pipeline-run.ts, resume.ts すべて confirmed |
| production の required lifecycle 処理に optional call/存在確認がない | ✅ grep で optional chaining 0 件 |
| `RealRuntimeStrategy` が 0 件 | ✅ ratchet TC-009, TC-031 |
| `Pick` ベースの導出 shim が 0 件 | ✅ ratchet TC-010, TC-011 |
| `as unknown as RuntimeStrategy` が 0 件 | ✅ ratchet TC-012 |
| test fake は typed builder/helper で必要 contract を満たす | ✅ (除: Finding 1 の local 再定義) |
| Local / Managed command lifecycle の contract test がある | ✅ command-lifecycle-contract.test.ts (TC-027 〜 TC-030, TC-013, TC-014) |
| full-port 依存と fake 都合 optional の再導入を防ぐ ratchet がある | ✅ 部分的 (Finding 2: local re-definition のガードが欠如) |
| ユーザー向け挙動・出力・終了コードに差分がない | ✅ execute() の順序・分岐は変更なし |

---

## Positive Observations

- `RuntimeFacade` の分離ファイル (`src/core/runtime-facade.ts`) はポート→ドメインの逆依存を生まずに composition root aggregate を定義する正しい設計。
- `CommandRunnerRuntime` / `PipelineRunRuntime` の 2 段階 narrowing は型安全を保ちながら責務を明確に分離している。
- ratchet test の `countConstructorFirstArgAsNever` ロジックは複数行コンストラクタ呼び出しをパーレン深さ追跡で処理しており、堅牢。
- `canDeriveChangedFiles` の optional chaining (`?.`) が production src から完全に除去されている点は重要な改善。
- `scope-check.ts` は `canDeriveChangedFiles()` を直接呼び出し (TC-006 ✅)、`runtime-capability-gate.ts` も同様 (TC-007 ✅)。

---

## 検証した項目

- `src/core/port/command-runtime.ts` — 4 つの named lifecycle capability interface が全メソッド required で定義されていることを確認
- `src/core/runtime-facade.ts` — `RuntimeFacade` が 6 capability の intersection として正しく定義されていることを確認
- `src/core/command/runner.ts` — `CommandRunnerRuntime` 型定義、execute() の呼び出し順序（assertProviderReadiness → prepare → setupWorkspace → reloadJobState → buildDeps → registerCleanup → pipeline → teardown）を確認
- `src/core/command/pipeline-run.ts` — `PipelineRunRuntime` 型定義、assertNoDuplicateLiveJob が bootstrapJob より前に呼ばれることを確認
- `src/core/command/resume.ts` — `CommandRunnerRuntime` のみを要求し `JobBootstrapCapability` / `RuntimeStrategy` を参照しないことを確認
- `src/core/runtime/factory.ts` — 戻り値型が `RuntimeFacade` であることを確認
- `src/cli/bootstrap.ts` — `BootstrapResult.runtime` が `RuntimeFacade` 型であることを確認
- `src/core/pipeline/runtime-capability-gate.ts` — `canDeriveChangedFiles()` を optional chaining なしで直接呼び出すことを確認
- `src/core/step/scope-check.ts` — `canDeriveChangedFiles()` を optional chaining なしで直接呼び出すことを確認
- `src/core/port/runtime-strategy.ts` — RuntimeStrategy の全メソッドが required（`?` なし）であることを確認
- grep: production src に `RuntimeStrategy & PipelineDepsBuilder` が 0 件（ratchet ファイルのみ）
- grep: production src に `Pick<RuntimeStrategy` が 0 件（ratchet ファイルのみ）
- grep: production src に `canDeriveChangedFiles?.` が 0 件（ratchet ファイルのみ）
- grep: production src に `RealRuntimeStrategy` が 0 件（ratchet ファイルのみ）
- grep: test files に `as unknown as RuntimeStrategy` が 0 件
- grep: test files に `import.*{[^}]*RuntimeStrategy` の named import が 0 件
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` — TC-008〜TC-012, TC-015, TC-031, TC-035, TC-037, TC-039 の ratchet assertions を確認
- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` — TC-013/014（構造適合）, TC-027〜TC-030（Local/Managed 差異）を確認
- `tests/core/provider-readiness-gate.test.ts` — `CommandRunnerRuntime` をローカル再定義していることを確認（Finding 1）
- `tests/unit/core/command/runner-fidelity-gate.test.ts` — `CommandRunnerRuntime` をローカル再定義していることを確認（Finding 1）
- `tests/pipeline-sole-committer-e2e.test.ts` — `as unknown as RuntimeStrategy` が除去され typed capability object を使用していることを確認
- `tests/unit/core/command/runner.test.ts` — `CommandRunnerRuntime` を runner.ts から正しく import していることを確認

---

## 検証できなかった項目

- `bun run typecheck` / `bun run test` / `bun run lint` の実行結果（gate TC-032〜TC-034）: CI 環境でのみ検証可能
- TC-016（ユーザー向け挙動に差分がない）: manual 検証項目

---

## Conclusion

Both findings are low severity and isolated to test files. The production contract is correct and fully enforced by the new capability interfaces and ratchet tests. The fixes are straightforward import replacements + one ratchet assertion.

**Recommended action**: fix both findings before merge. Finding 1 first (fix the test files), then Finding 2 (add the ratchet guard that catches re-introduction).
