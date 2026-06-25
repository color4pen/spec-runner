# Spec: findings-parse-soundness

## Requirements

### Requirement: `parseFindings` SHALL treat `line: null` as equivalent to `line` absent

The `parseFindings` function in `src/core/port/report-result.ts` MUST NOT return `{ ok: false }` when a finding contains `line: null`. It SHALL treat `line: null` identically to omitting the `line` field — the finding is retained and the `line` property is not set on the returned `Finding` object.

#### Scenario: single finding with `line: null` is retained

**Given** a findings array with one element where `line` is `null` and all other required fields are valid
**When** `parseFindings` is called with that array
**Then** the result is `{ ok: true, value: [<finding without line field>] }`

#### Scenario: mixed findings array with one null-line entry

**Given** a findings array where the first finding has `line: 3` and the second has `line: null`
**When** `parseFindings` is called
**Then** both findings are retained; the first has `line: 3`, the second has no `line` field

#### Scenario: non-null non-number `line` is still rejected

**Given** a findings array where a finding has `line: "five"` (a string)
**When** `parseFindings` is called
**Then** the result is `{ ok: false }`

---

### Requirement: `parseFindings` and `parseObservations` SHALL be symmetric on `line` acceptance

Both `parseFindings` and `parseObservations` MUST apply identical acceptance rules for the `line` field. Specifically: absent, `undefined`, `null`, and `number` are all accepted (finding/observation retained with `line` set only when a number); any other type is rejected.

#### Scenario: `parseFindings` and `parseObservations` accept the same set of `line` values

**Given** the same set of `line` values: `null`, `5`, absent, `undefined`
**When** each is tested against both `parseFindings` and `parseObservations`
**Then** both functions return `{ ok: true }` for all four cases

---

### Requirement: codex runtime SHALL parse findings with `line: null` without null-stripping preprocessing

After the kernel parser normalization, the codex adapter MUST NOT apply `stripNullDeep` before calling `parseInput`. The findings parse path for codex and local/managed runtimes SHALL be identical.

#### Scenario: codex `tryExtractToolResult` with `line: null` in findings

**Given** a JSON completion response containing a findings array with `line: null` on one finding
**When** `tryExtractToolResult` is called (without `stripNullDeep` in the call path)
**Then** `toolResult` is non-null and the findings are preserved

---

### Requirement: managed `verifyFindingRefs` SHALL NOT classify regular JSON array files as directories

When the GitHub Contents API returns a file whose raw content is a JSON array (not a GitHub directory listing), `verifyFindingRefs` MUST NOT add a line-referenced finding for that file to the `nonExistent` list.

A GitHub directory listing is identified by: the content parses to a non-empty JSON array where the first element is an object with both a `name: string` field and a `type: string` field.

#### Scenario: file content is a plain JSON array

**Given** a finding that references `fixtures/data.json` at line 2
**And** the GitHub API returns the file content `["alpha", "beta", "gamma"]`
**When** `verifyFindingRefs` is called
**Then** the finding is NOT in the returned `nonExistent` array (the file exists and has ≥ 2 lines)

#### Scenario: path is a real directory (GitHub listing format)

**Given** a finding that references `src/` at line 1
**And** the GitHub API returns `[{"name":"index.ts","type":"file","path":"src/index.ts","sha":"abc123"}]`
**When** `verifyFindingRefs` is called
**Then** the finding IS in the returned `nonExistent` array

#### Scenario: file does not exist (API returns null)

**Given** a finding that references `nonexistent.ts` at line 1
**And** the GitHub API returns `null`
**When** `verifyFindingRefs` is called
**Then** the finding IS in the returned `nonExistent` array

---

### Requirement: review-scores path SHALL be deleted; verdict derivation is unaffected

`parseReviewScores`, `ParsedStepResult.scores`, `ReviewScores`, and `FindingSeverityCounts` MUST be removed from the codebase. The verdict derivation path (findings aggregation in `judge-verdict.ts`) MUST remain unchanged.

#### Scenario: existing judge / review step tests pass after deletion

**Given** the four review-scores files are deleted and `ParsedStepResult.scores` is removed
**When** the full test suite runs
**Then** no test failures are introduced (the deleted path was dead code)
