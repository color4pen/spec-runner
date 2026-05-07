## 1. Config Schema 拡張

- [x] 1.1 `src/config/schema.ts` に `StepExecutionConfig` と `StepConfigMap` 型を追加
- [x] 1.2 `SpecRunnerConfig` に `steps?: StepConfigMap` フィールドを追加
- [x] 1.3 `RawConfig` に `steps?` フィールドを追加（読み込み用）

## 2. 解決関数の実装

- [x] 2.1 `src/config/step-config.ts` に `ResolvedStepConfig` 型と `getStepExecutionConfig()` 関数を実装
- [x] 2.2 解決順序のテストを追加: step-level > defaults > stepDefaults > SDK fallback
- [x] 2.3 `null` が有効値として扱われるテストを追加（`null` = unlimited、`undefined` = 次の fallback）
- [x] 2.4 `validateConfig()` に steps セクションの値検証を追加: maxTurns (number>=1 | null)、model (non-empty string)、timeoutMs (number>=1 | null)
- [x] 2.5 steps validation のテストを追加: 負数・0・文字列・空文字列・null・未指定の各ケース

## 3. ClaudeCodeRunner への適用

- [x] 3.1 `src/adapter/claude-code/agent-runner.ts` で `getStepExecutionConfig()` を呼び出し、解決済みの model / maxTurns を SDK `query()` に渡す
- [x] 3.2 `maxTurns: null` の場合に `options.maxTurns` を省略するロジックを実装
- [x] 3.3 既存の `step.maxTurns ?? 30` フォールバックを削除
- [x] 3.4 ClaudeCodeRunner のテストを更新: config 経由の model / maxTurns 解決を検証

## 4. specrunner init の更新

- [x] 4.1 `src/cli/init.ts` の `runInitLocal()` で `steps` セクション未存在時に `steps.defaults` を追加
- [x] 4.2 既存 config に `steps` がある場合は上書きしないロジックを実装
- [x] 4.3 init のテストを更新: steps.defaults 生成と上書き防止を検証

## 5. Delta Spec

- [x] 5.1 `openspec validate step-config-externalization --type change --strict` が pass することを確認

## 6. 検証

- [x] 6.1 `bun run typecheck` が green
- [x] 6.2 `bun run test` が green
