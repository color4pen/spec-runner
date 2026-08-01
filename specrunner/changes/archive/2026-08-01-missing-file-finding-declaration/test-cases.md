# Test Cases: 欠落指摘 finding の構造化宣言と反転検証

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 14
- **Manual**: 0
- **Priority**: must: 10, should: 4, could: 0

---

### TC-001: 欠落宣言 finding が parse で保持される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: finding は対象ファイルの欠落を構造化宣言できる > Scenario: 欠落宣言 finding が parse で保持される

---

### TC-002: 非宣言 finding は従来通り（fileMissing 未設定）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: finding は対象ファイルの欠落を構造化宣言できる > Scenario: 非宣言 finding は従来通り

---

### TC-003: 正当な欠落指摘の routing が保たれる（#916 再現）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: finding-ref 検証は欠落宣言別に期待を反転する > Scenario: 正当な欠落指摘の routing が保たれる（#916）

---

### TC-004: 虚偽の欠落宣言は escalation に上書きされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: finding-ref 検証は欠落宣言別に期待を反転する > Scenario: 虚偽の欠落宣言は escalation に上書きされる

---

### TC-005: 非宣言 finding の不在は従来通り escalation に上書きされ routing が消える

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: finding-ref 検証は欠落宣言別に期待を反転する > Scenario: 非宣言 finding の不在は従来通り escalation に上書きされ routing が消える

---

### TC-006: local / managed 両 runtime で同一挙動

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: finding-ref 検証は欠落宣言別に期待を反転する > Scenario: local / managed 両 runtime で同一挙動

---

### TC-007: 欠落宣言 finding の line は seam に渡らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 欠落宣言 finding では line を検証に使わない > Scenario: 欠落宣言 finding の line は無視される

---

### TC-008: Finding 型に fileMissing が追加され既存フィールドは不変

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `Finding` 型（`src/kernel/report-result.ts`）の定義
**WHEN** 型チェックおよびフィールド一覧を確認する
**THEN** `fileMissing?: boolean` が存在し、従来の必須/optional フィールド（`file`, `line`, `severity`, `resolution`, `title`, `rationale`, `origin` 等）はすべて不変である

---

### TC-009: 4 tool schema の toJSONSchema に fileMissing が反映される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `findingSchema`（JUDGE / CODE_REVIEW / REQUEST_REVIEW 共有）と `conformanceFindingSchema`（CONFORMANCE 専用）の定義
**WHEN** `toJSONSchema` で input_schema を生成する
**THEN** 生成された input_schema の finding 要素プロパティに `fileMissing` が optional boolean として含まれる

---

### TC-010: 4 tool の description に fileMissing 規約が明記される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL` の各 description 文字列
**WHEN** description を参照する
**THEN** 各 tool description に `fileMissing` キーワードおよび「あるべきファイルが存在しないことを指摘する場合に true、`file` には欠落している path を書く」に相当する用途説明が含まれる

---

### TC-011: fileMissing が absent/false/非 boolean の入力では非宣言扱い

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `parseFindings` 入力の finding 要素で `fileMissing` が absent / `false` / 数値 / 文字列など `true` 以外の値を持つ
**WHEN** `parseFindings` が finding を取り込む
**THEN** `finding.fileMissing` が未設定（`undefined`）になり parse 成否は変わらない

---

### TC-012: typecheck が error なしで通る

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 実装完了後のコードベース
**WHEN** `bun run typecheck` を実行する
**THEN** exit code 0 かつ型エラー 0 件

---

### TC-013: bun run test が全 pass する（新規 + 既存）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 実装完了後のコードベース（T-04 / T-05 の新規テストと既存テスト一式）
**WHEN** `bun run test` を実行する
**THEN** exit code 0 かつ新規テスト・既存テストすべてが pass する

---

### TC-014: 既存テストファイルへの変更がない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 変更後のコードベースおよび既存テストファイル（`managed-verify-finding-refs.test.ts`, `verify-finding-refs.test.ts`, step-completion 系, judge-verdict 系）
**WHEN** git diff で既存テストファイルの変更を確認する
**THEN** 既存テストファイルに変更行が存在せず、新設テストファイルの追加のみが差分に現れる

---

## Result

```yaml
result: completed
total: 14
automated: 14
manual: 0
must: 10
should: 4
could: 0
blocked_reasons: []
```
