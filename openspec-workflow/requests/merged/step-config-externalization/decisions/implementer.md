# Implementer Decisions: step-config-externalization

## 決定事項

- `StepExecutionConfig` と `StepConfigMap` を `src/config/schema.ts` に追加する :: types は `SpecRunnerConfig` と同一ファイルに置き、cohesion を保つ（module-analysis recommendation #2）

- `getStepExecutionConfig()` を `src/config/step-config.ts` に純粋関数として実装する :: SRP に従い解決ロジックを schema.ts から分離（module-analysis recommendation #1）

- `validateConfig()` に steps フィールドの検証を追加する :: 既存の pipeline.maxRetries 検証と同じパターンで、spec-review HIGH #1 の指摘に対応する

- `maxTurns: null` と `maxTurns: undefined` を明示的に区別する :: null = unlimited（fallback なし）、undefined = 次の優先度へ fallback。JSON では `null` キーと key 不在が区別可能

- ClaudeCodeRunner で `step.maxTurns ?? 30` フォールバックを削除し、`getStepExecutionConfig()` の解決チェーンに置き換える :: tasks.md 3.3 の指示に従う。既存テスト TC-002/TC-003 は新しい config 経由の解決を検証するよう更新する

- 既存の ClaudeCodeRunner テスト（TC-002、TC-003、TC-023）は config 経由の解決を検証する形に更新する :: `step.maxTurns ?? 30` 削除後の期待値を新しい解決チェーンに合わせる

- `runInitLocal()` で `steps` フィールドがない場合のみ `steps.defaults` を追加する :: 既存の `anthropic: existingConfig.anthropic ?? {...}` パターンと同じ `??` イディオムを使う

- `timeoutMs` は `ResolvedStepConfig` に含めるが SDK options には渡さない :: design.md D3「SDK 未対応」に従う。resolved value を返すが ClaudeCodeRunner では使用しない

- テストは `tests/config/step-config.test.ts` に新規ファイルとして作成する :: 純粋関数なのでモックなし（module-analysis recommendation #8）

- init テストは `tests/init.test.ts` の末尾に追記する :: 既存のテストパターンと一致させる（tempDir + XDG_CONFIG_HOME パターン）
