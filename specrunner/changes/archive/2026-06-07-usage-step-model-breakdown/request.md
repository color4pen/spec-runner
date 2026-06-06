# `specrunner usage` に step × model の内訳を表示する

## Meta

- **type**: new-feature
- **slug**: usage-step-model-breakdown
- **base-branch**: main
- **adr**: false

## 背景

`specrunner usage` は slug × model の粗い集計のみ表示する。usage.json には step 単位の `modelUsage` が記録されているが、表示に出ていない。

「どの step がいくら食っているか」「その step がどのモデルを使っているか」がわからないと、モデル選択の妥当性やコスト最適化の判断ができない。

## 要件

1. `specrunner usage` が step × model の交差表を表示する（step 名、model 名、input/output トークン数、USD コスト）。
2. 既存の slug × model の集計は維持する（上位サマリとして）。
3. USD コスト計算にはモデルごとの料金テーブル（input / output / cacheRead / cacheWrite）を使う。

## スコープ外

- usage.json のフォーマット変更（既存データに step × model のデータは既に入っている）
- リアルタイム実行中の usage 表示

## 受け入れ基準

- [ ] `specrunner usage` の出力に step × model の内訳行が含まれる
- [ ] 各行に USD コストが表示される
- [ ] 既存の slug 別集計が引き続き表示される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

TBD
