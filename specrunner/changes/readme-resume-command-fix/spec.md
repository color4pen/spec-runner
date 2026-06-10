# Spec: readme-resume-command-fix

## Requirements

### Requirement: README は resume コマンドを `specrunner job resume` としてのみ参照しなければならない

README.md は中断ジョブの再開コマンドを、CLI の実コマンドである `specrunner job resume`
（`src/cli/command-registry.ts` の `USAGE` / `COMMANDS.job.subcommands["resume"]` が正）として
のみ参照しなければならない（MUST）。存在しない top-level 表記 `specrunner resume`（直後に `job` を
伴わないもの）を本文に含んではならない（MUST NOT）。状態名 `awaiting-resume` および別コマンド
`specrunner run` はこの制約の対象外である。

#### Scenario: 修正後の README は bare な resume コマンド表記を含まない

**Given** README.md の Troubleshooting「Silent exit」節が `specrunner job resume` を参照している
**When** drift-guard テストが README.md 本文から bare な `specrunner resume`（直後に `job` を伴わない）表記を探索する
**Then** 一致は 0 件であり、テストは pass する

#### Scenario: 誤った top-level resume 表記が再混入すると検知される

**Given** README.md のどこかに bare な `specrunner resume` 表記が（再び）書き込まれる
**When** drift-guard テストが実行される
**Then** テストは fail し、誤記の再混入を検知する
