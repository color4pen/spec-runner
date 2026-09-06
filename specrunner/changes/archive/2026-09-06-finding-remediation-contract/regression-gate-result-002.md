# Regression Gate Result — finding-remediation-contract · Iteration 2

## Evidence Summary

| Item | Checked | Status |
|------|---------|--------|
| Ledger findings | 11 | All verified |
| Regressions detected | 0 | — |

---

## Finding-by-Finding Verification

### [1] `cf00c499` · MEDIUM — spec-fixer system prompt 変更の Requirement が spec.md に欠けている

**Verification**: `specrunner/changes/finding-remediation-contract/spec.md` lines 189–206 に新たな Requirement「spec-fixer の「最小限」は全 site での不変条件成立を意味する」が追加されている。Scenario が 2 件（全 site 成立定義・入力記述の一致）設けられており、T-08 の変更をカバーしている。

**Status**: ✅ Fixed (no regression)

---

### [2] `91209b92` · LOW — TC-T04-03 が buildCustomReviewerSystemPrompt の containment 検証を含めていない

**Verification**: `specrunner/changes/finding-remediation-contract/test-cases.md` line 279 の TC-T04-03 の Given 句に `buildCustomReviewerSystemPrompt(anyDef)` が先頭で列挙されている。また `src/prompts/__tests__/fragment-coverage.test.ts` line 330/382 に `buildCustomReviewerSystemPrompt()` が containment テーブルに追加されている。

**Status**: ✅ Fixed (no regression)

---

### [3] `cd70aee8` · LOW — 非 strict モードで malformed remediation を持つ finding の silent-drop 挙動を確認する TC が欠如している

**Verification**: `specrunner/changes/finding-remediation-contract/test-cases.md` lines 138–145 に TC-T03-03b が追加されている（non-strict + `sites: []` malformed remediation → finding 採用 + remediation silent-drop）。実装側は `src/core/port/__tests__/remediation-parse.test.ts` line 198 に "malformed remediation (non-strict) → silent drop, finding kept" テストが存在する。

**Status**: ✅ Fixed (no regression)

---

### [4] `9a47e123` · LOW — TC-T10-01 reproduction fixture tests buildFindingsBlock, not CodeFixerStep.buildMessage

**Verification**: `src/core/port/__tests__/remediation-parse.test.ts` lines 498–568 の reproduction fixture は `CodeFixerStep.buildMessage!(state, deps)` を呼び出し（line 563）、両 site（`src/core/step/commit-push.ts`, `src/core/pipeline/parallel-review-round.ts`）が同時に現れることを assert している。`buildFindingsBlock` 直呼びではない。

**Status**: ✅ Fixed (no regression)

---

### [5] `1862a489` · LOW — FINDING_REMEDIATION_DEFINITION scanning obligation omits 'same-check across abstraction layers' category from design D8

**Verification**: `src/prompts/judge-rules.ts` line 129 の走査義務文に「同じ検査を行う別レイヤ」が追加されており、「隣接関数・並列経路・同じ検査を行う別レイヤ」の三カテゴリが揃っている。

**Status**: ✅ Fixed (no regression)

---

### [6] `1fc754d8` · LOW — TC-T04-04 companion test for three-category scanning phrase is absent

**Verification**: `src/prompts/__tests__/fragment-coverage.test.ts` lines 260–273 に TC-T04-04 として "contains '同じ検査を行う別レイヤ' (third scanning category)" テストが存在し、`FINDING_REMEDIATION_DEFINITION` に三カテゴリ句が含まれることを assert している。

**Status**: ✅ Fixed (no regression)

---

### [7] `df8dbb78` · HIGH — remediation の副 site が fixer の write-scope 判定を迂回する

**Verification**: `src/core/step/canon-escalation.ts` lines 71–113 に `isFileWritableByFixer` と `isFindingWithinFixerWriteScope` が追加された。`selectUnroutableCanonFindings`（line 169–188）は remediation を持つ finding に対して `isFindingWithinFixerWriteScope` を使い、主 file + 全 remediation sites を一括で検査する。副 site が write-scope 外であれば escalation に倒す。

**Status**: ✅ Fixed (no regression)

---

### [8] `4cd3f496` · MEDIUM — remediation の副 site が no-op exemption に含まれない

**Verification**: `src/core/step/executor.ts` lines 524–526 で `findingTargetPaths` の構築に `...(f.remediation?.sites.map((s) => s.file) ?? [])` が追加されており、副 site の artifact を修正した run が no-op と誤判定されなくなった。

**Status**: ✅ Fixed (no regression)

---

### [9] `25583e04` · HIGH — 主 file が非 canon だと保護正典の副 site が依然 routing を迂回する

**Verification**: `src/core/step/canon-escalation.ts` lines 178–180 の remediation path は `isFindingWithinFixerWriteScope` を使う。この関数は主 file の canon 判定に関わらず全 sites を走査するため、主 file が非 canon でも remediation に canon 副 site が含まれていれば正しく escalation に倒す。`false` 早期リターンのバグは解消されている。

**Status**: ✅ Fixed (no regression)

---

### [10] `42c4616f` · HIGH — 非 canon の副 site は effective fixer の write scope 外でも routing を通過する

**Verification**: `src/core/step/canon-escalation.ts` lines 76–83 の `isFileWritableByFixer` は非 canon path に対して `broadWriteFixers`（デフォルト: `code-fixer`, `implementer`）に fixer が含まれているかを検査する。spec-fixer など broad write 対象外の fixer は非 canon 副 site でも unroutable と判定され、escalation が発動する。

**Status**: ✅ Fixed (no regression)

---

### [11] `7c1a812a` · HIGH — conformance の target 集約後に全 finding を単一 fixer へ渡すため、site 単位の scope 判定と実際の routing が一致しない

**Verification**: `src/core/step/judge-verdict.ts` lines 186–191 に R1b チェックが追加されている。`aggregateFixTarget` で単一 fixer に畳んだ後、`selectUnroutableCanonFindings(findings, canonScope, aggregatedResolver)` で全 finding を集約後の fixer で再検証し、いずれかが unroutable であれば escalation を返す。テストは `tests/unit/core/step/judge-verdict-conformance.test.ts` TC-JVCONF-10/11 でカバーされている。

**Status**: ✅ Fixed (no regression)

---

## Conclusion

11 件全ての ledger finding について修正が確認された。回帰なし。
