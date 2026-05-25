# cli-finish-command Specification (delta)

## Requirements

### Requirement: Phase 1 で usage.json を derive

finish Phase 1 SHALL derive pipeline step token usage from the job state file and append entries to `specrunner/changes/<slug>/usage.json` before archiving the change folder.

#### Scenario: pipeline 完走後の finish で usage entries が追加される

- WHEN `specrunner job finish <slug>` を実行する
- AND job state に pipeline step の `modelUsage` 記録がある
- THEN `specrunner/changes/<slug>/usage.json` の `commandInvocations` に各 step の entry が append される
- AND 各 entry の `command` は `"job"` である
- AND 各 entry に `jobId`, `stepName`, `timestamp`, `modelUsage` が含まれる
- AND derive 後に `git add` で staging される
- AND その後の `archiveChangeFolder` で `usage.json` が archive に含まれる

#### Scenario: draft 段階の entries が保持される

- WHEN `specrunner job finish <slug>` を実行する
- AND `specrunner/changes/<slug>/usage.json` に既に draft 段階の entries (request-review 等) が存在する
- THEN 既存 entries が保持されたまま pipeline entries が append される

#### Scenario: change folder が存在しない場合

- WHEN `specrunner job finish <slug>` を実行する
- AND `specrunner/changes/<slug>/` が存在しない (PR 既 merge で archive 済み等)
- THEN usage derivation は skip される
- AND finish は通常通り続行する

#### Scenario: state に modelUsage がない step

- WHEN `specrunner job finish <slug>` を実行する
- AND job state の一部 step で `modelUsage` が undefined (managed runtime 等)
- THEN その step の entry は `modelUsage: null` として記録される
- AND `stepName`, `timestamp`, `jobId` は記録される

#### Scenario: derive 失敗時に finish が中断されない

- WHEN `specrunner job finish <slug>` を実行する
- AND usage.json の derive / 書き込みが何らかの理由で失敗する
- THEN warning ログが出力される
- AND finish の残りのフェーズ (archive, push, merge) は通常通り続行する
