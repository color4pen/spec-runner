# Regression Gate Result — rules-delivery (Iteration 1)

## Summary

7 findings checked. 5 fixed, 2 still present.

---

## Finding Verification

### [LOW] Finding 1: "frontmatter が本文から除去される" Scenario が delivery: prompt のみをカバー

**File**: specrunner/changes/rules-delivery/spec.md
**Status**: FIXED

spec.md now has two scenarios under "Requirement: rule ファイルの frontmatter で配送方式を宣言できる":
- `#### Scenario: frontmatter が本文から除去される（prompt 配送）`
- `#### Scenario: frontmatter が本文から除去される（followup 配送）`

Both delivery paths are covered.

---

### [LOW] Finding 2: D6 エラーメッセージに "step 名" を記述しているが実装制約上不可能

**File**: specrunner/changes/rules-delivery/design.md:1
**Status**: FIXED

design.md D6 currently reads:
> メッセージは不正値・許容値・本文冒頭行（locator）を含める。

No mention of "step 名". Implementation in `validateDelivery()` (rules-delivery.ts:100-108) matches:
```
`Unknown delivery value "${value}" (allowed: followup, prompt). Rule starts with: ${firstLine}`
```
Design and implementation are consistent.

---

### [HIGH] Finding 3: TC-008 統合テスト欠如 — buildStepContext の unknown delivery fail-fast が未固定

**File**: src/core/step/__tests__/step-context-builder.test.ts
**Status**: FIXED

TC-008 is implemented at lines 174-198:
```typescript
describe("TC-008: 未知 delivery 値で buildStepContext が throw する", () => {
  it("delivery: bogus の rule で buildStepContext が例外を投げ AgentRunContext を返さない", ...
  it("例外メッセージに不正値 bogus と許容値が含まれる", ...
```
Both: throws assertion and message content assertion are present.

---

### [MEDIUM] Finding 4: TC-006/TC-007 統合テスト欠如 — followup/未指定ルールの buildStepContext 配送経路が未固定

**File**: src/core/step/__tests__/step-context-builder.test.ts
**Status**: FIXED

TC-006 (lines 128-144): asserts frontmatter-less rule goes to `policy.postWorkPrompts`, `policy.promptRules` is undefined.
TC-007 (lines 150-168): asserts `delivery: followup` rule goes to `postWorkPrompts`, frontmatter stripped, `promptRules` undefined.

Both integration paths are now pinned.

---

### [HIGH] Finding 5: buildStepContext の「no exceptions」モジュールコメントが不変条件を偽に宣言している

**File**: src/core/step/step-context-builder.ts:5
**Status**: FIXED

Module header (lines 1-16) now reads:
> Contains NO control-flow early returns, no state mutations.
> All paths lead to a fully constructed AgentRunContext, EXCEPT when a rule
> file declares an unknown `delivery` value — in that case splitRulesByDelivery
> throws and the caller (executor.ts) catches it as a step-level error.

executor.ts line 312-313:
> // Build agent run context — pure assembly, no control flow.
> // NOTE: may throw when a rule file has an unknown delivery value (D6, rules-delivery).

Both comments correctly document the exception path.

---

### [LOW] Finding 6: splitFrontmatter が reviewers/definition.ts と重複実装されており規約変更時にドリフトが生じる

**File**: src/core/step/rules-delivery.ts:24
**Status**: STILL PRESENT

The `splitFrontmatter` function in rules-delivery.ts (lines 26-48) remains a separate implementation from `src/core/reviewers/definition.ts`. A NOTE comment was added (lines 18-19):
```
 * NOTE: the same frontmatter convention is also implemented in src/core/reviewers/definition.ts.
 * If the `---` delimiter convention changes, update both files.
```
The NOTE documents the risk but does not eliminate the duplication. Design D2 explicitly chose this trade-off. The underlying issue remains.

---

### [MEDIUM] Finding 7: managed adapter SSE path (runDesignStyle) ignores `promptRules` from port contract

**File**: src/adapter/managed-agent/agent-runner.ts:363
**Status**: STILL PRESENT

`streamWithPollingFallback` (lines 363-371), called exclusively by `runDesignStyle`, builds `effectiveRequestContentWithResume` without appending `ctx.policy.promptRules`:

```typescript
const effectiveRequestContentWithResume = ctx.session.resumePrompt
  ? `${effectiveRequestContent}\n\n<resume-context>\n${ctx.session.resumePrompt}\n</resume-context>`
  : effectiveRequestContent;

const sseResult = await this.sessionClient.streamEvents(sessionId, {
  requestContent: effectiveRequestContentWithResume, // promptRules absent
  ...
```

`runPollingStyle` (lines 629-631) correctly injects `promptRules`:
```typescript
if (ctx.policy?.promptRules) {
  initialMessage = `${initialMessage}\n\n${ctx.policy.promptRules}`;
```

The TC-017 test only exercises the polling path (step role `implementer`). The SSE path (`step.agent.role === "design"`) remains untested and non-injecting. If a `delivery: prompt` rule exists for the design step, `buildStepContext` will populate `ctx.policy.promptRules` correctly but `runDesignStyle` will silently discard it — no error, no injection.

---

## Verdict Input

- Findings still present: 2
  - [LOW] Finding 6 (splitFrontmatter duplication)
  - [MEDIUM] Finding 7 (managed SSE path ignores promptRules)
- Findings fixed: 5 (Findings 1–5)
