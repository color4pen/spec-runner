# bootstrap の materialization commit を egress 台帳に記録し、初回 push の誤 halt を解消する

## Meta

- **type**: bug-fix
- **slug**: bootstrap-commit-egress-ledger
- **base-branch**: main
- **adr**: false

## 背景

egress backstop(#893)は「push が新規公開する commit ⊆ state 記録の synthesizedCommits」を検証する。しかし job bootstrap 時に pipeline 自身が作る「add request.md for <slug>」の materialization commit は synthesizedCommits に記録されておらず、かつ branch の初回 push は最初の step commit と同時に行われるため、**新規 job の最初の scoped commit + push が必ず EGRESS_UNKNOWN_COMMIT で halt する**(実例: job ac3aa8bf、request-review 完了後の push で materialization commit f78c52e1d が unknown 判定 → awaiting-resume。operator の branch 手 push で回避した)。

台帳の意味論は「pipeline が構成した commit の全集合」であり、bootstrap commit は pipeline 製である。台帳への記録漏れが欠陥であり、egress 側の緩和(範囲縮小)は正しくない(resume 経路の盲点になるため設計 D4 で明示的に禁止済み)。

## 現状コードの前提

- `src/core/runtime/local.ts:406` / `src/core/runtime/managed.ts:236` / `src/core/runtime/workspace-materializer.ts:215` — 3 つの bootstrap 経路が `git commit -m "add request.md for <slug>" -- <changeFolder>` を実行する。いずれも commit OID を捕捉せず、state の synthesizedCommits に append しない
- `src/state/schema/operations.ts` — `appendSynthesizedCommit(state, oid)`(pure・冪等)が存在する
- 3 サイトとも commit 直後に jobId と updateJobState(または同等の state 書込手段)へアクセスできる文脈にある
- `src/core/step/commit-push.ts` — `runInlineEgressCheck` の公開範囲は `rev-list HEAD --not --remotes=origin` の厳密形(entry-HEAD による縮小は resume 盲点のため禁止 — design D4)。bootstrap commit が未 push かつ台帳外だと初回 push の範囲に現れて halt する
- `tests/pipeline-sole-committer-e2e.test.ts` ほか実 git テストは baseline を `rev-list HEAD` で台帳 seed しており、「bootstrap commit が台帳に載る」実挙動は未検証(この seed が本欠陥を覆い隠した)

## 要件

1. 3 つの bootstrap 経路すべてで、materialization commit の作成直後に `git rev-parse HEAD` で OID を捕捉し、`appendSynthesizedCommit` で job state に記録して永続化する。
2. rev-parse または state 永続化の失敗は黙殺せず bootstrap 失敗として扱う(fail-closed。台帳に載らない pipeline commit を作らない)。
3. 実 git テスト: 手動 seed なしの fabricated bootstrap → 最初の scoped commit + push の egress が pass することを固定する(本欠陥の再現封鎖)。既存テストの baseline 手動 seed は「bootstrap 由来でない歴史を持つ repo」の表現としてのみ残す。

## スコープ外

- egress の公開範囲計算の変更(厳密形を維持する)
- operator 手 commit の運用(手 push のまま)
- 既存 halt 済み job の遡及修復(operator 手 push で解消済み)

## 受け入れ基準

- [ ] 3 経路それぞれで bootstrap 後の state.synthesizedCommits に materialization commit の OID が含まれることをテストで固定する
- [ ] 手動 seed なしの実 git bootstrap → 初回 scoped commit + push で EGRESS_UNKNOWN_COMMIT が発生しないことをテストで固定する
- [ ] rev-parse 失敗の注入で bootstrap が失敗することをテストで固定する(黙殺しない)
- [ ] 修正前の挙動(台帳未記録)に戻すと該当テストが fail することを破壊確認として記録する
- [ ] 既存の egress / 合成 / revision 束縛テストは無改変で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: 台帳側の完全化(bootstrap commit の記録)**。台帳の意味論「pipeline 製 commit の全集合」に対する記録漏れの修正であり、検証側は触らない。
- **却下: egress の公開範囲を entry-HEAD 等で縮小して回避** — resume 経路の盲点を作るため設計 D4 で明示的に禁止済み。
- **却下: bootstrap 時に branch を即 push して回避** — push を増やしても台帳の意味論の穴(pipeline 製なのに台帳外の commit)は残り、ネットワーク断で同じ halt に戻る。
