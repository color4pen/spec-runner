# Module Architect Decisions

型定義を schema.ts に、解決関数を step-config.ts に分割する :: SpecRunnerConfig.steps フィールドの型は schema.ts の SpecRunnerConfig 定義と同居すべき（cohesion）だが、解決ロジックは getAgentId.ts と同格の独立モジュールとする（SRP）

steps の validation を validateConfig() 内に追加する :: pipeline.maxRetries と同じパターンを踏襲し、validation の単一エントリポイントを維持する（cohesion）

migrate.ts を変更しない :: applyMigration の spread パターンが新規オプショナルフィールドをパススルーするため不要（coupling 削減）

saveConfig() を変更しない :: legacy フィールド stripping は steps に無関係（coupling 削減）

ClaudeCodeRunner.run() 内の options 構築をインライン修正にとどめる :: 単一 call site への 5 行追加は helper 抽出の閾値未満（readability）

runInitLocal() の steps 追加を既存の条件付きデフォルトパターンに従う :: anthropic の ?? パターンと同形式（readability、consistency）

getStepExecutionConfig() のテストを独立ファイルにする :: pure 関数のテストは mock 不要で自己完結（testability）
