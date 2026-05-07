# specrunner run の進捗表示と完了後の次アクション案内

## Meta

- **type**: improvement
- **slug**: cli-run-progress-display

## 背景

`specrunner run` 実行中の CLI 表示が不足している:
- どの step を実行中か分からない（spec-review の iter 表示以外は沈黙）
- warning が大量に出て本筋が埋もれる
- 完了時に次のアクション（finish コマンド）が案内されない

## 要件

1. step 遷移ごとに進捗を stdout に表示する
   - 例: `[propose] �� (12s) → [spec-review] running...`
   - `[spec-review] ✓ approved (8s) → [implementer] running...`
   - `[verification] ✗ failed → [build-fixer] running...`
2. 各 step の所要時間を表示する
3. pipeline 完了時に次のアクションを表示する
   - `Next: bun ./bin/specrunner.ts finish <slug>`
4. warning を `--verbose` 時のみ表示する（デフォルトは抑制）
5. EventBus の `step:start` / `step:complete` / `step:error` / `verdict:parsed` に subscriber を登録して表示する（pipeline.ts の直接 stdout 出力は残してよい）

## 受け入れ基準

- [ ] step 遷移が stdout に表示される
- [ ] 各 step の所要時間が��示される
- [ ] 完了時に next action（finish コマンド）が表示される
- [ ] `--verbose` なしで warning が抑制される
- [ ] `bun run typecheck && bun run test` が green
