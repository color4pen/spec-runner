# Spec: `specrunner request review` の `--model` フラグ

## Requirements

### Requirement: request review SHALL accept a `--model` flag that overrides the resolved model

`specrunner request review` コマンドは `--model <model-name>` フラグを受理 MUST する。
このフラグが指定されたとき、システムは config 解決チェーン（`getStepExecutionConfig`）で
決定された最終モデル（`resolvedConfig.model`）よりも `--model` の値を優先 SHALL し、
そのモデルでレビュー agent を実行する。`--model` はモデル識別子の自由文字列として扱い、
列挙制約を課さない。

#### Scenario: `--model` が指定されたとき config の解決結果を上書きする

**Given** `config.steps["request-review"].model` に `claude-sonnet-4-6` が設定されている
**When** ユーザーが `specrunner request review --model claude-opus-4-8[1m] <slug>` を実行する
**Then** レビュー agent は `claude-opus-4-8[1m]` で実行され、config の `claude-sonnet-4-6` は使われない

#### Scenario: `--model` がフラグとして受理され Unknown flag にならない

**Given** `specrunner request review` コマンド
**When** ユーザーが `--model <model-name>` を付けて実行する
**Then** flag parser は `--model` を string フラグとして受理し、`Unknown flag` エラーを発生させない

### Requirement: 未指定時は既存の解決チェーン挙動を維持 SHALL する

`--model` フラグが指定されない場合、システムは既存のモデル解決挙動（config → defaults →
コード定数 `claude-opus-4-5`）を変更なく維持 SHALL する。すなわち `resolvedConfig.model` が
そのまま使われ、いかなる上書きも行われない。

#### Scenario: `--model` 未指定時は config の解決チェーン結果が使われる

**Given** `config.steps["request-review"].model` に `claude-sonnet-4-6` が設定されている
**When** ユーザーが `--model` を付けずに `specrunner request review <slug>` を実行する
**Then** レビュー agent は config 解決チェーンが決めた `claude-sonnet-4-6` で実行される

#### Scenario: config も `--model` も無い場合はコード定数にフォールバックする

**Given** config に request-review 用のモデル設定が存在しない
**When** ユーザーが `--model` を付けずに `specrunner request review <slug>` を実行する
**Then** レビュー agent はコード定数 `claude-opus-4-5`（stepDefaults）で実行される

### Requirement: 空の `--model` 値は未指定として扱う MUST

CLI 境界において、`--model` の値が空文字または空白のみである場合、システムは
それを未指定（オーバーライドなし）として扱う MUST。これにより空のモデル名が SDK に
渡る degenerate ケースを防ぐ。

#### Scenario: 空文字の `--model` はオーバーライドを発生させない

**Given** `specrunner request review` コマンド
**When** ユーザーが `--model ""`（空文字）を指定して実行する
**Then** システムは空値を未指定として正規化し、config 解決チェーンの結果でレビューを実行する
