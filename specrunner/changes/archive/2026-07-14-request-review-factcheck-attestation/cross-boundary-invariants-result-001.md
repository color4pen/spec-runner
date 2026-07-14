# Cross-Boundary Invariants Review: request-review-factcheck-attestation

- **reviewer**: cross-boundary-invariants
- **verdict**: approved
- **date**: 2026-07-14

## Scope

Verified that the new attestation mechanism does not silently break implicit assumptions held by code that was NOT changed. Focus: step-to-step data contracts, output-contract gate, pipeline sequencing invariants, and verdict/stop behavior.

## Invariants Examined

### 1. Output-contract gate does not halt on absent attestation (D8)

`RequestReviewStep.writes()` declares the attestation with `verify: false`. `producedContractsFromWrites()` in `output-verify.ts:73` skips entries where `w.verify === false`. The attestation is therefore excluded from `buildAllOutputContracts()` → `validateStepOutputs()`. The gate cannot halt on a missing attestation. ✓

### 2. Hash gate prevents drift from passing silently (D2)

`evaluateFactCheckAttestation()` evaluates to `stale` when `parsed.requestHash !== hashRequestContent(currentRequestContent)`, and `absent` when the file is missing or unparseable. Both cases route design to full re-verification. The gate is a pure, deterministic CLI function, not delegated to the agent. ✓

### 3. Fail-safe: no unsafe skip is possible

Every path except `status === "valid"` instructs design to verify all in-scope assertions. An agent-omitted, malformed, or wrong-hash attestation is handled identically. The only "valid" path requires both: (a) parse success with `codeAssertionsVerified === true`, and (b) exact hash equality. ✓

### 4. Verdict and stop behavior of request-review are unchanged

The attestation write is additional output. The verdict is derived solely from `findings` in the report tool result (unchanged). `REQUEST_REVIEW_SYSTEM_PROMPT` retains all prior verdict-derivation rules. `RequestReviewStep.parseResult` still returns `verdict: null` (toolResult path). `REQUEST_REVIEW_REPORT_TOOL` schema is unchanged. ✓

### 5. Design's `ok:false` stop path is unchanged

`DESIGN_BASE` still contains the stop condition: mismatch found during verification → `ok:false + reason`. The new attestation section in `DESIGN_BASE` adds a `MAY`-skip permission only; it does not remove or modify the stop path. `completionVerdict: "success"` on `DesignStep` is unchanged. ✓

### 6. Pipeline sequencing preserves read-after-write ordering

`enrichContext` for design is called inside the runner just before `buildMessage`, which is after the request-review step has fully committed and pushed (via `finalizeStepArtifacts`). The local worktree retains the file after commit. In the managed runtime, `enrichContext` read failures degrade gracefully (context returned unchanged, no attestation field set, directive omitted). ✓

### 7. State schema is unchanged (D1)

No new fields on `JobState`, `StepRun`, or any state subtype. The attestation is a change-folder file artifact only. Confirmed: no edits to `src/state/schema.ts`. ✓

### 8. `DynamicContext` new fields are purely additive (T-02)

`requestContentHash?: string` and `factCheckAttestation?: {...}` are optional with no default. `collectDynamicContext()` is not modified. All existing callers and tests using `DynamicContext` remain unaffected. ✓

---

## Findings

### F-1: Step-to-step data contract declared asymmetrically

- **severity**: low
- **location**: `src/core/step/design.ts` (enrichContext reads) vs. `DesignStep.reads()`
- **description**: The attestation is declared as a `write` in `RequestReviewStep.writes()` with `verify: false`, but is NOT declared as a `read` in `DesignStep.reads()`. The formal io-contracts system tracks data flows via `reads()`/`writes()` declarations; the attestation's consumption side is expressed only as code in `enrichContext`, making the cross-step dependency invisible to the io-contract validation layer (`validateRequiredInputs`).
- **impact**: No runtime impact — absent attestation is handled fail-safely. However, the pipeline's io-contract graph does not reflect this data dependency. If a future rule requires all `enrichContext` I/O to be declared in `reads()`, this will require a retrofit.
- **mitigation in place**: Fail-safe (`absent` → verify all). The asymmetry is intentional per D8 — declaring it as a required read would create a new halt path. An optional read (`required: false`) would be semantically correct but provides no additional runtime protection given the current degradation behavior.
- **verdict contribution**: non-blocking

### F-2: `codeAssertionsVerified: true` is a process flag, not a correctness flag

- **severity**: low
- **location**: `src/prompts/request-review-system.ts` (attestation JSON spec), `src/core/factcheck-attestation.ts` (evaluateFactCheckAttestation)
- **description**: The attestation's `codeAssertionsVerified: true` encodes "Step 2 completed" rather than "Step 2 found zero assertion mismatches." If request-review writes the attestation while also recording HIGH findings (assertion mismatch), the flag still reads `true`. Design consuming this attestation on a hash-match would skip re-verifying those assertions.
- **impact**: In normal pipeline flow this is impossible: HIGH findings → `needs-discussion` verdict → pipeline escalates before design runs. The invariant "design only runs after `approve`" is enforced by the pipeline state machine, not by the attestation data contract. If the state machine invariant is bypassed (e.g., manual state manipulation), design could skip assertions with known mismatches.
- **mitigation in place**: Pipeline sequencing (design only reachable post-approve). Acknowledged trade-off in design.md "Risks / Trade-offs" section. The request-review prompt also states the attestation does NOT affect verdict — finding a mismatch still produces a HIGH finding and drives `needs-discussion`.
- **verdict contribution**: non-blocking

### F-3: Temporal coupling not expressed in contracts (observation)

- **severity**: observation
- **location**: Implicit assumption between `finalizeStepArtifacts` (request-review) and `enrichContext` (design)
- **description**: `DesignStep.enrichContext` reads the attestation from the local worktree after request-review has committed it. This temporal dependency (request-review must commit before design's enrichContext reads) is enforced by the sequential pipeline but is not expressed in any formal contract.
- **impact**: None under current architecture. In a hypothetical parallel pipeline where design could start before request-review commits, enrichContext would get `absent` → verify all (fail-safe). No correctness risk.
- **verdict contribution**: non-blocking

---

## Conclusion

All cross-boundary invariants are maintained. The output-contract gate, hash-gate fail-safe, verdict/stop behavior, and state schema invariants are all verified intact. The two low-severity findings are intentional design choices (D8, acknowledged trade-off) with appropriate mitigations in place. No breaking cross-boundary invariant was found.

- **verdict**: approved
