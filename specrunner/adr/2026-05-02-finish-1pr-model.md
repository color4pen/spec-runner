# ADR-20260502: finish コマンドを 1-PR モデルへ移行する

## ステータス

採用

## コンテキスト

`specrunner finish` の旧実装は 2-PR モデルを採用していた。

1. **Feature PR**（`feat/<slug>` → `main`）を `gh pr merge --squash` でマージ
2. **Archive PR**（`chore/archive-<slug>` → `main`）を別途作成し、`openspec archive` と `git mv` の結果をコミットしてマージ

この設計には複数の問題があった。

- PR が 2 本になるため GitHub の PR 一覧が汚れる
- Archive PR のマージ漏れや順序依存で不整合が起きやすい
- 2 段階マージのため finish の実行時間が長い
- `chore/archive-<slug>` ブランチを明示的に掃除しないと残留する

## 決定

**archive 操作を feature branch のコミットとして乗せ、feature PR 1 本のみでマージする。**

### 新フロー（Phase 0〜4）

```
Phase 0: Pre-flight checks（8 項目）
  check 2: state.pullRequest.number 確認
  check 3+4: gh pr view + mergeStateStatus UNKNOWN 3 秒×3 回 retry
  check 5: openspec/changes/<slug>/ 存在確認（warning のみ）
  check 6: openspec validate <slug> --strict（change folder 存在時）
  check 7: gh / git / openspec バイナリ確認
  check 8: 未 push コミット警告

Phase 1: Feature branch 上で archive コミット
  git fetch + git checkout -B <feature-branch>
  openspec archive <slug> [--skip-specs]
  git mv openspec-workflow/requests/awaiting-merge/<slug>/ merged/<slug>/
  git commit "chore: archive <slug>"（staged 変更ゼロなら skip）

Phase 2: Feature branch を push
  git push origin <feature-branch>（新規コミットなければ skip）

Phase 3: Feature PR を squash merge
  gh pr merge <PR> --squash --delete-branch
  --admin は mergeStateStatus=BLOCKED かつ force=true の場合のみ付与

Phase 4: ローカル main を更新
  git checkout main
  git pull --ff-only
  markJobArchived（pull 完了後に実行）
```

### Resume 冪等性

- PR が既に MERGED → Phase 1〜3 を skip して Phase 4 のみ実行
- `state.status=archived` → 全 Phase skip して `Already archived` を出力し exit 0

## 影響

- `src/core/finish/archive-pr.ts` を削除
- `src/core/finish/orchestrator.ts` を全面的に書き直し
- `src/core/finish/preflight.ts` を新規作成
- `src/core/finish/resolve-target.ts` を書き直し（`<slug>` / `--pr` / `--job` / auto-detect の 4 形式）
- `bin/specrunner.ts` の finish コマンドに `--pr`, `--job`, `--dry-run` フラグを追加
- `src/cli/ps.ts` に SLUG 列と `--all` フラグを追加
- `src/core/tools/register-branch.ts` に optional `slug` フィールドを追加
- `src/state/schema.ts` の `RequestInfo` に `slug?: string | null` を追加
- `src/state/job-slug.ts` を新規作成（`getJobSlug` / `stripBranchPrefix`）

## 代替案

**2-PR モデルを維持する**: 既存の実装を活かせるが、上記の問題が残る。PR 数の削減効果が大きいため不採用。

**Squash merge 時に archive を post-merge hook で実行する**: GitHub の webhook + CI job での実装が必要。SpecRunner の外部依存が増えるため不採用。

## 参照

- `openspec/changes/finish-redesign/design.md`
- `openspec/changes/finish-redesign/spec.md`
- PR: change/finish-redesign
