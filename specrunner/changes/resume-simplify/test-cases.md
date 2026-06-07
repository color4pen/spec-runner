# Test Cases: resume の再開位置解決を resumePoint の記録から素直に決定する

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 15
- **Manual**: 2
- **Priority**: must: 11, should: 5, could: 1

---

### TC-001: crash で記録された step から再開する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resolveResumeStep は記録された resumePoint.step を再推理せず返す > Scenario: crash で記録された step から再開する

---

### TC-002: reviewer が記録されていればその reviewer を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resolveResumeStep は記録された resumePoint.step を再推理せず返す > Scenario: reviewer が記録されていればその reviewer を返す

---

### TC-003: fixer が記録されていれば fixer-empty 推理なしにその fixer を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resolveResumeStep は記録された resumePoint.step を再推理せず返す > Scenario: fixer が記録されていればその fixer を返す（fixer-empty 推理なし）

---

### TC-004: --from が resumePoint を上書きする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from <step-name> は記録より優先して任意 step から再開する > Scenario: --from が resumePoint を上書きする

---

### TC-005: --from に未登録の値を与えるとエラーになる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: --from <step-name> は記録より優先して任意 step から再開する > Scenario: --from に未登録の値を与えるとエラーになる

---

### TC-006: --from fixer（legacy alias）は受け付けられない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: legacy alias を撤去する > Scenario: --from fixer は受け付けられない

---

### TC-007: 再開位置不明エラー

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resumePoint が null かつ --from 未指定なら推測せずエラーにする > Scenario: 再開位置不明エラー

---

### TC-008: null resumePoint でも --from があれば再開する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resumePoint が null かつ --from 未指定なら推測せずエラーにする > Scenario: null resumePoint でも --from があれば再開する

---

### TC-009: code-review 枯渇 → code-fixer から再開

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 枯渇後は対の fixer step を resumePoint に記録する > Scenario: code-review 枯渇 → code-fixer から再開

---

### TC-010: spec-review 枯渇 → spec-fixer から再開

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 枯渇後は対の fixer step を resumePoint に記録する > Scenario: spec-review 枯渇 → spec-fixer から再開

---

### TC-011: 枯渇の診断情報は維持される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 枯渇後は対の fixer step を resumePoint に記録する > Scenario: 枯渇の診断情報は維持される

---

### TC-012: --from critic / creator も未登録値として拒否される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** 任意の `resumePoint` が存在する  
**WHEN** `--from critic` または `--from creator` を指定して `resolveResumeStep` を呼ぶ  
**THEN** legacy alias を step へ解決せず、有効な step 名を列挙したエラーを throw する（`critic` / `creator` は列挙に含まれない）

---

### TC-013: resolveResumeStep に null + --from 未指定が渡った場合は防御的エラー

**Category**: unit
**Priority**: should
**Source**: design.md > D5

**GIVEN** `resumePoint === null` かつ `from === undefined`  
**WHEN** `resolveResumeStep(undefined, null)` を呼ぶ  
**THEN** command 層のガードより先にここへ到達した場合でも Error を throw する（invariant）

---

### TC-014: verification 枯渇 → build-fixer を resumePoint に記録する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** verification loop が反復上限に達して枯渇する  
**WHEN** pipeline が `handleExhausted` で `awaiting-resume` へ遷移する  
**THEN** `resumePoint.step` は `"build-fixer"` になる

---

### TC-015: 対の fixer を持たない loop step（conformance）枯渇 → 自身を記録

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D4

**GIVEN** conformance loop が反復上限に達して枯渇する（`loopFixerPairs` に対の fixer なし）  
**WHEN** pipeline が `handleExhausted` で `awaiting-resume` へ遷移する  
**THEN** `resumePoint.step` は `"conformance"`（自身）のまま変わらない

---

### TC-016: resolveResumeStep の行数削減確認

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `src/core/resume/resolve-step.ts` の実装が完了している  
**WHEN** ファイルの行数を確認する  
**THEN** 全行数が 118 行以下（現行 237 行の 50% 以下）である

---

### TC-017: bun run typecheck && bun run test が green

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-08

**GIVEN** T-01〜T-07 の実装がすべて完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** typecheck・test ともにエラーなく終了する

---

## Result

```yaml
result: completed
total: 17
automated: 15
manual: 2
must: 11
should: 5
could: 1
blocked_reasons: []
```
