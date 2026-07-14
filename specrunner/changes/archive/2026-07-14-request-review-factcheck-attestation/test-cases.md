# Test Cases: request-review fact-check attestation

## Summary

- **Total**: 44 cases
- **Automated** (unit/integration): 42
- **Manual**: 2
- **Priority**: must: 32, should: 11, could: 1

---

## Scenario 由来 TC（spec.md）

### TC-001: attestation is produced after request-review runs

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: request-review emits a fact-check attestation artifact > Scenario: attestation is produced after request-review runs

### TC-002: attestation is a file artifact, not state

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review emits a fact-check attestation artifact > Scenario: attestation is a file artifact, not state

### TC-003: hash match skips recorded assertions

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design skips re-verifying recorded assertions when the attestation is valid > Scenario: hash match skips recorded assertions

### TC-004: hash mismatch falls back to full re-verification

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design re-verifies all assertions when the attestation is stale or absent > Scenario: hash mismatch falls back to full re-verification

### TC-005: absent attestation falls back to full re-verification

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design re-verifies all assertions when the attestation is stale or absent > Scenario: absent attestation falls back to full re-verification

### TC-006: verdict and stop behavior are preserved

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the attestation does not change verdict or stop outcomes > Scenario: verdict and stop behavior are preserved

### TC-007: bad attestation fails safe

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the attestation does not change verdict or stop outcomes > Scenario: a bad attestation fails safe

---

## 非 Scenario 由来 TC（tasks.md / design.md）

### TC-008: factCheckAttestationPath returns correct path

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** `factCheckAttestationPath` is called with slug `"foo"`
**WHEN** the function executes
**THEN** the return value is `"specrunner/changes/foo/request-review-attestation.json"`

---

### TC-009: hashRequestContent is deterministic for identical input

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** the same string is passed to `hashRequestContent` twice
**WHEN** both calls complete
**THEN** both return values are identical

---

### TC-010: hashRequestContent produces different output for different input

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** two distinct strings `"content-a"` and `"content-b"`
**WHEN** each is passed to `hashRequestContent`
**THEN** the two return values are not equal

---

### TC-011: hashRequestContent output is prefixed with "sha256:"

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 (hashRequestContent returns `"sha256:" + hex`)

**GIVEN** any non-empty string is passed to `hashRequestContent`
**WHEN** the function executes
**THEN** the return value starts with `"sha256:"`

---

### TC-012: buildFactCheckAttestation produces the expected shape

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `requestContent = "some request"` and `verifiedAssertions = ["src/foo.ts:10", "Bar"]`
**WHEN** `buildFactCheckAttestation(requestContent, verifiedAssertions)` is called
**THEN** the result has `requestHash = hashRequestContent(requestContent)`, `codeAssertionsVerified = true`, and `verifiedAssertions` equal to the provided array

---

### TC-013: parseFactCheckAttestation parses a valid JSON attestation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** a JSON string representing a well-formed `FactCheckAttestation`
**WHEN** `parseFactCheckAttestation` is called with that string
**THEN** it returns an object with the correct `requestHash`, `codeAssertionsVerified`, and `verifiedAssertions` values

---

### TC-014: parseFactCheckAttestation returns null on malformed JSON

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** a string that is not valid JSON (e.g. `"not json {"`)
**WHEN** `parseFactCheckAttestation` is called with that string
**THEN** it returns `null` without throwing

---

### TC-015: parseFactCheckAttestation returns null when required fields are missing

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** a valid JSON object that omits one or more of `requestHash`, `codeAssertionsVerified`, `verifiedAssertions`
**WHEN** `parseFactCheckAttestation` is called with the serialised form
**THEN** it returns `null`

---

### TC-016: parseFactCheckAttestation returns null when required fields have wrong types

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** a JSON object where `requestHash` is a number, `codeAssertionsVerified` is a string, or `verifiedAssertions` is not an array
**WHEN** `parseFactCheckAttestation` is called
**THEN** it returns `null`

---

### TC-017: evaluateFactCheckAttestation returns "valid" when parsed, flag true, hash matches

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** an attestation JSON whose `requestHash` equals `hashRequestContent(currentContent)` and `codeAssertionsVerified` is `true`
**WHEN** `evaluateFactCheckAttestation(attestationJson, currentContent)` is called
**THEN** the result is `{ status: "valid", verifiedAssertions: <the recorded list> }`

---

### TC-018: evaluateFactCheckAttestation returns "stale" on hash mismatch

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** a valid parseable attestation whose `requestHash` was computed from a different content string
**WHEN** `evaluateFactCheckAttestation(attestationJson, currentContent)` is called where `currentContent` differs
**THEN** the result is `{ status: "stale", verifiedAssertions: [] }`

---

### TC-019: evaluateFactCheckAttestation returns "stale" when codeAssertionsVerified is false

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** a parseable attestation with matching hash but `codeAssertionsVerified: false`
**WHEN** `evaluateFactCheckAttestation` is called
**THEN** the result is `{ status: "stale", verifiedAssertions: [] }`

---

### TC-020: evaluateFactCheckAttestation returns "absent" when input is null

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** `null` is passed as the attestation raw string
**WHEN** `evaluateFactCheckAttestation(null, anyContent)` is called
**THEN** the result is `{ status: "absent", verifiedAssertions: [] }`

---

### TC-021: evaluateFactCheckAttestation returns "absent" when input is unparseable

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** an unparseable non-null string (e.g. `"garbage"`) is passed as the attestation raw string
**WHEN** `evaluateFactCheckAttestation` is called
**THEN** the result is `{ status: "absent", verifiedAssertions: [] }`

---

### TC-022: buildFactCheckDirective for "valid" includes skip instruction

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** an `AttestationEvaluation` with `status: "valid"` and a non-empty `verifiedAssertions` list
**WHEN** `buildFactCheckDirective(evaluation)` is called
**THEN** the returned string instructs skipping re-verification of the listed assertions and verifying only in-scope assertions not in the list

---

### TC-023: buildFactCheckDirective for "stale" and "absent" includes verify-all instruction

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** an `AttestationEvaluation` with `status: "stale"` or `status: "absent"`
**WHEN** `buildFactCheckDirective(evaluation)` is called
**THEN** the returned string instructs verifying all in-scope current-code assertions as usual

---

### TC-024: src/util/paths.ts retains zero imports from other src/ modules

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** `factCheckAttestationPath` is added to `src/util/paths.ts`
**WHEN** the file's import declarations are inspected
**THEN** no import resolves to another module under `src/` (the file remains dependency-free)

---

### TC-025: DynamicContext new optional fields exist and default to undefined

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `collectDynamicContext` is called without any attestation-related input
**WHEN** the returned `DynamicContext` is inspected
**THEN** `requestContentHash` and `factCheckAttestation` are both `undefined`, and no existing field is affected

---

### TC-026: RequestReviewStep.writes() includes attestation path with verify:false

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** a `RequestReviewStep` instance with a known `slug`
**WHEN** `writes()` is called
**THEN** the returned list includes an entry whose `path` equals `factCheckAttestationPath(slug)` and whose `verify` is `false`

---

### TC-027: RequestReviewStep.enrichContext computes sha256 hash from readable request.md

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** a temp directory containing a `request.md` file with known content
**WHEN** `RequestReviewStep.enrichContext(dynamicContext, tmpDir, slug)` is called
**THEN** the returned context's `requestContentHash` equals `hashRequestContent(<file content>)`

---

### TC-028: RequestReviewStep.enrichContext returns unchanged context when request.md is unreadable

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** a directory where `request.md` does not exist (read will throw)
**WHEN** `RequestReviewStep.enrichContext(dynamicContext, dir, slug)` is called
**THEN** the returned context is reference-equal to or structurally identical to the input `dynamicContext`, with no `requestContentHash` added

---

### TC-029: buildRequestReviewInitialMessage with hash includes attestation write instruction

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** `buildRequestReviewInitialMessage` is called with a non-null `requestContentHash` value
**WHEN** the message is produced
**THEN** it contains the attestation file path (`request-review-attestation.json`), the exact hash string, and an instruction to write the attestation after Step 2

---

### TC-030: buildRequestReviewInitialMessage without hash omits attestation instruction

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** `buildRequestReviewInitialMessage` is called with no `requestContentHash` (managed degradation)
**WHEN** the message is produced
**THEN** no attestation write instruction appears in the message

---

### TC-031: REQUEST_REVIEW_SYSTEM_PROMPT includes attestation output description

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` (the `REQUEST_REVIEW_BASE` constant) is inspected
**WHEN** its text content is checked
**THEN** it contains a subsection describing the attestation output, its JSON shape, the requirement to copy `requestHash` verbatim, and that attestation does not affect the verdict

---

### TC-032: REQUEST_REVIEW_SYSTEM_PROMPT retains all previously-asserted substrings

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** the modified `REQUEST_REVIEW_BASE` constant
**WHEN** existing prompt-substring assertions in the test suite are executed (e.g. assertions for `"Code Assertion Fact-Check"`)
**THEN** all previously-passing substring assertions remain green without modification

---

### TC-033: RequestReviewReportResult schema is unchanged

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria ("No change to the report-tool schema or RequestReviewReportResult")

**GIVEN** the `RequestReviewReportResult` type and report-tool schema before and after the change
**WHEN** the two are compared structurally
**THEN** no field has been added, removed, or renamed on the report-tool schema

---

### TC-034: DesignStep.enrichContext returns "valid" status with recorded assertions on hash match

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > Acceptance Criteria

**GIVEN** a temp change folder containing an `request-review-attestation.json` whose `requestHash` matches the hash of the current `request.md`
**WHEN** `DesignStep.enrichContext(dynamicContext, tmpDir, slug)` is called
**THEN** the returned context has `factCheckAttestation.status === "valid"` and `factCheckAttestation.verifiedAssertions` equal to the attestation's recorded list

---

### TC-035: DesignStep.enrichContext returns "stale" when hash does not match

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > Acceptance Criteria

**GIVEN** a temp change folder containing an attestation whose `requestHash` was computed from different content than the current `request.md`
**WHEN** `DesignStep.enrichContext` is called
**THEN** the returned context has `factCheckAttestation.status === "stale"` and `verifiedAssertions: []`

---

### TC-036: DesignStep.enrichContext returns "absent" when no attestation file exists

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > Acceptance Criteria

**GIVEN** a temp change folder that contains `request.md` but no `request-review-attestation.json`
**WHEN** `DesignStep.enrichContext` is called
**THEN** the returned context has `factCheckAttestation.status === "absent"` and `verifiedAssertions: []`

---

### TC-037: buildInitialMessage includes skip directive when status is "valid"

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > Acceptance Criteria

**GIVEN** `dynamicContext.factCheckAttestation` has `status: "valid"` and a non-empty `verifiedAssertions` list
**WHEN** `buildInitialMessage(deps, dynamicContext, ...)` is called for the design step
**THEN** the produced message contains a directive to skip re-verifying the listed assertions and to verify only unlisted in-scope assertions

---

### TC-038: buildInitialMessage includes verify-all directive when status is "stale"

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > Acceptance Criteria

**GIVEN** `dynamicContext.factCheckAttestation` has `status: "stale"`
**WHEN** `buildInitialMessage` is called for the design step
**THEN** the produced message contains a directive to verify all in-scope current-code assertions as usual

---

### TC-039: buildInitialMessage includes verify-all directive when status is "absent"

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 > Acceptance Criteria

**GIVEN** `dynamicContext.factCheckAttestation` has `status: "absent"`
**WHEN** `buildInitialMessage` is called for the design step
**THEN** the produced message contains a directive to verify all in-scope current-code assertions as usual

---

### TC-040: buildInitialMessage is unchanged when factCheckAttestation is absent from context

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 > Acceptance Criteria (managed degradation path); design.md > D7

**GIVEN** `dynamicContext` has no `factCheckAttestation` field (undefined)
**WHEN** `buildInitialMessage` is called for the design step
**THEN** the produced message is identical to the message produced before this change was introduced (no attestation-related text injected)

---

### TC-041: DESIGN_SYSTEM_PROMPT includes attestation-aware verification guidance

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 > Acceptance Criteria

**GIVEN** the modified `DESIGN_BASE` constant
**WHEN** its "現状コード断定の検証" section is inspected
**THEN** it describes the MAY-skip behaviour when a valid directive is present and the verify-all behaviour when the directive marks stale/absent or is absent

---

### TC-042: DESIGN_SYSTEM_PROMPT retains all previously-asserted substrings

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > Acceptance Criteria

**GIVEN** the modified `DESIGN_BASE` constant
**WHEN** existing prompt-substring assertions in the test suite are executed
**THEN** all previously-passing substring assertions remain green without modification

---

### TC-043: typecheck && test passes after all changes

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 > Acceptance Criteria

**GIVEN** all T-01 through T-05 tasks are implemented
**WHEN** `typecheck && test` is executed at the repo root
**THEN** both commands exit with code 0 and no errors

---

### TC-044: no pre-existing test file was modified

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 > Acceptance Criteria; request.md > 受け入れ基準

**GIVEN** the full set of changes introduced by this request
**WHEN** the diff of all files under `tests/` is inspected on the feature branch
**THEN** no pre-existing test file has been altered — only newly added test files are present in the diff

---

## Result

```yaml
result: completed
total: 44
automated: 42
manual: 2
must: 32
should: 11
could: 1
blocked_reasons: []
```
