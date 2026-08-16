# Test Cases: auth-setup-ux

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

- **Total**: 21 cases
- **Automated** (unit/integration): 21
- **Manual**: 0
- **Priority**: must: 19, should: 2, could: 0

---

### TC-001: --provider は login の help surface に存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL be GitHub-only and reject the removed `--provider` flag > Scenario: --provider is absent from login help surface

---

### TC-002: 旧 `login --provider claude` が migration 捕捉されて非 0 終了する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL be GitHub-only and reject the removed `--provider` flag > Scenario: legacy `login --provider claude` is captured with migration guidance

---

### TC-003: 有効な最優先 token が存在する場合 Device Flow をスキップする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: valid top-priority token skips the Device Flow

---

### TC-004: env/gh 由来の無効 token が Device Flow なしで非 0 終了する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: invalid token from an env/gh source fails without a Device Flow

---

### TC-005: credentials.json 由来の無効 token は Device Flow へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: invalid token from credentials.json proceeds to the Device Flow

---

### TC-006: 解決可能な token が存在しない場合 Device Flow へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: no resolvable token proceeds to the Device Flow

---

### TC-007: token 有効性が確認不可の場合は既存 token を上書きしない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: validity cannot be confirmed does not overwrite silently

---

### TC-008: --force は常に Device Flow を実行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token > Scenario: --force always runs the Device Flow

---

### TC-009: `credentials set claude-code` が Claude Code token を credentials.json に保存する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input > Scenario: credentials set claude-code stores the Claude Code token

---

### TC-010: `credentials set anthropic-api-key` が API key を credentials.json に保存する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input > Scenario: credentials set anthropic-api-key stores the API key

---

### TC-011: secret の入力値が output stream に書かれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input > Scenario: secret input is not echoed

---

### TC-012: 既存の別 credential が credentials set 後も保持される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input > Scenario: storing one secret preserves other stored credentials

---

### TC-013: `src/` に `login --provider anthropic` の文字列が存在しない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: guidance MUST reference only real, current commands > Scenario: no dead `login --provider anthropic` guidance remains

T-10 の grep 系テスト（`src/` 全体走査）で固定する。`login --provider anthropic` および `login --provider claude` の双方を対象とする。

---

### TC-014: doctor hint 内のコマンド参照がサブコマンドを含め registry に実在する

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: guidance MUST reference only real, current commands > Scenario: doctor hints reference registered commands only

T-10 の hint-command-existence テスト（`src/core/doctor/**` 走査）で固定する。hint 中の `specrunner <verb> [<sub>]` が `COMMANDS`（**parent の subcommand を含む**）に実在することを検証する。たとえば `credentials set claude-code` という hint は、parent コマンド `credentials` と subcommand `set` の両方が registry に登録済みであることを確認する必要があり、parent の存在確認のみでは不十分である。`credentials` コマンドおよび `set` サブコマンドが registry に実在することが、この検証の通過条件となる。

---

### TC-015: headless Claude credential 未設定の doctor 結果が warn かつ cron/inbox 注記を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL treat headless Claude credential absence as a warning, not a failure > Scenario: unset headless Claude credential is a warn with a scoped note

---

### TC-016: warn あり・fail なしの doctor が Ready と次の一歩を案内する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor readiness SHALL be determined by fail == 0 > Scenario: warnings remain but no failures shows Ready plus next step

---

### TC-017: fail ありの doctor が Ready を出力しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor readiness SHALL be determined by fail == 0 > Scenario: a failing check suppresses Ready

---

### TC-018: 既存 global config + provider flag の init が案内を出力し config を変更しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: init MUST NOT silently ignore the provider flag when a global config exists > Scenario: provider flag under an existing global config emits a notice

---

### TC-019: README Quick Start が doctor 中心の導線になっている

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: README Quick Start SHALL present a doctor-centered setup flow > Scenario: Quick Start centers on doctor

T-10 の README 内容検証テストで固定する。`specrunner doctor` が Quick Start 節に含まれること、および無条件必須の `specrunner login` 手順が存在しないことを確認する。

---

### TC-020: `credentials set <unknown>` が非 0 終了する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a user runs `specrunner credentials set unknown-name`
**WHEN** the handler validates the positional `<name>` argument
**THEN** the command exits non-zero and prints usage indicating accepted names

---

### TC-021: `credentials set` に空入力が渡された場合に非 0 終了する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a user runs `specrunner credentials set claude-code` and provides an empty string as the secret value
**WHEN** the handler reads the secret via `readSecret`
**THEN** the command exits non-zero with an error message and does not write to credentials.json

---

## Result

```yaml
result: completed
total: 21
automated: 21
manual: 0
must: 19
should: 2
could: 0
blocked_reasons: []
```
