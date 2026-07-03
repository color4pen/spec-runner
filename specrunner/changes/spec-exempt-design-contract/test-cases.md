# Test Cases: spec-exempt design contract

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 17
- **Manual**: 1
- **Priority**: must: 12, should: 6, could: 0

---

### TC-001: chore is spec-exempt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Request type declares spec requirement as a declarative attribute > Scenario: chore is spec-exempt

---

### TC-002: spec-required types are unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Request type declares spec requirement as a declarative attribute > Scenario: spec-required types are unchanged

---

### TC-003: unknown type falls back to spec-required

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Request type declares spec requirement as a declarative attribute > Scenario: unknown type falls back to spec-required

---

### TC-004: spec-exempt design generates zero requirements without halting

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Design step omits the spec.md output contract for spec-exempt types > Scenario: spec-exempt design generates zero requirements without halting

---

### TC-005: spec-required design still halts on an unmodified scaffold

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Design step omits the spec.md output contract for spec-exempt types > Scenario: spec-required design still halts on an unmodified scaffold

---

### TC-006: local and managed agree on the exemption

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Design step omits the spec.md output contract for spec-exempt types > Scenario: local and managed agree on the exemption

---

### TC-007: exempt note replaces the requirement template for spec-exempt types

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Spec-exempt spec.md carries an explicit, machine-recognizable exemption note > Scenario: exempt note replaces the requirement template for spec-exempt types

---

### TC-008: spec-required types keep the requirement template

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Spec-exempt spec.md carries an explicit, machine-recognizable exemption note > Scenario: spec-required types keep the requirement template

---

### TC-009: spec-review does not fabricate findings for an exempt spec.md

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Downstream review treats an exempt spec.md as vacuously satisfied > Scenario: spec-review does not fabricate findings for an exempt spec.md

---

### TC-010: conformance treats an exempt spec.md as conforming

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Downstream review treats an exempt spec.md as vacuously satisfied > Scenario: conformance treats an exempt spec.md as conforming

---

### TC-011: `specReviewMode: "lightweight"` は spec 免除の判定に使われない

**Category**: unit
**Priority**: should
**Source**: design.md > D1（Rationale — `specReviewMode` との直交性）

**GIVEN** `refactoring` 型の request（`specReviewMode` は `"lightweight"` だが spec-required）
**WHEN** `isSpecRequired("refactoring")` を呼ぶ
**THEN** `true` が返り、refactoring が誤って spec 免除にならないことが確認できる

---

### TC-012: SPEC_EXEMPT_NOTE は非空かつ空の Requirements 雛形を含まない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02（Acceptance Criteria）

**GIVEN** `SPEC_EXEMPT_NOTE` 定数
**WHEN** その内容を検査する
**THEN** (a) 文字列が非空であること、(b) `## Requirements` の空雛形を含まないこと、(c) `SPEC_EXEMPT_MARKER` を含むこと、(d) 免除理由が人間可読な本文で述べられていること

---

### TC-013: design.md / tasks.md のテンプレート内容は全型で不変

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02（Acceptance Criteria — design.md / tasks.md template は全型で不変）

**GIVEN** `chore`、`new-feature`、`bug-fix` それぞれの state で `getOutputTemplates("design", slug, state)` を呼ぶ
**WHEN** 各型の出力テンプレートから `design.md` と `tasks.md` の content を取得する
**THEN** 全型で `design.md` / `tasks.md` の content が同一であり、型によって変わらない

---

### TC-014: chore の buildAllOutputContracts が design.md / tasks.md を produced contract に含む

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03（Acceptance Criteria）

**GIVEN** `request.type` が `chore` の state と deps
**WHEN** `buildAllOutputContracts(DesignStep, state, deps)` を呼ぶ
**THEN** produced contracts に `spec.md` のエントリが含まれず、`design.md` と `tasks.md` のエントリは含まれる

---

### TC-015: bug-fix の spec.md produced contract が scaffold 一致検出を持つ

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03（Acceptance Criteria）

**GIVEN** `request.type` が `bug-fix` の state と deps
**WHEN** `buildAllOutputContracts(DesignStep, state, deps)` を呼ぶ
**THEN** produced contracts に `spec.md` のエントリが含まれ、その `scaffold` フィールドが `SPEC_TEMPLATE` と一致し、scaffold 放置での violation 検出が有効

---

### TC-016: spec-review / conformance の system prompt に SPEC_EXEMPT_MARKER が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05（Acceptance Criteria）

**GIVEN** `spec-review-system.ts` と `conformance-system.ts` が生成する system prompt 文字列
**WHEN** 各文字列に `SPEC_EXEMPT_MARKER` の値が含まれるかを検査する
**THEN** 両プロンプトとも `SPEC_EXEMPT_MARKER` を含み、マーカーと note 間のドリフトが無いことが確認できる

---

### TC-017: design system prompt に chore 用 Completion Checklist 分岐が追加され既存分岐は不変

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05（Acceptance Criteria — design system prompt の chore 用分岐）

**GIVEN** `design-system.ts` が生成する system prompt 文字列
**WHEN** Completion Checklist 節を検査する
**THEN** (a) chore 用分岐（spec.md を免除ノートのまま残す旨）が存在すること、(b) spec-change/new-feature 向けの既存分岐と bug-fix/refactoring 向けの既存分岐が従来のまま存在すること

---

### TC-018: typecheck / lint / test / build がすべて成功する

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06（Acceptance Criteria）

**GIVEN** 実装完了後の worktree
**WHEN** `bun run typecheck`、`bun run lint`、`bun run test`、`bun run build` を順に実行する
**THEN** すべてがエラーなく成功し、既存テストに変更が加えられていない（新規テストのみ追加）

---

## Result

```yaml
result: completed
total: 18
automated: 17
manual: 1
must: 12
should: 6
could: 0
blocked_reasons: []
```
