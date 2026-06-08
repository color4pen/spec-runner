# pr-status.ts のユニットテストを追加する

## Meta

- **type**: chore
- **slug**: pr-status-tests
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/core/finish/pr-status.ts`（196 行）は `archive --with-merge` の PR ステータス確認を担う。`fetchPrViewWithRetry`（UNKNOWN retry + MERGED bypass）と `checkMergeableForMerge`（MERGEABLE/CONFLICTING/UNKNOWN 分岐 + retry）の 2 関数を持つが、テストファイルが一切存在しない。

## 要件

1. `tests/unit/core/finish/pr-status.test.ts` を新規作成し、以下の分岐を網羅する。

   **fetchPrViewWithRetry**:
   - getPullRequest 成功 → mergeStateStatus が CLEAN 系 → ok: true
   - getPullRequest が throw → ok: false（escalation）
   - mergeStateStatus が UNKNOWN → retry → 2 回目で CLEAN → ok: true
   - mergeStateStatus が UNKNOWN → 全 retry 消尽 → ok: false（escalation）
   - MERGED + UNKNOWN → retry せず即 ok: true（bypass）

   **checkMergeableForMerge**:
   - mergeable が MERGEABLE → ok: true
   - mergeable が CONFLICTING → ok: false（escalation に baseBranch を含む）
   - mergeable が UNKNOWN → retry → 2 回目で MERGEABLE → ok: true
   - mergeable が UNKNOWN → 全 retry 消尽 → ok: false（escalation）
   - getPullRequest が throw → ok: false（escalation）

2. sleepFn を注入して retry の待ち時間を除去する。GitHubClient は `makeGitHubClientMock`（`tests/helpers/github-client-mock.ts` — 存在しない場合はテスト内にローカル helper を定義）を使う。

## スコープ外

- `pr-status.ts` のプロダクションコード変更。
- `merge-then-archive.ts` の error path テスト（別 request）。

## 受け入れ基準

- [ ] `tests/unit/core/finish/pr-status.test.ts` が存在し、上記 10 分岐を網羅する
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- テストは既存の `tests/unit/core/finish/` に置く（archive-change-folder.test.ts と同じ場所）。
- GitHubClient mock は inline で全メソッドを定義する（既存テストと同じパターン。共有 factory への集約は別作業）。
