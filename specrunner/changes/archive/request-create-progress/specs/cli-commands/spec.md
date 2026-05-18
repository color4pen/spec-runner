## ADDED Requirements

### Requirement: `specrunner request create` / `specrunner request review` は LLM 呼び出しの進捗を stderr に出力する

`specrunner request create` と `specrunner request review` は MUST LLM query() 呼び出しの開始時と完了時に stderr へ進捗メッセージを出力する。

#### 進捗メッセージ仕様

| コマンド | タイミング | メッセージ |
|----------|-----------|-----------|
| `request create` | query() 呼び出し直前 | `Generating request.md...` |
| `request create` | 成功時 | `✓ Generated <slug>` |
| `request create` | 失敗時 | `✗ Failed: <error message>` |
| `request review` | query() 呼び出し直前 | `Reviewing request.md...` |
| `request review` | 成功時 | `✓ Reviewed` |
| `request review` | 失敗時 | `✗ Failed: <error message>` |

進捗メッセージは SHALL stderr に出力する（stdout は構造化結果のために予約）。

#### Scenario: request create の開始メッセージ

- **WHEN** ユーザーが `specrunner request create "..."` を実行する
- **THEN** LLM 呼び出し前に `Generating request.md...` が stderr に出力される

#### Scenario: request create の成功メッセージ

- **WHEN** `specrunner request create` が正常に完了する
- **THEN** `✓ Generated <slug>` が stderr に出力され、slug が stdout に出力される

#### Scenario: request create の失敗メッセージ

- **WHEN** `specrunner request create` の LLM 呼び出しが失敗する
- **THEN** `✗ Failed: <error message>` が stderr に出力される（既存の `Error:` / `Hint:` 出力に先行）

#### Scenario: request review の開始メッセージ

- **WHEN** ユーザーが `specrunner request review <file>` を実行する
- **THEN** LLM 呼び出し前に `Reviewing request.md...` が stderr に出力される

#### Scenario: request review の成功メッセージ

- **WHEN** `specrunner request review` が正常に完了する
- **THEN** `✓ Reviewed` が stderr に出力される（その後に verdict 等の通常出力が続く）

#### Scenario: request review の失敗メッセージ

- **WHEN** `specrunner request review` の LLM 呼び出しが失敗する
- **THEN** `✗ Failed: <error message>` が stderr に出力される
