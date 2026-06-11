# PR の Fixes 行を job state の issueNumber から導出する

## Meta

- **type**: spec-change
- **slug**: pr-fixes-issue-link
- **base-branch**: main
- **adr**: false

## 背景

issue 起点の job では、PR の merge で起点 issue が自動 close されることが期待される（完了状態を issue の open/closed で一覧できるようにする）。しかし PR body の Fixes 行は request.md の issue フィールドのみを参照しており、job が実際に保持する起点 issue 番号（issueNumber）と接続されていない。このため issue 起点の job（inbox / --issue 経由）では Fixes 行が出力されず、merge 後も issue が開いたまま残る。

## 現状コードの前提

- renderPrBody は parsedRequest.issue が設定されている場合のみ `Fixes ${parsedRequest.issue}` を PR body に出力する（src/core/pr-create/body-template.ts:72-74）
- pr-create step は renderPrBody に jobState を渡している（src/core/step/pr-create.ts:33）
- issue 起点の job は state の issueNumber に起点 issue 番号を保持する（job start --issue / inbox 経由で設定）

## 要件

1. PR body の Fixes 行は jobState.issueNumber を優先し、`Fixes #<issueNumber>` を出力する
2. issueNumber が無い場合は従来どおり parsedRequest.issue を使う
3. どちらも無い場合は Fixes 行を出力しない

## スコープ外

- issue の close を archive や API 呼び出しで行う機構（close は GitHub の merge 時動作に委ねる）

## 受け入れ基準

- [ ] issueNumber を持つ job の PR body に `Fixes #<issueNumber>` が含まれる
- [ ] issueNumber が無く request.md に issue がある場合は従来の出力を維持する
- [ ] 両方無い場合は Fixes 行が出力されない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

TBD
