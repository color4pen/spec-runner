# Regression Gate Evidence Report — finding-remediation-contract / Iteration 1

## Summary

All 10 ledger findings were verified against the current branch (`feat/finding-remediation-contract-d394de74`). No regressions were found.

---

## Per-Finding Verification

### [1] `cf00c499` — spec-fixer system prompt 変更の Requirement が spec.md に欠けている

**File checked**: `specrunner/changes/finding-remediation-contract/spec.md`

**Verdict**: FIXED

`spec.md` now includes "Requirement: spec-fixer の「最小限」は全 site での不変条件成立を意味する" (lines 189–206) with two concrete Scenarios:
- "spec-fixer system prompt が全 site 成立を最小限の定義とする"
- "spec-fixer system prompt の入力記述が実際の受け渡しと一致する"

---

### [2] `91209b92` — TC-T04-03 が buildCustomReviewerSystemPrompt の containment 検証を含めていない

**File checked**: `specrunner/changes/finding-remediation-contract/test-cases.md` line 279

**Verdict**: FIXED

TC-T04-03 now reads:
> **Given** `buildCustomReviewerSystemPrompt(anyDef)` の戻り値 / `CODE_REVIEW_SYSTEM_PROMPT` / `SPEC_REVIEW_SYSTEM_PROMPT` / `CONFORMANCE_SYSTEM_PROMPT` / `REGRESSION_GATE_SYSTEM_PROMPT` の各文字列

`buildCustomReviewerSystemPrompt(anyDef)` has been prepended to the list, matching T-04 Acceptance Criteria.

---

### [3] `cd70aee8` — 非 strict モードで malformed remediation を持つ finding の silent-drop 挙動を確認する TC が欠如している

**File checked**: `specrunner/changes/finding-remediation-contract/test-cases.md` lines 138–146

**Verdict**: FIXED

TC-T03-03b has been added:
> **Given** persisted state から読み込んだ、不正形 remediation（例: `sites: []`）を持つ fixable finding の JSON  
> **When** `parseFindings(raw)` を引数なし（非 strict）で呼ぶ  
> **Then** parse が成功し、finding は採用されるが `finding.remediation` は設定されない（silent-drop）

This covers D3/T-03 — non-strict + malformed remediation → finding accepted, remediation silent-dropped.

---

### [4] `9a47e123` — TC-T10-01 reproduction fixture tests buildFindingsBlock, not CodeFixerStep.buildMessage

**File checked**: `src/core/port/__tests__/remediation-parse.test.ts` lines 498–569

**Verdict**: FIXED

The reproduction fixture now calls `CodeFixerStep.buildMessage!(state, deps)` (line 563) and asserts both sites appear in that output — end-to-end through `selectFixerTargetFindings`, `buildFindingsBlock`, and the wrapping template. The old `buildFindingsBlock` direct call is replaced.

---

### [5] `1862a489` — FINDING_REMEDIATION_DEFINITION scanning obligation omits 'same-check across abstraction layers'

**File checked**: `src/prompts/judge-rules.ts` line 129

**Verdict**: FIXED

Line 129 now reads:
> **走査義務**: finding を 1 つ構成したら、同じ不変条件を共有する隣接関数・並列経路・**同じ検査を行う別レイヤ**を走査し、成立していない箇所をすべて `sites` に列挙してください。

The phrase `・同じ検査を行う別レイヤ` (same-check different layer) has been added, completing the D8 obligation.

---

### [6] `df8dbb78` — remediation の副 site が fixer の write-scope 判定を迂回する

**File checked**: `src/core/step/canon-escalation.ts`

**Verdict**: FIXED

The file has been fully rewritten. `isFindingWithinFixerWriteScope` (lines 102–114) checks the primary file via `isFileWritableByFixer`, then iterates over `finding.remediation.sites` calling `isFileWritableByFixer` for each. Both `selectUnroutableCanonFindings` and `selectRoutableCanonFindings` now use this shared predicate for findings with remediation, so all secondary sites participate in write-scope determination.

---

### [7] `4cd3f496` — remediation の副 site が no-op exemption に含まれない

**File checked**: `src/core/step/executor.ts` lines 522–527

**Verdict**: FIXED

`findingTargetPaths` now uses:
```typescript
collectRoutedFixerFindings(state).flatMap((f) => [
  f.file,
  ...(f.remediation?.sites.map((s) => s.file) ?? []),
])
```
Secondary sites (`f.remediation?.sites`) are now included in the no-op exemption paths, preventing a legitimate multi-site fix from being mis-classified as no-op.

---

### [8] `25583e04` — 主 file が非 canon だと保護正典の副 site が依然 routing を迂回する

**File checked**: `src/core/step/canon-escalation.ts`

**Verdict**: FIXED

`isFileWritableByFixer` checks non-canon paths via `broadWriteFixers` (lines 80–82). `isFindingWithinFixerWriteScope` first checks the primary file (regardless of whether it is canon), then all remediation sites. If the primary file is non-canon, it goes through the `broadWriteFixers` path rather than returning `false` early; secondary canon sites are then independently checked via `writableByFixer`. The early-return-before-remediation-check bug is eliminated.

---

### [9] `42c4616f` — 非 canon の副 site は effective fixer の write scope 外でも routing を通過する

**File checked**: `src/core/step/canon-escalation.ts`

**Verdict**: FIXED

`isFileWritableByFixer` now handles non-canon paths explicitly (lines 80–82):
```typescript
const broad = scope.broadWriteFixers ?? DEFAULT_BROAD_WRITE_FIXERS;
return broad.has(effectiveFixer);
```
Non-canon secondary sites that are outside the effective fixer's `broadWriteFixers` set now return `false` (unwritable), causing the finding to be classified as unroutable. The previous omission of non-canon site validation is resolved.

---

### [10] `7c1a612a` — conformance の target 集約後に全 finding を単一 fixer へ渡すため、site 単位の scope 判定と実際の routing が一致しない

**File checked**: `src/core/step/judge-verdict.ts` lines 178–193

**Verdict**: FIXED

After `aggregateFixTarget` is called, `deriveConformanceVerdict` now performs a second pass (R1b):
```typescript
if (canonScope) {
  const aggregatedResolver = (): FixTarget => target as FixTarget;
  if (selectUnroutableCanonFindings(findings, canonScope, aggregatedResolver).length > 0) {
    return "escalation";
  }
}
```
If any finding's sites cannot be written by the aggregated fixer (e.g., `spec-fixer` selected but findings include `src/**` sites), the verdict becomes `escalation` rather than routing an inconsistent set to an incapable fixer.

---

## Evidence Summary

| # | Ref | Severity | Status |
|---|-----|----------|--------|
| 1 | `cf00c499` | MEDIUM | Fixed |
| 2 | `91209b92` | LOW | Fixed |
| 3 | `cd70aee8` | LOW | Fixed |
| 4 | `9a47e123` | LOW | Fixed |
| 5 | `1862a489` | LOW | Fixed |
| 6 | `df8dbb78` | HIGH | Fixed |
| 7 | `4cd3f496` | MEDIUM | Fixed |
| 8 | `25583e04` | HIGH | Fixed |
| 9 | `42c4616f` | HIGH | Fixed |
| 10 | `7c1a612a` | HIGH | Fixed |

**Regressions detected**: 0  
**Checked**: 10  
**Skipped**: 0  
**Unverified**: 0
