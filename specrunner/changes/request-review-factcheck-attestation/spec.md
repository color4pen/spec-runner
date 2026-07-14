# Spec: request-review fact-check attestation

## Requirements

### Requirement: request-review emits a fact-check attestation artifact

After completing its code-assertion fact-check, the `request-review` step SHALL emit
a fact-check attestation as a change-folder file at
`specrunner/changes/<slug>/request-review-attestation.json`. The attestation MUST
record the content hash of the reviewed `request.md`, a flag indicating that code
assertions were verified, and the list of relevant paths / symbols that were
verified. The attestation MUST NOT be stored in the job state schema.

#### Scenario: attestation is produced after request-review runs

**Given** a request whose `request.md` contains current-code assertions
**When** the `request-review` step completes its fact-check for that change
**Then** `specrunner/changes/<slug>/request-review-attestation.json` exists in the
change folder
**And** it records the `request.md` content hash, a code-assertions-verified flag,
and the list of verified paths / symbols

#### Scenario: attestation is a file artifact, not state

**Given** a completed `request-review` step that produced an attestation
**When** the job state is inspected
**Then** the attestation lives only as the change-folder file, and no attestation
field is added to the job state schema

### Requirement: design skips re-verifying recorded assertions when the attestation is valid

When a fact-check attestation exists and the current `request.md` content hash
matches the hash recorded in the attestation, the `design` step SHALL skip
re-verifying the assertions recorded in the attestation. `design` MUST still verify
any in-scope current-code assertion in `request.md` that is not recorded in the
attestation.

#### Scenario: hash match skips recorded assertions

**Given** a fact-check attestation whose recorded hash equals the hash of the
current `request.md`
**When** the `design` step prepares to verify current-code assertions
**Then** the assertions recorded in the attestation are treated as already verified
and are not re-verified
**And** only in-scope assertions absent from the recorded list are verified

### Requirement: design re-verifies all assertions when the attestation is stale or absent

When no fact-check attestation exists, or the current `request.md` content hash does
not match the hash recorded in the attestation, the `design` step SHALL re-verify
all in-scope current-code assertions exactly as it does without the attestation
mechanism.

#### Scenario: hash mismatch falls back to full re-verification

**Given** a fact-check attestation whose recorded hash differs from the hash of the
current `request.md` (the request was edited after review)
**When** the `design` step prepares to verify current-code assertions
**Then** all in-scope current-code assertions are re-verified as usual

#### Scenario: absent attestation falls back to full re-verification

**Given** a change folder with no fact-check attestation file
**When** the `design` step prepares to verify current-code assertions
**Then** all in-scope current-code assertions are re-verified as usual

### Requirement: the attestation does not change verdict or stop outcomes

The fact-check attestation SHALL only reduce exploration. It MUST NOT change the
verdict or stop outcome of the `request-review` or `design` steps relative to their
behavior without the attestation. A missing, malformed, or hash-mismatched
attestation MUST fail safe to full re-verification rather than to a new halt or a
changed verdict.

#### Scenario: verdict and stop behavior are preserved

**Given** a request that `request-review` and `design` process
**When** the attestation mechanism is active
**Then** `request-review` produces the same verdict it would without the attestation
**And** `design` reaches the same stop/continue outcome it would without the
attestation, differing only in how much of the codebase it re-explores

#### Scenario: a bad attestation fails safe

**Given** a fact-check attestation that is missing, malformed, or records a
non-matching hash
**When** the `design` step consumes it
**Then** `design` re-verifies all in-scope assertions
**And** `request-review` does not gain a new halt caused by the attestation
