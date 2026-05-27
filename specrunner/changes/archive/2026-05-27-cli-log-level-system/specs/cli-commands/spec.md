## Requirements

### Requirement: CLI ログレベルを 4 段階で制御する

**Replaces**: 「`--verbose` フラグによる詳細ログファイル出力」の CLI フラグ・環境変数部分

`specrunner` CLI は MUST quiet / default / verbose / debug の 4 段階のログレベルをサポートする。

| レベル | 出力内容 | CLI フラグ | 環境変数 |
|---|---|---|---|
| quiet | error のみ | `-q` | `SPECRUNNER_LOG_LEVEL=quiet` |
| default | error + warn + info（進捗表示） | (なし) | (なし) |
| verbose | + debug 相当の詳細情報 + verbose ログファイル | `-v` / `--verbose` | `SPECRUNNER_LOG_LEVEL=verbose` |
| debug | + 全 diagnostic ログ | `-vv` | `SPECRUNNER_LOG_LEVEL=debug` |

レベル解決の優先順位は MUST: CLI フラグ > `SPECRUNNER_LOG_LEVEL` env > `DEBUG` env > default。

`-q` / `-v` / `-vv` フラグは `run` / `job start` / `job resume` コマンドで使用可能とする。`--verbose` は `-v` と同等の互換フラグとして MUST 維持する。

`DEBUG` 環境変数が設定されている場合は `SPECRUNNER_LOG_LEVEL=debug` と同等に MUST 動作する。

#### Scenario: `-q` で quiet レベルが有効になる

- **WHEN** `specrunner run -q <slug>` を実行する
- **THEN** stderr に error メッセージのみが出力され、info / warn / step 進捗は出力されない

#### Scenario: `-v` で verbose レベルが有効になる

- **WHEN** `specrunner run -v <slug>` を実行する
- **THEN** verbose 詳細ログファイルが生成され、従来の `--verbose` と同等に動作する

#### Scenario: `-vv` で debug レベルが有効になる

- **WHEN** `specrunner run -vv <slug>` を実行する
- **THEN** verbose ログファイルが生成され、`SPECRUNNER_DEBUG` で有効化されたサブシステムの diagnostic ログも stderr に出力される

#### Scenario: `SPECRUNNER_LOG_LEVEL=quiet` で環境変数からレベル制御できる

- **WHEN** `SPECRUNNER_LOG_LEVEL=quiet specrunner run <slug>` を実行する
- **THEN** `-q` と同等に error のみが出力される

#### Scenario: `SPECRUNNER_LOG_LEVEL=debug` で環境変数からレベル制御できる

- **WHEN** `SPECRUNNER_LOG_LEVEL=debug specrunner run <slug>` を実行する
- **THEN** `-vv` と同等に debug レベルが有効になる

#### Scenario: CLI フラグが環境変数に優先する

- **WHEN** `SPECRUNNER_LOG_LEVEL=debug specrunner run -q <slug>` を実行する
- **THEN** CLI フラグの `-q` が優先され quiet レベルで動作する

#### Scenario: `DEBUG` 環境変数が debug レベルとして動作する

- **WHEN** `DEBUG=1 specrunner run <slug>` を実行する
- **THEN** `SPECRUNNER_LOG_LEVEL=debug` と同等に debug レベルが有効になる

### Requirement: logWarn は default レベル以上で出力する

`logWarn` は MUST quiet 以外の全レベル（default / verbose / debug）で stderr に出力する。quiet レベルでのみ抑制する。

#### Scenario: フラグなしで logWarn が出力される

- **WHEN** ログレベルが default（フラグ未指定）の状態で `logWarn("...")` が呼ばれる
- **THEN** stderr に `Warning: ...` が出力される

#### Scenario: quiet レベルで logWarn が抑制される

- **WHEN** ログレベルが quiet の状態で `logWarn("...")` が呼ばれる
- **THEN** stderr への出力は発生しない

### Requirement: SPECRUNNER_DEBUG サブシステムフィルタは debug レベル有効時のみ機能する

`SPECRUNNER_DEBUG` のサブシステムフィルタ（`pipeline` 等のカンマ区切り値）は MUST debug レベルが有効な場合のみ機能する。debug レベルが無効の場合、`SPECRUNNER_DEBUG` の値に関わらず diagnostic ログは出力されない。

#### Scenario: debug レベル + SPECRUNNER_DEBUG=pipeline で diagnostic が出力される

- **GIVEN** `SPECRUNNER_LOG_LEVEL=debug` かつ `SPECRUNNER_DEBUG=pipeline` が設定されている
- **WHEN** pipeline が実行される
- **THEN** pipeline 境界の diagnostic ログが stderr に出力される

#### Scenario: debug レベルなし + SPECRUNNER_DEBUG=pipeline で diagnostic が出力されない

- **GIVEN** ログレベルが default で `SPECRUNNER_DEBUG=pipeline` が設定されている
- **WHEN** pipeline が実行される
- **THEN** diagnostic ログは出力されない

#### Scenario: `-vv` + SPECRUNNER_DEBUG=pipeline で diagnostic が出力される

- **GIVEN** `-vv` フラグが指定され `SPECRUNNER_DEBUG=pipeline` が設定されている
- **WHEN** pipeline が実行される
- **THEN** pipeline 境界の diagnostic ログが stderr に出力される
