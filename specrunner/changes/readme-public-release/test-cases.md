# Test Cases: README を公開向けに拡充する

## Summary

- **Total**: 21 cases
- **Automated** (unit/integration): 5
- **Manual**: 16
- **Priority**: must: 19, should: 2, could: 0

---

### TC-001: 全 canonical step 名が README に存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: README pipeline 節の step 名は STEP_NAMES と一致しなければならない > Scenario: 全 canonical step 名が README に存在する

---

### TC-002: canonical でない step 名の混入を検出できる（改名検出）

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: README pipeline 節の step 名は STEP_NAMES と一致しなければならない > Scenario: canonical でない step 名は混入していない（改名検出）

---

### TC-003: 4 つの新節見出しが README に存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: README は公開向け 4 節を備えなければならない > Scenario: 4 つの新節見出しが README に存在する

---

### TC-004: 既存節のテキストが不変である

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 追記は既存節を変更してはならない > Scenario: 既存節のテキストが不変である

---

### TC-005: Stability 節が 0.x・破壊的変更・minor migration の内容を含む

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** README に Stability 節が追記されている
**WHEN** 節の本文を確認する
**THEN** 「SpecRunner は 0.x である」「state / config フォーマットに破壊的変更があり得る」「migration は semver minor で提供される」相当の記述がすべて存在する

---

### TC-006: Stability 節が `## Installation` より前に配置されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** README に Stability 節が追記されている
**WHEN** README の見出し順序を確認する
**THEN** Stability 節の `##` 見出しが `## Installation` より前の行に存在し、前後に空行を挟んでいる

---

### TC-007: pipeline 概要に judge⇄fixer ループと conformance→implementer 戻しが記述されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** README に How the Pipeline Works 節が追記されている
**WHEN** 節の本文を確認する
**THEN** `spec-review`⇄`spec-fixer` / `verification`⇄`build-fixer` / `code-review`⇄`code-fixer` のループと、`conformance` の `needs-fix` が `implementer` に戻ること、の両方が `STANDARD_TRANSITIONS` と矛盾しない形で記載されている

---

### TC-008: pipeline 概要に escalation の説明（正常停止・`job resume` 再開）が含まれている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** README に How the Pipeline Works 節が追記されている
**WHEN** 節の本文を確認する
**THEN** 「escalation は失敗ではなく人間の判断待ちの正常な停止である」「job state は保持される」「`specrunner job resume <slug>` で再開できる」相当の記述がある

---

### TC-009: pipeline 概要に `adr-gen` の条件付き実行が記述されている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** README に How the Pipeline Works 節が追記されている
**WHEN** 節の本文を確認する
**THEN** `adr-gen` は `request.adr === true` のときのみ ADR を生成する旨が記載されている

---

### TC-010: How the Pipeline Works 節が `## Installation` より前に配置されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** README に Stability 節と How the Pipeline Works 節が追記されている
**WHEN** README の見出し順序を確認する
**THEN** How the Pipeline Works 節が Stability 節の直後かつ `## Installation` の前に配置されている

---

### TC-011: Cost 節が `## Runtime Modes` と `## Troubleshooting` の間に配置されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** README に Cost 節が追記されている
**WHEN** README の見出し順序を確認する
**THEN** Cost 節の `##` 見出しが `## Runtime Modes` の後かつ `## Troubleshooting` の前の行に存在する

---

### TC-012: Cost 節に算出方法・as-of 日付・per-invocation 実 model 課金の記述がある

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** README に Cost 節が追記されている
**WHEN** 節の本文を確認する
**THEN** 「`specrunner/changes/archive/*/usage.json` を集計した」「各 invocation を実 model の Anthropic list 価格で課金した」「price の as-of 日付が明記されている」の 3 点が節内に含まれている

---

### TC-013: Cost 節に「model は config 変更可能」「レンジは複雑さ依存」の注記がある

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** README に Cost 節が追記されている
**WHEN** 節の本文を確認する
**THEN** 使用モデルが config で変更可能であること、およびレンジが request の複雑さに依存することの両方が記載されている

---

### TC-014: 集計スクリプトがリポジトリにコミットされていない

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** Cost 節の追記が完了している
**WHEN** `git log --all --name-only` でコミット履歴を確認する
**THEN** コスト集計用スクリプトが tracked file として含まれていない

---

### TC-015: Assumptions 節に信頼モデル（solo 運用前提・第三者 request 想定外）が記述されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** README に Assumptions & Supported Scope 節が追記されている
**WHEN** 節の本文を確認する
**THEN** 「`request.md` は信頼された入力」「request を書いた本人が PR を承認する solo 運用が前提」「第三者の `request.md` をそのまま流す運用は想定外」相当の記述がある

---

### TC-016: Assumptions 節に `verification.commands` escape hatch の記述がある

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** README に Assumptions & Supported Scope 節が追記されている
**WHEN** 節の本文を確認する
**THEN** デフォルトでは Node / Bun プロジェクトが主対象である旨と、`verification.commands` を設定すれば任意言語（Python / Go / Rust 等）で検証コマンドを実行できることの両方が記載されており、既存 Troubleshooting 節の記述と矛盾しない

---

### TC-017: Assumptions 節に信頼できないコミット履歴への注意書きがある

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** README に Assumptions & Supported Scope 節が追記されている
**WHEN** 節の本文を確認する
**THEN** 「外部コントリビュータのいるリポジトリでは git log / diff が agent prompt に入る」「信頼できないコミット履歴を持つリポジトリでの実行は非推奨」相当の注意書きがある

---

### TC-018: `STEP_NAMES` の値を 1 つ削除するとドリフトガードテストが失敗する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `tests/unit/docs/readme-pipeline-sync.test.ts`（または同等のファイル）が存在し、`bun run test` で green になっている
**WHEN** README から `STEP_NAMES` の値のいずれか 1 つ（例: `implementer`）を削除した状態でテストを実行する
**THEN** 当該テストが「`implementer` が README に存在しない」旨のエラーで失敗する

---

### TC-019: 4 節見出しのいずれかを欠くとドリフトガードテストが失敗する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `tests/unit/docs/readme-pipeline-sync.test.ts`（または同等のファイル）が存在し、`bun run test` で green になっている
**WHEN** README から新節見出し（Stability / How the Pipeline Works / Cost / Assumptions & Supported Scope）のいずれか 1 つを削除した状態でテストを実行する
**THEN** 当該テストが当該見出しの欠落を検出して失敗する

---

### TC-020: `bun run typecheck` が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** T-05 のドリフトガードテストを含むすべての変更が適用されている
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーがなく正常終了する

---

### TC-021: `bun run test` が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** T-05 のドリフトガードテストを含むすべての変更が適用されている
**WHEN** `bun run test` を実行する
**THEN** 全テスト（既存テスト・新規ドリフトガードテスト含む）がパスする

---

## Result

```yaml
result: completed
total: 21
automated: 5
manual: 16
must: 19
should: 2
could: 0
blocked_reasons: []
```
