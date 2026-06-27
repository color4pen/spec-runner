# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All T-01 through T-07 checkboxes marked [x] |
| design.md | ✓ | D1–D4 each realized in code and documentation |
| spec.md | ✓ | All SHALL/MUST requirements and scenarios satisfied; see detail below |
| request.md | ✓ | All 5 acceptance criteria satisfied by tests; typecheck && test green |

---

## Detail

### tasks.md

All T-01 through T-07 checkboxes are marked `[x]`. No incomplete tasks.

---

### design.md

**D1 — Non-derivable → activate the reviewer**

`evaluateActivation` (`activation.ts:83-85`) returns `{ activated: true, reason: "activated" }` when
`facts.changedFilesDerivable === false` and `cond.paths` is present. The glob match is never attempted. ✓

**D2 — `changedFilesDerivable` as optional fact, defaulting to derivable**

`ActivationFacts.changedFilesDerivable?: boolean` added with JSDoc documenting the default-derivable rule. The
`computeInvalidations` call site in `reviewer-status.ts` does not pass the field; `undefined !== false` keeps it on
the existing path. Byte-for-byte unchanged for that caller. ✓

**D3 — Short-circuit `listChangedFiles` when non-derivable**

`executor.ts:239-242` gates the `listChangedFiles` call behind `changedFilesDerivable`. T-06 test
"managed/non-derivable + paths reviewer: agent IS called, listChangedFiles is NOT called" asserts the spy was not
invoked. ✓

**D4 — Reframe the contradicting documentation**

- `managed.ts:505-518`: "fail-safe: under-activate" framing removed. New doc states `[]` is a structural limitation
  ("NOT a signal that nothing changed") and that `[] MUST NOT be interpreted as 'no changes'`.
- `runtime-strategy.ts:382-402`: "reviewer activation consumers MUST NOT reference this predicate" removed. New doc
  names both consumers (scope-check and activation gate) and their fail-closed behaviors. ✓

---

### spec.md

**R1 — Gate SHALL consult `canDeriveChangedFiles()` before evaluating `paths`**

`executor.ts:237-238` computes `changedFilesDerivable` from `deps.runtimeStrategy?.canDeriveChangedFiles?.() !== false`
before any `listChangedFiles` call. T-06 scenarios confirm `listChangedFiles` is not called on non-derivable runtimes
and is called on derivable runtimes. ✓

**R2 — `paths`-conditioned reviewer SHALL be activated when changed files cannot be derived**

`evaluateActivation` returns `activated: true` on `changedFilesDerivable === false` + `paths` present. T-06 confirms
`runMock` called once and verdict is not `"skipped"`. ✓

**R3 — `evaluateActivation` SHALL treat non-derivable as activating**

T-05 covers all scenarios: `changedFilesDerivable: false` + `paths` → `activated: true`; `requestTypes` mismatch
still skips deterministically before the `changedFilesDerivable` guard; `changedFilesDerivable: true` or absent +
non-matching files → `activated: false` (no regression). ✓

**R4 — `skipReason` SHALL distinguish derivability failure from condition mismatch**

Non-derivable case: reviewer activates; no `skipped` verdict, no `skipReason`. Derivable non-matching case:
`skipReason` contains `"no changed files matched paths [src/auth/**]"`. Both confirmed by T-06 tests. ✓

**R5 — Reviewers without `paths` SHALL be unaffected**

Unconditional reviewer hits the early return at `activation.ts:62-64` before the `paths` block. `requestTypes`-only
reviewer never reaches the `if (cond.paths)` block. T-06 "unconditional reviewer" and "requestTypes-only reviewer"
tests confirm `runMock` called once on non-derivable runtimes. ✓

---

### request.md — acceptance criteria

| Criterion | Evidence |
|-----------|----------|
| managed runtime で path 条件付き reviewer が無言 skip されないことをテストで固定 | T-06 "managed/non-derivable + paths reviewer" — `runMock` called, verdict not `skipped` |
| local runtime で path 条件の活性/非活性が現挙動どおり | T-06 "local-runtime regression" pair (paths match → agent called; paths no-match → skipped with glob in skipReason) |
| `paths` 条件なし reviewer が影響を受けない | T-06 unconditional + requestTypes-only tests on non-derivable runtime |
| skipReason が「導出不能」と「条件不一致」を区別 | Non-derivable → activation (no skipReason generated); derivable non-match → "no changed files matched paths [...]" |
| `typecheck && test` が green | verification-result.md: build ✓ typecheck ✓ 5611/5611 tests ✓ lint ✓ |

---

## Noted non-blocking observations

**F-1 (low, pre-existing, scoped out)** — `computeInvalidations` on the managed runtime evaluates `paths` reviewers
against `[]` from `listChangedFiles`, so an approved paths reviewer is never invalidated after a fixer run on managed.
This gap was previously invisible (paths reviewers were always skipped); the change makes it reachable. Explicitly
scoped out in D2. Acknowledged by the cross-boundary-invariants reviewer. Not a blocker.

**F-2 (trivial)** — A commit-mutex comment at `executor.ts:88` mentions "activation listChangedFiles" as concurrent;
on non-derivable runtimes `listChangedFiles` is no longer called in the activation path. Comment-only stale text,
no behavioral impact.
