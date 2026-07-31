# Cross-Boundary Invariants Review — bite-evidence-test-file-selection — iter 1

## Scope

`git diff main...HEAD --stat`: 26 files, 3296 insertions / 19 deletions.
Primary changes: `test-file-selection.ts` (new leaf module), `gate.ts` (re-routes selection
to shared module, changes empty-set verdict), `achieved-assurance.ts` (re-routes selection to
shared module).

---

## New paths enumerated

| # | New path | Adjacent mechanism | Invariant check |
|---|----------|-------------------|-----------------|
| P1 | Empty selection → `strategy-deferred` (gate) | Pipeline routing | `strategy-deferred → verification` was already handled; existing tests cover it ✓ |
| P2 | Test-file pattern filter applied in gate | `runTestsAtCommit` (local.ts, unchanged) | Receives a narrower file set; pre-change invariant breach (all non-artifact files) is *reduced*, not extended ✓ |
| P3 | Test-file pattern filter applied in floor | `diffPathsBetweenCommits` (local.ts, unchanged) | Uses `git diff ... -- <paths>` (line 995 of local.ts); honors the paths arg directly; tamper surface narrows correctly ✓ |
| P4 | `scopedTestPatterns` in config | Schema validation + deep-merge | Validation rejects `[]` and non-string elements as CONFIG_INVALID; merge is additive; no conflict with existing keys ✓ |
| P5 | `isExcludedPath` moved to new module, re-exported from gate.ts | Any caller of `gate.ts::isExcludedPath` | Re-export at gate.ts:27 preserves backward compat for all existing importers ✓ |
| P6 | Floor's `materializedTestFiles` now excludes non-test files from the base commit | `diffPathsBetweenCommits` `paths` argument | `git diff ... -- <paths>` restricts the diff to those paths; implementation edits of non-test files disappear from the tamper surface ✓ |

---

## Findings

### F-001 [medium / info] — `matchesGlob` compiles `.` to `[._]`; design D3 says "literal (regex-escaped)"; creates an undocumented implicit contract

**Location**: `src/core/step/bite-evidence/test-file-selection.ts:76-79` (`matchesGlob`
dot branch); `design.md` §D3; `spec.md` scenario "configured patterns replace the default"
(TC-005 equivalent).

**What the code does**:

```typescript
} else if (ch === ".") {
  regex += "[._]";   // matches EITHER "." or "_"
```

**What D3 says**: "any other char → literal (regex-escaped)". A literal `.` should compile
to `\.` (matches only `.`).

**The contradiction**:
- With D3-strict (`\.`): pattern `**/*.spec.rb` → regex `^(?:.*/)?[^/]*\.spec\.rb$`.
  `spec/model_spec.rb` has `_spec.`, not `.spec.` → **not matched**.
- With `[._]`: same pattern → regex `^(?:.*/)?[^/]*[._]spec[._]rb$`.
  `spec/model_spec.rb` → `model` + `_`(matches `[._]`) + `spec` + `.`(matches `[._]`) + `rb` → **matched**.

Spec.md scenario explicitly requires `spec/model_spec.rb` to match `**/*.spec.rb`.
The only way this works is `[._]`. Implementation satisfies spec.md, but D3 was never updated
to document this behavior.

**False positive surface created by `[._]`**:

A file named `integration_test_helpers.ts` (a test-helper utility, not a test runner entry
point) matches `**/*_test.*`:
- regex: `^(?:.*/)?[^/]*_test[._][^/]*$`
- `integration` → `[^/]*`, `_test` → `_test`, `_` → `[._]`, `helpers.ts` → `[^/]*` → **TRUE**

With D3-strict (`\.`), `_test_helpers.ts` would NOT match `**/*_test.*` because the
separator between `_test` and the extension is `_`, not `.`. The `[._]` rule is what makes
it match.

**Boundary consequence**: If a `test-materialize` commit includes a file named
`*_test_*.ext` (helper or fixture with underscore-delimited `_test_`), it will be passed to
`runTestsAtCommit` (unchanged in local.ts). The gate may then return `failed` (if the file
produces red→red) or spuriously `passed` (if the file coincidentally satisfies base-red /
candidate-green by depending on a module added in the implementation commit).

**Not a newly introduced violation** (important for scoping): Before this change, `runTestsAtCommit`
received ALL non-artifact files from the base commit — every fixture, package.json, and `.rs`
file. The `[._]` false-positive for `_test_`-named files is a narrower surface than the
pre-change baseline. No previously-safe code now breaks; the violation existed before and is
only partially fixed.

**Maintenance hazard** (why this matters despite no immediate runtime break): TC-017 is
titled "literal `.` in a pattern is escaped and does not act as a regex wildcard" — which is
what D3 promises. A future maintainer reading D3 + TC-017 would believe `.` → `\.` and
might "correct" the implementation to match D3, breaking the spec.md Ruby scenario and any
configured patterns where `_spec_` / `_test_` separator is `_`. The `[._]` contract is
currently undocumented.

---

### F-002 [info] — TC-017 test name promises strict-dot escaping; assertions only verify a non-`_` substitution

**Location**: `src/core/step/bite-evidence/__tests__/test-file-selection.test.ts`, TC-017
describe block.

**Gap**: TC-017 verifies `matchesGlob("foo_testXts", "**/*.test.*")` is `false` (correct;
`X` is not in `[._]`). It does **not** assert that `matchesGlob("foo_test_ts", "**/*.test.*")`
is `false`. With `[._]` behavior, the latter returns `true`.

The test's passing state makes the describe-block title read as a guarantee of strict-dot
semantics. A future maintainer reading "literal `.` is escaped" and seeing a green test
would not notice that `_` in the path position of `.` is also accepted.

---

## Path-by-path verdict

| Path | Gate/floor invariant held? | Note |
|------|---------------------------|------|
| Empty set → `strategy-deferred` | ✓ | Pipeline routing unchanged; `strategy-deferred` already routed to verification in pipeline |
| `diffPathsBetweenCommits` with narrowed paths | ✓ | `git diff ... -- paths` (local.ts:995) restricts to the listed paths; verified against real impl |
| `runTestsAtCommit` with narrowed files | ✓ (narrowed, not expanded vs pre-change) | Pre-change: all non-artifact files; post-change: only test-pattern-matched files |
| `isExcludedPath` backward compat | ✓ | Re-exported from gate.ts:27 |
| Config merge of `scopedTestPatterns` | ✓ | No new keys; validation rejects bad values before merge |
| gate ↔ floor selection parity | ✓ | Structural test TC-021/TC-022 pins import invariant; same function called by both |

---

## Summary

All new paths were enumerated and the adjacent-mechanism invariants were found to be
preserved. No concrete reproduction sequence exists where an **unchanged** mechanism's
assumption is broken by the new behavior.

F-001 documents a D3/spec.md contradiction that must be resolved in documentation (either
update D3 to say "`.` → `[._]` …" or add a note in TC-017), so that future maintainers
who read D3 and see `[._]` do not treat it as a bug. The false-positive surface for
`_test_`-named helper files exists but is narrower than the pre-change baseline; it does
not constitute a newly introduced cross-boundary invariant break.
