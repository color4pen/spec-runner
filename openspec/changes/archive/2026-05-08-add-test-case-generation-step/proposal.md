## Why

code-review prompt は `openspec/changes/<slug>/test-cases.md` を参照して Scenario Coverage を評価するが、このファイルを生成するステップが pipeline に存在しない。implementer はテスト対象を自力で判断し、code-review は存在しないファイルを基準に評価しようとしている。spec-review 通過後に test-case-gen ステップを挿入し、design.md / tasks.md からテストシナリオを導出する。

## What Changes

- `src/core/step/test-case-gen.ts`: TestCaseGenStep を定義（AgentStep, Sonnet, completionVerdict: "success"）
- `src/prompts/test-case-gen-system.ts`: system prompt と buildMessage 関数を定義。入力は design.md + tasks.md、出力は test-cases.md（must/should/could の GIVEN/WHEN/THEN 形式）
- `src/core/pipeline/types.ts`: STANDARD_TRANSITIONS を変更（`spec-review:approved → test-case-gen`, `test-case-gen:success → implementer`, `test-case-gen:error → escalate`）
- `src/core/pipeline/run.ts`: createStandardPipeline() に TestCaseGenStep を登録
- テスト: buildMessage, parseResult, 遷移テーブルの検証

## Capabilities

### New Capabilities

- `test-case-gen`: spec-review 通過後にテストシナリオを自動生成するパイプラインステップ

### Modified Capabilities

- `pipeline-orchestrator`: 遷移テーブルに test-case-gen ステップを追加

## Impact

- `src/core/step/test-case-gen.ts`: 新規ファイル
- `src/prompts/test-case-gen-system.ts`: 新規ファイル
- `src/core/pipeline/types.ts`: STANDARD_TRANSITIONS に 2 行追加、1 行変更
- `src/core/pipeline/run.ts`: TestCaseGenStep の import と steps Map への登録
- `tests/test-case-gen-step.test.ts`: 新規テストファイル
