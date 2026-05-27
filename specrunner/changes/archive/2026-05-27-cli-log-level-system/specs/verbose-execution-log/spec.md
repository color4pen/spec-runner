## Requirements

### Requirement: verbose ログファイルは verbose レベル以上で有効化される

**Replaces**: 「`--verbose` フラグおよび環境変数による詳細実行ログ出力」

verbose ログファイルの有効化条件は MUST ログレベルが verbose 以上（verbose / debug）であることとする。default / quiet レベルではログファイルを生成してはならない（SHALL NOT）。

CLI フラグと環境変数の判定は `resolveLogLevel()` で 1 箇所に集約しなければならない（MUST）。`resolveVerboseFlag()` は廃止する。

#### Scenario: `-v` で verbose ログファイルが生成される

- **WHEN** `specrunner run -v <slug>` を実行する
- **THEN** `<repo-root>/.specrunner/logs/<jobId>.log` に JSON Lines 形式のログファイルが生成される

#### Scenario: `-vv` でも verbose ログファイルが生成される

- **WHEN** `specrunner run -vv <slug>` を実行する
- **THEN** `<repo-root>/.specrunner/logs/<jobId>.log` に JSON Lines 形式のログファイルが生成される

#### Scenario: フラグなし（default レベル）ではログファイルが生成されない

- **WHEN** `specrunner run <slug>` をフラグなしで実行する
- **THEN** `.specrunner/logs/` にログファイルは生成されない

#### Scenario: `SPECRUNNER_LOG_LEVEL=verbose` でログファイルが有効化される

- **WHEN** `SPECRUNNER_LOG_LEVEL=verbose specrunner run <slug>` を実行する
- **THEN** `-v` と同等にログファイルが生成される
