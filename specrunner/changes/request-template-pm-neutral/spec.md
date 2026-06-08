# Spec: request template と prompt の PM / test 配置中立化

## Requirements

### Requirement: request template の受け入れ基準は package manager 非依存とする

`specrunner request template` が生成する scaffold の `## 受け入れ基準` セクションは、package manager 名を含まない wording を使用しなければならない（MUST）。生成される出力は `bun` という文字列を含んではならない（MUST NOT）。

#### Scenario: template 出力に bun が含まれない

**Given** ユーザーが `specrunner request template`（任意の `--type`）を実行する
**When** scaffold template が生成される
**Then** `## 受け入れ基準` に PM 名を含まない受け入れ基準（例: `typecheck && test が green`）が含まれ、出力全体に `bun` という文字列が含まれない

### Requirement: build-fixer prompt は test 配置をプロジェクト既存パターンに委ねる

build-fixer の system prompt は、test-coverage 失敗時に追加する test の配置先を「プロジェクトの既存テストの配置パターンに従う」と指示しなければならない（MUST）。固定ディレクトリパス `tests/` を指定してはならない（MUST NOT）。

#### Scenario: build-fixer prompt に tests/ 固定パスが含まれない

**Given** `BUILD_FIXER_SYSTEM_PROMPT` 文字列
**When** test-coverage 失敗時の test 追加指示を検査する
**Then** 配置先はプロジェクトの既存テスト配置パターンに従う旨が記述され、固定パス `tests/` が含まれない
