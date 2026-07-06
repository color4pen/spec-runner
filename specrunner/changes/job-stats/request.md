# run 単位の統計（コスト・収束回数・所要時間）を集計する job stats コマンド

## Meta

- **type**: new-feature
- **slug**: job-stats
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

run の実測データ（何ドルかかったか・review が何周で収束したか・何分かかったか）は journal / usage.json に記録されているが、run 横断で集計して見る手段がない。既存の `usage` / `usage summary` はトークンとコストの明細に限られ、収束回数と所要時間はどこにも表示されない。

このため「fast profile は実際いくら節約するのか」「escalation はどの程度の頻度か」「典型的な run は何分・何ドルか」といった運用判断が勘に頼っている。run 単位の統計を機械可読で出せるようにし、以後の改善（profile 推奨・見積もり提示）の入力データにする。

## 現状コードの前提

- `src/store/event-journal.ts:31-53`: `StepAttemptRecord` は `step` / `outcome.verdict` / `startedAt` / `endedAt`（ISO 8601）を持つ。attempt 番号は記録されず fold 時に導出される（`:222,290`）。usage/cost フィールドは journal に無い。
- `src/store/event-journal.ts:106-128`: `fold()` の `FoldResult` は `stepCounts`（step 別 attempt 数）と `steps`（`startedAt`/`endedAt` 付き `StepRun[]`）を計算する。cost と duration は計算しない。
- `src/core/usage/types.ts:9-28`: `usage.json` は `{ commandInvocations: [...] }`。各 invocation は `command` / `timestamp` / `modelUsage`（model 名 → トークン 4 種、`null` あり）/ `jobId?` / `stepName?` を持つ。事前計算されたコストは持たない。
- `src/core/usage/pricing.ts:210-220`: `computeCostUsd(model, usage)` が読み出し時にコストを計算する。`MODEL_PRICING`（`:38-172`）に無い model は unpriced 扱い。
- `src/core/command/usage-summary.ts:57-89,222-264`: `aggregateUsage` が archive 全体を `fs.readdir` で走査し slug / step×model / 総計のトークン・コストを集計する。収束回数・所要時間は扱わない。
- `src/cli/job-show.ts:221-266`: `computeStepCosts` が単一 run の step 別コストを計算・表示する。
- `src/cli/command-registry.ts:398-`: `job` コマンドの `subcommands` に `start` / `ls` / `show` / `cancel` / `resume` / `archive` 等が registry 形式で定義される。`stats` は存在しない。
- `src/util/paths.ts:102,242`: `archivedChangesDirRel()` = `specrunner/changes/archive`、`parseArchiveDirName` が `YYYY-MM-DD-` prefix を分離する。
- `src/state/schema.ts:174-178`: ManagedAgentRunner / CLI 実行の step は `modelUsage` が null になり得る。

## 要件

1. **`specrunner job stats` subcommand を追加する。** archive 配下（および active な `specrunner/changes/<slug>`）の run を列挙し、run ごとに 1 行のテーブルで表示する: slug / 日付 / 所要時間 / 収束回数（review 系 loop step の attempt 数）/ コスト（USD）/ 最終 outcome。
2. **summary 行を出す**: 対象 run 件数、コストの合計と中央値、所要時間の中央値、収束回数の平均。
3. **`--json` フラグで機械可読出力を出す。** run ごとの行と summary を含む JSON。以後のツール（profile 推奨・見積もり）の入力になることを想定した安定したキー集合とする。
4. **導出は既存機構を再利用する**: 収束回数は `fold()` の `stepCounts`、コストは `usage.json` + `computeCostUsd`、所要時間は journal の timestamp（最小 `startedAt` 〜最大 `endedAt`）から導出する。集計ロジックの再実装をしない。
5. **データ欠損に寛容にする**: `usage.json` 不在・`modelUsage` null・`events.jsonl` 不在・timestamp 欠落の run は fail させず、該当セルを欠損表示（`-` 等)にして残りを集計する。

## スコープ外

- 既存 `usage` / `usage summary` コマンドの変更・統合（トークン明細の役割で現状のまま残す）
- live（実行中）job のリアルタイム統計・進捗表示
- 統計に基づく推奨・自動化（profile 推奨・見積もり提示は後続 request）
- journal / usage.json のスキーマ変更

## 受け入れ基準

- [ ] fixture の archive ディレクトリ（events.jsonl + usage.json + state.json）に対する `job stats` のテーブル出力と `--json` 出力がテストで固定される
- [ ] usage.json 不在・modelUsage null・events.jsonl 不在の各 fixture で fail せず欠損表示になることがテストで固定される
- [ ] `--json` 出力のトップレベルキー集合がテストで固定される
- [ ] 既存テスト無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **新 subcommand として追加し、`usage summary` の拡張にしない（採用）**: usage summary はトークン明細の表で意味が確立しており、列を足すと既存出力の互換と役割が崩れる。run 単位の運転統計は別コマンドの方が責務が明確。
- **所要時間は journal timestamp から導出（採用）** / state.json の `createdAt`/`updatedAt` から導出（却下: updatedAt は run 完了以外の操作でも動き得て、意味が曖昧）。
- **コストは読み出し時計算を維持（採用）** / usage.json への事前計算コスト追加（却下: スキーマ変更はスコープ外、pricing 改定時に腐る）。
