# Delta Spec: cli-resume-command

## Requirements

### Requirement: `--prompt` / `--prompt-file` 指定時に prompt injection 警告を表示する

`--prompt` または `--prompt-file` が指定された場合、`stderrWrite()` で警告メッセージを stderr に表示する MUST。

#### Scenario: --prompt 指定時に警告が表示される

- **WHEN** `specrunner job resume <slug> --prompt "任意のテキスト"` を実行する
- **THEN** stderr に「--prompt の内容は agent prompt に直接注入」を含む警告メッセージが表示される
- **AND** resume 処理は警告後も正常に続行する

#### Scenario: --prompt-file 指定時に警告が表示される

- **GIVEN** `./notes.md` が存在する
- **WHEN** `specrunner job resume <slug> --prompt-file ./notes.md` を実行する
- **THEN** stderr に「--prompt の内容は agent prompt に直接注入」を含む警告メッセージが表示される

#### Scenario: --quiet モードでも警告が表示される

- **WHEN** `specrunner job resume <slug> --prompt "text" --quiet` を実行する
- **THEN** stderr に警告メッセージが表示される（`stderrWrite()` は log level に依存しないため）

#### Scenario: --prompt 未指定時は警告なし

- **WHEN** `specrunner job resume <slug>` を `--prompt` / `--prompt-file` なしで実行する
- **THEN** stderr に prompt injection 警告は表示されない
