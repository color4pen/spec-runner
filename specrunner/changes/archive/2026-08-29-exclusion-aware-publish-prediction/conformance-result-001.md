# Conformance Result — exclusion-aware-publish-prediction — Iteration 1

**Date**: 2026-08-29
**Branch**: fix/exclusion-aware-publish-prediction-ce51ff02

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

---

## 検証した項目

### Request acceptance criteria（11 件）

| AC | 確認内容 | 結果 |
|---|---|---|
| AC-01 | `UNPUSHABLE_PATH_BLOCKED` not thrown for excluded worktree paths (guarded/scoped/commitScopedPaths) | ✅ |
| AC-02 | Layer 1 (`validateStepOutputs`) no unpushable-path violation for excluded worktree paths | ✅ |
| AC-03 | Unpushed-commit path with excluded pattern still triggers `UNPUSHABLE_PATH_BLOCKED` | ✅ |
| AC-04 | Scoped step's excluded dirty path → no `WRITE_SCOPE_VIOLATION`, no quarantine/restore/git clean | ✅ |
| AC-05 | E2E story (vendor/**) — no halt, not committed, worktree preserved | ✅ |
| AC-06 | Design/review/conformance context contains Delivery exclusions block (テストで固定) | ✅ |
| AC-07 | halt → resume does not destroy excluded paths via reconcile | ✅ |
| AC-08 | Non-excluded dirty paths remain residual violations | ✅ |
| AC-09 | Protected canon path write-scope not bypassed by exclusion pattern | ✅ |
| AC-10 | `docs/configuration.md` updated with new contract | ✅ |
| AC-11 | typecheck / test / architecture tests green | ✅ |

### Spec Requirements（5 件）

**Requirement: worktree 由来の除外 path は unpushable-path 判定でブロックされない（SHALL NOT）**

- `src/git/push-capability.ts`: `collectPublishablePaths(spawnFn, cwd, worktreeExcludePatterns?)` の第3引数を追加。worktree 成分（section a）にのみフィルタを適用し、unpushed-commit 成分（section b）には適用しない。
- `src/core/step/commit-push.ts` L526: guarded Layer 2 backstop で `resolveStagingExcludePatterns(deps.config)` を解決して渡す。
- `src/core/step/commit-push.ts` L1042: `commitScopedPaths` Layer 2 backstop で同様に渡す。
- `src/core/runtime/local.ts` L1621: `validateStepOutputs` 内の unpushable-path 判定で `excludeWorktreePatterns` を渡す。
- TC-001, TC-002, TC-003, TC-004 がテストで固定。

**Requirement: scoped step の residual check が除外 path を violation 扱いしない（MUST, SHALL NOT）**

- `src/core/step/commit-push.ts` L594–600: `potentialViolations = findWriteScopeViolations(...)` をバイパスセットとして使い、potential violation でないパスにのみ `applyStagingExclusions` を適用した `filteredResidualPaths` を構築。`findScopedCommitViolations` にはフィルタ済みリストを渡す。
- `postStatus.stagedOnly` の `findWriteScopeViolations` は変更なし（protected canon 検査は迂回されない）。
- TC-005, TC-006, TC-007b/c がテストで固定。

**Requirement: 除外 path は worktree に保持されたまま後続 step へ進む（MUST）**

- guarded mode: 除外済みパスは `applyStagingExclusions` により stage set から除去される（既存動作）。
- scoped mode: 除外パスは `filteredResidualPaths` に含まれないため `restoreViolatedPaths`（`git clean -f`）が呼ばれない。
- resume: `reconcileWorktreeArtifacts` が `excludePatterns` 引数を受け取り、一致パスをスキップ。`isReconcilableArtifact` は change-folder 外パスを自然に除外。
- TC-008 E2E, TC-024 がテストで固定。

**Requirement: design / review が除外 scope を delivery 判定に使う（MUST）**

- `src/core/step/staging-containment.ts`: `buildDeliveryExclusionsBlock(patterns)` を追加・export。
- `src/core/step/design.ts`, `code-review.ts`, `conformance.ts`, `custom-reviewer.ts`: 各 `buildMessage` で `resolveStagingExcludePatterns(deps.config)` を解決してブロックを注入。
- `src/prompts/design-system.ts`: `buildInitialMessage` に `deliveryExclusionsBlock?: string` を追加。
- TC-009, TC-010, TC-017, TC-018, TC-019, TC-020, TC-021 がテストで固定。

**Requirement: `collectPublishablePaths` は worktree 成分のみに除外を適用する（MUST）**

- フィルタはセクション (a) 完了後・セクション (b) 開始前に適用。commit 由来パスは除外されない。
- TC-011 (worktree フィルタ済み), TC-012 (commit パス保持), TC-013 (mixed reset → worktree 成分として除外) がテストで固定。

### Design decisions（計画文脈として確認）

| Decision | 実装確認 | 備考 |
|---|---|---|
| D1: `collectPublishablePaths` 3rd arg | `worktreeExcludePatterns?: string[]`、`matchesGlob` インライン使用、`staging-containment.ts` インポートなし（DSM 制約維持）。TC-028 確認。 | ✅ |
| D2: 3 call site | commit-push.ts L526（guarded Layer 2）、commitScopedPaths L1042（scoped Layer 2）、step-context-builder.ts L137（Layer 1） | ✅ |
| D3: call-site pre-filter | `filteredResidualPaths` 構築後に `findScopedCommitViolations` に渡す。関数本体は変更なし。 | ✅ |
| D4: delivery exclusions block | staging-containment.ts に `buildDeliveryExclusionsBlock` 追加。4 step に注入。design-system.ts に新引数追加。 | ✅ |
| D5: `renderPushCapabilityNotice` 3rd arg | `worktreeExcludePatterns?: string[]` 追加。predicted files を事前フィルタしてから `matchUnpushablePaths`。TC-022, TC-023 確認。 | ✅ |

### tasks.md（計画文脈として確認）

全チェックボックス（T-01〜T-15）が ✅ 完了状態。

### verification-result.md

`Verdict: passed`（build / typecheck / test / lint / changed-line-coverage 全 phase 通過）。

### regression-gate-result-001.md

14 件すべて FIXED（regressions: 0 / 14）。高 severity 7 件を含む。

---

## 検証できなかった項目

None — 全受け入れ基準・spec Requirements/Scenarios を実装コードとテストで確認した。

---

## Findings 詳細

指摘なし。

---

## 詳細エビデンス

### AC-01: UNPUSHABLE_PATH_BLOCKED not thrown for excluded worktree paths

`src/git/push-capability.ts` L155–163 のフィルタロジック（worktree 成分のみ適用）:

```ts
if (worktreeExcludePatterns && worktreeExcludePatterns.length > 0) {
  for (const p of Array.from(paths)) {
    if (worktreeExcludePatterns.some((pattern) => matchesGlob(p, pattern))) {
      paths.delete(p);
    }
  }
}
```

フィルタは section (a) の `paths` Set 確定後・section (b) の rev-list ループ開始前に実行され、commit 成分は影響を受けない。

### AC-04: Scoped residual check — potentialViolations bypass

`src/core/step/commit-push.ts` L594–600:

```ts
const residualExcludePatterns = resolveStagingExcludePatterns(deps.config);
const potentialViolations = new Set(findWriteScopeViolations(step.name, slug, postStatus.paths, filePaths));
const filteredResidualPaths = [
  ...postStatus.paths.filter((p) => potentialViolations.has(p)), // always checked (bypass exclusion)
  ...applyStagingExclusions(postStatus.paths.filter((p) => !potentialViolations.has(p)), residualExcludePatterns),
];
const residualViolations = findScopedCommitViolations(slug, filteredResidualPaths, filePaths, allManagedPaths);
```

- Protected canon paths（`specrunner/changes/<slug>/spec.md` 等）と undeclared judge artifacts は `potentialViolations` に入るため、exclusion フィルタをバイパスして常に検査される。
- 除外パターンに一致する「宣言外の一般パス」のみが `filteredResidualPaths` から除去される。

### AC-07: reconcile excludePatterns

`src/core/resume/reconcile-worktree.ts` L296–311:

```ts
export async function reconcileWorktreeArtifacts(
  slug: string,
  worktreePath: string,
  spawnFn: SpawnFn,
  excludePatterns: string[] = [],
): Promise<ReconcileResult> {
  return quarantineAndRemoveMatching(
    slug,
    worktreePath,
    (p) =>
      isReconcilableArtifact(p, slug) &&
      (excludePatterns.length === 0 || !excludePatterns.some((pat) => matchesGlob(p, pat))),
    ...
  );
}
```

`resume.ts` L524 で `resolveStagingExcludePatterns(config)` を渡す。また `isReconcilableArtifact` が change-folder 外パスを自然に除外するため、`.github/workflows/**` や `vendor/**` は `excludePatterns` に依存せず保持される。

### AC-09: Protected canon write-scope invariant in parallel-review-round

`src/core/pipeline/parallel-review-round.ts` L420–428:

```ts
const excludePatterns = resolveStagingExcludePatterns(deps.config);
const potentialViolations = new Set(findWriteScopeViolations(coordinatorName, deps.slug, inspection.paths, declared));
const filteredPaths = [
  ...inspection.paths.filter((p) => potentialViolations.has(p) || declaredSet.has(p)), // bypass exclusion
  ...applyStagingExclusions(
    inspection.paths.filter((p) => !potentialViolations.has(p) && !declaredSet.has(p)),
    excludePatterns,
  ),
];
```

protected canon / undeclared judge artifact は `potentialViolations` に含まれるためバイパスされ、宣言済みパスは `declaredSet` でバイパスされてコミットに到達する。
