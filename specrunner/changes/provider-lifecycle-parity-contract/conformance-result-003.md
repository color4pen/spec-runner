# Conformance Result — provider-lifecycle-parity-contract (Iteration 3)

## Evidence Summary

| Category | Checked | Skipped | Unverified |
|----------|---------|---------|------------|
| Normative items (request + spec) | 30 | 0 | 0 |

---

## Step 1 — Identity Priming

Rules loaded from `specrunner/changes/provider-lifecycle-parity-contract/rules.md`.
Conformance reads request/spec as normative, design/tasks as plan context only.

---

## Step 2 — Acceptance Criteria (request.md)

Twelve acceptance criteria identified:

| # | Criterion | Status |
|---|-----------|--------|
| AC-1 | Stable case ID を持つ provider lifecycle contract table がある | PASS |
| AC-2 | 8 lifecycle 領域カバー（main work / report / post-work / output repair / transient retry / timeout / context / metrics / completion-error） | PASS |
| AC-3 | shared case は Claude / Codex 双方で実行される | PASS |
| AC-4 | provider-specific / unsupported 差が理由付きで明示され、期待値として固定される | PASS |
| AC-5 | 必須 ID・重複・provider coverage・暗黙 skip を検出する ratchet がある | PASS — ただし後述 F-1 参照 |
| AC-6 | 実 SDK・外部 API へ接続しない deterministic test である | PASS |
| AC-7 | 既存 provider 別テストを不要に削除・弱化しない | PASS |
| AC-8 | Claude / Codex adapter の production behavior に変更がない | PASS |
| AC-9 | `AgentRunner` / `AgentRunResult` contract に変更がない | PASS |
| AC-10 | provider SDK 型が shared production module へ漏れない | PASS |
| AC-11 | SpecRunner 上の verification が green | PASS（12785 passed, 1 skipped, 2 todo） |
| AC-12 | R4b/R4c で同じ contract suite を回帰基準として利用できる | PASS（by design） |

---

## Step 6 — Scope (git diff main...HEAD --stat)

34 files changed, 9879 insertions, 0 deletions.

New files are exclusively in:
- `specrunner/changes/provider-lifecycle-parity-contract/` — change-folder artifacts
- `tests/unit/contract/provider-lifecycle/` — 11 new test files

`git diff main...HEAD --stat -- src/` is **empty** — no production source changes confirmed.

---

## Step 7 — Normative Verification

### Spec Req 1: Stable-ID provider lifecycle contract table

**Scenario: case table matches the frozen required ID list**
`case-ids.ts` defines `REQUIRED_CASE_IDS` as a 31-element hand-written `as const` literal array.
`contract-ratchet.test.ts` ratchet:id compares `CONTRACT_CASES.map(c => c.id)` against `REQUIRED_CASE_IDS` in both directions.
The ratchet:area additionally validates each ID matches `<area>.<slug>` format and area is in `LIFECYCLE_AREAS`.
✓ PASS

**Scenario: deleting a case from the table fails the ratchet**
The ID ratchet ("all REQUIRED_CASE_IDS are present in CONTRACT_CASES") would report the missing ID as a violation.
✓ PASS by inspection

**Scenario: duplicate case ID fails the ratchet**
The Duplicate ratchet ("no duplicate IDs in CONTRACT_CASES" and "REQUIRED_CASE_IDS itself has no duplicates") explicitly catches both sides.
✓ PASS

**Scenario: every required case ID uses a known lifecycle area prefix**
The Area ratchet ("all CONTRACT_CASES areas are in LIFECYCLE_AREAS") checks every case's `area` field.
✓ PASS

---

### Spec Req 2: All required lifecycle areas

**Scenario: every lifecycle area has at least one case**
Area ratchet ("every LIFECYCLE_AREA has at least one case") and the count assertion ("total case count equals 31") both verify this.
9 areas: `main-work`(2), `report`(5), `post-work`(2), `output-repair`(3), `transient`(4), `timeout`(3), `context`(3), `metrics`(6), `completion-error`(3).
✓ PASS

**Scenario: report settle and follow-up budget are represented**
The following IDs are present and confirmed in `REQUIRED_CASE_IDS`:
- `report.first-turn-success` (first-turn report success)
- `report.follow-up-recovers` (follow-up recovery)
- `report.follow-up-budget-exhausted` (budget exhaustion)
- `report.settle-on-abort-with-captured-report` (settle after abort)
- `report.parse-failure-diagnostics` (parse failure)
✓ PASS

---

### Spec Req 3: Provider-neutral scenario drives both providers

**Scenario: one scenario drives both provider harnesses**
`scenario.ts` defines `LifecycleScenario` as provider-neutral turn scripts.
`harness/claude-code.ts` translates turn behaviors into `_queryFn` calls.
`harness/codex.ts` translates turn behaviors into `CodexThread.runStreamed` calls.
The driver iterates `CONTRACT_CASES × CONTRACT_PROVIDERS` using the same `contractCase.scenario` object for both providers.
✓ PASS

**Scenario: no real SDK is loaded**
`harness/claude-code.ts` constructs `ClaudeCodeRunner` with injected `_queryFn`/`_createMcpServerFn`/`_sleepFn` — no call to `loadClaudeAgentSdk`.
`harness/codex.ts` constructs `CodexAgentRunner` with injected `_codexFactory`/`_sleepFn` — no call to `loadCodexSdk`.
The SDK containment ratchet (ratchet:sdk-containment) confirms that provider-neutral modules do not import `@anthropic-ai/claude-agent-sdk` or `@openai/codex-sdk`.
✓ PASS

**Scenario: timeout cases are driven without wall-clock waiting**
`scenario.ts` `LifecycleScenario.usesFakeTimers` flag is set on `timeout.*` and `context.rollover-*` cases.
The driver installs `vi.useFakeTimers()` inside the test body (not in beforeEach) and uses `vi.advanceTimersByTimeAsync()` to advance time.
`_sleepFn` is always injected as an immediately-resolving no-op.
✓ PASS

---

### Spec Req 4: Classification with required reasons

**Scenario: shared case requires expectations for both providers**
Shared ratchet ("shared cases have both providers as supported") iterates all shared cases and verifies each `CONTRACT_PROVIDERS` entry has `support === "supported"`.
Count ratchets: `shared.length === 19` and `provider-specific.length === 12`.
✓ PASS

**Scenario: provider-specific case without a reason fails the ratchet**
The UNEXPLAINED ratchet ("provider-specific cases with both providers supported must have reasons") requires `reason.length >= 40` for each provider expectation when both are supported in a provider-specific case.
The Reason ratchet ("absent expectations always have a reason of ≥40 chars") requires `reason.length >= 40` for all `support === "absent"` entries.
✓ PASS

**Scenario: absent support is asserted rather than skipped**
The driver uses `const runTest = test` (no skip) for all cases including absent ones.
The ratchet:no-skip verifies no `it.skip`/`describe.skip`/`test.skip`/`it.todo`/`.only` appears in any contract source file.
The `assertExpectations` helper applies universal invariants and matrix-absent checks even for absent-support cases.
✓ PASS

---

### Spec Req 5: AgentRunResult field capability matrix

**Scenario: matrix covers exactly the port's AgentRunResult fields**
The field matrix ratchet (ratchet:field-matrix) uses `ts.createSourceFile` (TypeScript syntax parser, parse-only) to extract member names from the `AgentRunResult` interface in `src/core/port/agent-runner.ts`, then asserts `RESULT_FIELD_MATRIX` keys equal the parsed set exactly.
15 fields defined: `completionReason`, `resultContent`, `toolResult`, `followUpAttempts`, `transientRetryAttempts`, `sessionId`, `agentBranch`, `error`, `modelUsage`, `completionReportDiagnostics`, `addedTurns`, `contextMetrics`, `invocationMetrics`, `touchedFiles`, `sessionRollovers`.
✓ PASS

**Scenario: adding a port field without updating the matrix fails the ratchet**
The field matrix ratchet checks both directions (field in port not in matrix → fail; field in matrix not in port → fail).
✓ PASS by design

**Scenario: absent capability fields stay undefined on every case**
The `assertExpectations` helper applies a universal matrix-absent loop: for every field where `RESULT_FIELD_MATRIX[field].providers[providerId] === "absent"`, it calls `expect(result[field]).toBeUndefined()`. This fires on all 62 case × provider combinations.
✓ PASS

**Scenario: supported capability fields are observed at least once**
The driver populates `_observedFields` per provider after each `runner.run()` call.
Ledger TC-016 ("each matrix-supported field observed ≥once per provider") verifies that every `supported` field was non-undefined in at least one case result.
✓ PASS

---

### Spec Req 6: Pin existing retry, follow-up and turn accounting semantics

**Scenario: transient retry budget is bounded**
`transient.budget-exhausted` case pins `sdkInvocations = maxRetries + 1` and `completionReason = "error"`.
Provider-specific expectations with distinct error codes for Claude (`CLAUDE_CODE_QUERY_FAILED`) and Codex (`CODEX_SDK_ERROR`).
✓ PASS

**Scenario: non-transient failure is not retried**
`transient.non-transient-not-retried` case pins `sdkInvocations = 1` and `completionReason = "error"`. This is a shared case (same for both providers).
✓ PASS

**Scenario: abort does not trigger an additional retry**
`timeout.abort-not-retried` case pins `completionReason = "timeout"`, `errorCode = "STEP_TIMEOUT"` with `errorHintPresent = true`, and `sdkInvocations = 1`.
✓ PASS

**Scenario: post-work turns are excluded from followUpAttempts**
`post-work.excluded-from-follow-up-attempts` case pins `followUpAttempts = 0` and `sdkInvocations = 2` (one main turn + one post-work turn).
✓ PASS

**Scenario: addedTurns invariant holds wherever addedTurns is present**
The universal invariant in `assertExpectations` applies: `if (result.addedTurns !== undefined) { expect(reportRetry + outputRepair).toBe(result.followUpAttempts); }`.
This is applied to every case result, not only declared ones.
✓ PASS

---

### Spec Req 7: Detect missing provider coverage and implicit skips

**Scenario: adding a local adapter without registering it fails the ratchet**
Registry ratchet ("every src/adapter/ subdirectory with agent-runner.ts is registered or explicitly excluded") reads `src/adapter/` directories, finds those with `agent-runner.ts`, and requires each to be in `CONTRACT_PROVIDERS` or `EXCLUDED_FROM_CONTRACT`. Exclusions require justification.
Current exclusions: `dispatching` (delegates, not a standalone lifecycle) and `managed-agent` (server-side, not local-provider lifecycle).
✓ PASS

**Scenario: skip and focus markers are rejected**
The no-skip ratchet ("contract source files contain no test.skip, it.skip, describe.skip, it.todo, test.todo, or .only markers") recursively scans all `.ts` files in the contract directory (excluding the ratchet file itself).
✓ PASS

**Scenario: execution ledger equals the full case-by-provider cross product**
Ledger TC-024 ("all (caseId × provider) pairs executed") verifies `_executedPairs` equals the full 62-element cross product `CONTRACT_CASES × CONTRACT_PROVIDERS`.
✓ PASS

---

### Spec Req 8: Stop instead of normalizing unexplained differences

**Scenario: unexplained difference blocks the suite**
The UNEXPLAINED ratchet ("no reason starts with UNEXPLAINED:") checks all `CONTRACT_CASES` expectations for reasons prefixed with `"UNEXPLAINED:"` and fails if any are found.
✓ PASS for case-table scope

**Scenario: no unexplained differences in the delivered contract**
Verified by `grep -r "UNEXPLAINED:" tests/unit/contract/provider-lifecycle/` returning 0 matches.
Current state: 0 UNEXPLAINED: reasons in both `CONTRACT_CASES` and `RESULT_FIELD_MATRIX`.
✓ PASS — current state

**GAP (F-1):** The spec's "no unexplained differences" scenario states "Given the delivered contract case table **and result-field capability matrix**", indicating the ratchet must count UNEXPLAINED: reasons from both sources. The `ratchet:unexplained` describe block in `contract-ratchet.test.ts` only iterates `CONTRACT_CASES`; it does not scan `RESULT_FIELD_MATRIX.reason` for UNEXPLAINED: prefix. If an UNEXPLAINED: reason is added to the matrix, the ratchet would not catch it.

---

### Spec Req 9: Keep provider production behavior and SDK type containment unchanged

**Scenario: no production source is modified**
`git diff main...HEAD --stat -- src/` produces no output.
✓ PASS

**Scenario: provider SDK imports stay inside the two provider adapter directories**
SDK containment ratchet ("provider-specific SDK references are confined to their two allowed adapter directories in src/") recursively scans `src/**/*.ts` for `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` references and verifies each is inside the allowed adapter directory.
✓ PASS

**Scenario: provider-neutral contract modules stay provider-free**
SDK containment ratchet ("shared contract modules do not import from adapter/claude-code/, adapter/codex/, or provider SDK packages") checks six shared modules: `case-ids.ts`, `scenario.ts`, `case-table.ts`, `result-field-matrix.ts`, `harness/types.ts`, `provider-lifecycle-parity.test.ts`.
D5 isolation ratchet verifies `case-table.ts` does not import `case-ids.ts` and `case-ids.ts` has zero imports.
✓ PASS

**Scenario: existing provider tests remain intact**
`git diff main...HEAD --name-status -- tests/unit/adapter/ tests/adapter/ src/adapter/claude-code/__tests__/ src/adapter/codex/__tests__/ tests/unit/contract/agent-runner-contracts.test.ts` produces no output.
✓ PASS

---

## Plan Divergences (design/tasks — not conformance gates)

**D6 shared/provider-specific count**: Design D6 initially stated 20 shared / 11 provider-specific. Tasks T-05 updated this to 19 shared / 12 provider-specific (moving `transient.budget-exhausted` to provider-specific because `errorCode` differs between Claude and Codex). The ratchet hard-codes `shared.length === 19` and `provider-specific.length === 12`, matching the executed implementation. No spec violation.

**Contract module naming**: Design D1 specifies `LIFECYCLE_CONTRACT_CASES`; the implementation exports `CONTRACT_CASES` from `case-table.ts`. The ratchet and driver both use `CONTRACT_CASES`. This is an internal naming detail not constrained by spec.

---

## Findings

### F-1: UNEXPLAINED ratchet does not scan RESULT_FIELD_MATRIX for UNEXPLAINED: prefix

**Spec reference**: Spec Req 8 Scenario "no unexplained differences in the delivered contract": "Given the delivered contract case table and result-field capability matrix / When the contract ratchet counts reasons prefixed with `UNEXPLAINED:` / Then the count is 0."

**Location**: `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts`, `ratchet:unexplained` describe block.

**Observation**: The ratchet iterates `CONTRACT_CASES` but does not iterate `RESULT_FIELD_MATRIX` entries for `UNEXPLAINED:` prefix. If a future unexplained provider difference is recorded in the matrix, the ratchet would not detect it, violating the mechanical enforcement requirement.

**Current impact**: Low — the delivered matrix has 0 UNEXPLAINED: reasons, so the scenario outcome ("count is 0") is currently correct. The gap is in future-proofing enforcement.

**Fix**: Add a loop over `Object.values(RESULT_FIELD_MATRIX)` inside the "no reason starts with UNEXPLAINED:" test in `ratchet:unexplained` to check `capability.reason.trimStart().startsWith("UNEXPLAINED:")`.

**Severity**: Medium. **Resolution**: Fixable. **Fix target**: code-fixer.

---

## Conclusion

30 normative items verified. 1 finding identified (F-1: medium, fixable). The delivered contract satisfies all acceptance criteria in its current state; F-1 is a gap in ratchet coverage that would allow future UNEXPLAINED: matrix entries to go undetected.
