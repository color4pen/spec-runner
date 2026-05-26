# Delta Spec: resume-prompt-injection

**Target**: `specrunner/specs/cli-resume-command/spec.md`
**Action**: add

## Requirements

### Requirement: `--prompt` オプションで resume 時に inline テキストを agent に注入できる

`specrunner job resume <slug> --prompt <text>` で、最初の agent ステップの prompt に追加テキストを注入する MUST。

#### Scenario: inline prompt 注入

- **GIVEN** job が `awaiting-resume` 状態である
- **WHEN** `specrunner job resume <slug> --prompt "手動で foo.ts を修正済み"` を実行する
- **THEN** 最初の agent ステップの prompt に `<resume-context>` セクションとして注入テキストが含まれる
- **AND** 後続の agent ステップには注入テキストが含まれない

### Requirement: `--prompt-file` オプションで resume 時にファイル内容を agent に注入できる

`specrunner job resume <slug> --prompt-file <path>` で、指定ファイルの内容を最初の agent ステップの prompt に注入する MUST。

#### Scenario: ファイルから prompt 注入

- **GIVEN** job が `awaiting-resume` 状態である
- **AND** `./fix-notes.md` が存在し内容がある
- **WHEN** `specrunner job resume <slug> --prompt-file ./fix-notes.md` を実行する
- **THEN** ファイル内容が最初の agent ステップの prompt に `<resume-context>` セクションとして注入される

#### Scenario: 存在しないファイルを指定

- **WHEN** `specrunner job resume <slug> --prompt-file ./nonexistent.md` を実行する
- **THEN** stderr にエラーメッセージを出力し exit code 1 で終了する

### Requirement: `--prompt` と `--prompt-file` の同時指定はエラーとする

両オプションを同時に指定した場合は MUST エラーを返す。

#### Scenario: 排他エラー

- **WHEN** `specrunner job resume <slug> --prompt "text" --prompt-file ./file.md` を実行する
- **THEN** stderr に `--prompt and --prompt-file are mutually exclusive.` を出力し exit code 2 で終了する

### Requirement: prompt オプション未指定時は既存動作と同一

`--prompt` / `--prompt-file` のいずれも指定しない場合、resume の動作は MUST 現行と完全に同一である。

#### Scenario: オプションなしの後方互換

- **WHEN** `specrunner job resume <slug>` を `--prompt` / `--prompt-file` なしで実行する
- **THEN** agent に `<resume-context>` セクションが含まれない
- **AND** 既存の全挙動（step 解決、safety check、state 遷移等）が変わらない
