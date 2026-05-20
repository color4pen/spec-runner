# finish コマンドの Phase 0 で feature branch に checkout してから validate を実行する

## Meta

- **type**: bug-fix
- **slug**: finish-checkout-feature-branch

## 背景

`specrunner finish <slug>` の Phase 0 check 6 で `openspec validate <slug>` を実行するが、local mode では change folder が feature branch にのみコミットされている。main の cwd で validate を実行すると change folder が認識されず `Unknown item` で escalation する。

## 再現手順

1. `specrunner run` で pipeline を完走させる（PR 作成まで）
2. `specrunner finish <slug>` を実行する
3. Phase 0 check 6 で `openspec validate` が失敗する: `Unknown item '<slug>'`

## 期待される動作

finish が `state.branch` に checkout してから validate を実行し、完了後に元の branch に戻る。

## 要件

1. Phase 0 の `openspec validate` 実行前に `git checkout <state.branch>` を実行する
2. Phase 0 完了後（成功/失敗問わず）に元の branch に `git checkout -` で戻る
3. checkout 失敗時は escalation として報告する
4. managed mode（branch が remote のみに存在する場合）では `git fetch origin <branch> && git checkout <branch>` にする

## 受け入れ基準

- [ ] local mode で `specrunner finish` が Phase 0 check 6 を通過する
- [ ] finish 完了後に元の branch に戻っている
- [ ] `bun run typecheck && bun run test` が green
