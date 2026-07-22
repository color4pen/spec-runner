# Regression Gate Report — permission-layer-git-write-denial — Iteration 1

**Date**: 2026-07-23
**Branch**: feat/permission-layer-git-write-denial-ac3aa8bf
**HEAD**: fb9b2bd23

---

## Verification Method

- `git diff main...HEAD` (three-dot) to see changes introduced by this branch relative to merge base
- `git diff main HEAD` (two-dot) to verify absolute state against current main
- Direct file reads for each finding's target location

---

## F-01 [CRITICAL] Bash が allowedTools に残り、本番 SDK 経路で git 変更 deny が機能しない

**Status**: FIXED

**Evidence**:

`src/adapter/claude-code/agent-runner.ts`:

```typescript
const baseAllowedTools = ["Read", "Grep", "Glob"];
```

Bash is absent. Confirmed by diff line:
```
-const baseAllowedTools = ["Read", "Bash", "Grep", "Glob"];
+const baseAllowedTools = ["Read", "Grep", "Glob"];
```

Additionally, `autoAllowBashIfSandboxed` changed from `true` to `false` (probe observation B — `true` would auto-approve Bash before `canUseTool` fires, making the guard unreachable):
```
-    autoAllowBashIfSandboxed: true,
+    autoAllowBashIfSandboxed: false,
```

Both TC-037 and the updated TC-SB-02 assert `not.toContain("Bash")` and `autoAllowBashIfSandboxed === false`.

---

## F-02 [CRITICAL] guard 単体テスト TC-011〜TC-036 が未実装

**Status**: FIXED

**Evidence**:

`src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts` now includes all required must-priority tests:

| TC | Description | Present |
|---|---|---|
| TC-011 | git 状態変更 Bash deny | ✓ (8 sub-cases) |
| TC-012 | deny message content (pipeline + read-git) | ✓ |
| TC-013 | 読み取り git allow + updatedInput | ✓ |
| TC-014 | 非 git Bash allow + updatedInput | ✓ |
| TC-015 | compound command mutation deny | ✓ |
| TC-017 | state.json Write deny (scoped + guarded) | ✓ |
| TC-018 | .specrunner/ Write deny | ✓ |
| TC-022 | scoped 宣言外 Write deny | ✓ |
| TC-023 | scoped 宣言外 Edit deny | ✓ |
| TC-025 | scoped 宣言内 Write allow + updatedInput | ✓ |
| TC-026 | scoped 宣言内 Edit allow + updatedInput | ✓ |
| TC-027 | guarded 保護正典 Write deny | ✓ |
| TC-028 | guarded 各保護正典 Write deny | ✓ |
| TC-029 | guarded 非保護 Write allow + updatedInput | ✓ |
| TC-033 | allow updatedInput 不変条件 | ✓ |

489 lines of new test code added to the file.

---

## F-03 [HIGH] ALWAYS_MUTATING リストが design D2 仕様より不完全

**Status**: FIXED

**Evidence**:

`src/adapter/claude-code/git-command-classifier.ts` ALWAYS_MUTATING set contains all D2-required subcommands:

```
switch ✓  revert ✓  pull ✓  commit-tree ✓
update-index ✓  fast-import ✓  gc ✓  prune ✓
```

Full set at lines 39–63: commit, commit-tree, push, add, reset, checkout, switch, restore, clean, merge, rebase, cherry-pick, revert, rm, mv, am, apply, pull, update-ref, update-index, filter-branch, fast-import, gc, prune.

TC-001 test cases cover switch, revert, pull, commit-tree, update-index, fast-import, gc, prune directly.

---

## F-04 [MEDIUM] TC-SB-02 と TC-037 が相互矛盾、TC-037/TC-038 のテストが未実装

**Status**: FIXED

**Evidence**:

`src/adapter/claude-code/__tests__/sandbox-scope.test.ts`:

- TC-SB-02 description updated to "Bash is NOT in allowedTools — canUseTool fires for Bash". Assertion changed from `toContain("Bash")` to `not.toContain("Bash")` and `autoAllowBashIfSandboxed === false`.
- TC-037 added (lines 269–314): asserts `allowedTools` does not contain "Bash".
- TC-038 added (lines 316–336): asserts `permissionMode === "default"`.

No contradiction between TC-SB-02 and TC-037 — both assert Bash is absent from allowedTools.

---

## F-05 [LOW] probe R5-a 観測 A/B の実行記録が design.md に未記録

**Status**: FIXED

**Evidence**:

`specrunner/changes/permission-layer-git-write-denial/design.md` section D6 now contains:

```
**probe 実行記録(2026-07-23、実 SDK)**:

| シナリオ | 結果 | 観測 |
|---|---|---|
| (a) bash-canusetool-gate | PASS | 観測 B: autoAllowBashIfSandboxed:true は auto-approve… |
| (b) bash-git-mutation-deny | PASS | git commit が canUseTool で deny される |
| (c) bash-git-read-allow | PASS | route=sdk-fast-path … |
| (d) scoped-write-deny | PASS | 宣言外 Write が deny |
| (e) state-json-deny | PASS | state.json Write が deny |
```

Observation A/B conclusively recorded: observation B (autoAllowBashIfSandboxed:true auto-approves before guard). Production config updated to false accordingly. TC-051 satisfied.

---

## F-06 [LOW] T-06 注記が stale ドキュメント

**Status**: FIXED

**Evidence**:

`specrunner/changes/permission-layer-git-write-denial/tasks.md` T-06 now reads:

> `baseAllowedTools` を `["Read", "Grep", "Glob"]` に変更（Bash を除外 — canUseTool 発火のため。TC-SB-02 は「Bash 非含有 + autoAllowBashIfSandboxed: false」を固定するよう更新済み）

This matches the actual implementation. The self-contradictory "Bash は allowedTools に残る" note is gone.

---

## F-07 [LOW] git branch --set-upstream-to=origin/main false negative

**Status**: STILL PRESENT

**Evidence**:

`src/adapter/claude-code/git-command-classifier.ts` lines 136 and 143:

```typescript
if (remainingArgs.some((a) => ["-D", "-d", "-m", "-M", "-c", "-C", "-u"].includes(a))) {
```

`--set-upstream-to` and `--unset-upstream` are absent from this list. `git branch --set-upstream-to=origin/main` (no positional branch name arg) would be classified as `read-or-nongit` (false negative). The `--set-upstream-to=origin/main` token starts with `--` and contains `=`, so it falls through the `--opt=value` skip branch (line 205) → `idx++` → no positional arg → `read-or-nongit`.

No test in `git-command-classifier.test.ts` covers this case.

**Severity**: LOW (design acknowledges this as "許容範囲内" per conservative lexical classification policy)

---

## F-08 [LOW] should 優先度テスト 4 件 (TC-010, TC-019, TC-021, TC-030) が未実装

**Status**: STILL PRESENT

**Evidence**:

Searched `src/adapter/claude-code/__tests__/git-command-classifier.test.ts` and `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts` for TC-010, TC-019, TC-021, TC-030 — not found.

- **TC-010** (classifier leaf 制約): `git-command-classifier.test.ts` covers TC-001 through TC-009 only. No test asserts that the file imports nothing from `src/`.
- **TC-019** (events.jsonl/usage.json/bite-evidence-result.md 個別 deny): TC-017 tests state.json deny. The other 3 managed paths are not individually asserted.
- **TC-021** (pipeline 管理パス deny が scoped/guarded 両方で適用): TC-017 includes a guarded-step state.json check, but there is no describe block for TC-021 that verifies all 4 managed paths across both staging modes.
- **TC-030** (guarded step が宣言した保護正典への Write は allow): TC-029 tests non-protected writes; no test covers the case where the guarded step declares a protected canon path and Write to it is permitted.

**Severity**: LOW (all `should` priority; must-priority tests cover the functional correctness per finding rationale)

---

## F-09 [CRITICAL] bootstrap commit OID の台帳記録削除 — managed.ts 経路が未修正

**Status**: STILL PRESENT (managed.ts path)

**Evidence**:

The finding required restoring `appendSynthesizedCommit` calls in 3 files: `local.ts`, `managed.ts`, `workspace-materializer.ts`.

Actual state at HEAD:

| File | appendSynthesizedCommit present? |
|---|---|
| `src/core/runtime/local.ts` | ✓ Restored (commit `10844d3bb`) |
| `src/core/runtime/workspace-materializer.ts` | ✓ Restored (commit `10844d3bb`) |
| `src/core/runtime/managed.ts` | **✗ ABSENT** |

Verification — `git show main:src/core/runtime/managed.ts | grep appendSynthesizedCommit` returns 2 hits (import + call at line 256). Current HEAD managed.ts has 0 hits.

`git diff main HEAD -- src/core/runtime/managed.ts` confirms the bootstrap OID capture block (17 lines) is deleted compared to main. The code-fixer commit `10844d3bb` modified only `local.ts` and `workspace-materializer.ts`, leaving `managed.ts` unfixed.

**Impact**: When the managed runtime's `bootstrapJob` creates the initial git commit and pushes, the bootstrap OID is not recorded in `state.synthesizedCommits`. On the next `commitAndPush` call, `runInlineEgressCheck` calls `git rev-list HEAD --not --remotes=origin` which returns both the bootstrap OID and the step OID. The bootstrap OID is absent from the ledger → `EGRESS_UNKNOWN_COMMIT` → pipeline halt.

**Severity**: CRITICAL (the finding classified it as CRITICAL; managed runtime jobs would fail on first step commit)

---

## Summary

| Finding | Severity | Status |
|---|---|---|
| F-01 Bash in allowedTools | CRITICAL | **FIXED** |
| F-02 TC-011〜TC-036 未実装 | CRITICAL | **FIXED** |
| F-03 ALWAYS_MUTATING 不完全 | HIGH | **FIXED** |
| F-04 TC-SB-02/TC-037 矛盾 | MEDIUM | **FIXED** |
| F-05 probe 実行記録なし | LOW | **FIXED** |
| F-06 tasks.md T-06 stale | LOW | **FIXED** |
| F-07 --set-upstream-to false negative | LOW | **STILL PRESENT** |
| F-08 should テスト 4 件未実装 | LOW | **STILL PRESENT** |
| F-09 managed.ts bootstrap OID 欠落 | CRITICAL | **STILL PRESENT** |
