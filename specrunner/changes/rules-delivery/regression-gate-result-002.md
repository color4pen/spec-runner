# Regression Gate Result — Iteration 002

## Evidence

Checked all 7 findings from the ledger against the current branch (`change/rules-delivery-86f243f2`).

---

### Finding 1: [LOW] "frontmatter が本文から除去される" Scenario が delivery: prompt のみをカバー

**Status: FIXED**

`specrunner/changes/rules-delivery/spec.md` now contains two scenarios:
- Line 14: "Scenario: frontmatter が本文から除去される（prompt 配送）"
- Line 20: "Scenario: frontmatter が本文から除去される（followup 配送）"

Both prompt and followup delivery paths have frontmatter-removal coverage.

---

### Finding 2: [LOW] D6 エラーメッセージに "step 名" を記述しているが実装制約上不可能

**Status: FIXED**

`specrunner/changes/rules-delivery/design.md` D6 (line 130) reads:
```
- メッセージは不正値・許容値・本文冒頭行（locator）を含める。
```
"step 名" is not mentioned; only "本文冒頭行（locator）" is specified, which is consistent with the implementation in `rules-delivery.ts` and TC-027.

---

### Finding 3: [HIGH] TC-008 統合テスト欠如 — buildStepContext の unknown delivery fail-fast が未固定

**Status: FIXED**

`src/core/step/__tests__/step-context-builder.test.ts` lines 174–198 contain:
```
describe("TC-008: 未知 delivery 値で buildStepContext が throw する", () => {
  it("delivery: bogus の rule で buildStepContext が例外を投げ AgentRunContext を返さない", ...)
  it("例外メッセージに不正値 bogus と許容値が含まれる", ...)
})
```
Both `rejects.toThrow()` and `/bogus/` message assertions are present.

---

### Finding 4: [MEDIUM] TC-006/TC-007 統合テスト欠如 — followup/未指定ルールの buildStepContext 配送経路が未固定

**Status: FIXED**

`src/core/step/__tests__/step-context-builder.test.ts`:
- Lines 125–144: TC-006 — frontmatter-less rule goes to `postWorkPrompts`, `promptRules` is `undefined`
- Lines 150–168: TC-007 — `delivery: followup` rule goes to `postWorkPrompts` (with body, without frontmatter), `promptRules` is `undefined`

Both integration paths are now fixed by tests.

---

### Finding 5: [HIGH] buildStepContext の「no exceptions」モジュールコメントが不変条件を偽に宣言している

**Status: FIXED**

`src/core/step/step-context-builder.ts` lines 1–9 now reads:
```
 * Contains NO control-flow early returns, no state mutations.
 * All paths lead to a fully constructed AgentRunContext, EXCEPT when a rule
 * file declares an unknown `delivery` value — in that case splitRulesByDelivery
 * throws and the caller (executor.ts) catches it as a step-level error.
```

`src/core/step/executor.ts` line 312–313 now reads:
```
// Build agent run context — pure assembly, no control flow.
// NOTE: may throw when a rule file has an unknown delivery value (D6, rules-delivery).
```

Both the module comment and the call-site comment correctly describe the exception case.

---

### Finding 6: [LOW] splitFrontmatter が reviewers/definition.ts と重複実装されており規約変更時にドリフトが生じる

**Status: FIXED**

`src/core/step/rules-delivery.ts` lines 17–18 now contain:
```
 * NOTE: the same frontmatter convention is also implemented in src/core/reviewers/definition.ts.
 * If the `---` delimiter convention changes, update both files.
```

The co-maintenance requirement is explicitly documented, mitigating the drift risk as permitted by design D2.

---

### Finding 7: [MEDIUM] managed adapter SSE path (runDesignStyle) ignores `promptRules` from port contract

**Status: FIXED**

`src/adapter/managed-agent/agent-runner.ts` lines 369–372 (`streamWithPollingFallback`):
```typescript
// rules-delivery D4: inject promptRules after resume context (SSE path).
const effectiveRequestContentFinal = ctx.policy?.promptRules
  ? `${effectiveRequestContentWithResume}\n\n${ctx.policy.promptRules}`
  : effectiveRequestContentWithResume;
```

`src/adapter/managed-agent/__tests__/prompt-rules-injection.test.ts` TC-019 (lines 231–273) verifies that:
- `promptRules` appears in `streamEvents` `requestContent` after `resume-context`
- Absent `promptRules` leaves `streamEvents` content unchanged

Both the polling path (TC-017) and SSE path (TC-019) are now covered.

---

## Conclusion

All 7 findings from the ledger are fixed in the current code. No regressions detected.
