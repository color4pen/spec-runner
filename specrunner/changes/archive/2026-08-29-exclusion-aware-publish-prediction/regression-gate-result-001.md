# Regression Gate Result — exclusion-aware-publish-prediction — Iteration 1

**Date**: 2026-08-29
**Branch**: fix/exclusion-aware-publish-prediction-ce51ff02
**Ledger size**: 14 findings

## Verdict

No regressions detected. All 14 ledger findings have been resolved in the current code.

---

## Evidence per Finding

### [1] HIGH — TC-024 対応タスク (T-15) が存在しない (`91e92803`)

**Status**: FIXED

`tasks.md` の T-01〜T-14 に存在しなかった TC-024 対応の T-15 タスクが L281–313 に追加された。タスク本文には `isReconcilableArtifact` の動作根拠・背景・具体的な実装内容・Acceptance Criteria が記載されており、TC-024 の integration test を書く根拠が提供されている。

---

### [2] LOW — YAML result ブロックのカウント不整合 (`2835b309`)

**Status**: FIXED

`test-cases.md` の YAML result ブロック（L329–332）に `gate: 1` フィールドが追加され、`automated:26 + manual:2 + gate:1 = 29 = total:29` で整合している。

---

### [3] MEDIUM — T-15 の引数順序が逆 (`02ff67a9`)

**Status**: FIXED

`tasks.md` L293 および L311 の記述が `isReconcilableArtifact(".github/workflows/ci.yml", "some-slug")` となっており、実際のシグネチャ `isReconcilableArtifact(path: string, slug: string)` と一致している（path first, slug second）。

---

### [4] LOW — Summary セクションに gate カテゴリが欠落 (`160104d3`)

**Status**: FIXED

`test-cases.md` Summary セクション（L5–9）に `**Gate**: 1` 行が追加され、Automated:26 + Manual:2 + Gate:1 = 29 = Total:29 で整合している。

---

### [5] HIGH — TC-003 unit test missing (`3efc2444`)

**Status**: FIXED

`src/core/step/__tests__/exclusion-aware-validation.test.ts` に TC-003 の describe ブロックが存在する（L95–197）。`LocalRuntime.validateStepOutputs` を直接呼び出し、`excludeWorktreePatterns: [".github/workflows/**"]` 指定時に violation が報告されないこと（TC-003）、未指定時に violation が報告されること（TC-003b）、および wiring の確認（TC-003c）が固定されている。

---

### [6] HIGH — TC-008 missing (`5088146a`)

**Status**: FIXED

`src/core/step/__tests__/commit-push-exclusion.test.ts` の L583–695 に TC-008 describe ブロックが存在する。guarded implementer commit → scoped design commit の E2E ストーリーが `vendor/**` 除外パターン下で検証されており、`vendor/generated.js` がコミットされず・クリーンアップされず・両ステップが halt しないことが固定されている。

---

### [7] LOW — TC-015, TC-016 missing (`cd8d82aa`)

**Status**: FIXED

- TC-015: `commit-push-exclusion.test.ts` L701–765 に `commitScopedPaths` の 7-arg 後方互換テストが存在する（no-exclusion case および legacy UNPUSHABLE_PATH_BLOCKED case を含む）。
- TC-016: `commit-push-exclusion.test.ts` L771–819 に `validateStepOutputs` の 3-arg 後方互換テストが存在する。

---

### [8] LOW — conformance.ts の exclusions block 配置 (`4867efa4`)

**Status**: FIXED

`conformance.ts` L101 の構造は `</user-request>${exclusionsSection}` となっており、exclusions block は `</user-request>` タグの**外側**（後）に配置されている。これは `code-review.ts` / `design.ts` の配置（`${constraintsSection}${exclusionsSection}` パターン）と一致しており、仕様 D4 の「完了指示の後ではなく前」への準拠も `</user-request>` 外配置で達成されている。

---

### [9] LOW — TC-007 が guarded mode のみ (`8e11e9bd`)

**Status**: FIXED

`commit-push-exclusion.test.ts` に TC-007b（L451–490）と TC-007c（L492–534）が追加された。TC-007b は scoped step で staged な protected canon path（`A ` ステータス、`postStatus.stagedOnly` 経由）が除外設定に関係なく WRITE_SCOPE_VIOLATION になることを確認。TC-007c は untracked な protected canon path が `potentialViolations` バイパス（`filteredResidualPaths` に残留）経由で検出されることを確認。

---

### [10] HIGH — Parallel review rejects excluded worktree dirt (`33078ff0`)

**Status**: FIXED

`parallel-review-round.ts` L420–428 で `excludePatterns` を適用する前に `potentialViolations`（`findWriteScopeViolations` 結果）と `declaredSet` をバイパスセットとして計算し、`filteredPaths` を構築してから `partitionRoundChanges` に渡す実装が追加された。除外対象 path は `partitionRoundChanges` に届かないため `ROUND_NONDECLARED_CHANGE` を引き起こさない。

---

### [11] HIGH — Resume reconcile deletes excluded files (`1a9fdac1`)

**Status**: FIXED

`reconcileWorktreeArtifacts` のシグネチャに `excludePatterns: string[] = []` が追加された（`reconcile-worktree.ts` L300）。`resume.ts` L524 で `resolveStagingExcludePatterns(config)` を渡す呼び出しに更新されており、除外 path は `isReconcilableArtifact` の条件を満たしても reconcile（削除）されない。

---

### [12] HIGH — Scoped exclusion filters protected canon (`17e72755`)

**Status**: FIXED

`commit-push.ts` L594–599 で `potentialViolations = new Set(findWriteScopeViolations(...))` をバイパスセットとして使い、`filteredResidualPaths` を構築する際に protected canon path（forbidden ∪ 非宣言）を exclusion フィルタから外している。除外設定が write-scope 違反検査を迂回できない不変条件が維持されている。

---

### [13] HIGH — Exclusion filtering bypasses write-scope for undeclared judge artifacts (`c781e20f`)

**Status**: FIXED

Finding [12] と同じ修正（`commit-push.ts` L594–599）で対応。`findWriteScopeViolations` のバイパスセットは `forbidden ∪ isJudgeArtifact && !declared` を含むため、undeclared judge artifact（`review-feedback-*.md`、`*-result-*.md`）も exclusion フィルタをバイパスし、残留検査で検出される。TC-030a/b テストがこの不変条件を固定している。

---

### [14] HIGH — Excluded declared parallel-review result causes downstream write-scope violation (`1a8adeaa`)

**Status**: FIXED

`parallel-review-round.ts` L422–428 で `declaredSet.has(p)` をバイパス条件として追加したことにより、宣言済みメンバー出力は `applyStagingExclusions` に通さず `filteredPaths` に直接含める。`partitionRoundChanges` → `toStage` → `commitRoundArtifacts` に届き、下流ステップが undeclared judge artifact と誤判定しなくなった。`parallel-review-round-git-effects.test.ts` L1185–1228 の positive control テストがこの不変条件を固定している。

---

## Summary

| # | Severity | Status |
|---|----------|--------|
| 1 | HIGH | FIXED |
| 2 | LOW | FIXED |
| 3 | MEDIUM | FIXED |
| 4 | LOW | FIXED |
| 5 | HIGH | FIXED |
| 6 | HIGH | FIXED |
| 7 | LOW | FIXED |
| 8 | LOW | FIXED |
| 9 | LOW | FIXED |
| 10 | HIGH | FIXED |
| 11 | HIGH | FIXED |
| 12 | HIGH | FIXED |
| 13 | HIGH | FIXED |
| 14 | HIGH | FIXED |

**Regressions**: 0 / 14
