# 成果物の lineage と工程ごとの cost 帰属を可視化する（記述子化 R5）

## Meta

- **type**: new-feature
- **slug**: artifact-observability
- **base-branch**: main
- **adr**: true

## 背景

記述子化の直列計画 R1〜R4（pipeline-identity / pipeline-descriptor / pipeline-roles-neutral-engine / step-io-contracts、いずれも 2026-06-04 に archive 済み）により、pipeline は一級の記述子を持ち、各 step は inputs / outputs を宣言している。R5 として、この宣言を観測に接続する: 成果物の lineage（どの artifact がどの step のどの入力から生まれたか）と、工程ごとの cost 帰属を `job show` 等で可視化する。

## 現状コードの前提

- 各 step の inputs / outputs は `reads()` / `writes()` で宣言済み（R4、`src/core/step/types.ts` の IoRef）
- cost は `changes/<slug>/usage.json` に invocation 単位で記録され、step / model 別の集計が `specrunner usage` に存在する
- `StepName` は closed union（`src/kernel/step-names.ts`）で、任意工程名の記録は読めない
- `JobState.version` は常に 1（`src/state/schema.ts`、validateJobState が強制）

## 要件

1. 成果物の lineage を記録する: step 完了時に「宣言された outputs ← 宣言された inputs」の対応を、content addressing（内容ハッシュ）付きで journal に記録する
2. `job show <slug>` で lineage（artifact の生成元 step と入力）と step ごとの cost（usage.json との接続）を表示する
3. `StepName` を string へ拡張し、任意工程名の記録を読めるようにする（型安全な whitelist は標準記述子側の検証に残す）
4. `JobState` の version を上げ、旧 version の記録を読み込み時に移行する（前方互換）
5. cache は導入しない（計画の明示判断: 全工程が gitWrite のため適用対象が無く、誤判定で branch / 記録が乖離する）

## スコープ外

- methodology-packaging（H1）・並列分岐（H2）
- usage.json のフォーマット変更
- lineage に基づく実行最適化（観測のみ）

## 受け入れ基準

- [ ] `job show` で lineage と step 別 cost が表示される
- [ ] 任意工程名を含む記録が読める
- [ ] 旧 version の state.json / events.jsonl が移行で読める（既存 archive のサンプルで検証）
- [ ] 既存の標準 pipeline の挙動・画面出力が変わらない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- state version 上げと移行を伴うため adr: true。lineage は journal（append-only）側に記録し、projection の責務を増やさない方向を基本とする
