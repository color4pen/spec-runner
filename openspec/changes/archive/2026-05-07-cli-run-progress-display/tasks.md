## 1. --verbose フラグの追加

- [x] 1.1 `bin/specrunner.ts` の `run` case で `args.includes("--verbose")` を解析し、`--verbose` を除外した requestMd を取得する
- [x] 1.2 `runRun` と `runRunCore` の options 型に `verbose?: boolean` を追加（`src/cli/run.ts`）
- [x] 1.3 `bin/specrunner.ts` から `runRun(requestMd, { verbose })` で渡す

## 2. warning 抑制

- [x] 2.1 `src/logger/stdout.ts` にモジュールレベル `let verbose = false` と `setVerbose(v: boolean)` / `isVerbose()` を追加
- [x] 2.2 `logWarn` を `if (!verbose) return;` で早期 return に変更
- [x] 2.3 `runRunCore` の冒頭で `setVerbose(options.verbose ?? false)` を呼び出す

## 3. EventBus の外部注入

- [x] 3.1 `src/core/pipeline/run.ts` の `runPipeline` signature に第3引数 `events?: EventBus` を追加
- [x] 3.2 関数内部で `const bus = events ?? new EventBus();` に変更し、以降 `bus` を使用
- [x] 3.3 `runProposePipeline` にも同様の変更を適用（一貫性のため）
- [x] 3.4 `bun run typecheck` が通ることを確認

## 4. ProgressDisplay の実装

- [x] 4.1 `src/cli/progress.ts` を新規作成
- [x] 4.2 `ProgressDisplay` クラスを実装: constructor で EventBus に subscribe
- [x] 4.3 `step:start` handler: `stepStartTimes` に開始時刻を記録し `[step] running...` を stdout に出力
- [x] 4.4 `step:complete` handler: 開始時刻から経過秒を算出し `[step] ✓ (Ns)` を stdout に出力
- [x] 4.5 `step:error` handler: `[step] ✗ error (Ns)` を stdout に出力
- [x] 4.6 `verdict:parsed` handler: verdict 値がある場合 `[step] verdict: <verdict>` を stdout に出力
- [x] 4.7 `pipeline:complete` handler: `Next: bun ./bin/specrunner.ts finish <slug>` を stdout に出力
- [x] 4.8 `pipeline:fail` handler: failure reason を stdout に出力

## 5. 配線

- [x] 5.1 `src/cli/run.ts` の `runRunCore` で EventBus を生成し、`ProgressDisplay` を構築して登録
- [x] 5.2 生成した EventBus を `runPipeline(jobState, deps, events)` に渡す
- [x] 5.3 ProgressDisplay の slug に `request.slug` を渡す

## 6. テスト

- [x] 6.1 `ProgressDisplay` の単体テスト: EventBus に emit して stdout 出力を検証
- [x] 6.2 `setVerbose(false)` 時に `logWarn` が出力しないことを検証
- [x] 6.3 `setVerbose(true)` 時に `logWarn` が出力することを検証
- [x] 6.4 `bun run typecheck` が green
- [x] 6.5 `bun run test` が green
