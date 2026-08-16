# Test Cases: auth/setup UX

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 24 cases
- **Automated** (unit/integration/gate): 24
- **Manual**: 0
- **Priority**: must: 21, should: 3, could: 0

---

## login の GitHub 専用化と --provider 廃止

### TC-001: --provider は login の flag surface に存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL be GitHub-only and reject the removed `--provider` flag > Scenario: --provider is absent from login help surface

### TC-002: legacy `login --provider claude` が migration 捕捉されて非 0 終了する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL be GitHub-only and reject the removed `--provider` flag > Scenario: legacy `login --provider claude` is captured with migration guidance

---

## login の有効性ベース Device Flow 判定

### TC-003: 最優先 token が valid なら Device Flow をスキップし exit 0

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: valid top-priority token skips the Device Flow

### TC-004: invalid token かつ出所が env/gh なら Device Flow へ進まず非 0 終了

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: invalid token from an env/gh source fails without a Device Flow

### TC-005: invalid token かつ出所が credentials.json なら Device Flow へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: invalid token from credentials.json proceeds to the Device Flow

### TC-006: token が 1 つも解決できない場合 Device Flow へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: no resolvable token proceeds to the Device Flow

### TC-007: 有効性確認が到達不能の場合 Device Flow へ進まず非 0 終了

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: validity cannot be confirmed does not overwrite silently

### TC-008: --force 指定時は常に Device Flow が実行される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: --force always runs the Device Flow

---

## credentials set サブコマンド

### TC-009: `credentials set claude-code` が credentials.json (0600) へ token を保存する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input > Scenario: credentials set claude-code stores the Claude Code token

### TC-010: `credentials set anthropic-api-key` が credentials.json (0600) へ API key を保存する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input > Scenario: credentials set anthropic-api-key stores the API key

### TC-011: secret が output stream に書かれない（TTY silent / 非 TTY stdin）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input > Scenario: secret input is not echoed

### TC-012: 既存 credential を持つ credentials.json に保存しても他 key が保持される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input > Scenario: storing one secret preserves other stored credentials

---

## dead guidance の全廃

### TC-013: `src/` に `login --provider anthropic` の文字列が存在しない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: guidance MUST reference only real, current commands > Scenario: no dead `login --provider anthropic` guidance remains

`tests/` に `collectTsFiles` 型の grep テストを追加し、`src/` 配下の全 .ts ファイルに文字列 `login --provider anthropic` が含まれないことを機械検証する。

### TC-014: doctor hint 中の `specrunner <verb>` がすべて registry 登録済みコマンド

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guidance MUST reference only real, current commands > Scenario: doctor hints reference registered commands only

---

## doctor の warn / readiness

### TC-015: headless Claude credential 未設定が warn かつ cron/inbox 限定の注記を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL treat headless Claude credential absence as a warning, not a failure > Scenario: unset headless Claude credential is a warn with a scoped note

### TC-016: fail == 0 の doctor 出力が `Ready to run.` と `specrunner request new` を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor readiness SHALL be determined by fail == 0 > Scenario: warnings remain but no failures shows Ready plus next step

### TC-017: fail > 0 の doctor 出力が `Ready to run.` を含まない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor readiness SHALL be determined by fail == 0 > Scenario: a failing check suppresses Ready

---

## init の provider flag 無言無視の解消

### TC-018: 既存 global config + provider flag 指定の init が案内を出力し config は不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: init MUST NOT silently ignore the provider flag when a global config exists > Scenario: provider flag under an existing global config emits a notice

---

## README Quick Start の doctor 中心化

### TC-019: README Quick Start が doctor を参照し login を無条件ステップとして提示しない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: README Quick Start SHALL present a doctor-centered setup flow > Scenario: Quick Start centers on doctor

README.md を読み取り、`## Quick Start` 節に `specrunner doctor` が含まれること、および `specrunner login` が無条件の必須手順として提示されていないことをファイル読み取りテストで検証する。

---

## 非 Scenario 由来 TC

### TC-020: parseFlags が deprecated flag に遭遇した時点で FlagParseError を throw する

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-01

**GIVEN** `FlagDef` に `deprecated: { message: "... credentials set claude-code ..." }` を持つ `provider` flag が定義されている
**WHEN** `parseFlags(["--provider", "claude"], flagDefs)` を呼び出す
**THEN** `FlagParseError` が throw され、message に `credentials set claude-code` が含まれる

### TC-021: `src/` に `login --provider claude` の文字列が存在しない

**Category**: gate
**Priority**: must
**Source**: design.md D6 / tasks.md T-10

TC-013 の grep テストと同一ファイル内（または別 it ブロック）で、`src/` 配下の全 .ts ファイルに文字列 `login --provider claude` が含まれないことを機械検証する（dead guidance の claude 側再発防止）。

### TC-022: `credentials set <unknown>` が非 0 で終了する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03

**GIVEN** `credentials set` に登録外の `<name>`（例: `foobar`）を渡す
**WHEN** `runCredentialsSet("foobar")` を呼び出す
**THEN** 戻り値が非 0 であり、credentials.json への書き込みは行われない

### TC-023: init の config 生成メッセージが login でなく doctor へ誘導する

**Category**: unit
**Priority**: should
**Source**: design.md D9 / tasks.md T-07

**GIVEN** global config が存在しない（初回 init）
**WHEN** `runInit({ repoRoot })` を実行し stdout を捕捉する
**THEN** stdout に `specrunner doctor` が含まれ、`specrunner login` が無条件案内として出力されない

### TC-024: top-level USAGE に `credentials set` のエントリが含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04

**GIVEN** `src/cli/command-registry.ts` の top-level `USAGE` 定数
**WHEN** その文字列を検査する
**THEN** `credentials set` の記載が含まれる

---

## Result

```yaml
result: completed
total: 24
automated: 24
manual: 0
must: 21
should: 3
could: 0
blocked_reasons: []
```
