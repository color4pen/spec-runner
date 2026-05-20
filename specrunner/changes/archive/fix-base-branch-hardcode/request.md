# collectDynamicContext 他の base branch ハードコードを解消する

## Meta

- **type**: bug-fix
- **slug**: fix-base-branch-hardcode

## 背景

`src/git/dynamic-context.ts` の `collectDynamicContext()` をはじめ、コードベース全体で base branch が `"main"` / `"origin/main"` にハードコードされている。`master` ベースのリポジトリでは git log/diff が空にフォールバックし DynamicContext の価値がゼロになるほか、PR の base branch も誤ったものが指定される。

issue #121。

### 影響箇所（10 箇所）

1. `src/git/dynamic-context.ts:60,61` — `git log main..HEAD` / `git diff main..HEAD`（`_branch` パラメータ未使用）
2. `src/core/command/runner.ts:113` — `collectDynamicContext` 呼び出しで `jobState.branch ?? "main"` をフォールバック渡し
3. `src/core/runtime/local.ts:153` — resume worktree 再作成時の `"origin/main"`
4. `src/core/runtime/local.ts:167` — resume（worktree 未記録）時の `"origin/main"`
5. `src/core/runtime/local.ts:201` — run 時の worktree 作成 `"origin/main"`
6. `src/core/runtime/local.ts:186,193` — `rev-list HEAD..origin/main` の behind 警告
7. `src/core/step/pr-create.ts:35` — `baseBranch: "main"`
8. `src/core/finish/orchestrator.ts:259` — `currentBranch === "main"` の比較（`master` リポジトリで常に false → base branch への復帰がスキップされる）
9. `src/core/finish/orchestrator.ts:263` — `git checkout main`
10. `src/core/finish/orchestrator.ts:215` — escalation メッセージ内 `"onto main"` ハードコード

### 設計方針

request.md の Meta セクションに `base-branch` フィールドを必須化する。未指定の場合は `parseRequestMdContent()` で `REQUEST_MD_INVALID` エラーを投げる。`specrunner request validate` でも検出される。

各コマンド（`run` / `finish`）は `ParsedRequest.baseBranch` から値を取得し、ハードコードされた `"main"` を置換する。

## 要件

### 1. ParsedRequest に baseBranch フィールドを追加

- `src/parser/request-md.ts` の `ParsedRequest` interface に `baseBranch: string` を追加
- `parseRequestMdContent()` で Meta セクションから `- **base-branch**: <value>` を抽出
- 未指定時は `REQUEST_MD_INVALID` エラーを throw（`type` / `slug` と同じパターン）

### 2. request テンプレートに base-branch を追加

- `buildScaffoldTemplate()` のテンプレート出力に `- **base-branch**: main` をデフォルト値付きで追加
- `specrunner request template` の出力に反映される

### 3. 10 箇所のハードコードを ParsedRequest.baseBranch 参照に置換

- `src/git/dynamic-context.ts:60,61` — `_branch` パラメータを `baseBranch: string` にリネームして実際に使用
- `src/core/command/runner.ts:113` — `collectDynamicContext` に `request.baseBranch` を渡す
- `src/core/runtime/local.ts:153,167,201` — `"origin/main"` を `"origin/{baseBranch}"` に置換。`baseBranch` は `setupWorkspace()` の引数経由で受け取る
- `src/core/runtime/local.ts:186,193` — behind 警告の `origin/main` 参照を同様に修正
- `src/core/step/pr-create.ts:35` — `baseBranch: "main"` を `ParsedRequest` から取得した値に置換
- `src/core/finish/orchestrator.ts:259,263` — `currentBranch === "main"` と `git checkout main` を `baseBranch` に置換
- `src/core/finish/orchestrator.ts:215` — escalation メッセージ内 `"onto main"` を `baseBranch` に置換

### 4. finish への baseBranch 伝搬経路

- `FinishInput` interface に `baseBranch: string` を追加
- `cli/finish.ts` で request.md をパースし `baseBranch` を `FinishInput` 経由で orchestrator に渡す

### 5. TODO(base-branch) マーカーの除去

修正完了後、全 `TODO(base-branch)` コメントを削除する。

## スコープ外

- config.json への baseBranch フィールド追加（request.md で指定するため不要）
- Managed Runtime 側の対応（現在 Local Runtime のみが該当）

## 受け入れ基準

- [ ] `ParsedRequest` に `baseBranch: string` フィールドが存在する
- [ ] request.md に `base-branch` がない場合 `REQUEST_MD_INVALID` エラーが発生する
- [ ] `specrunner request template` の出力に `base-branch` フィールドが含まれる
- [ ] 10 箇所のハードコード `"main"` / `"origin/main"` が全て `baseBranch` 参照に変更されている
- [ ] `FinishInput` 経由で orchestrator が `baseBranch` にアクセスできる
- [ ] `TODO(base-branch)` コメントがコードベースに残っていない
- [ ] `bun run typecheck && bun run test` が green


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/fix-base-branch-hardcode.md` by `merged-to-archive-consolidation`.
