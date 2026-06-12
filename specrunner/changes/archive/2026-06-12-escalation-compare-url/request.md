# escalation 通知コメントに branch の compare URL を含め、停止した job の差分確認を GitHub 上で完結させる

## Meta

- **type**: new-feature
- **slug**: escalation-compare-url
- **base-branch**: main
- **adr**: false

## 背景

escalation で停止した job への判断には変更差分の確認が必要だが、escalation 通知コメントには step 名と理由しか含まれず、diff への導線が GitHub 上に存在しない（2026-06-12 の escalation 対応では worktree 内のファイルを直接参照する必要があった）。

job の branch は step 完了毎に origin へ push 済みのため、escalation 時点で差分は compare ページ（`{base}...{branch}`）として既に閲覧可能になっている。不足しているのは通知コメントからの導線のみであり、URL を 1 行含めるだけで「diff を見る → linked issue にコメントで判断 → /resume」が GitHub 上で完結する。

## 現状コードの前提

- `src/core/notify/issue-notifier.ts:88` — `buildEscalationComment(state)` は marker / step / reason / resume コマンドのみを含む。JobState を入力とする純関数
- `src/state/schema.ts:89-92` — JobState.repository に owner / name があるため、compare URL は state のみから組み立て可能
- `src/state/schema.ts:201` — `state.branch` は `string | null`。branch 作成前（request-review 段階）の escalation では null があり得る
- `src/state/schema.ts:79-87` — RequestInfo は base-branch を保持しない。request.md の base-branch を URL の base に反映するには保存の追加が必要（保存方式、または main 固定で済ませるかは design で判断）
- `src/core/step/commit-push.ts` — 各 step 完了時に commit & push されるため、escalation 時点の branch は origin 上で最新

## 要件

1. escalation 通知コメントに compare URL（`https://github.com/{owner}/{repo}/compare/{base}...{branch}`）を 1 行含める
2. `state.branch` が null の場合は URL 行を省略し、従来の文面で投稿する（投稿自体を妨げない）
3. base は request.md の base-branch を反映する（実現方式は design で判断。main 固定とする場合はその制約を ADR ではなく design.md に記録する）

## スコープ外

- escalation 時の draft PR 作成（diff への行コメント単位のレビューが実需になった場合に別 request で再検討）
- 完走通知（completion comment）の変更 — PR URL が既に含まれている
- inbox / resume コメントジェスチャー側の変更

## 受け入れ基準

- [ ] escalation 通知コメント本文に compare URL が含まれることをテストで固定する
- [ ] `state.branch` が null の場合に URL 行なしで従来通り投稿されることをテストで固定する
- [ ] base-branch が main 以外の request での URL（または main 固定の制約の記録）をテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 発端: 2026-06-12 の escalation 3 件（いずれも pr-create 前の停止で、GitHub 上に diff 確認手段がなかった）
