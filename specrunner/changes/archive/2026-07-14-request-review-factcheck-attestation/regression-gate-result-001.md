# Regression Gate Result — iteration 001

- **verdict**: approved
- **iteration**: 001

## Ledger Verification

### Finding 1: Attestation consumption not declared in DesignStep.reads() — asymmetric io-contract

**File**: `src/core/step/design.ts`

**Status**: No regression — intentional trade-off confirmed present.

**Verification**:

- `RequestReviewStep.writes()` declares `{ path: factCheckAttestationPath(slug), verify: false }` at `src/core/step/request-review.ts:77` ✓
- `DesignStep.reads()` returns `[{ path: requestMdPath(deps.slug) }]` — attestation path is NOT declared as a read.
- `DesignStep.enrichContext` reads the attestation file at runtime (line 97), which is the consumption side — but this is not mirrored in `reads()`.

The finding is still technically present (io-contract asymmetry). However, this is an intentional design decision per D8 in `design.md`:

> "The asymmetry is intentional per D8 — declaring it as a required read would create a new halt path. An optional read (required: false) would be semantically correct but provides no additional runtime protection given the current degradation behavior."

The fail-safe property ensures absent attestation → design verifies all assertions (degrade, not halt). No runtime correctness is lost. The cross-boundary-invariants reviewer found this and voted `approved` (non-blocking). The design rationale documented in `design.md` D8 is still present. No regression.

---

### Finding 2: codeAssertionsVerified:true is a process flag (Step 2 ran), not a correctness flag (Step 2 passed)

**File**: `src/prompts/request-review-system.ts`

**Status**: No regression — process-flag semantics documented and mitigation in place.

**Verification**:

At `src/prompts/request-review-system.ts:208`:
```
- **codeAssertionsVerified**: Always `true` when the attestation is written (indicates Step 2 completed).
```

The documentation explicitly labels the field as a process flag ("indicates Step 2 completed"), not a correctness assertion. This clarification is present in the system prompt.

`design.md` Risks / Trade-offs section also acknowledges this:
> "design no longer independently re-checks assertions when the hash matches, so a fact-check error made by request-review is no longer caught a second time by design. Mitigation: skipping is gated on hash-equality and on request-review having approved; identical content means any real mismatch would already have surfaced as a high finding at review."

The mitigation (pipeline sequencing — design only reachable post-approve) is still enforced by the state machine. No code change was needed or made. The cross-boundary-invariants reviewer found this and voted `approved` (non-blocking). No regression.

---

## Summary

Both ledger findings are intentional design trade-offs acknowledged in `design.md` (D8 and Risks section) and documented in the system prompt. Neither was addressed via code change — both were confirmed non-blocking by the cross-boundary-invariants reviewer (verdict: approved). The current code is in the same state the reviewer approved. No regressions detected.

| # | Finding | Status |
|---|---------|--------|
| 1 | Attestation not in DesignStep.reads() | Intentional per D8 — no regression |
| 2 | codeAssertionsVerified semantics | Documented as process flag — no regression |
