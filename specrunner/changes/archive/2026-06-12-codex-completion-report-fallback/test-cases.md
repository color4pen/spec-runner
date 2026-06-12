# Test Cases: codex-completion-report-fallback

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 8, should: 9, could: 2

---

### TC-001: Code-fenced JSON is recovered

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Robust JSON extraction from finalResponse > Scenario: code-fenced JSON is recovered

---

### TC-002: Text-prefixed JSON is recovered

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Robust JSON extraction from finalResponse > Scenario: text-prefixed JSON is recovered

---

### TC-003: Raw JSON (existing path) is unaffected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Robust JSON extraction from finalResponse > Scenario: raw JSON (existing path) is unaffected

---

### TC-004: Unrecoverable finalResponse returns null

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Robust JSON extraction from finalResponse > Scenario: unrecoverable finalResponse returns null

---

### TC-005: Schema-invalid JSON is rejected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Validation contract is not relaxed > Scenario: schema-invalid JSON is rejected

---

### TC-006: Retry turns do not receive outputSchema

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Schema-free follow-up retry turns > Scenario: retry turns do not receive outputSchema

---

### TC-007: Parse failure is logged

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Parse failure observability > Scenario: parse failure is logged

---

### TC-008: Fragment is truncated at 200 characters

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Parse failure observability > Scenario: fragment is truncated at 200 characters

---

### TC-009: All turns fail → toolResult null

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Fail-closed behavior preserved > Scenario: all turns fail → toolResult null

---

### TC-010: Code fence without language tag is recovered

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** a `finalResponse` of ` ```\n{"verdict":"approved","findingsPath":null}\n``` ` (no `json` language tag)
**WHEN** `tryExtractToolResult` is called with a matching `reportTool`
**THEN** `toolResult` is non-null and strategy 2 (code-fence) succeeds

---

### TC-011: Inline code fence is recovered

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** a `finalResponse` of ` ```json {"verdict":"approved","findingsPath":null} ``` ` (no newline between fence markers and content)
**WHEN** `tryExtractToolResult` is called with a matching `reportTool`
**THEN** `toolResult` is non-null

---

### TC-012: Trailing text does not block extraction (strategy 3)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** a `finalResponse` of `'{"verdict":"approved","findingsPath":null}\ntrailing text'`
**WHEN** `tryExtractToolResult` is called with a matching `reportTool`
**THEN** `toolResult` is non-null (bracket extraction strategy succeeds)

---

### TC-013: rawFragment ends with `…` when finalResponse exceeds 200 characters

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** a `finalResponse` that is plain prose longer than 200 characters and contains no valid JSON
**WHEN** `tryExtractToolResult` is called and returns `toolResult: null`
**THEN** `rawFragment` ends with `…` and its total length is ≤201 characters

---

### TC-014: `tryParseToolResult` is removed

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04

**GIVEN** the updated `agent-runner.ts` module
**WHEN** the module's exports are inspected
**THEN** `tryParseToolResult` is not exported (the symbol no longer exists in the file)

---

### TC-015: Main turn code-fenced JSON recovered — no retry turns executed

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** the main work turn returns a code-fenced completion report and `runFollowUpTurnWithRetry` is mocked
**WHEN** `CodexAgentRunner.run()` executes
**THEN** `result.toolResult` is non-null and `runFollowUpTurnWithRetry` is never called

---

### TC-016: Main turn unrecoverable, first retry recovers

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** the main work turn returns unrecoverable prose, and the first retry turn returns a code-fenced completion report
**WHEN** `CodexAgentRunner.run()` executes
**THEN** `result.toolResult` is non-null and `result.followUpAttempts` equals 1

---

### TC-017: Main work turn retains outputSchema

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `CodexAgentRunner` is configured with a `reportTool`
**WHEN** the main work `executeTurn` is invoked
**THEN** `runStreamed` (or equivalent) is called with a non-null `outputSchema` derived from `reportTool.zodSchema`

---

### TC-018: Retry prompt instructs plain JSON without outputSchema reference

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-03

**GIVEN** the `toolReportRetry` loop's updated retry prompt string
**WHEN** the prompt text is inspected
**THEN** the text does not contain `"出力スキーマ"` and does contain an instruction to return a plain JSON object without code fences

---

### TC-019: Successful extraction emits no diagnostic log

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** a `finalResponse` that contains a valid, schema-conformant JSON object
**WHEN** `tryExtractToolResult` returns a non-null `toolResult` and the call site processes the result
**THEN** `stderrWrite` is not called at that call site

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 8
should: 9
could: 2
blocked_reasons: []
```
