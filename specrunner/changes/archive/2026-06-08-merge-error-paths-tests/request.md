# merge-then-archive の未テスト error path を追加する

## Meta

- **type**: chore
- **slug**: merge-error-paths-tests
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/core/archive/merge-then-archive.ts` は `archive --with-merge` の全体オーケストレーションを担う。既存テスト（`tests/unit/core/archive/merge-then-archive.test.ts`）は happy path と check status 系の分岐を網羅しているが、以下の 4 つの error path がテストされていない:

1. Step 1: `JobStateStore.list` が throw → exitCode 2
2. Step 2: 初回 `getPullRequest` が throw → exitCode 1（escalation）
3. Step 5: `mergePullRequest` が throw → exitCode 1（escalation）
4. Step 5: `mergePullRequest` が `{ merged: false }` を返す → exitCode 1（escalation）

## 要件

1. 既存の `tests/unit/core/archive/merge-then-archive.test.ts` に上記 4 ケースを追加する。
2. 既存テストの `makeGitHubClient` helper と `makeJobState` helper を再利用する。
3. 各ケースで exitCode と escalation メッセージの内容（failedStep 名）を検証する。

## スコープ外

- `merge-then-archive.ts` のプロダクションコード変更。
- `pr-status.ts` のテスト（別 request）。
- protected-paths guard 関連のテスト追加（既存テストで網羅済み）。

## 受け入れ基準

- [ ] 上記 4 つの error path それぞれにテストケースが追加されている
- [ ] ケース 1 は exitCode: 2 と message 内容を検証、ケース 2〜4 は exitCode: 1 と escalation 内の failedStep 文字列を検証している
- [ ] 既存テストに regression がない
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- 既存テストファイルに追記する（新規ファイルを作らない）。既に `makeGitHubClient` / `makeJobState` / module mock が整っているため、そこに乗る。
