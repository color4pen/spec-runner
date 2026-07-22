# Conformance Result — pipeline-sole-committer — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Identity

Reviewer operating under `specrunner/changes/pipeline-sole-committer/rules.md`.

---

## Iter 1 からの変更点

以下が conformance iter 1 以降に変更された主要箇所（`git diff 2909e764c..HEAD --stat` 確認済み）:

| 変更 | 内容 |
|---|---|
| D4 egress 精密化 | `runInlineEgressCheck` から `headBeforeStep` 除外を削除（`--not --remotes=origin` 厳密形のみ）。design.md も同 commit で更新 |
| staged-only 正典検出 | scoped 残余検査に `stagedOnly` / `stagedNew` を追加（cross-boundary F-002）。`restoreViolatedPaths` に staged-new 用 `git rm --cached` + `git clean -f` 経路を追加 |
| round push 失敗処理 | `commitRoundArtifacts` を try-catch でラップし、push 失敗時も OID を `synthesizedCommits` に記録（EGRESS_UNKNOWN_COMMIT デッドロック防止） |
| F-001 (iter 1) 修正 | `commitAndPush` JSDoc から旧実装の fallback 記述（"git add -A -- ."）を削除 |

---

## 検証した項目

### 1. Tasks Completeness

T-01〜T-17 全チェックボックスが `[x]`。T-17 には:
- Tests: 610 files / 8925 passed, 1 skipped (vitest run)
- typecheck: `tsc --noEmit` exit 0

### 2. Design Decisions Coverage

| Decision | File / Location | Status |
|---|---|---|
| D1: mixed reset + 明示パス合成（sequential） | `commit-push.ts:commitAndPush` L429-601 | ✅ |
| D2: commitFinalState pipeline 管理パス限定 | `commit-push.ts:commitFinalState` L632-718 | ✅ |
| D3: ParallelReviewRound HEAD guard | `parallel-review-round.ts` L264-304 | ✅ |
| D4: synthesizedCommits 台帳 + egress backstop（厳密形） | `types.ts:504`, `operations.ts:35`, `commit-push.ts:verifyEgressLedger` / `runInlineEgressCheck`（headBeforeStep 除外なし） | ✅ |
| D5: 合成・復帰経路 fail-closed | `commit-push.ts:L481-485`（status fail→halt）、reset check L441-444、`restoreViolatedPaths` throws | ✅ |
| D6: biteEvidenceResultPath in pipelineManagedPaths | `round-git-scope.ts:105` | ✅ |
| D7: push-as-is 除去; scoped 残余 restore + halt 保持 | push-as-is コード不在; 残余 halt L486-502 保持 | ✅ |
| D8: 破壊確認 | TC-031/TC-032/TC-033 コメント・テスト | ✅ |

### 3. Spec Requirements Verification

**Requirement: sequential step の commit は合成で構成する**
- HEAD entry キャプチャ（L430）→ 前進時 `git reset --mixed <headBeforeStep>`（L436-444）→ reset 失敗 halt
- scoped: `stagePaths = declaredWrites ∪ existingManagedPaths`、`git add -A -- <stagePaths>`、`git commit -- <stagePaths>`（L463, L520）
- guarded: `git status --porcelain -z --no-renames` 列挙 → violation check → `git add -A -- <changedPaths>` → `git commit -- <changedPaths>`（L535-600）
- 全 Scenario 適合 ✅

**Requirement: scoped / guarded の staging は明示パス指定（裸 git add -A 全廃）**
- 静的テスト TC-021（`write-scope-invariants.test.ts:L200`）green ✅
- F-012（`git commit` も pathspec あり）テスト green ✅
- `write-scope.ts:46` の guarded 説明（"stage whole worktree (git add -A)"）は stale → **F-001**（低）

**Requirement: guarded の write-scope 違反は退避して fail-closed halt**
- `findWriteScopeViolations` → quarantine → `restoreViolatedPaths`（throws on failure）→ `writeScopeViolationError` ✅

**Requirement: checkpoint / finalize は pipeline 管理パスのみ**
- `commitFinalState`: per-path `git add -- <path>` loop、`git commit -- <stagedPaths>`（pathspec 限定）✅
- TC-007 / TC-019 E2E でも確認 ✅

**Requirement: parallel round の HEAD guard**
- `baselineCommit = captureHeadSha(cwd)` pre fan-out → post fan-out 比較 → 前進時 quarantine + `git reset --mixed`（失敗 → SpecRunnerError throw）→ `ROUND_HEAD_ADVANCED` + escalation ✅
- TC-009 / TC-020 real git E2E green ✅

**Requirement: egress backstop**
- `runInlineEgressCheck` の publish range = `rev-list HEAD --not --remotes=origin`（headBeforeStep 縮小なし）
- 全 push 発生点（commitAndPush scoped/guarded、commitScopedPaths、commitFinalState、propagate）が egress 検証を経由 ✅
- TC-033 が「rev-list 引数に headBeforeStep を含まない」ことを静的テストで固定 ✅

**Requirement: git 操作失敗の fail-closed**
- `getWorktreeChangedPaths ok:false` → `commitEffectFailedError` throw（silent skip を廃止）
- `git reset --mixed` 失敗 → halt
- `restoreViolatedPaths` は各 git コマンド失敗を個別に throws ✅

**Requirement: bite-evidence-result.md を pipeline 管理パスに含める**
- `pipelineManagedPaths(slug)` に `biteEvidenceResultPath(slug)` を含む（`round-git-scope.ts:105`）
- `pipeline-sole-committer-bite-evidence.test.ts` green ✅

**Requirement: commitOid の意味論を不変に保つ**
- `StepRun.commitOid` の定義・docstring 無改変。`synthesizedCommits` は独立 field
- revision 束縛・canonHash 束縛テスト差分 0、全 green ✅

### 4. Iter 1 Findings の追跡

| Finding | 状態 |
|---|---|
| F-001 (iter 1): commitAndPush JSDoc の旧 fallback 記述 | ✅ **修正済み** — JSDoc を合成モデル説明に更新 |
| F-002 (iter 1): commit-final-state.test.ts:39 stale title; parallel-review-round-git-effects に HEAD advance シナリオなし | **部分残存** — round-git-effects は push fail シナリオ 3 件追加。HEAD advance は別ファイル（round-guard.test.ts）でカバー済み。commit-final-state.test.ts:39 の stale title は未修正 → **F-002**（低） |

### 5. Acceptance Criteria

| 基準 | 証跡 |
|---|---|
| R6-1 / R6-2 実 git E2E green | TC-019 / TC-020 pass; 610/8925 green |
| agent 自己 commit → 無損失合成 | `pipeline-sole-committer-synthesis.test.ts`; T-14 |
| guarded 実変更列挙完全性 | synthesis tests; guarded `git status` 列挙 |
| 裸 git add -A が src/ に 0 件（静的テスト） | TC-021 `write-scope-invariants.test.ts:L200-264` |
| round HEAD 前進 → escalation + 退避証跡 | TC-009 / TC-011 / TC-020 |
| egress halt（台帳未記録 commit） | `pipeline-sole-committer-egress.test.ts` |
| git op 失敗 → halt | T-06 fail-closed テスト群 |
| bite-evidence-result.md 合成 + 誤発火なし | `pipeline-sole-committer-bite-evidence.test.ts` |
| revision 束縛 / canonHash 束縛 無改変 green | 差分 0、全 green |
| 検査モデルテスト → 合成モデル期待に更新 | `write-scope-bypass-closure*.test.ts`, `commit-and-push.test.ts`, `commit-push-write-scope.test.ts` 更新済み |
| 破壊確認記録 | TC-031 (bare add-A)、TC-032 (HEAD guard)、TC-033 (entry-HEAD 縮小) |
| typecheck && test green | tsc exit 0; vitest 8925/8925 (1 skip) |

---

## 検証できなかった項目

None. 全受け入れ基準は source code および verification-result.md から独立に検証可能であった。

---

## Findings 詳細

### F-001 (low / fixable): `write-scope.ts:46` の guarded 説明が旧実装を記述

**File**: `src/core/step/write-scope.ts`
**Line**: 46

```
* "guarded" — stage whole worktree (git add -A) after verifying no forbidden paths were touched.
```

実装は `git status` で変更パスを列挙して明示 pathspec で `git add -A -- <paths>` を実行する（裸 `git add -A` ではない）。この JSDoc を読んで guarded モードの動作を理解しようとすると誤認する。

Fix: "enumerate changed paths via git status, then stage/commit with explicit pathspec (git add -A -- \<paths\>) after allowlist verification." 相当に書き換える。

### F-002 (low / fixable): `commit-final-state.test.ts:39` stale test title

**File**: `tests/unit/core/step/commit-final-state.test.ts`
**Line**: 39

```javascript
it("calls git add -A, git commit with finalize message, and git push", async () => {
```

本文コメントにも `// git add -A` が残り、テストボディは `args[0] === "add"` で pathspec を検証していない。新実装の管理パス限定 pathspec は `pipeline-sole-committer-final-state.test.ts` でカバー済みなので動作は保証されているが、メンテナが `commit-final-state.test.ts` を読むと現在の動作と異なる記述に直面する。

Fix: `it()` 説明を "stages pipeline-managed paths only and commits with finalize message" 相当に更新。コメント `// git add -A` → `// git add -- <managed-path>` 等。

### F-003 (low / fixable): `runtime-strategy.ts:402` port JSDoc が旧挙動を記述

**File**: `src/core/port/runtime-strategy.ts`
**Line**: 402

```
* - local:   git add -A → commit "finalize: <slug>" → push origin <branch> (1 retry, best-effort)
```

`local.ts` の `commitFinalState` JSDoc は正しく更新済みだが、port 側のインターフェース説明は旧記述のまま。新しい adapter を実装するときにこの port を参照すると誤認する。

Fix: "管理パス（state.json / events.jsonl / usage.json / bite-evidence-result.md）を明示 pathspec で add → commit → push（1 retry）" 相当に更新。
