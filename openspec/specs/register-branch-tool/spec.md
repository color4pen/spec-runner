## Purpose

Custom Tool definition allowing the propose agent to report the branch it created back to specrunner.

## Requirements
### Requirement: `register_branch` Custom Tool は固定スキーマで定義される

`register_branch` ツールは MUST type `custom` で、SHALL 以下の固定スキーマで定義される:

- name: `register_branch`
- description: 3 文以上の詳細記述（何をするか / いつ使うか / 入力 branch の意味と命名規約 / 冪等性が last-write-wins である旨）
- input_schema:
  - type: `object`
  - properties.branch: `{ type: "string", description: "openspec slug を含むブランチ名（例: feat/2026-04-27-cli-core-pipeline）" }`
  - required: `["branch"]`

#### Scenario: definition が安定している

- **WHEN** Agent 作成時に `custom_tools` に渡される `register_branch` definition を JSON-stringify する
- **THEN** name, description, input_schema が決定論的に生成される（環境変数や時刻に依存しない）

### Requirement: ハンドラは last-write-wins で冪等に動作する

`register_branch` のハンドラは MUST 同一 session 内で複数回呼ばれた場合、毎回 state.branch を入力値で上書きする。Agent には SHALL 常に `{ ok: true, branch: <input> }` を返す。

#### Scenario: 1 回呼び出し

- **WHEN** ハンドラが `{ branch: "feat/x" }` で呼ばれる
- **THEN** state.branch が `feat/x` になり、戻り値が `{ ok: true, branch: "feat/x" }` になる

#### Scenario: 連続 2 回呼び出し

- **WHEN** ハンドラが `{ branch: "a" }` → `{ branch: "b" }` で連続呼び出しされる
- **THEN** 最終 state.branch が `b` になり、両回ともエラーは発生しない

### Requirement: definition と handler は同一モジュールに colocate される

`register_branch` の definition と handler は MUST 単一の TypeScript モジュールから `defineCustomTool({ definition, handler })` 経由で `{ definition, handler }` を含む単一オブジェクトとして export される。Agent 作成時の `custom_tools` 配列および SSE dispatch table は SHALL 同じ tool registry から導出される。

#### Scenario: 単一 source-of-truth

- **WHEN** Agent 作成時の custom_tools 配列を生成する
- **THEN** `tool-registry.getDefinitions()` を呼び出し、その配列を渡す（手動で definition オブジェクトを別箇所に書かない）

#### Scenario: SSE dispatch も同じ registry から取得する

- **WHEN** SSE で `agent.custom_tool_use` イベントを受信する
- **THEN** `tool-registry.getHandler(event.name)` を呼び出してハンドラを解決する

### Requirement: 不正な入力は明確なエラーで拒否する

`register_branch` の handler は MUST 入力検証を行い、`branch` が空文字列または string 以外の場合は SHALL Agent に `{ ok: false, error: "branch must be a non-empty string" }` を返す。

#### Scenario: 空文字列入力

- **WHEN** ハンドラが `{ branch: "" }` で呼ばれる
- **THEN** state.branch は変更されず、戻り値が `{ ok: false, error: "branch must be a non-empty string" }` になる

#### Scenario: 必須プロパティ欠落

- **WHEN** ハンドラが `{}` で呼ばれる
- **THEN** state.branch は変更されず、戻り値が `{ ok: false, error: "branch must be a non-empty string" }` になる

### Requirement: ハンドラ応答は user.custom_tool_result イベントで送信される

ハンドラが応答を生成したら、CLI は MUST `events.send` で `type: "user.custom_tool_result"` のイベントを送信する。`custom_tool_use_id` は SHALL SSE で受信した `agent.custom_tool_use` イベントの id と完全一致する。

#### Scenario: id の対応

- **WHEN** SSE で受信した custom_tool_use イベントの id が `ctu_abc123`
- **THEN** 送信する custom_tool_result イベントの custom_tool_use_id は `ctu_abc123` であり、handler の戻り値が JSON 文字列として content に含まれる
