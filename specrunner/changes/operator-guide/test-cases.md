# Test Cases: specrunner guide サブコマンド

## Summary

- **Total**: 21 cases
- **Automated** (unit/integration): 21
- **Manual**: 0
- **Priority**: must: 18, should: 3, could: 0

---

### TC-001: 引数なしで topic 一覧を出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guide コマンドは topic 一覧と topic 本文を静的に出力する > Scenario: 引数なしで topic 一覧を出力する

---

### TC-002: topic 指定で全文を出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guide コマンドは topic 一覧と topic 本文を静的に出力する > Scenario: topic 指定で全文を出力する

---

### TC-003: repo 外でも動作する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: guide コマンドは topic 一覧と topic 本文を静的に出力する > Scenario: repo 外でも動作する

---

### TC-004: 未知 topic はエラーと一覧を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 未知 topic はエラーと一覧を返す > Scenario: 未知 topic

---

### TC-005: 一覧が registry から導出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 一覧・未知候補・init snippet の topic 列挙は単一 registry から導出される > Scenario: 一覧が registry から導出される

---

### TC-006: finish/archive escalation の導線

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: operator 向け escalation 出力に guide escalation 導線を含める > Scenario: finish/archive escalation の導線

---

### TC-007: 保護正典 escalation の導線

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: operator 向け escalation 出力に guide escalation 導線を含める > Scenario: 保護正典 escalation の導線

---

### TC-008: usage に guide が現れる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --help に guide の案内を含める > Scenario: usage に guide が現れる

---

### TC-009: init が snippet を出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: init 完了時に CLAUDE.md 用 snippet を出力する > Scenario: init が snippet を出力する

---

### TC-010: escalation 本文の必須要素

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation topic 本文は復帰 flag 分岐と reopen 制約を含める > Scenario: escalation 本文の必須要素

---

### TC-011: 薄いトリガー化

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: skill を薄いトリガーへ縮退し廃止コマンド文字列を排除する > Scenario: 薄いトリガー化

---

### TC-012: 廃止 skill とコマンド文字列の不在

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: skill を薄いトリガーへ縮退し廃止コマンド文字列を排除する > Scenario: 廃止 skill とコマンド文字列の不在

---

### TC-013: 本文コマンドが registry で解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guide 本文の specrunner コマンドは現行 CLI に実在する > Scenario: 本文コマンドが registry で解決される

---

### TC-014: GUIDE_TOPICS は 9 件を宣言順で持つ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `GUIDE_TOPICS` が定義されている
**WHEN** 配列の要素数と各 `name` を順に確認する
**THEN** `jobs / merge / audit / setup / escalation / request / review / inject / inbox` の順で 9 件が存在する

---

### TC-015: renderTopicList のフォーマット

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** `GUIDE_TOPICS` が 9 topic を持つ
**WHEN** `renderTopicList()` を呼び出す
**THEN** 返り値の各行が `<name> — <summary>` の形式を持ち、9 topic 分の行を含む文字列である

---

### TC-016: runGuide の戻り値仕様

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `runGuide` が実装されている
**WHEN** topic 未指定 / 既知 topic (`"jobs"`) / 未知 topic (`"nonexistent"`) でそれぞれ呼び出す
**THEN** topic 未指定と既知 topic は `0` を返し、未知 topic は `2` を返す

---

### TC-017: resolveCommand で guide コマンドが解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** command-registry に `guide` が登録されている
**WHEN** `resolveCommand(["guide"])` および `resolveCommand(["guide", "escalation"])` を呼び出す
**THEN** 両方とも `{ status: "ok" }` を返す

---

### TC-018: guide コマンドは requiresRepo を持たない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D2

**GIVEN** `COMMANDS` に `guide` が登録されている
**WHEN** `guide` コマンド定義の `requiresRepo` プロパティを確認する
**THEN** `requiresRepo` が truthy でない(未設定または false)

---

### TC-019: canon-escalation.ts は guide.ts を import しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria / design.md > D3

**GIVEN** `src/core/step/canon-escalation.ts` が実装されている
**WHEN** ファイルの import 文を確認する
**THEN** `src/core/command/guide` への import が存在せず、leaf 制約が保たれている

---

### TC-020: buildClaudeMdSnippet は GUIDE_TOPICS の全 name を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D1

**GIVEN** `GUIDE_TOPICS` に 9 topic が定義されている
**WHEN** `buildClaudeMdSnippet()` を呼び出す
**THEN** 返り値に `GUIDE_TOPICS` の全 `name`(jobs / merge / audit / setup / escalation / request / review / inject / inbox)が含まれる

---

### TC-021: findTopic の正常・異常動作

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `GUIDE_TOPICS` が定義されている
**WHEN** `findTopic("jobs")` および `findTopic("nonexistent")` を呼び出す
**THEN** `"jobs"` は body が非空の `GuideTopic` を返し、`"nonexistent"` は `undefined` を返す

---

## Result

```yaml
result: completed
total: 21
automated: 21
manual: 0
must: 18
should: 3
could: 0
blocked_reasons: []
```
