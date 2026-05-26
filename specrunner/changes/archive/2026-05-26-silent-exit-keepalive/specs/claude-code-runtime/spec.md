# claude-code-runtime Specification (delta)

**Spec Name**: claude-code-runtime
**Modification Type**: MODIFIED
**Delta Date**: 2026-05-26
**Reason**: SDK が LLM に Agent/Task tool を強制告知する問題 (#399) への対策。tool_result が返らず SDK の for await が hang する silent exit を防止

## Requirements

### Requirement: Agent/Task tool の呼び出しを redirect する

SDK が LLM の init tools list に `Task` (= Agent の旧名) を強制告知するため、LLM が Agent tool を呼び出す可能性がある。Host 側は必ず応答 (tool_result) を返さなければならない (MUST)。応答なしによる hang を防止する。

#### Scenario: disallowedTools で Agent/Task を除外する
- **GIVEN** ClaudeCodeRunner が queryOptions を構築する
- **WHEN** query() を呼び出す
- **THEN** queryOptions に `disallowedTools: ["Agent", "Task"]` が含まれる
- **AND** SDK が `disallowedTools` をサポートしない場合は代替手段 (no-op agent handler 登録 or prompt-based) にフォールバックする

#### Scenario: Agent tool 呼び出しに redirect message を返す
- **GIVEN** LLM が Agent または Task tool を呼び出した
- **WHEN** SDK が tool dispatch を試みる
- **THEN** redirect message が tool_result として返される
- **AND** redirect message は教育的 text:「Subagent invocation is not available. Use Read, Grep, Edit, Bash, Write, and Glob tools directly.」相当

#### Scenario: redirect が上限回数を超えたら session を abort する
- **GIVEN** 同一 session 内で Agent/Task redirect が 3 回発火した
- **WHEN** 4 回目の Agent/Task tool 呼び出しが発生する
- **THEN** AbortController.abort() が呼ばれる
- **AND** step は error/timeout 経路で pipeline に戻る
- **AND** pipeline が escalation に倒す

### Requirement: additionalInstructions に Agent tool 使用禁止を明記する

buildAdditionalInstructions() は Agent/Task tool の使用禁止指示を出力に含めなければならない (SHALL)。インフラ制約の補助として prompt レベルでも LLM を誘導する。

#### Scenario: Agent/Task tool 禁止指示が additionalInstructions に含まれる
- **GIVEN** buildAdditionalInstructions() が呼ばれる
- **WHEN** 任意の step で additionalInstructions を構築する
- **THEN** 出力に「Do not use the Agent or Task tool」相当の指示が含まれる
