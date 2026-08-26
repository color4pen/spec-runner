# Conformance Result — codex-scope-guidance — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

---

## 検証した項目

### REQ-1: Codex adapter injects scope discipline guidance into every main work turn prompt

`src/adapter/codex/scope-guidance.ts` exports `CODEX_SCOPE_GUIDANCE` as the verbatim 8-line block
(header + blank + 6 bullets) matching spec.md exactly. In `src/adapter/codex/agent-runner.ts` (lines 431–437),
`const scopeGuidanceSection = \`\n\n${CODEX_SCOPE_GUIDANCE}\`` is defined unconditionally and concatenated
into `fullPrompt` for both the reportTool-present and reportTool-absent code paths:

```typescript
const fullPrompt = reportTool
  ? `${baseFullPrompt}${promptRulesSection}${scopeGuidanceSection}\n\n${buildMainTurnCompletionInstruction()}`
  : `${baseFullPrompt}${promptRulesSection}${scopeGuidanceSection}`;
```

No branching on step name, reviewer name, request type, promptRules presence, artifact presence,
touched-files presence, or resume context — injection is unconditional as required.

Scenarios verified:
- **TC-001** (reviewer step `custom-reviewer`): `scope-guidance-injection.test.ts` — `toContain(CODEX_SCOPE_GUIDANCE)` ✓
- **TC-002** (producer step `implementer`): same file — `toContain` ✓
- **TC-003** (no reportTool, no promptRules): guidance present, `COMPLETION_REPORT_MEANS` absent ✓
- **TC-004** (session resumed): guidance + resume context both present ✓
- **TC-014** (reportTool set, no promptRules): guidance before completion instruction ✓

---

### REQ-2: Guidance positioned after project rules and before the completion report instruction

Prompt concatenation order in `agent-runner.ts`:
`baseFullPrompt → promptRulesSection → scopeGuidanceSection → buildMainTurnCompletionInstruction()`

Scenarios verified:
- **TC-005** (`prompt-rules + reportTool`): index comparison asserts
  `indexOf(promptRules) < indexOf(CODEX_SCOPE_GUIDANCE) < indexOf(buildMainTurnCompletionInstruction())` ✓
- **TC-006 / TC-015** (no reportTool, no promptRules, no artifacts, no resume): byte-identical
  `toBe(\`${BASE_MESSAGE}\n\n${additionalInstructions}\n\n${CODEX_SCOPE_GUIDANCE}\`)` in
  `artifact-bundle-injection.test.ts` — guidance is tail of prompt with no other section present ✓
- **Existing TC-018** (`prompt-rules-injection.test.ts`): ordering invariant
  `resumeIdx < rulesIdx < completionIdx` still holds because guidance sits between `rulesIdx` and
  `completionIdx`, not violating the inequality. File unchanged (confirmed by git diff). ✓

---

### REQ-3: Follow-up turns do not repeat the guidance

`buildCompletionRetryPrompt` (in `completion-report-prompt.ts`) is the only source of retry-turn
prompts, and does not reference `CODEX_SCOPE_GUIDANCE`. Post-work and output-verification
repair turns use `ctx.policy.postWorkPrompts` / `outputVerif.buildPrompt()`, neither of which
receives `CODEX_SCOPE_GUIDANCE`.

Scenario verified:
- **TC-007**: first call (main turn) contains guidance; second call (completion retry) does not ✓

---

### REQ-4: Non-Codex providers are unaffected by the guidance

`git diff main...HEAD` shows zero changes to:
- `src/adapter/shared/` (shared prompt builder)
- `src/adapter/claude-code/`
- `src/adapter/managed-agent/`
- `src/prompts/`
- `src/core/`

Scenarios verified:
- **TC-008**: source-scan guard in `scope-guidance-provider-isolation.test.ts` checks every non-test
  `.ts` file outside `src/adapter/codex/` for `CODEX_SCOPE_GUIDANCE`, `scope-guidance`, and
  `SpecRunner execution guidance:` — 5 tests, all green ✓
- **TC-009**: `buildAdditionalInstructions` and `buildResumeSection` return values contain no
  guidance markers — verified with `not.toContain` on all three FORBIDDEN_MARKERS ✓

---

### REQ-5: The guidance is a single-source adapter-local constant

`src/adapter/codex/scope-guidance.ts`:
- No `import` / `require` statements (pure constant module) — TC-012 guard test verifies this ✓
- Exports exactly one symbol: `CODEX_SCOPE_GUIDANCE` ✓
- Value matches canonical spec.md text character-for-character — TC-013 extracts from spec.md at
  runtime and uses `toBe` strict equality ✓

All test files import from `../scope-guidance.js` (or `src/adapter/codex/scope-guidance.js`);
none re-state the guidance text as an inline literal — TC-010 satisfied ✓

No pipeline or reviewer files changed:
- `src/core/pipeline/` — no diff ✓
- `specrunner/reviewers/` — no diff ✓
- `src/core/port/agent-runner.ts` — no provider guidance fields (TC-016 guard test green) ✓

---

### Acceptance Criteria (request.md)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Codex adapter prompt に guidance が含まれることが unit test で固定 | ✓ | scope-guidance-injection.test.ts (7 tests green), isolation test (5 tests green) |
| Claude provider の prompt 組み立てに変更なし | ✓ | git diff: 0 changes in `src/adapter/claude-code/` and `src/adapter/shared/` |
| 新しい provider config protocol / pipeline abstraction なし | ✓ | No changes to `src/core/port/agent-runner.ts` or pipeline files; TC-016 guard green |
| pipeline transition / convergence budget / maxIterations / `specrunner/reviewers/*.md` に diff なし | ✓ | git diff: 0 changes in prohibited paths |
| typecheck / test / architecture tests が green | ✓ | Verification: build ✓, typecheck ✓, test ✓ (97.2s), lint ✓ |

---

### TC-015 Byte-Identity Baselines (D5)

Both previously byte-identical tests updated to `toBe` strict equality including `CODEX_SCOPE_GUIDANCE`:

- `resume-prompt-injection.test.ts:167`:
  `toBe(\`${baseMessage}\n\n${additionalInstructions}\n\n${CODEX_SCOPE_GUIDANCE}\`)` — imports constant, no literal ✓
- `artifact-bundle-injection.test.ts:175`:
  `toBe(\`${BASE_MESSAGE}\n\n${additionalInstructions}\n\n${CODEX_SCOPE_GUIDANCE}\`)` — imports constant, no literal ✓

Both use `toBe` (strict equality) rather than being relaxed to `toContain`. ✓

`touched-files-injection.test.ts` and `prompt-rules-injection.test.ts` are unchanged (confirmed by
git diff), consistent with design D5 expectation. ✓

---

### Changed File Scope (TC-018 / TC-019)

**Changed source files** (outside change folder):
```
src/adapter/codex/scope-guidance.ts                                 (new)
src/adapter/codex/agent-runner.ts                                   (modified)
src/adapter/codex/__tests__/scope-guidance-injection.test.ts        (new)
src/adapter/codex/__tests__/resume-prompt-injection.test.ts         (modified)
src/adapter/codex/__tests__/artifact-bundle-injection.test.ts       (modified)
tests/adapter/codex/scope-guidance-provider-isolation.test.ts       (new)
```

All within the allowed set specified in tasks.md T-06. No file outside this set was modified.
Prohibited areas (`src/core/pipeline/`, `specrunner/reviewers/`, `.specrunner/config.json`,
`src/adapter/shared/`, `src/adapter/claude-code/`, `src/adapter/managed-agent/`, `src/prompts/`,
`src/core/`) have zero diff entries. ✓

---

## 検証できなかった項目

None.

All normative requirements from spec.md and all acceptance criteria from request.md were verified
through static source review, git diff inspection, and confirmed test results from verification-result.md.

---

## Findings 詳細

None.
