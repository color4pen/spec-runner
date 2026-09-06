# Regression Gate Result — Iteration 003

**Change**: finding-remediation-contract  
**Date**: 2026-09-06

## Summary

All 13 ledger findings verified. **No regressions detected.**

---

## Evidence

### [1] spec-fixer system prompt 変更の Requirement が spec.md に欠けている (`cf00c499`)

**Status: FIXED**

`spec.md` now contains a dedicated requirement section:

> `### Requirement: spec-fixer の「最小限」は全 site での不変条件成立を意味する`

Two Scenarios are present:
- "spec-fixer system prompt が全 site 成立を最小限の定義とする"
- "spec-fixer system prompt の入力記述が実際の受け渡しと一致する"

These are equivalent to the T-08 items previously only covered in `tasks.md`. Not a regression.

---

### [2] TC-T04-03 が buildCustomReviewerSystemPrompt の containment 検証を含めていない (`91209b92`)

**Status: FIXED**

`specrunner/changes/finding-remediation-contract/test-cases.md` line 279 now reads:

> `**Given** buildCustomReviewerSystemPrompt(anyDef) の戻り値 / CODE_REVIEW_SYSTEM_PROMPT / SPEC_REVIEW_SYSTEM_PROMPT / CONFORMANCE_SYSTEM_PROMPT / REGRESSION_GATE_SYSTEM_PROMPT の各文字列`

`buildCustomReviewerSystemPrompt` is now explicitly included in the TC-T04-03 Given clause. Not a regression.

---

### [3] 非 strict モードで malformed remediation を持つ finding の silent-drop 挙動を確認する TC が欠如している (`cd70aee8`)

**Status: FIXED**

`specrunner/changes/finding-remediation-contract/test-cases.md` now contains TC-T03-03b:

> Given: `sites: []` を持つ fixable finding の JSON  
> When: `parseFindings(raw)` を引数なし（非 strict）で呼ぶ  
> Then: parse が成功し、finding は採用されるが `finding.remediation` は設定されない（silent-drop）

The corresponding implementation test at `src/core/port/__tests__/remediation-parse.test.ts` line 198 ("malformed remediation (non-strict) → silent drop, finding kept") covers this scenario. Not a regression.

---

### [4] TC-T10-01 reproduction fixture tests buildFindingsBlock, not CodeFixerStep.buildMessage (`9a47e123`)

**Status: FIXED**

`src/core/port/__tests__/remediation-parse.test.ts` line 498 now has the comment:

> `// Asserts against CodeFixerStep.buildMessage (end-to-end through selectFixerTargetFindings, ...`

The test at line 563 calls `CodeFixerStep.buildMessage!(state, deps)`, not `buildFindingsBlock` directly. Both sites are asserted to appear in the output. Not a regression.

---

### [5] FINDING_REMEDIATION_DEFINITION scanning obligation omits 'same-check across abstraction layers' category (`1862a489`)

**Status: FIXED**

`src/prompts/judge-rules.ts` line 129 now reads:

> `**走査義務**: finding を 1 つ構成したら、同じ不変条件を共有する隣接関数・並列経路・同じ検査を行う別レイヤを走査し、成立していない箇所をすべて \`sites\` に列挙してください。`

The third category "同じ検査を行う別レイヤ" is present. Not a regression.

---

### [6] TC-T04-04 companion test for three-category scanning phrase is absent (`1fc754d8`)

**Status: FIXED**

`src/prompts/__tests__/fragment-coverage.test.ts` lines 272–273 now contain:

```ts
it("contains '同じ検査を行う別レイヤ' (third scanning category)", () => {
  expect(FINDING_REMEDIATION_DEFINITION).toContain("同じ検査を行う別レイヤ");
```

All three scanning categories are tested. Not a regression.

---

### [7] TC-T04-03: no prompt-inclusion assertions for FINDING_REMEDIATION_DEFINITION (`b283f409`)

**Status: FIXED**

`src/prompts/__tests__/fragment-coverage.test.ts` now contains a complete `describe("5 judge prompts contain FINDING_REMEDIATION_DEFINITION (TC-T04-03)")` block covering:
- CODE_REVIEW_SYSTEM_PROMPT
- SPEC_REVIEW_SYSTEM_PROMPT
- CONFORMANCE_SYSTEM_PROMPT
- REGRESSION_GATE_SYSTEM_PROMPT
- buildCustomReviewerSystemPrompt

All 5 prompts are guarded. Not a regression.

---

### [8] TC-T09-01 and TC-T09-02: no tests pin ledger-block all-site wording or system-prompt site-inheritance (`d022e4f1`)

**Status: FIXED**

`src/core/step/__tests__/regression-gate-step.test.ts` now contains:

- **TC-T09-01** (line 290): asserts `buildMessage` output contains "Sites がある entry は列挙された全 site で不変条件が成立しているかを確認する" when any entry has sites; asserts absence when no sites.
- **TC-T09-02** (line 324): asserts `REGRESSION_GATE_SYSTEM_PROMPT` contains "全 site を確認し、いずれかで不変条件が破れていれば退行として報告する" and sites-inheritance instruction.

Not a regression.

---

### [9] remediation の副 site が fixer の write-scope 判定を迂回する (`df8dbb78`)

**Status: FIXED**

`src/core/step/canon-escalation.ts` has been restructured. `isFindingWithinFixerWriteScope` (line 102) now checks both the primary `finding.file` and all `finding.remediation.sites` via `isFileWritableByFixer`. The old code that only examined `finding.file` (the original line 76 implementation) no longer exists. Not a regression.

---

### [10] remediation の副 site が no-op exemption に含まれない (`4cd3f496`)

**Status: FIXED**

`src/core/step/executor.ts` line 522–526:

```ts
findingTargetPaths: step.noOpDetect === true
  ? collectRoutedFixerFindings(state).flatMap((f) => [
      f.file,
      ...(f.remediation?.sites.map((s) => s.file) ?? []),
    ])
  : [],
```

Secondary sites from `remediation.sites` are now included in `findingTargetPaths`. Not a regression.

---

### [11] 主 file が非 canon だと保護正典の副 site が依然 routing を迂回する (`25583e04`)

**Status: FIXED**

`selectUnroutableCanonFindings` in `src/core/step/canon-escalation.ts` (lines 169–188) now has two paths:
- **With remediation**: delegates to `isFindingWithinFixerWriteScope` which checks ALL sites regardless of whether the primary file is canon.
- **Without remediation (legacy)**: only checks primary canon file (unchanged behavior).

The old early-return on `!scope.canonPaths.has(f.file)` for findings with remediation has been removed. Not a regression.

---

### [12] 非 canon の副 site は effective fixer の write scope 外でも routing を通過する (`42c4616f`)

**Status: FIXED**

`isFileWritableByFixer` (lines 71–83) now handles both cases:
- Canon path: writable only if in `writableByFixer[effectiveFixer]`.
- **Non-canon path**: writable only if fixer is in `broadWriteFixers` (or `DEFAULT_BROAD_WRITE_FIXERS`).

Non-canon sites outside the fixer's broad write scope are now correctly detected as unroutable. Not a regression.

---

### [13] conformance の target 集約後に全 finding を単一 fixer へ渡すため routing が一致しない (`7c1a612a`)

**Status: FIXED**

`deriveConformanceVerdict` in `src/core/step/judge-verdict.ts` (lines 185–191) now includes an R1b re-validation step:

```ts
if (canonScope) {
  const aggregatedResolver = (): FixTarget => target as FixTarget;
  if (selectUnroutableCanonFindings(findings, canonScope, aggregatedResolver).length > 0) {
    return "escalation";
  }
}
```

When the aggregated fixer cannot write all sites of any finding (e.g. spec-fixer selected but has a finding with `src/**` sites), the verdict is `"escalation"` rather than routing incorrectly. Not a regression.

---

## Conclusion

**Checked**: 13  
**Regressions**: 0  
**Contradictions**: 0
