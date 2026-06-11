# Spec: init-gitignore-node-modules

## Requirements

### Requirement: ensureDotSpecrunnerGitignore は node_modules/ を保証する

`ensureDotSpecrunnerGitignore` を呼び出すと、`.gitignore` に `node_modules/` 行が存在することを MUST 保証する。既に存在する場合は重複追記しない（idempotent）。

#### Scenario: .gitignore が存在しない repo で init する

**Given** repo root に `.gitignore` が存在しない
**When** `ensureDotSpecrunnerGitignore(repoRoot)` を呼び出す
**Then** 生成された `.gitignore` に `node_modules/` 行が含まれる

#### Scenario: node_modules/ が既載の .gitignore に対して重複追記しない

**Given** `.gitignore` に `node_modules/` 行が既に存在する
**When** `ensureDotSpecrunnerGitignore(repoRoot)` を呼び出す
**Then** `node_modules/` 行の出現数は 1 のまま変化しない

#### Scenario: .specrunner/* エントリの管理動作に影響しない

**Given** TC-GI-01〜TC-GI-12 が規定する任意の初期状態の `.gitignore`
**When** `ensureDotSpecrunnerGitignore(repoRoot)` を呼び出す
**Then** `.specrunner/*` / `!.specrunner/config.json` に関する既存テストの期待値が変わらず満たされる
