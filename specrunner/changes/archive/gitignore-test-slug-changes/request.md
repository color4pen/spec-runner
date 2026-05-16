# specrunner/changes/test-slug/ を gitignore に追加し test artifact churn を排除する

## Meta

- **type**: chore
- **slug**: gitignore-test-slug-changes
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen
- **issue**: #242

## 背景

`src/core/step/pr-create.ts` が `specrunner/changes/<slug>/pr-create-result.md` を、`src/core/verification/runner.ts` が `specrunner/changes/<slug>/verification-result.md` を書き出す。テストでは `slug = "test-slug"` のフィクスチャを使うため、テスト実行のたびに `specrunner/changes/test-slug/` 配下のタイムスタンプが更新される。

該当ファイルが git に tracked されているため、PR #238 等の diff に紛れ込んだ実績がある (実害なし):

```diff
- **CreatedAt**: 2026-05-15T04:06:51.003Z
+ **CreatedAt**: 2026-05-15T14:00:34.607Z
```

関連 issue: #242

## 目的

テスト artifact churn を main から外し、PR diff に余計なタイムスタンプ更新が混入しないようにする。

## 設計判断

1. **最小修正**: `.gitignore` 追加 + 既存 tracked file の untrack のみで対応する。`pr-create.ts` のパス解決を test 時だけ切り替える案 (issue 内提案) は別軸の改善として扱わない (実装複雑化のコストに見合わない)
2. **patterns は specrunner/changes/test-slug/ 配下を全部対象**: 個別ファイル名指定ではなくディレクトリ単位で gitignore する。将来 test artifact が他にも増えても自動で吸収される
3. **既存ファイルの untrack は同 PR 内で完結**: `.gitignore` だけ追加して既存 file を残すと無効。`git rm --cached` も同時実施

## 要件

### 1. `.gitignore` の更新

`.gitignore` に以下を追加する:

```
specrunner/changes/test-slug/
```

### 2. 既存 tracked file の untrack

`specrunner/changes/test-slug/` 配下の tracked file を `git rm --cached` で untrack する:

- `specrunner/changes/test-slug/pr-create-result.md` (および同ディレクトリ配下の他 tracked file があればすべて)

### 3. test 実行後の git status clean を確認する

ローカルで `bun run test && git status` を実行し、`specrunner/changes/test-slug/` 配下の変更が表示されないことを確認する。

### 4. spec 影響

なし。本 request は build artifact / dev hygiene の範囲なので spec 編集不要。

## スコープ外

- `pr-create.ts` の path 解決ロジック変更 (test 時の出力先を `tests/fixtures/` 配下に切り替える等)
- 他の test artifact ディレクトリの gitignore 整理 (本 request は `test-slug` 1 件のみ)

## 受け入れ基準

- [ ] `.gitignore` に `specrunner/changes/test-slug/` が含まれている
- [ ] `specrunner/changes/test-slug/` 配下の tracked file が untrack されている (`git ls-files specrunner/changes/test-slug/` が空)
- [ ] `bun run test` 実行後に `git status` が clean (= test artifact が untracked にも tracked にも現れない)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
