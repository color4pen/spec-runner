# finish Phase 3 で merge 前に conflict 状態をチェックする

## Meta

- **slug**: finish-conflict-precheck
- **type**: new-feature
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`specrunner finish` の Phase 3 で `gh pr merge` が "Base branch was modified" で失敗することがある。rebase してからやり直せば解決するが、merge 直前まで進んでから失敗するのは UX が悪い。

GitHub Issue #197。

## 目的

merge 実行前に PR の conflict 状態を確認し、conflict がある場合は rebase を促すメッセージを出して早期に停止する。

## 要件

1. Phase 3 の `gh pr merge` 実行前に `gh pr view --json mergeable` で PR の状態を確認する
2. mergeable が `CONFLICTING` の場合、rebase を促すエラーメッセージを出して停止する
3. mergeable が `UNKNOWN` の場合、短時間リトライ（最大3回、各5秒待機）して判定する
4. mergeable が `MERGEABLE` の場合、そのまま merge を実行する

## 受け入れ基準

- [ ] conflict 状態の PR で finish を実行すると rebase を促すメッセージが出る
- [ ] mergeable な PR は通常通り merge できる
- [ ] UNKNOWN 状態でリトライが動作する
- [ ] `bun run typecheck` / `bun run test` が全 pass
