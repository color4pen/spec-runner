# Conformance Result — provider-lifecycle-parity-contract — iter 1

## Summary

The implementation adds a provider lifecycle parity contract suite under
`tests/unit/contract/provider-lifecycle/` without modifying any production source
(`src/**` diff is empty). The overall structure — stable case IDs, provider-neutral
scenarios, per-provider harnesses, capability matrix, and static ratchets — is correct
and well-engineered. All verification steps (build, typecheck, lint, test) pass.

Eight normative gaps were found. Four are confirmed violations against SHALL/MUST
language in the spec; one is a confirmed violation against the T-07 acceptance criterion.

---

## Evidence Counts

- **Checked**: 48 (8 acceptance criteria + 8 spec requirements × 4 scenarios each avg + ratchet implementation review)
- **Skipped**: 0
- **Unverified**: 2 (exact runtime mechanism that causes 8 vitest skips; whether TC-024 ledger test itself is among the skipped)

---

## Pass / Neutral items (not findings)

| Item | Result |
|------|--------|
| `src/**` diff empty — production behavior unchanged | ✓ empty |
| `AgentRunner` / `AgentRunResult` contract unchanged | ✓ unchanged |
| Existing provider test files not deleted or modified | ✓ git diff shows 0 deletions |
| 31 required case IDs present in both case-ids.ts and case-table.ts | ✓ |
| All 9 lifecycle areas covered by ≥ 1 case each | ✓ |
| No real SDK loader invoked (DI-only harnesses) | ✓ |
| No UNEXPLAINED: reasons in delivered contract (0 of 31 cases) | ✓ |
| Frozen required ID literal is independent of case table | ✓ design D5 |
| Case table does not import case-ids.ts | ✓ |
| case-ids.ts has zero import statements | ✓ |
| Shared modules do not import provider adapter packages | ✓ ratchet:sdk-containment passes |
| Result-field matrix has 15 fields matching AgentRunResult interface | ✓ ratchet:field-matrix passes |
| Provider-specific / absent expectations carry ≥ 40-char reasons | ✓ reason ratchet passes |
| Timeout cases use fake timers | ✓ |
| Universal error↔completionReason invariant applied | ✓ |
| `followUpAttempts ≥ 0` universal invariant applied | ✓ |
| Matrix-absent fields forced undefined across all cases | ✓ |
| All 9 lifecycle areas have ≥ 1 case (area ratchet) | ✓ |
| shared / provider-specific classification ratchet present | ✓ |
| PROVIDER_HARNESSES keys match CONTRACT_PROVIDERS | ✓ |
| No static `.skip` / `.only` / `.todo` markers in contract source | ✓ ratchet:no-skip passes |

---

## Findings

### F-1 [CRITICAL] 8 tests reported as skipped — absent cases must execute, not be skipped

**Spec reference**: Requirement "The system shall classify each case and provider pair…"
— Scenario: *"absent support is asserted rather than skipped"*:
> "Then the case executes and asserts the documented absent behavior instead of being skipped"

**T-07 acceptance criterion**:
> "実行される test 件数が 62 + 台帳検査分（最低 64 件以上）であり、**skip 0 件**である"

**Evidence**: The verification output for
`tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` reads
`(62 tests | 8 skipped)`. The tasks.md T-11 self-report also confirms
`Tests 54 passed | 8 skipped (62)` and explicitly attributes the 8 skips to the
8 absent-support case+provider combinations (claude-code absent: 2,
codex absent: 6).

**Impact**: The 8 absent-support cases do not execute their test bodies. Universal
invariants (error/completionReason coherence, `followUpAttempts ≥ 0`, matrix-absent
field enforcement) are not applied to these combinations. The execution-ledger
check TC-024 may also be unreachable if it is itself among the skipped tests,
meaning the "62 pairs executed" coverage guarantee cannot be verified.

Static analysis of the driver found no explicit `test.skip()` / `test.todo()` /
`ctx.skip()` call, and the no-skip ratchet passed (ratchet 10). The mechanism
producing the skips is therefore not caught by the current ratchet, constituting
a second-order gap (see F-2 below). The root cause is not confirmed from static
analysis alone, but the observed result unambiguously violates the spec.

**Fix**: Determine and eliminate the skip-producing mechanism. Every
`(caseId × provider)` combination must enter and complete its test body; skipped
tests must become pass or fail, never skip.

---

### F-2 [HIGH] `ratchet:unexplained` does not detect `UNEXPLAINED:` prefix in reasons

**Spec reference**: Requirement "The system shall stop instead of normalizing
unexplained provider differences" — Scenario: *"unexplained difference blocks the suite"*:
> "Given a per-provider expectation whose reason starts with `UNEXPLAINED:` /
> When the contract ratchet runs / Then the ratchet fails and reports the count
> and the affected case IDs"

Scenario: *"no unexplained differences in the delivered contract"*:
> "When the contract ratchet counts reasons prefixed with `UNEXPLAINED:` /
> Then the count is 0"

**Design D11 / Tasks T-08** both require:
> "case table と capability matrix の全 reason のうち `UNEXPLAINED:` で始まるものの件数が 0 である（0 でなければ件数と case ID を出して fail）"

**Evidence**: The `describe("ratchet:unexplained")` block (contract-ratchet.test.ts
lines 196–218) checks that provider-specific cases where both providers are
`supported` have reasons ≥ 40 chars. It does **not** scan all reasons for the
`UNEXPLAINED:` prefix. A reason of the form
`"UNEXPLAINED: both providers behave differently in context X, cause unknown"`
(> 40 chars) would **pass** ratchet 6 and silently survive.

**Impact**: Currently, 0 reasons carry the `UNEXPLAINED:` prefix (confirmed by
tasks.md T-11 grep output `→ 0`). However the protection mechanism described in
the spec and design is absent. A future implementer who adds an `UNEXPLAINED:`
reason (per D11 protocol) will not be blocked from merging.

**Fix**: Add a scan over all `reason` strings in both `CONTRACT_CASES` and
`RESULT_FIELD_MATRIX` and fail if any starts with `UNEXPLAINED:`, reporting
the count and affected case IDs.

---

### F-3 [HIGH] Registry ratchet does not cross-check against `src/adapter/` file system

**Spec reference**: Requirement "The system shall detect missing provider coverage and
implicit skips" — Scenario: *"adding a local adapter without registering it fails the ratchet"*:
> "Given a new directory under `src/adapter/` containing `agent-runner.ts` /
> When the provider registry is not updated to include it /
> Then the contract ratchet fails and names the unregistered adapter directory"

**Tasks T-08**:
> "**provider registry ratchet**: `src/adapter/` 配下で `agent-runner.ts` を持つ
> ディレクトリ集合（`managed-agent` / `github` / `shared` / `dispatching` を除外）が
> `CONTRACT_PROVIDERS` および `PROVIDER_HARNESSES` のキー集合と一致する"

**Evidence**: The `describe("ratchet:registry")` block (lines 240–267) checks only
that `PROVIDER_HARNESSES` keys equal `CONTRACT_PROVIDERS`. It does **not** scan
the file system to list directories under `src/adapter/` that contain
`agent-runner.ts`. Adding a new provider adapter directory without registering it
would not be detected.

**Impact**: The detection described in the spec scenario does not function. A new
local adapter (e.g. `src/adapter/llama/agent-runner.ts`) added for R4b/R4c would
not trigger a ratchet failure until the developer also updated `CONTRACT_PROVIDERS`
and `PROVIDER_HARNESSES`.

**Fix**: Add a `readdirSync`-based scan of `src/adapter/` (excluding
`managed-agent`, `github`, `shared`, `dispatching`) to collect directories
containing `agent-runner.ts`, and assert that the resulting set equals
`CONTRACT_PROVIDERS` (existing precedent: `agent-runner-contracts.test.ts`
uses the same technique).

---

### F-4 [MEDIUM] `addedTurns` arithmetic invariant is per-case opt-in, not universal

**Spec reference**: Requirement "The system shall pin existing retry, follow-up and turn
accounting semantics" — Scenario: *"addedTurns invariant holds wherever addedTurns is present"*:
> "Given **any** contract case execution whose result defines `addedTurns` /
> When the driver applies the universal invariants /
> Then `addedTurns.reportRetry + addedTurns.outputRepair` equals `followUpAttempts`"

**Design D7** lists this as a universal invariant:
> "addedTurns が存在するとき reportRetry + outputRepair === followUpAttempts
> （port doc comment に明記された不変条件）"

**Evidence**: The driver's `assertExpectations()` helper checks this invariant only
when `exp.assertAddedTurnsInvariant === true` (driver lines 152–158). Cases where
`addedTurns` is present in the result but the expectation object does not declare
`assertAddedTurnsInvariant: true` will not have the arithmetic relationship checked.

**Impact**: Cases like `post-work.single-prompt-adds-turn` or
`output-repair.violation-then-clean` populate `addedTurns` in the result but may not
declare `assertAddedTurnsInvariant: true`, leaving the relationship unchecked. R4b
phase-split errors that break the relationship would not be caught for those cases.

**Fix**: In `assertExpectations()`, after existing per-case assertions, add a
universal check: `if (result.addedTurns !== undefined) { expect(result.addedTurns.reportRetry + result.addedTurns.outputRepair).toBe(result.followUpAttempts); }`.
Remove the per-case `assertAddedTurnsInvariant` flag or retain it as a no-op alias.

---

### F-5 [LOW] SDK containment ratchet does not scan `src/**` for provider SDK imports

**Spec reference**: Requirement "The system shall keep provider production behavior and
SDK type containment unchanged" — Scenario:
*"provider SDK imports stay inside the two provider adapter directories"*:
> "Given the repository source tree under `src/` /
> When the ratchet lists files importing `@anthropic-ai/claude-agent-sdk` or
> `@openai/codex-sdk` /
> Then every such file is under `src/adapter/claude-code/` or `src/adapter/codex/`"

**Evidence**: The `describe("ratchet:sdk-containment")` block (lines 367–406) checks
only that **contract suite shared modules** do not import provider adapters or SDKs.
It does not scan `src/**` to assert that provider SDK imports outside the two
allowed directories do not exist.

**Impact**: No `src/` files were added or modified in this change (git diff confirms
empty `src/` delta), so the current state is correct. However, a future change to
`src/` that imports `@anthropic-ai/claude-agent-sdk` from outside the two allowed
directories would not be caught by the ratchet.

**Fix**: Add a scan (e.g. `readdirSync`-recursive on `src/`) that collects all files
importing `@anthropic-ai/claude-agent-sdk` or `@openai/codex-sdk` and asserts each
is under `src/adapter/claude-code/` or `src/adapter/codex/` — mirroring the existing
technique used for the no-skip scan.

---

## Plan Divergences (informational, not findings)

| Design/Tasks | Implementation | Note |
|---|---|---|
| D6: 20 shared / 11 provider-specific | ratchet asserts 19 shared / 12 provider-specific | Plan divergence only; spec does not mandate exact counts |
| T-07: "最低 64 件以上" test count | Verification shows 62 tests (8 skipped) | Incorporated in F-1 |
| T-11 T-07 acceptance: "`skip 0 件`" | 8 skipped | Incorporated in F-1 |

---

## Conclusion

The production invariants (no `src/` changes, no existing test deletions, correct
`AgentRunResult` contract, correct result-field matrix) are all satisfied. The structural
design is sound. The four HIGH/CRITICAL gaps (F-1 through F-4) all concern
the coverage and protection mechanisms that are central to the R4a objective of
"making the contract suite trustworthy as a R4b regression baseline". F-1 in
particular means absent-case behavior is not verified, which is a stated acceptance
criterion. F-2 and F-3 mean two protection mechanisms described by the spec exist
only in name. These must be resolved before this suite can serve as a reliable
regression baseline for R4b/R4c.
