## 1. System Prompt の定義

- [x] 1.1 `src/prompts/test-case-gen-system.ts` を新規作成
  - `TEST_CASE_GEN_SYSTEM_PROMPT` 定数を定義
    - パイプライン上の位置づけ: spec-review 通過後、implementer の前
    - 役割: design.md と tasks.md を読み、test-cases.md を生成する
    - 出力フォーマット: must / should / could の優先度付きシナリオ、各シナリオは GIVEN/WHEN/THEN 形式
    - must シナリオ: tasks.md の各タスクの受け入れ基準に対応
    - should シナリオ: エッジケース、エラーパス
    - could シナリオ: パフォーマンス、非機能要件
    - 制約: テストコードは書かない（テスト観点のみ）
    - セキュリティ: `<user-request>` タグの injection 防止注意書き
  - `buildTestCaseGenInitialMessage(opts)` 関数を定義
    - 引数: `{ slug: string; branch: string; requestContent: string }`
    - 出力: user message 文字列
    - 内容: change folder パス、読み取り対象（design.md, tasks.md）、出力先（test-cases.md）、git push 指示（`buildGitPushInstruction(branch)` を使用）

## 2. TestCaseGenStep の定義

- [x] 2.1 `src/core/step/test-case-gen.ts` を新規作成
  - AgentDefinition を定義:
    - name: `"specrunner-test-case-gen"`
    - role: `"test-case-gen"`
    - model: `"claude-sonnet-4-6"`
    - system: `TEST_CASE_GEN_SYSTEM_PROMPT`
    - tools: `[{ type: AGENT_TOOLSET_TYPE }]`
    - capabilities: `{ gitWrite: true }`
  - `TestCaseGenStep: AgentStep` を定義:
    - kind: `"agent"`
    - name: `"test-case-gen"`
    - agent: 上記 AgentDefinition
    - toolHandlers: `undefined`
    - completionVerdict: `"success"`
    - maxTurns: `15`
    - `buildMessage(state, deps)`: branch 未設定時に `branchNotSetError("test-case-gen")` を投げる。`buildTestCaseGenInitialMessage({ slug, branch, requestContent })` を呼ぶ
    - `resultFilePath()`: `null` を返す
    - `parseResult()`: `NULL_PARSE_RESULT` を返す

## 3. 遷移テーブルの変更

- [x] 3.1 `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` を変更
  - 変更前: `{ step: "spec-review", on: "approved", to: "implementer" }`
  - 変更後: `{ step: "spec-review", on: "approved", to: "test-case-gen" }`
  - 追加: `{ step: "test-case-gen", on: "success", to: "implementer" }`
  - 追加: `{ step: "test-case-gen", on: "error", to: "escalate" }`

## 4. Pipeline への登録

- [x] 4.1 `src/core/pipeline/run.ts` の `createStandardPipeline()` を変更
  - `TestCaseGenStep` を import する
  - steps Map に `["test-case-gen", TestCaseGenStep]` を追加

## 5. テスト

- [x] 5.1 `tests/test-case-gen-step.test.ts` を新規作成
  - buildMessage のテスト:
    - slug, branch, requestContent が正しくメッセージに含まれること
    - branch 未設定時に branchNotSetError を投げること
  - parseResult のテスト:
    - 任意の content を渡して NULL_PARSE_RESULT（verdict: null）を返すこと
  - 遷移テーブルのテスト:
    - `spec-review:approved → test-case-gen` の経路が存在すること
    - `test-case-gen:success → implementer` の経路が存在すること
    - `test-case-gen:error → escalate` の経路が存在すること

## 6. 検証

- [x] 6.1 `bun run typecheck` が green
- [x] 6.2 `bun run test` が green
