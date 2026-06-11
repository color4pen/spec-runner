# カスタムレビューワーの起動条件を宣言的に指定できるようにする

## Meta

- **type**: new-feature
- **slug**: reviewer-activation-conditions
- **base-branch**: main
- **adr**: true

## 背景

カスタムレビューワー（#622）を全 job で無条件に起動すると、観点が無関係な変更でも時間と token を消費する — 認証コードに触れない diff へのセキュリティ監査、bug-fix への重量レンズなど。起動するかどうかの判断を LLM に渡さず、観測可能な事実（変更ファイル一覧・request type）から CLI が決定論で判定する宣言的ゲートを導入する。#622 の着地を前提とする。

## 現状コードの前提

- code-review は CLI が事前計算した diff stat を初期メッセージ注入で受け取る（`src/core/step/code-review.ts:65-67`）— 変更ファイルの観測経路は CLI 側に既存
- request type 別の step 設定解決（byRequestType）が存在する（`src/config/step-config.ts:71`）— type を判定材料にする前例
- reviewer 定義の frontmatter（name / maxIterations / model）と load-time validation は #622 で導入される

## 要件

1. reviewer 定義の frontmatter に任意の `paths`（glob 配列）/ `requestTypes`（配列）を指定できる
2. 起動判定は CLI が決定論で行う — paths は差分の変更ファイル一覧との glob 照合、requestTypes は request の type との一致。LLM を使わない
3. 条件不一致の reviewer は skip し、approved と区別された状態として理由付きで state / journal に記録する
4. 条件無指定は制約なし（常時起動）。条件を持たない reviewer と reviewers/ 不存在の挙動は現行と完全一致
5. `specrunner reviewers new <name>` scaffold コマンドを追加する（`rules new` と同型、必須セクション入りの雛形を生成）

## スコープ外

- LLM による起動判定（router agent）
- diff 行数などサイズ閾値による条件
- reviewer 間の依存・順序条件

## 受け入れ基準

- [ ] paths 不一致の reviewer が skip され、理由付きで journal に記録される
- [ ] requestTypes 一致で起動、不一致で skip される
- [ ] 条件無指定の reviewer は常時起動する
- [ ] skip が approved と区別された状態として state に残る
- [ ] scaffold の出力が #622 の load-time validation を通る
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 起動判定を agent ではなく CLI の決定論に置く。「どの観点でレビューしたか」は説明責任を伴う判断であり、非決定にしない
- 条件は md にコミットされる宣言とし、起動ポリシーの変更自体を PR でレビュー可能にする（CODEOWNERS / GitHub Actions の paths と同じ語彙）
- skip ≠ approved を state に固定する。「そもそも見ていない観点」と「見て通った観点」の区別を lineage に残す
