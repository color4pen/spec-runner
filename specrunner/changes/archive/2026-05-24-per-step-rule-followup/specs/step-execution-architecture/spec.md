# step-execution-architecture Specification (delta)

## Requirements

### Requirement: StepExecutor は followUpPrompts を AgentRunContext に転記する

`StepExecutor.runAgentStep` SHALL `AgentStep.followUpPrompt` (静的 / getFollowUpPrompt 動的) と project rules ファイルから生成された follow-up prompt 列を結合して `AgentRunContext.followUpPrompts` に転記する。

転記ロジック:
1. 既存の follow-up prompt を解決: `step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt`
2. `resolveStepRules(step.name, cwd, fsAdapter)` で `specrunner/rules/<step-name>/` 配下の rules ファイル中身を取得
3. `buildRulesFollowUpPrompts(ruleContents)` で wrap 付き prompt 列を生成
4. 結合: `[existingFollowUp (あれば), ...rulesPrompts]`
5. `ctx.followUpPrompts = combined` (結果が空配列なら undefined でも可)

`StepExecutor` は `followUpPrompts` の実行を行わない。転記のみを責務とし、N 段実行の制御は adapter に委ねる。

executor / finalizeStep の既存ロジックは無改修とする。`runner.run(ctx)` が内部 N turn でも executor からは 1 回の await で 1 つの `AgentRunResult` を受け取る。

#### Scenario: executor が rules ありで followUpPrompts を構築する

- **GIVEN** `specrunner/rules/design/01-style.md` と `specrunner/rules/design/02-domain.md` が存在する
- **AND** `step.followUpPrompt` が `"rules.md を読み直してください"` である
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompts` は長さ 3 の配列である
- **AND** `ctx.followUpPrompts[0]` は `"rules.md を読み直してください"` である
- **AND** `ctx.followUpPrompts[1]` は `01-style.md` の内容に 3 要素 wrap を付加した string である
- **AND** `ctx.followUpPrompts[2]` は `02-domain.md` の内容に 3 要素 wrap を付加した string である

#### Scenario: executor が rules なしで既存 followUpPrompt のみ転記する

- **GIVEN** `specrunner/rules/design/` ディレクトリが存在しない
- **AND** `step.followUpPrompt` が `"rules.md を読み直してください"` である
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompts` は `["rules.md を読み直してください"]` である

#### Scenario: executor が rules ありで既存 followUpPrompt なしの場合

- **GIVEN** `specrunner/rules/implementer/01-naming.md` が存在する
- **AND** `step.followUpPrompt` が undefined で `step.getFollowUpPrompt` も未定義である
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompts` は長さ 1 の配列であり rules prompt のみ含む

#### Scenario: executor が rules なし + followUpPrompt なしで followUpPrompts を設定しない

- **GIVEN** `specrunner/rules/<step>/` が存在しない
- **AND** `step.followUpPrompt` が undefined である
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompts` は undefined または空配列である

#### Scenario: CLI step 名の rules ディレクトリは無視される

- **GIVEN** `specrunner/rules/verification/01-check.md` が存在する
- **WHEN** `StepExecutor.runCliStep` が実行される
- **THEN** rules ファイルは読み込まれない
- **AND** follow-up turn は発生しない

### Requirement: rules ファイル列挙は rules-resolve モジュールで行う

`src/core/step/rules-resolve.ts` SHALL `resolveStepRules(stepName, cwd, fs)` 関数を export する。この関数は `specrunner/rules/<stepName>/` 配下の `.md` ファイルを数字 prefix 昇順で列挙し、各ファイルの中身を `string[]` で返す。

`RulesResolveFs` interface を injectable dependency として受け取り、テスト時の mock を可能にする。ディレクトリ不存在時は空配列を返す。

#### Scenario: rules ファイルが数字 prefix 昇順で返される

- **GIVEN** `specrunner/rules/design/` に `02-domain.md`, `01-style.md`, `10-review.md` が存在する
- **WHEN** `resolveStepRules("design", cwd, fs)` を呼ぶ
- **THEN** 返り値は `[content_of_01, content_of_02, content_of_10]` の順である

#### Scenario: rules ディレクトリが存在しない場合は空配列

- **GIVEN** `specrunner/rules/implementer/` ディレクトリが存在しない
- **WHEN** `resolveStepRules("implementer", cwd, fs)` を呼ぶ
- **THEN** 返り値は `[]` である

#### Scenario: .md 以外のファイルは無視される

- **GIVEN** `specrunner/rules/design/` に `01-style.md` と `notes.txt` が存在する
- **WHEN** `resolveStepRules("design", cwd, fs)` を呼ぶ
- **THEN** 返り値は `[content_of_01-style.md]` のみである

### Requirement: rules follow-up prompt は 3 要素 wrap で構成される

`src/core/step/rules-followup-prompts.ts` SHALL `buildRulesFollowUpPrompts(ruleContents)` 関数を export する。各 rule content を以下の 3 要素 wrap で囲んだ prompt string を生成する:

- (a) 修正範囲: この規約に関連するファイルのみ修正
- (b) stop 条件: 違反がなければ変更せず end_turn
- (c) 意図解釈: 書かれた言葉そのままではなく意図を汲んで判断

3 要素以外の wrap を CLI が追加することは禁止。wrap 文言の拡張には新 ADR が MUST 必要。

#### Scenario: 各 follow-up prompt に 3 要素 wrap が含まれる

- **GIVEN** rule content `"変数名は camelCase を使うこと"` を含む配列
- **WHEN** `buildRulesFollowUpPrompts(["変数名は camelCase を使うこと"])` を呼ぶ
- **THEN** 出力の prompt string に `修正範囲` / `stop 条件` / `意図解釈` の 3 要素が含まれる
- **AND** rule content が `<rule>` タグで囲まれている
- **AND** 3 要素以外の CLI 由来 wrap 文言が含まれない

#### Scenario: 空配列入力で空配列出力

- **WHEN** `buildRulesFollowUpPrompts([])` を呼ぶ
- **THEN** 返り値は `[]` である

## Removed

- "StepExecutor は followUpPrompt を AgentRunContext に転記する"
