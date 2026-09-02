# Regression Gate Result — Iteration 009

**Branch**: refactor/runtime-strategy-convergence-b0074b66
**Date**: 2026-09-02
**Ledger items checked**: 24
**Regressions found**: 0

## Summary

All 24 findings from the ledger have been verified as fixed in the current code. No regressions detected.

## Verification Details

### [1] `74c57ebf` — design.md Risk 節の reloadJobState 推論 — FIXED
design.md:181 now correctly states that managed new run では `reloadJobState` が実装済み（throw する）かつ `existingWorktreePath === undefined` が true になるため既に throw が発生する経路が存在する。旧来の「resume path をスキップするため throw する経路はない」という誤った記述は修正済み。

### [2] `a3f334e5` — ratchet に `canDeriveChangedFiles?.` 禁止パターンが欠落 — FIXED
`runtime-strategy-ratchet.test.ts` lines 205–211 に `canDeriveChangedFiles?.` を production src 禁止パターンとして assert する ratchet が追加された。design.md D7 の項目 6 にも記載済み。

### [3] `bf648013` — REPO_ROOT off-by-one — FIXED
`runtime-strategy-ratchet.test.ts:117` の `REPO_ROOT` は `path.resolve(import.meta.dirname, "..", "..", "..", "..")` — 4 つの `..` で正しくリポジトリルートを指している。コメントも「4 levels up」と一致。

### [4] `3c2c274d` — JSDoc assertNoDuplicateLiveJob managed no-op — FIXED
`command-runtime.ts:51` は「managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local).」と正確に記述されている。旧「no-op」記述は削除済み。

### [5] `9276fb21` — Stale JSDoc in managed.ts:607 — FIXED
`managed.ts:601–608` のコメントは「reloadJobState is required on JobStatePersistenceCapability; the safest production behavior for managed runtime is to throw rather than silently skip.」と更新済み。`RealRuntimeStrategy` および optional chaining への言及はなし。`provider-readiness.ts:5` も「Consumed by ProviderReadinessCapability (required) in command-runtime.ts」と更新済み。

### [6] `c13131e8` — runner.test.ts fake typed as RuntimeStrategy & PipelineDepsBuilder — FIXED
`runner.test.ts:94` の `buildMockRuntime` は `RuntimeFacade` を返すよう更新済み。`RuntimeStrategy & PipelineDepsBuilder` の参照なし。

### [7] `dfde0782` — types.ts JSDoc stale — FIXED
`types.ts:165–166` は「Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface」と更新済み。

### [8] `2312a149` — PipelineDepsBuilder JSDoc stale (same location as [7]) — FIXED
同上。`types.ts:165–166` の JSDoc が正確な記述に更新済み。

### [9] `57758a4f` — runtime-strategy.ts file-level JSDoc stale — FIXED
`runtime-strategy.ts:22–24` は「Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file.」と更新済み。

### [10] `868d8ee7` — TestCommand constructor in runner-reload-egress-e2e.test.ts — FIXED
`runner-reload-egress-e2e.test.ts:295` の `TestCommand` は `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` を受け取るよう更新済み。

### [11] `50dac132` — TC-032 が tests/unit/core/runtime/ をカバーしない — FIXED
TC-032c (`runtime-strategy-ratchet.test.ts:256–264`) が `tests/unit/core/runtime/` ディレクトリを対象に追加された。

### [12] `3630b474` — assertRuntimeSupportsScope が Pick<ChangedFilesCapability> を使用 — FIXED
`runtime-capability-gate.ts:74` のパラメータ型は `ChangedFilesCapability` に更新済み。

### [13] `7884d0f9` — resolve-scope.test.ts helpers が Pick<RuntimeStrategy> を返す — FIXED
`resolve-scope.test.ts:310,317` の `makeIncapableRuntime()` / `makeCapableRuntime()` は `ChangedFilesCapability` を返すよう更新済み。

### [14] `fb43706d` — 修飾 import 形式 `as unknown as import(...)RuntimeStrategy` が TC-012 をすり抜ける — FIXED
`unpushable-path-contract.test.ts` から `RuntimeStrategy` の参照は完全に除去済み（grep で確認）。

### [15] `39e34e9c` — step-layer テストのモノリシック fake が ratchet 外 — FIXED
TC-032d (`runtime-strategy-ratchet.test.ts:270–278`) が `tests/unit/step/` を対象に追加された。`executor-input-validation.test.ts` 等に `RuntimeStrategy & PipelineDepsBuilder` の記述なし（grep で確認）。

### [16] `adfd236f` — managed-runtime-capabilities.test.ts 二重 optional chaining — FIXED
`managed-runtime-capabilities.test.ts:290` は `deps.changedFiles?.canDeriveChangedFiles()` — 内側 `?.` が除去済み。

### [17] `fb1f1c44` — 修飾 import 形式の ratchet gap（[14] と同一箇所） — FIXED
Finding [14] と同様。`unpushable-path-contract.test.ts` から `RuntimeStrategy` 参照は完全除去済み。

### [18] `bb562fd0` — managed-runtime-capabilities.test.ts 内側 `?.` 不要（[16] と同一箇所） — FIXED
Finding [16] と同様。

### [19] `ec2aa9e0` — TC-032 が tests/unit/step/ をカバーしない — FIXED
TC-032d により修正済み（Finding [15] と同様）。

### [20] `64d3a5b3` — tests/unit/core/step/ が ratchet 外 — FIXED
TC-032e (`runtime-strategy-ratchet.test.ts:284–292`) が `tests/unit/core/step/` を対象に追加された。`executor-cli-entry-oid.test.ts` に `RuntimeStrategy & PipelineDepsBuilder` なし（grep で確認）。

### [21] `e3c7d9fb` — tests/attach/ が ratchet 外（known gap） — FIXED
TC-032f (`runtime-strategy-ratchet.test.ts:297–305`) が `tests/attach/` を対象に追加された。`attach-resume-e2e.test.ts` に `RuntimeStrategy & PipelineDepsBuilder` なし（grep で確認）。

### [22] `d7765b54` — runner.ts JSDoc Execution sequence に Step 0 欠落 — FIXED
`runner.ts:8` に「Step 0: assertProviderReadiness() — before prepare(); readiness failures have no side effects」が追加済み。Error handling セクション（line 18）にも「assertProviderReadiness() failure → return 1 (no job state created)」が記載済み。

### [23] `70bd6bc9` — TC-012 が `as any as RuntimeStrategy` をカバーしない — FIXED
TC-012b (`runtime-strategy-ratchet.test.ts:193–197`) が `as any as RuntimeStrategy` を禁止パターンとして追加。`tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts` に該当パターンなし（grep で確認）。TC-032g も `tests/unit/pipeline/` をカバー。

### [24] `6f18b58e` — command-runtime.ts JSDoc が factory.ts を参照 — FIXED
`command-runtime.ts:15–16` は「RuntimeFacade ... is defined in src/core/runtime-facade.ts to avoid a ports→domain import edge」と更新済み。

## Evidence

- Files read: 17 key source/test files
- Grep searches: 10+ pattern scans
- No regressions detected in any of the 24 ledger items
