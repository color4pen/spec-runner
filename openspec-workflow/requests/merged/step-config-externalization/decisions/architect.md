# Architect Decisions — step-config-externalization

## Design Evaluation

StepConfigMap を Record<string, StepExecutionConfig | undefined> ベースにする :: step 名の追加時に型変更が不要。explicit union は step 追加のたびに型とspec両方の修正が必要で保守コストが高い。ただし typo のサイレント無視リスクは受容する（将来 doctor で検証可能）

getStepExecutionConfig を純粋関数として step-config.ts に配置する :: 既存パターン getMaxRetries(config) と同構造。config モジュール内に責務が閉じ、テスタビリティが高い。Step オブジェクト自体を config-agnostic に保つ判断は正しい

4段階解決チェーンを採用する :: 段数は適正。config step > config defaults > hardcode > SDK の順序は specificity の降順で自然。CSS の cascade に類似した mental model で直感的

null vs undefined の区別を JSON semantics で行う :: JSON では null と key不在を区別可能。JavaScript での hasOwnProperty / in operator で判定可能。設計として sound

## module-analysis.md 評価

migrate.ts の spread passthrough 判断を妥当と判定する :: line 119 の `...rawConfig as Record<string, unknown>` が steps フィールドをそのまま通過させることを実コードで確認済み

store.ts 変更不要の判断を妥当と判定する :: saveConfig は canonical SpecRunnerConfig を JSON.stringify するだけで、steps フィールドは透過的に保存される

validateConfig に steps validation を追加すべきと判定する :: module-analysis の recommendation #3 は正しいが、delta spec に steps の validation scenario が不足している。maxTurns の型検証（number | null のみ許容）、model の空文字列拒否等が未定義

## リスク評価

ManagedAgentRunner 除外のリスクを低と判定する :: Managed Agents API は session 単位での model/maxTurns 変更をサポートしない。config.steps は local runtime のみで効果を持つことは design.md D5 で明文化済み。ただし runtime: "managed" 時に steps 設定がサイレントに無視される旨の warning/doc が spec に不在

## Devil's Advocate

より単純な代替案を検討して却下する :: env var ベース（SPECRUNNER_IMPLEMENTER_MAX_TURNS=100）は config 管理が分散する。CLI flag ベース（--step-config implementer.maxTurns=100）は引数が爆発する。config.json の steps セクションは集中管理可能で適切
