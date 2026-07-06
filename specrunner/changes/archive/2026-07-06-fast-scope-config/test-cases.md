# Test Cases: fast pipeline forbidden surfaces の repo config 化

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 17
- **Manual**: 0
- **Priority**: must: 11, should: 5, could: 1

---

### TC-001: project local config で forbidden surfaces を宣言できる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: config で fast の forbidden surfaces を宣言できる > Scenario: project local config で forbidden surfaces を宣言

---

### TC-002: user global と project local の array は project local が置換する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: config で fast の forbidden surfaces を宣言できる > Scenario: user global と project local の array は project local が置換する

---

### TC-003: config 宣言が実効 descriptor の forbidden になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fast descriptor は forbidden surfaces を config から解決する > Scenario: config 宣言が実効 descriptor の forbidden になる

---

### TC-004: registry に spec-runner 固有パスリテラルが残っていない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fast descriptor は forbidden surfaces を config から解決する > Scenario: registry の静的定数に spec-runner 固有パスが残っていない

---

### TC-005: 宣言 path への接触で conformance checkpoint が breach を検出する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 宣言 paths への接触が conformance checkpoint で breach 検出される > Scenario: 宣言 path への接触で breach

---

### TC-006: config 無指定の場合 breach が発生しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: config 無指定なら forbidden は空で breach は発生しない > Scenario: 無指定なら breach なし

---

### TC-007: config 無指定でも capability gate が発火する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: forbidden が空でも scope presence を維持し capability gate が適用される > Scenario: 無指定でも capability gate が発火する

---

### TC-008: id 欠落の config が validation エラーになる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 不正な forbidden surfaces config は validation エラーになる > Scenario: id 欠落

---

### TC-009: paths が配列でない config が validation エラーになる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 不正な forbidden surfaces config は validation エラーになる > Scenario: paths が配列でない

---

### TC-010: standard descriptor が変換後も permissionScope を持たず参照同一

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 非 scope pipeline は変換で影響を受けない > Scenario: standard descriptor は変換後も permissionScope を持たない

---

### TC-011: 自 repo .specrunner/config.json に現行 3 面が宣言されている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-runner 自身の config が現行 3 面を宣言する > Scenario: 自 repo config に 3 面が宣言されている

---

### TC-012: resolver が fast 以外の pipelineId に空配列を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** config の `pipeline.fast.forbiddenSurfaces` に 1 面以上が宣言されている
**WHEN** `resolvePipelineForbiddenSurfaces(config, "standard")` を呼ぶ
**THEN** 空配列が返る（fast 以外の id はマッピング対象外）

---

### TC-013: config 無指定のとき resolver が pipelineId="fast" で空配列を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** config に `pipeline.fast.forbiddenSurfaces` が定義されていない
**WHEN** `resolvePipelineForbiddenSurfaces(config, "fast")` を呼ぶ
**THEN** 空配列が返る

---

### TC-014: forbidden 宣言ありの fast でも capability gate が config 変化によらず発火する

**Category**: unit
**Priority**: should
**Source**: design.md > D5

**GIVEN** config に forbidden surfaces が宣言された fast descriptor（`permissionScope` presence あり）
**AND** `canDeriveChangedFiles()` が false を返す runtime
**WHEN** `assertRuntimeSupportsScope(descriptor, runtime)` を評価する
**THEN** `UnsupportedRuntimeCapabilityError` が throw される

---

### TC-015: composeReviewerDescriptor 通過後も解決済み scope が保持される

**Category**: unit
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-06

**GIVEN** `applyScopeConfig` を適用した fast descriptor（forbidden に 1 面以上が解決済み）
**WHEN** `composeReviewerDescriptor(scoped, reviewers)` を通す
**THEN** 結果 descriptor の `permissionScope.forbidden` が解決済み面と一致する（spread 保持）

---

### TC-016: paths が空配列の surface が validation を通過する

**Category**: unit
**Priority**: could
**Source**: design.md > Risks / Trade-offs（`paths` 空配列の許容）

**GIVEN** `forbiddenSurfaces` に `{ id: "x", paths: [] }` を含む config
**WHEN** config を validate する
**THEN** validation エラーにならない（空配列は許容）

---

### TC-017: FAST_DESCRIPTOR の permissionScope が presence・checkpoint・forbidden 空を満たす

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / T-09

**GIVEN** `src/core/pipeline/registry.ts` の `FAST_DESCRIPTOR`
**WHEN** `permissionScope` を参照する
**THEN** `permissionScope` は defined（presence 維持）、`checkpoint` は `"conformance"`、`forbidden` は空配列である

---

## Result

```yaml
result: completed
total: 17
automated: 17
manual: 0
must: 11
should: 5
could: 1
blocked_reasons: []
```
