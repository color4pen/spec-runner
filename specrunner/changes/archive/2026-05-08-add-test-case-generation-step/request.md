# spec-review 通過後に test-cases.md を生成するステップを追加する

## Meta

- **type**: new-feature
- **slug**: add-test-case-generation-step

## 背景

openspec-workflow では spec-review 通過後に test-case-generator agent が design.md と tasks.md からテストシナリオを導出し、test-cases.md を生成している。implementer はこれを見て何をテストすべきか把握し、code-review は must シナリオの実装率（Scenario Coverage）を評価する。

spec-runner の code-review prompt（`src/prompts/code-review-system.ts:38`）は既に `test-cases.md` を参照しているが、これを生成するステップが存在しない。implementer は何をテストすべきか自力で判断しており、code-review は存在しないファイルを基準に評価しようとしている。

## 要件

### 1. TestCaseGenStep の定義

1. `src/core/step/test-case-gen.ts` に AgentStep を定義する
   - model: Sonnet（テストケース導出は設計の読解であり、Opus は過剰）
   - maxTurns: 15
   - completionVerdict: "success"（result file による verdict 判定なし、完走 = 成功）
   - resultFilePath: `openspec/changes/<slug>/test-cases.md`
   - parseResult: ファイルの存在確認のみ。内容の verdict パースは不要
   - capabilities: `{ gitWrite: true }`（生成した test-cases.md を commit/push する）

### 2. system prompt

2. `src/prompts/test-case-gen-system.ts` に system prompt を定義する
   - 入力: `openspec/changes/<slug>/design.md` と `openspec/changes/<slug>/tasks.md`
   - 出力: `openspec/changes/<slug>/test-cases.md`
   - フォーマット: must / should / could の優先度付きシナリオ。各シナリオは GIVEN/WHEN/THEN 形式
   - must シナリオ: tasks.md の各タスクの受け入れ基準に対応するもの
   - should シナリオ: エッジケース、エラーパス
   - could シナリオ: パフォーマンス、非機能要件
   - 制約: テストコードは書かない。テスト観点のみ

### 3. 遷移テーブルの変更

3. `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` を変更する

   変更前:
   ```
   spec-review:approved → implementer
   ```
   変更後:
   ```
   spec-review:approved → test-case-gen
   test-case-gen:success → implementer
   test-case-gen:error   → escalate
   ```

### 4. Pipeline への登録

4. `src/core/pipeline/run.ts` の `createStandardPipeline()` に TestCaseGenStep を登録する

### 5. buildMessage

5. buildMessage で slug, branch, request.md の内容を渡す。dynamicContext は不要（設計ドキュメントのみ参照するため）

### 6. テスト

6. TestCaseGenStep の buildMessage が正しいメッセージを組み立てること
7. 遷移テーブルが `spec-review:approved → test-case-gen → implementer` の経路を持つこと
8. parseResult がファイル内容を受け取って success verdict を返すこと

## スコープ外

- test-cases.md の品質レビュー（独立したレビューループは入れない。品質が低ければ code-review で検出される）
- spec-fixer による test-cases.md の修正（spec-fixer は spec のみ扱う）
- test-case-gen の fixer ループ（完走 = 成功。失敗は escalation）

## 受け入れ基準

- [ ] `spec-review:approved` 後に test-case-gen ステップが実行される
- [ ] test-cases.md が `openspec/changes/<slug>/` に生成される
- [ ] test-case-gen 完了後に implementer が実行される
- [ ] test-case-gen でエラーが発生した場合 escalation になる
- [ ] `bun run typecheck && bun run test` が green


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/add-test-case-generation-step.md` by `merged-to-archive-consolidation`.
