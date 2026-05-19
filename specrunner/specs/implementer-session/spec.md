# implementer-session Specification

## Purpose
TBD - created by archiving change implementer-verify-buildfix. Update Purpose after archive.
## Requirements

### Requirement: implementer step は spec approved 後にコードを実装し git push まで実行する agent step である

`ImplementerStep` SHALL `Step` interface を満たす agent step として `src/core/step/implementer.ts` に配置される。step.kind は MUST `"agent"`、step.name は MUST `"implementer"`、step.agent.role は MUST `"implementer"`、step.agent.model は SHALL `claude-sonnet-4-5`、step.agent.system は MUST `IMPLEMENTER_SYSTEM_PROMPT`（`src/prompts/implementer-system.ts` から export）、step.agent.tools は MUST `agent_toolset_20260401` を含み、step.agent.capabilities.gitWrite は MUST `true` である。

#### Scenario: ImplementerStep の構造

- **WHEN** `ImplementerStep` を import する
- **THEN** `step.kind === "agent"` かつ `step.name === "implementer"` かつ `step.agent.role === "implementer"` かつ `step.agent.model === "claude-sonnet-4-5"` かつ `step.agent.capabilities.gitWrite === true`
- **AND** `step.agent.system === IMPLEMENTER_SYSTEM_PROMPT`

#### Scenario: agent_toolset_20260401 の包含

- **WHEN** `ImplementerStep.agent.tools` を inspect する
- **THEN** `agent_toolset_20260401` が含まれる

### Requirement: implementer の buildMessage は tasks.md とリンクされた spec を user message に含める

`ImplementerStep.buildMessage(state, deps)` は MUST 以下を含む文字列を返す:

- change folder のパス（`openspec/changes/<slug>/`）
- `tasks.md` のパス（`openspec/changes/<slug>/tasks.md`）
- `specs/` ディレクトリのパス（`openspec/changes/<slug>/specs/`）
- 対象 branch 名（`state.branch`）
- 「checkout 済みの該当 branch で作業し、tasks.md のチェックボックス未完項目を順次実装し、テストを追加し、`git commit && git push` を実行する」旨の指示

ユーザー入力は SHALL `<user-request>...</user-request>` XML タグで囲み、プロンプトインジェクションを構造的に防御する。

#### Scenario: buildMessage の内容

- **GIVEN** `state.slug = "my-change"` かつ `state.branch = "feat/my-change"`
- **WHEN** `ImplementerStep.buildMessage(state, deps)` を呼ぶ
- **THEN** 戻り値の文字列に `openspec/changes/my-change/`、`tasks.md`、`specs/`、`feat/my-change`、`commit`、`push` の各文字列が含まれる
- **AND** `<user-request>` と `</user-request>` の対が含まれる

### Requirement: implementer step は verdict ファイルを生成しない

`ImplementerStep.resultFilePath(state)` は MUST `null` を返す。`ImplementerStep.parseResult(content)` は MUST `NULL_PARSE_RESULT`（= `{ verdict: null, findingsPath: null, fileContent: null }`）を返す（spec-fixer / build-fixer と同じ 3 フィールドパターン、`src/core/step/types.ts` の `NULL_PARSE_RESULT` 共有定数を使用）。session 完了は MUST agent session の `status: "idle"` をもって success と扱われ、`StepExecutor` が `verdict: "success"` を導出する。

#### Scenario: resultFilePath は null

- **WHEN** `ImplementerStep.resultFilePath(state)` を呼ぶ
- **THEN** `null` を返す

#### Scenario: parseResult は NULL_PARSE_RESULT を返す

- **WHEN** `ImplementerStep.parseResult("any content")` を呼ぶ
- **THEN** `{ verdict: null, findingsPath: null, fileContent: null }` を返す（`NULL_PARSE_RESULT` 定数と同値）

#### Scenario: 完了時の verdict は success

- **WHEN** implementer session が `status: "idle"` で正常完了する
- **THEN** `state.steps["implementer"]` 末尾要素の verdict は `"success"` である

### Requirement: implementer system prompt は「実装と push のみ」を明記する

`IMPLEMENTER_SYSTEM_PROMPT` は MUST 以下のキーワードを含む文字列である: 「implementer」「実装」「tasks.md」「spec」「commit」「push」「テスト」または「test」。さらに「レビュー」「verdict 判定」を行わない旨を明示する。

#### Scenario: system prompt 内容

- **WHEN** `IMPLEMENTER_SYSTEM_PROMPT` を inspect する
- **THEN** 文字列に `implementer`、`tasks.md`、`commit`、`push` を含む
- **AND** レビューや verdict 判定を行わない旨を述べる文字列を含む

### Requirement: implementer step は同 branch に commit + push を行い新 branch を作らない

implementer は MUST `state.branch` で取得される既存 branch（propose で `register_branch` 経由で登録済み）に対して `git commit && git push` を実行する。新 branch 作成は SHALL 行わない。CLI 側からの push 検証は MUST 行わず、push 失敗の検知は SHALL 次 step の verification が build/test 失敗で間接検知する（spec-fixer の push 失敗検知委任と同じパターン）。

#### Scenario: branch 名が user message に含まれる

- **GIVEN** `state.branch = "feat/example"`
- **WHEN** `ImplementerStep.buildMessage(state, deps)` を呼ぶ
- **THEN** 戻り値に `feat/example` が含まれる
- **AND** 新 branch 作成の指示は含まれない

#### Scenario: push 失敗は次 verification step が検知

- **WHEN** implementer session が `status: "idle"` で完了したが push が実際には失敗していた
- **THEN** CLI は session 完了を正常扱いとし `state.steps["implementer"]` 末尾要素を `{ verdict: "success", findingsPath: null, fileContent: null }` で記録する
- **AND** 次 step の verification が build/test failed を検出することで間接検知される

### Requirement: implementer step は AgentRegistry の集約対象である

`AgentRegistry.fromSteps([..., ImplementerStep, ...])` は MUST `ImplementerStep.agent` を集約し、`registry.get("implementer")` で取得可能にする。`specrunner init` は MUST `specrunner-implementer` Agent を Anthropic に作成する。

#### Scenario: AgentRegistry に登録される

- **GIVEN** Step 配列に `ImplementerStep` が含まれる
- **WHEN** `AgentRegistry.fromSteps(steps)` を呼ぶ
- **THEN** `registry.get("implementer")` が `ImplementerStep.agent` を返す

#### Scenario: specrunner init が Anthropic に Agent を作成する

- **WHEN** `specrunner init` を実行する
- **THEN** Anthropic 側に `name: "specrunner-implementer"` の Agent が作成される

### Requirement: implementer は test 関数名または comment に TC ID を記載する

implementer system prompt は MUST 「test 関数名または直前の comment に対応 TC ID（例: `TC-001`）を必ず記載する」旨を明示する。TC ID の記載は verification step の test-coverage phase が grep で機械的に検証するため、省略は禁止される。

記載例: `it("TC-070: Agent 定義ハッシュ — 同一定義は同一ハッシュ", ...)`

暗黙的なスキップの禁止: must TC を実装しない場合は既存の `test_cases_skipped` フォーマットで明示的に報告する。TC ID を test code に書かずに暗黙的に省略することは許容しない。

#### Scenario: implementer prompt に TC ID 規律が含まれる

- **WHEN** `IMPLEMENTER_SYSTEM_PROMPT` を inspect する
- **THEN** TC ID を test 関数名 / comment に記載する旨の指示が含まれる
- **AND** `TC-` を含む例示が含まれる

#### Scenario: must TC の暗黙スキップ禁止が明記されている

- **WHEN** `IMPLEMENTER_SYSTEM_PROMPT` を inspect する
- **THEN** TC ID 不記載による暗黙スキップを禁止する旨が含まれる
