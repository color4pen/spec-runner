# build-fixer-session Specification

## Purpose
TBD - created by archiving change implementer-verify-buildfix. Update Purpose after archive.
## Requirements
### Requirement: build-fixer step は verification 失敗時に mechanical な修正のみを行う agent step である

`BuildFixerStep` SHALL `Step` interface を満たす agent step として `src/core/step/build-fixer.ts` に配置される。step.kind は MUST `"agent"`、step.name は MUST `"build-fixer"`、step.agent.role は MUST `"build-fixer"`、step.agent.model は SHALL `claude-sonnet-4-5`、step.agent.system は MUST `BUILD_FIXER_SYSTEM_PROMPT`（`src/prompts/build-fixer-system.ts` から export）、step.agent.tools は MUST `agent_toolset_20260401` を含み、step.agent.capabilities.gitWrite は MUST `true` である。

#### Scenario: BuildFixerStep の構造

- **WHEN** `BuildFixerStep` を import する
- **THEN** `step.kind === "agent"` かつ `step.name === "build-fixer"` かつ `step.agent.role === "build-fixer"` かつ `step.agent.model === "claude-sonnet-4-5"` かつ `step.agent.capabilities.gitWrite === true`
- **AND** `step.agent.system === BUILD_FIXER_SYSTEM_PROMPT`

### Requirement: build-fixer の buildMessage は直前の verification-result.md を入力に取る

`BuildFixerStep.buildMessage(state, deps)` は MUST 直前の verification step の `findingsPath`（= `openspec/changes/<slug>/verification-result.md`）を `getLatestStepResult(state, "verification")` で取得し、user message 本文に以下を含める:

- change folder のパス（`openspec/changes/<slug>/`）
- `verification-result.md` のパス
- 対象 branch 名（`state.branch`）
- 「failed phase の error log を読んで mechanical な build/test/lint/typecheck エラー修正を行い、`git commit && git push` を実行する」旨の指示
- 「仕様変更や設計判断は行わない」旨の禁止条項

ユーザー入力は SHALL `<user-request>...</user-request>` XML タグで囲む。

`findingsPath` が null または verification StepResult が存在しない場合、SHALL state.status を `failed`、error を以下の shape に設定して終了する:

```
{
  code: "BUILD_FIXER_NO_VERIFICATION_RESULT",
  message: "build-fixer requires verification result but none found",
  hint: "Ensure verification step produced openspec/changes/<slug>/verification-result.md before invoking build-fixer."
}
```

この error shape は `SPEC_REVIEW_RETRIES_EXHAUSTED` / `VERIFICATION_RETRIES_EXHAUSTED` と同じ `{ code, message, hint }` 構造に準拠する。

#### Scenario: buildMessage の内容

- **GIVEN** `state.slug = "my-change"` かつ `state.branch = "feat/my-change"` かつ verification の findingsPath が `openspec/changes/my-change/verification-result.md`
- **WHEN** `BuildFixerStep.buildMessage(state, deps)` を呼ぶ
- **THEN** 戻り値に `openspec/changes/my-change/`、`verification-result.md`、`feat/my-change`、`commit`、`push` の各文字列を含む
- **AND** 「仕様変更」または「設計判断」を行わない旨の禁止条項を含む
- **AND** `<user-request>` と `</user-request>` の対を含む

#### Scenario: verification 結果不在

- **WHEN** state.steps["verification"] が空、または末尾要素の findingsPath が null
- **THEN** state.status が `failed`、state.error が `{ code: "BUILD_FIXER_NO_VERIFICATION_RESULT", message: "build-fixer requires verification result but none found", hint: "Ensure verification step produced openspec/changes/<slug>/verification-result.md before invoking build-fixer." }` になる

### Requirement: build-fixer step は verdict ファイルを生成しない

`BuildFixerStep.resultFilePath(state)` は MUST `null` を返す。`BuildFixerStep.parseResult(content)` は MUST `NULL_PARSE_RESULT`（= `{ verdict: null, findingsPath: null, fileContent: null }`）を返す（spec-fixer / implementer と同じ 3 フィールドパターン、`src/core/step/types.ts` の `NULL_PARSE_RESULT` 共有定数を使用）。session 完了は MUST `status: "idle"` をもって success と扱われ、`StepExecutor` が `verdict: "success"` を導出する。

#### Scenario: resultFilePath は null

- **WHEN** `BuildFixerStep.resultFilePath(state)` を呼ぶ
- **THEN** `null` を返す

#### Scenario: parseResult は NULL_PARSE_RESULT を返す

- **WHEN** `BuildFixerStep.parseResult("any content")` を呼ぶ
- **THEN** `{ verdict: null, findingsPath: null, fileContent: null }` を返す（`NULL_PARSE_RESULT` 定数と同値）

#### Scenario: 完了時の verdict は success

- **WHEN** build-fixer session が `status: "idle"` で正常完了する
- **THEN** `state.steps["build-fixer"]` 末尾要素の verdict は `"success"` である

### Requirement: build-fixer system prompt は「mechanical 修正のみ」を明記する

`BUILD_FIXER_SYSTEM_PROMPT` は MUST 以下のキーワードを含む文字列である: 「build-fixer」「mechanical」または「機械的」、「修正」、「仕様変更」「禁止」または「行わない」、「commit」、「push」、「verification-result」または「failed phase」。

#### Scenario: system prompt 内容

- **WHEN** `BUILD_FIXER_SYSTEM_PROMPT` を inspect する
- **THEN** 文字列に `build-fixer`、`修正`、`commit`、`push` を含む
- **AND** 仕様変更や設計判断を行わない旨を述べる文字列を含む

### Requirement: build-fixer step は同 branch に commit + push を行い新 branch を作らない

build-fixer は MUST `state.branch` で取得される既存 branch に対して `git commit && git push` を実行する。新 branch 作成は SHALL 行わない。CLI 側からの push 検証は MUST 行わず、push 失敗の検知は SHALL 次 step の verification が build/test 失敗を再検出することで間接検知する（spec-fixer / implementer と同じ委任パターン）。

#### Scenario: push 失敗は次 verification step が検知

- **WHEN** build-fixer session が `status: "idle"` で完了したが push が実際には失敗していた
- **THEN** CLI は session 完了を正常扱いとし `state.steps["build-fixer"]` 末尾要素を `{ verdict: "success", findingsPath: null, fileContent: null }` で記録する
- **AND** 次 step の verification が再度 failed を検出することで間接検知される

### Requirement: build-fixer step は AgentRegistry の集約対象である

`AgentRegistry.fromSteps([..., BuildFixerStep, ...])` は MUST `BuildFixerStep.agent` を集約し、`registry.get("build-fixer")` で取得可能にする。`specrunner init` は MUST `specrunner-build-fixer` Agent を Anthropic に作成する。

#### Scenario: AgentRegistry に登録される

- **GIVEN** Step 配列に `BuildFixerStep` が含まれる
- **WHEN** `AgentRegistry.fromSteps(steps)` を呼ぶ
- **THEN** `registry.get("build-fixer")` が `BuildFixerStep.agent` を返す

#### Scenario: specrunner init が Anthropic に Agent を作成する

- **WHEN** `specrunner init` を実行する
- **THEN** Anthropic 側に `name: "specrunner-build-fixer"` の Agent が作成される

