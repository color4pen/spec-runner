# Conformance Result — pipeline-sole-committer — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Identity

Reviewer operating under `specrunner/changes/pipeline-sole-committer/rules.md`.

---

## 検証した項目

### 1. Tasks Completeness

All 17 tasks (T-01 through T-17) carry `[x]` checkboxes. T-17 records:
- Tests: 610 files / 8918 passed (1 skipped)
- Typecheck: `tsc --noEmit` → no output → clean

### 2. Design Decisions Coverage

| Decision | File / Location | Status |
|---|---|---|
| D1: mixed reset + explicit staging (sequential) | `src/core/step/commit-push.ts:commitAndPush` | ✅ |
| D2: commitFinalState pipeline-managed paths only | `src/core/step/commit-push.ts:commitFinalState` L593-679 | ✅ |
| D3: HEAD guard in ParallelReviewRound | `src/core/pipeline/parallel-review-round.ts` L264-304 | ✅ |
| D4: synthesizedCommits ledger + egress backstop | `src/state/schema/types.ts:504`, `operations.ts:35`, `commit-push.ts:verifyEgressLedger` | ✅ |
| D5: fail-closed for git ops | `commit-push.ts:L498-500` (status fail→halt), reset check L414-417 | ✅ |
| D6: biteEvidenceResultPath in pipelineManagedPaths | `src/core/pipeline/round-git-scope.ts:105` | ✅ |
| D7: push-as-is removed; scoped residual restore + halt preserved | commit-push.ts push-as-is absent; L441-466 residual intact | ✅ |
| D8: destruction confirmation documented in tests | TC-031/TC-032 comments in E2E and unit tests | ✅ |

### 3. Spec Requirements Verification

**R1 — sequential step の commit 合成** (`commitAndPush`, L390-562):
- HEAD captured at entry (L403); if advanced: `git reset --mixed <headBeforeStep>` (L414); reset failure → throw (L415-417)
- Scoped: `stagePaths = declaredWrites ∪ existingManagedPaths`; `git add -A -- <stagePaths>`; `git commit -- <stagePaths>` (L436, L483)
- Guarded: `git status --porcelain -z --no-renames` enumerate; violation check; `git add -A -- <changedPaths>`; `git commit -- <changedPaths>` (L497-562)
- No bare `git add -A` in `src/`: confirmed by grep (zero matches)
- Scenarios: all three spec scenarios satisfied

**R2 — commitFinalState の限定** (L593-679):
- `managedPaths = pipelineManagedPaths(slug)` (state.json, events.jsonl, usage.json, bite-evidence-result.md)
- Per-path `git add -- <path>` loop; `git commit -- <stagedPaths>` (pathspec-limited)
- Agent uncommitted work left in worktree
- TC-019 E2E + TC-007 unit confirm no unauthorized file leakage

**R3 — parallel round HEAD guard** (parallel-review-round.ts L264-304):
- `baselineCommit = captureHeadSha(cwd)` pre fan-out
- Post fan-out: `headAfterFanOut = captureHeadSha(cwd)`; if advanced → quarantine diff → `git reset --mixed` (failure → SpecRunnerError throw) → `roundError.code = "ROUND_HEAD_ADVANCED"` → `inspectionEscalated = true` → escalation
- TC-020 real git E2E: reviewer self-commits `request.md`, HEAD reset confirmed, ROUND_HEAD_ADVANCED confirmed

**R4 — egress backstop**:
- `runInlineEgressCheck` called after every synthesis commit before pushOnly
- `verifyEgressLedger` called in `commitFinalState`
- `propagateVerificationResult` has inline egress check (propagate.ts L76-92)
- `commitScopedPaths` accepts egress params (L748)
- `synthesizedCommits` appended in `CommitOrchestrator.commitSuccess` (L365-373) and `commitRound` (L585-590)

**R5 — fail-closed**:
- `getWorktreeChangedPaths ok:false` → `commitEffectFailedError` throw (replaces old silent skip)
- `git reset --mixed` failure → throw L415-417
- `restoreViolatedPaths`: split untracked (clean -f) vs tracked (checkout HEAD); each failure throws

**R6 — 実 git E2E**:
- TC-019 (R6-1): `src/secret.ts` pre-staged → `commitFinalState` → not found in any commit ✅
- TC-020 (R6-2): reviewer self-commits → ROUND_HEAD_ADVANCED → HEAD reset → absent from push range ✅

**bite-evidence / #888**:
- `pipelineManagedPaths(slug)` includes `biteEvidenceResultPath(slug)` (round-git-scope.ts:105)
- `pipeline-sole-committer-bite-evidence.test.ts` green

**commitOid 意味論不変**:
- StepRun.commitOid definition unchanged; `synthesizedCommits` is an independent field
- canon-binding-e2e, revision-binding test files: diff=0, all green

### 4. Acceptance Criteria

| Criterion | Evidence |
|---|---|
| R6-1 / R6-2 実 git E2E green | TC-019/TC-020 pass; 610/8918 green |
| agent 自己 commit → 無損失合成 | pipeline-sole-committer-synthesis.test.ts; T-14 |
| guarded 実変更列挙 1 ファイルも落とさない | synthesis tests; guarded git status enumeration |
| 裸 git add -A が src/ に 0 件（静的テスト） | TC-021 write-scope-invariants.test.ts L200-264 |
| round HEAD 前進 → escalation + 退避証跡 | TC-009/TC-011/TC-020; ROUND_HEAD_ADVANCED |
| egress 照合 halt テスト | pipeline-sole-committer-egress.test.ts |
| git 操作失敗 → halt | T-06 fail-closed tests |
| bite-evidence-result.md 合成 + 誤発火なし | pipeline-sole-committer-bite-evidence.test.ts |
| revision 束縛 / canonHash 束縛 無改変 green | diff=0 on binding test files; all green |
| 検査モデルテスト → 合成モデル期待に更新 | write-scope-bypass-closure tests, commit-and-push.test.ts, commit-push-write-scope.test.ts updated |
| 修正前挙動 → fail の破壊確認記録 | TC-031 (bare add-A)、TC-032 (HEAD guard) comments |
| typecheck && test green | tsc: exit 0; vitest: 8918/8918 (1 skip) |

---

## 検証できなかった項目

None. All acceptance criteria were independently verifiable from source code and verification-result.md.

---

## Findings 詳細

### F-001 (low / fixable): Stale JSDoc in `commitAndPush` describes removed fallback

**File**: `src/core/step/commit-push.ts` L382-383

The function-level JSDoc says:
```
 *   - Fallback: if no changes detected, uses `git add -A -- .` (backward compat).
```

The actual implementation removed this fallback (L524 inline comment: "The previous fallback `["add", "-A", "--", "."]` ... violated F-004"). The behavior is correct; the JSDoc is stale. A reader relying on it would expect the fallback exists, contradicting the spec requirement (明示パス指定全廃) and TC-021.

Fix: Remove or rewrite the stale sentence to reflect current behavior (skip add when changedPaths is empty; never fall back to root pathspec).

### F-002 (low / fixable): T-10 migration targets served by new files, not in-place updates

**Files**: `tests/unit/core/step/commit-final-state.test.ts`, `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`

D7/T-10 lists these as migration targets requiring in-place updates to synthesis model expectations. Neither was modified:
- `commit-final-state.test.ts` TC-CFS-001 `it()` title still says `"calls git add -A"` — a stale description.
- `parallel-review-round-git-effects.test.ts` has no HEAD advance scenario; `captureHeadSha` always returns the same value.

Coverage is supplied by new files (`pipeline-sole-committer-final-state.test.ts`, `pipeline-sole-committer-round-guard.test.ts`) which are stronger and all pass. The stale test titles may mislead future maintainers.

Fix: Update `it()` description in TC-CFS-001 to reflect managed-path staging; add HEAD advance scenario reference or note in `parallel-review-round-git-effects.test.ts`.

