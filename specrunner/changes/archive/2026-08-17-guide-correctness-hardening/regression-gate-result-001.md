# Regression Gate Result — guide-correctness-hardening — Iteration 1

## Verdict

No regressions. All 4 findings from the ledger are confirmed fixed.

---

## Finding-by-Finding Evidence

### [HIGH] Design D3: validateInvocation が space-joined compound args.name を処理できず false positive

**Status: FIXED**

`src/core/command/__tests__/guide.test.ts` line 896:
```typescript
const allowed = arg.name.split(/[| ]/);
```

The delimiter is `/[| ]/`, which splits both `|`-separated and space-separated compound names.

For `rules new <step-name> <rule-slug>` (inject topic):
- `argsSpec[0].name = "step-name rule-slug"` → `allowed = ["step-name", "rule-slug"]`
- `positionals[0] = "step-name"` → `allowed.includes("step-name")` = true → no violation
- `positionals[1] = "rule-slug"` → `argsSpec[1] = undefined` → `continue` → no violation

TC-032 will pass for inject topic. The false positive is eliminated.

---

### [LOW] tasks.md と test-cases.md の TC 番号体系が乖離

**Status: FIXED**

`specrunner/changes/guide-correctness-hardening/tasks.md` line 3:
```
> **TC 番号の正本は `test-cases.md`**。本ファイルの TC 番号(TC-022〜TC-030 等)は設計上の参照用グループ番号であり、
> `test-cases.md` が定義する個別 TC 番号(TC-022〜TC-040)が実装・コメントの正典となる。
> テストコードのコメントに TC 番号を記載する場合は `test-cases.md` を参照すること。
```

Implementers are now directed to use test-cases.md as the canonical TC number source.

---

### [LOW] clarification note の TC 範囲上限が TC-041 と誤記

**Status: FIXED**

tasks.md line 3 clarification note reads "TC-022〜TC-040" (correct upper bound).
tasks.md T-07 (line 397) reads "新規 TC-022〜TC-039 が全て green" (consistent with actual test count).
Neither mentions TC-041.

---

### [MEDIUM] TC-035・TC-036 が test-cases.md で automated/must と宣言されているが tasks.md にテストコードが存在しない

**Status: FIXED**

TC-035 test present at `guide.test.ts` lines 952–958:
```typescript
describe("TC-035: acceptance-and-issue-audit SKILL.md", () => {
  it("TC-035: acceptance-and-issue-audit SKILL.md has no parallel-request-workflow reference", () => {
    ...
    expect(content).not.toContain("parallel-request-workflow");
  });
});
```

TC-036 test present at `guide.test.ts` lines 964–973:
```typescript
describe("TC-036: ADR 実状態整合", () => {
  it("TC-036: ADR does not describe tombstone approach for parallel-request-workflow", () => {
    ...
    expect(content).not.toContain("tombstone を置いて実質削除する");
  });
});
```

Both tests are automated/must as declared in test-cases.md. CI will detect regressions for both.

---

## Summary

| # | Severity | Title | Status |
|---|----------|-------|--------|
| 1 | HIGH | validateInvocation space-joined compound args.name | FIXED |
| 2 | LOW | TC 番号体系乖離の説明不足 | FIXED |
| 3 | LOW | clarification note TC 範囲上限 TC-041 誤記 | FIXED |
| 4 | MEDIUM | TC-035/TC-036 テストコード不在 | FIXED |
