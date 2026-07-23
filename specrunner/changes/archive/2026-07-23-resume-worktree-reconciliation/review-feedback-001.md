# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### スコープ確認
- `git diff main...HEAD --stat`: 20 files changed, 3601 insertions。実装ファイル・テストファイル・ドキュメント・変更フォルダ成果物が一致。

### 実装レビュー

**`src/core/resume/reconcile-worktree.ts`**
- `isReconcilableArtifact`: changeFolderPath の exact directory match（`path !== folder && !path.startsWith(folder + "/")`）による同一プレフィクス別ディレクトリの排除、protectedCanonPaths / pipelineManagedPaths の set-membership チェックを確認。
- `reconcileWorktreeArtifacts`: git status 失敗時の no-op（D7）、quarantine-all-first の順序保証（fsMkdir + writeFile が成功してから remove-all に進む）、removal kind 分岐（untracked/staged-new/tracked）の実装を確認。
- `.specrunner/local/.gitignore` 書き込みはベストエフォート（try-catch 付き）で証拠保全の fail-closed ゲートには影響しない。
- quarantineDir の fsMkdir はキャッチなし → 失敗時に throw 伝播 → fail-closed。

**`src/core/command/resume.ts`（差分のみ）**
- import `reconcileWorktreeArtifacts` が行 32 に追加。
- `if (resolvedWorktreePath !== null && resolvedSlug !== null)` ブロック内、apply-canon gate の直後に reconcile call を配置（D6: apply-canon gate → reconcile の順序）。
- throw 時は `PrepareError(1)` にラップしてステップ開始を阻止。

### テストカバレッジ確認（22 TC すべて）

| TC | ファイル | 確認結果 |
|----|---------|---------|
| TC-006〜TC-012 | `reconcile-worktree.test.ts` | 全実装 ✓ |
| TC-001〜TC-005, TC-013 | `resume-worktree-reconciliation-e2e.test.ts` | 全実装 ✓ |
| TC-014〜TC-020 | `resume-reconcile.test.ts` | 全実装 ✓ |
| TC-021 | `operations-recovery-contract.test.ts` | 全実装 ✓ |
| TC-022 | 検証結果（634 test files passed）で既存 apply-canon テスト通過を確認 ✓ |

### 受け入れ基準チェック

| 基準 | 確認 |
|------|------|
| halt→残骸→resume regression test（TC-001） | ✓ e2e で実経路を確認 |
| quarantine 失敗で fail-closed（TC-004, TC-017） | ✓ 実 git repo（`.specrunner/local` をファイル化）と mock 両方 |
| 冪等性 no-op（TC-002, TC-011） | ✓ |
| apply-canon gate 既存テスト green（TC-022） | ✓ 634 files passed |
| docs/operations.md 回復契約（TC-021 drift guard） | ✓ 3クラス + .specrunner/local/ + fail-closed 記述確認 |
| typecheck && test green | ✓ 検証結果 passed |

### docs/operations.md
`halt → resume の回復契約` セクションにテーブルあり。3クラス・処理・タイミング・`.specrunner/local/`・fail-closed on quarantine failure・検知ベストエフォートをすべて記載。

## 検証できなかった項目

None。

## Findings 詳細

### [low] staged-new removal kind に実 git テストなし

`reconcileWorktreeArtifacts` の staged-new 除去パス（`git rm --cached` + `git clean -f`）はコードとして実装されているが、TC-013（e2e）は untracked（git clean）と tracked-modified（git checkout HEAD）のみを対象にしており、staged-new の実 git カバレッジがない。

staged-new 状態は `commit-push.ts` の `git add` と `git commit` の間でプロセスが強制終了した場合に発生し得る。当該コード自体のロジックは `restoreViolatedPaths`（commit-push.ts）と同じ分岐ロジックで正しい。テスト追加は軽微な作業で完結する。

## 観察事項（アクション不要）

**証拠ファイル名の二重拡張子**: `spec-review-result-002.md` などのパスが quarantine 証拠ファイル名として `specrunner__changes__<slug>__spec-review-result-002.md.md` になる（`/` → `__` 置換後に `.md` を append するため）。機能上の問題はなく証拠内容は正確。

**`rules.md` の分類**: `specrunner/changes/<slug>/rules.md` は `protectedCanonPaths` にも `pipelineManagedPaths` にも含まれないため、dirty/untracked 時に reconcile 対象（Class 2）になる。これは分類述語の仕様通りだが、オペレーターが `rules.md` を手動編集して resume した場合に黙って退避・除去される。証拠は quarantine に保全される。docs のテーブルの例示（`spec-review-result-NNN.md` 等）には `rules.md` は記載されていないため、気づきにくい。`protectedCanonPaths` への追加はスコープ外（write-scope.ts 変更禁止）なので別 issue 化を推奨。
