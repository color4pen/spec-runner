# Tasks: request-review fact-check attestation

Implementation order: pure logic (T-01, T-02) → generation wiring (T-03) →
consumption wiring (T-04) → tests (T-05) → verification (T-06). All source paths are
repo-relative (worktree root).

## T-01: Pure fact-check attestation module + path helper

- [x] Add `factCheckAttestationPath(slug: string): string` to `src/util/paths.ts`
      returning `specrunner/changes/<slug>/request-review-attestation.json`
      (follow the existing per-slug path-helper pattern; no imports from other
      `src/` modules — this file must stay dependency-free).
- [x] Create `src/core/factcheck-attestation.ts` (pure functions only, no I/O) with:
  - [x] `interface FactCheckAttestation { requestHash: string; codeAssertionsVerified: boolean; verifiedAssertions: string[] }`.
  - [x] `hashRequestContent(content: string): string` — returns `"sha256:" + createHash("sha256").update(content).digest("hex")` using `node:crypto` (match the existing pattern in `src/core/attestation/build-attestation.ts`; do NOT use Bun APIs).
  - [x] `buildFactCheckAttestation(requestContent: string, verifiedAssertions: string[]): FactCheckAttestation` — sets `requestHash = hashRequestContent(requestContent)`, `codeAssertionsVerified = true`, `verifiedAssertions` normalized to a string array.
  - [x] `parseFactCheckAttestation(raw: string): FactCheckAttestation | null` — safe `JSON.parse` inside try/catch; returns `null` on parse error or when the shape is invalid (missing/typed-wrong `requestHash`/`codeAssertionsVerified`/`verifiedAssertions`); coerces `verifiedAssertions` to a `string[]`.
  - [x] `type AttestationStatus = "valid" | "stale" | "absent"` and `interface AttestationEvaluation { status: AttestationStatus; verifiedAssertions: string[] }`.
  - [x] `evaluateFactCheckAttestation(attestationRaw: string | null, currentRequestContent: string): AttestationEvaluation` — `null`/unparseable → `{ status: "absent", verifiedAssertions: [] }`; parsed but `codeAssertionsVerified !== true` OR `requestHash !== hashRequestContent(currentRequestContent)` → `{ status: "stale", verifiedAssertions: [] }`; parsed AND verified AND hash matches → `{ status: "valid", verifiedAssertions }`.
  - [x] `buildFactCheckDirective(evaluation: AttestationEvaluation): string` — pure text block for injection into the design message: for `valid`, instruct to skip re-verifying the listed assertions and to verify only in-scope assertions NOT in the list; for `stale`/`absent`, instruct to verify ALL in-scope assertions as usual.

**Acceptance Criteria**:
- `factCheckAttestationPath("foo")` returns `specrunner/changes/foo/request-review-attestation.json`.
- `hashRequestContent` is deterministic (same input → same `sha256:`-prefixed hash) and differs for differing input.
- `evaluateFactCheckAttestation` returns `valid` only when the attestation parses, `codeAssertionsVerified` is true, and the hash matches the current content; returns `stale` on hash mismatch or `codeAssertionsVerified !== true`; returns `absent` on `null` or unparseable input.
- All functions in `src/core/factcheck-attestation.ts` are pure (no fs/network/global mutation).
- `src/util/paths.ts` still imports nothing from other `src/` modules.

## T-02: DynamicContext additive fields

- [x] In `src/git/dynamic-context.ts`, add two optional fields to the
      `DynamicContext` interface (additive; do not change existing fields):
  - [x] `requestContentHash?: string` — the CLI-computed `request.md` hash injected into the request-review message.
  - [x] `factCheckAttestation?: { status: "valid" | "stale" | "absent"; verifiedAssertions: string[] }` — the design-side evaluation result. Declare this as an inline structural type (do not add a cross-layer import into `src/git/`).
- [x] Do not change `collectDynamicContext` behavior (the new fields default to
      `undefined`).

**Acceptance Criteria**:
- `DynamicContext` compiles with both new optional fields.
- Existing `collectDynamicContext` callers and tests are unaffected (fields are
  optional and unset by default).

## T-03: request-review attestation generation

- [x] In `src/core/step/request-review.ts`:
  - [x] Add `enrichContext(dynamicContext, cwd, slug)` that reads
        `requestMdPath(slug)` from `cwd` (try/catch — on any read error return
        `dynamicContext` unchanged, matching the build-fixer degradation pattern),
        computes `hashRequestContent`, and returns
        `{ ...dynamicContext, requestContentHash: <hash> }`.
  - [x] Add the attestation to `writes()`:
        `{ path: factCheckAttestationPath(deps.slug), verify: false }` (declared but
        NOT gated — must not create a new output-contract halt).
- [x] In `src/prompts/request-review-system.ts`:
  - [x] Extend `RequestReviewInitialMessageInput` and
        `buildRequestReviewInitialMessage` to accept the attestation output path and
        the injected `requestContentHash` (thread from `deps.dynamicContext` via
        `RequestReviewStep.buildMessage`).
  - [x] Have `buildRequestReviewInitialMessage` include, when a hash is available,
        an explicit instruction to write the attestation file at
        `specrunner/changes/<slug>/request-review-attestation.json` after Step 2,
        with `requestHash` set to the provided hash verbatim,
        `codeAssertionsVerified: true`, and `verifiedAssertions` listing the
        file:line / symbol / path assertions the agent verified. When no hash is
        available (e.g. managed degradation), the instruction is omitted.
  - [x] Add an additive subsection to `REQUEST_REVIEW_BASE` describing the
        attestation output: its purpose, JSON shape, that `requestHash` must be
        copied verbatim from the provided value, and that the attestation is
        additional output that does NOT affect the verdict.
- [x] Do NOT thread `verifiedAssertions` through the report tool or persisted
      `toolResult` (keep the job state schema unchanged).

**Acceptance Criteria**:
- `RequestReviewStep.writes()` includes `factCheckAttestationPath(slug)` with
  `verify: false`; the produced-output gate does not halt when the attestation is
  absent.
- `RequestReviewStep.enrichContext` returns a context whose `requestContentHash`
  equals `hashRequestContent(<request.md bytes>)` when `request.md` is readable, and
  returns the context unchanged when the read fails.
- `buildRequestReviewInitialMessage`, given a hash, produces a message that contains
  the attestation path, the exact hash string, and a write instruction; given no
  hash, produces a message without the attestation write instruction.
- `REQUEST_REVIEW_SYSTEM_PROMPT` contains the attestation-output description and
  still contains all previously-asserted substrings (e.g. "Code Assertion
  Fact-Check").
- No change to the report-tool schema or `RequestReviewReportResult`.

## T-04: design attestation consumption

- [x] In `src/core/step/design.ts`:
  - [x] Add `enrichContext(dynamicContext, cwd, slug)` that reads the attestation
        file (`factCheckAttestationPath(slug)`, missing → `null`) and `request.md`
        (`requestMdPath(slug)`) from `cwd`, computes
        `evaluateFactCheckAttestation(attestationRaw, requestContent)`, and returns
        `{ ...dynamicContext, factCheckAttestation: <evaluation> }`. On any read
        failure of `request.md`, return `dynamicContext` unchanged (degrade — design
        will then verify all).
- [x] In `src/prompts/design-system.ts`:
  - [x] In `buildInitialMessage`, when `factCheckDirective` parameter is present
        (pre-built by DesignStep.buildMessage from buildFactCheckDirective), append
        the directive (place it near the injected request-constraints block).
  - [x] Update the "現状コード断定の検証" section of `DESIGN_BASE` to state that when
        a fact-check attestation directive marks the attestation valid, the agent
        MAY skip re-verifying the listed assertions (already verified by
        request-review against an unchanged request.md) and MUST still verify any
        in-scope assertion not in the list; when the directive marks stale/absent, or
        no directive is present, verify ALL in-scope assertions as before.
- [x] Preserve the existing design stop behavior: on a real mismatch found during
      verification, design still reports `ok:false` + reason (unchanged).

**Acceptance Criteria**:
- `DesignStep.enrichContext` sets `factCheckAttestation.status = "valid"` (with the
  recorded assertions) when the attestation file's hash matches the current
  `request.md`; `"stale"` when it does not match; `"absent"` when the attestation
  file is missing.
- `buildInitialMessage` includes a "skip recorded assertions / verify only
  unlisted" directive when status is `valid`, and a "verify all" directive when
  status is `stale`/`absent`; when `factCheckAttestation` is absent from
  `dynamicContext`, the message is unchanged from today (managed degradation path).
- `DESIGN_SYSTEM_PROMPT` contains the attestation-aware verification guidance and
  still contains its previously-asserted substrings.

## T-05: Tests

- [x] Unit tests for `src/core/factcheck-attestation.ts`: `hashRequestContent`
      determinism/uniqueness; `buildFactCheckAttestation` shape;
      `parseFactCheckAttestation` for valid JSON, malformed JSON (→ null), and
      missing/mistyped fields (→ null); `evaluateFactCheckAttestation` for the
      valid / stale (hash mismatch) / stale (`codeAssertionsVerified` false) /
      absent (null) / absent (unparseable) cases; `buildFactCheckDirective` content
      for valid vs stale/absent.
- [x] Unit test (generation, AC1 path): `buildRequestReviewInitialMessage` with a
      provided hash includes the attestation path, the exact hash, and the write
      instruction; without a hash omits the write instruction. Plus a test that
      `RequestReviewStep.writes()` includes the attestation path with `verify:false`
      and that `RequestReviewStep.enrichContext` computes the hash from a
      temp-dir `request.md`.
- [x] Unit test (consumption, AC2): `DesignStep.enrichContext` over a temp change
      folder returns `status: "valid"` and the recorded assertions when the
      attestation hash matches `request.md`; and `buildInitialMessage` then emits the
      skip directive listing those assertions.
- [x] Unit test (consumption, AC3): with an attestation whose hash does not match
      `request.md`, `enrichContext` returns `status: "stale"` and `buildInitialMessage`
      emits the verify-all directive; and with no attestation file present it returns
      `status: "absent"` with the verify-all directive.
- [x] Invariance test (AC4): assert `RequestReviewStep` and `DesignStep` verdict /
      completion outcomes are unchanged by the attestation (e.g. request-review still
      derives its verdict from findings; design's stop path is unaffected). Confirm
      no existing test file is modified to make the suite pass.

**Acceptance Criteria**:
- New tests cover: attestation file generation (AC1), valid-hash skip path (AC2),
  mismatch and absent fallback paths (AC3), and verdict/stop invariance (AC4).
- All new tests pass.

## T-06: Verification

- [x] Run `typecheck` and `test`; both are green.
- [x] Confirm no existing test file was modified to accommodate the change (existing
      tests remain green unchanged), per the acceptance criterion.
- [x] Confirm no edits were made outside `src/` and `tests/` (no README/source
      changes beyond the files listed in T-01–T-05).

**Acceptance Criteria**:
- `typecheck && test` passes.
- The request-review / design verdict and stop observable behavior is unchanged;
  the attestation only reduces design's re-verification exploration.
- No pre-existing test was altered to keep the suite green.
