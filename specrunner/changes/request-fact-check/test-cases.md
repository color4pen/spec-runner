# Test Cases: request の現状コード断定を design / request-review が実コードと突き合わせる

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 11
- **Manual**: 1
- **Priority**: must: 7, should: 5, could: 0

---

### TC-001: template 出力に節とコメントが含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request scaffold は「現状コードの前提」任意節を含める > Scenario: template 出力に節とコメントが含まれる

---

### TC-002: request new の生成ファイルにも節が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request scaffold は「現状コードの前提」任意節を含める > Scenario: request new の生成ファイルにも節が含まれる

---

### TC-003: 節を持たない既存 request が green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 節を持たない request は validate を green で通過する > Scenario: 節を持たない既存 request が green

---

### TC-004: request-review prompt に突き合わせ観点と severity 規定が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review は現状コード断定を実コードと突き合わせる > Scenario: prompt に突き合わせ観点と severity 規定が含まれる

---

### TC-005: design prompt に検証工程と報告経路が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design は前提を実コードと突き合わせ不一致を escalate する > Scenario: prompt に検証工程と報告経路が含まれる

---

### TC-006: request-generate prompt が任意節を案内する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-generate は「現状コードの前提」を任意節として案内する > Scenario: generate prompt が任意節を案内する

---

### TC-007: scaffold が parseRequestMdContent を例外なく通過する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `buildScaffoldTemplate()` が「## 現状コードの前提」節を含む scaffold 文字列を返す
**WHEN** その文字列を `parseRequestMdContent()` に渡す
**THEN** 例外が発生せず、parse 結果が返る

---

### TC-008: parser/rules に required-section rule が追加されていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `src/parser/rules/` ディレクトリ配下のルール一覧
**WHEN** 「現状コードの前提」節を必須とするようなルールファイルを探す
**THEN** そのようなルールは存在しない（Meta 系 7 ルールのみ）

---

### TC-009: 既存 request-review prompt の read-only / verdict 記述が壊れていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** 変更後の `REQUEST_REVIEW_SYSTEM_PROMPT` 文字列
**WHEN** 既存の read-only 制約（ファイル編集禁止）および verdict / findings 関連の記述を検査する
**THEN** 追加前と同等の内容が含まれており、既存の read-only 権限記述が欠落していない

---

### TC-010: 既存 design-system の Completion Checklist が壊れていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** 変更後の `DESIGN_SYSTEM_PROMPT` 文字列
**WHEN** 既存の Completion Checklist / path-fence など他セクションの記述を検査する
**THEN** 変更前と同等の内容が保持されており、既存テスト（`tests/prompts/design-system.test.ts`）が green のまま

---

### TC-011: typecheck && test && lint が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09 Acceptance Criteria

**GIVEN** 全変更を適用した状態のコードベース
**WHEN** `bun run typecheck && bun run test && bun run lint` を実行する
**THEN** すべてが exit 0 で完了し、エラーが出力されない

---

### TC-012: request template 出力の目視確認

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-09 Acceptance Criteria

**GIVEN** 変更を適用したローカル環境で `specrunner request template` を実行する
**WHEN** 標準出力を確認する
**THEN** `## 現状コードの前提` heading と、file:line・未検証前提・対象外を案内する HTML コメントが含まれる

---

## Result

```yaml
result: completed
total: 12
automated: 11
manual: 1
must: 7
should: 5
could: 0
blocked_reasons: []
```
