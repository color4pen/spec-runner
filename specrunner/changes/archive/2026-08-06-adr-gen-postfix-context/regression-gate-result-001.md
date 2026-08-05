# Regression Gate Result — Iteration 001

**Change**: adr-gen-postfix-context
**Date**: 2026-08-06

## Evidence Summary

All 4 findings from the review ledger are confirmed fixed. No regressions detected.

---

## Finding 1 — [LOW] T-05 が存在しないファイル prior-round-context.test.ts を fixture 参照として引用している

**Status**: FIXED ✓

**Evidence**:
- `tasks.md:79` now references `src/core/step/__tests__/prior-round-context.test.ts` (correct path)
- File confirmed present: `src/core/step/__tests__/prior-round-context.test.ts` exists in the worktree (`ls` output verified)
- The fixture reference is now accurate and navigable

---

## Finding 2 — [LOW] 要件1「全 round 分を含める」を検証する複数 round のシナリオが欠落している

**Status**: FIXED ✓

**Evidence**:
- `spec.md` lines 16–21 now contain:
  ```
  #### Scenario: 複数 fixer round の全件が post-fix ブロックに含まれる

  **Given** code-fixer の StepRun が 2 件以上あり、それぞれに commitOid が記録されている
  **And** `listCommitChangedFiles` が各 commit の changed files を返す（mock 経由）
  **When** システムが post-fix ブロックを構築する
  **Then** ブロックには全 round 分のエントリが含まれ、最新 round のみに限定されない
  ```
- MUST NOT 要件（最新 round のみに限定しない）が spec 層で明示的に契約化されている

---

## Finding 3 — [LOW] 「port 不在」Scenario が runtimeStrategy 自体の undefined ケースを明示していない

**Status**: FIXED ✓

**Evidence**:
- `spec.md` の `Scenario: listCommitChangedFiles port が不在（managed runtime 相当）` の Given 節が更新されている:
  ```
  **Given** `runtimeStrategy` 自体が undefined、または `runtimeStrategy.listCommitChangedFiles` が存在しない
  ```
- `runtimeStrategy` 自体が undefined のケースを明示的に含み、実装の optional chaining（`runtimeStrategy?.listCommitChangedFiles`）と整合している

---

## Finding 4 — [MEDIUM] TC-019 second sub-test is a permanent tautology

**Status**: FIXED ✓

**Evidence**:
- `tests/unit/core/step/adr-gen.test.ts:812–816` の第2サブテストが実際の検証に置き換えられている:
  ```typescript
  it("TC-019: ADR_GEN_SYSTEM_PROMPT contains the post-fix priority rule (GREEN — T-04 implemented)", () => {
    expect(ADR_GEN_SYSTEM_PROMPT.includes("最終実装が正")).toBe(true);
  });
  ```
- `expect(typeof ruleIsAbsent).toBe("boolean")` の恒真テストではなく、`ADR_GEN_SYSTEM_PROMPT.includes("最終実装が正")` を直接検証する形に変更されている
- システムプロンプトから「最終実装が正」の文言を削除すれば `false` が返り本テストが fail する — sabotage 検出の歯として機能している

---

## Regressions

なし。4 件の指摘すべてが現行コードで修正済みであることを確認した。
