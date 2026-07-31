# Cross-Boundary Invariants Review — bite-evidence-test-file-selection — iter 2

## Scope

`git diff main...HEAD --stat`: 27 files, 3522 insertions / 19 deletions.
Primary changes from iter 1: `test-file-selection.ts` — `matchesGlob` dot handling changed
from `[._]` to `\.` (D3-strict). `spec.md` updated with explicit dot-is-literal note at
scenario "configured patterns replace the default". TC-017 tests extended with `foo_test_ts`
and `x_test_helpers.ts` assertions. `docs/configuration.md` Ruby example uses `**/*.spec.rb`.

---

## Iter-1 findings status

### F-001 [resolved] — `matchesGlob` compiled `.` to `[._]`; D3 and TC-017 promised strict-dot

**Resolution**: `matchesGlob` now uses `ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&")` for all
non-`*` characters, compiling `.` to `\.` (regex-literal). D3 in design.md was already
correct; `spec.md:53` now adds an inline clarification: "`.` は glob で literal であり、
`_spec.` を `**/*.spec.rb` で拾うような暗黙変換は行わない". TC-017 adds two new assertions:
- `matchesGlob("foo_test_ts", "**/*.test.*")` → false  (was true with `[._]`)
- `selectMaterializedTestFiles(["x_test_helpers.ts"], undefined)` → empty  (was non-empty)

Both assertions are green. The false-positive surface for `_test_`-named helper files is
eliminated. The iteration-1 undocumented implicit contract no longer exists.

### F-002 [resolved] — TC-017 title promised strict-dot; assertions did not verify `foo_test_ts` = false

**Resolution**: TC-017 now explicitly asserts both `foo_test_ts` (false) and the
`x_test_helpers.ts` end-to-end case. The describe-block title and assertions are now
self-consistent.

---

## New paths enumerated (iter 2)

| # | New path | Adjacent mechanism | Invariant check |
|---|----------|-------------------|-----------------|
| N1 | `\.` for `.` in `matchesGlob` | Default patterns `**/*.test.*`, `**/*.spec.*`, `**/*_test.*` | All three default patterns produce strictly narrower match sets. `foo.test.ts`, `pkg/bar.spec.ts`, `mod/baz_test.ts` still selected (literal dots match). `_test_helpers.ts` now correctly excluded. Verified by TC-002, TC-017. |
| N2 | `spec.md:53` clarification | TC-005 using `**/*_spec.rb` | Test uses underscore-based pattern (correct for RSpec `_spec.rb` convention). No conflict with `\.` behavior. |
| N3 | `docs/configuration.md` Ruby example `**/*.spec.rb` | `matchesGlob` with `\.` | See F-001 below. |

---

## Findings

### F-001 [medium] — docs Ruby example uses `**/*.spec.rb`; with `\.` this does NOT match standard RSpec `_spec.rb` files

**Location**: `docs/configuration.md:238` — the Ruby project example:

```json
{ "verification": { "scopedTestPatterns": ["**/*.spec.rb"] } }
```

**What `\.` produces**:
- `**/*.spec.rb` compiles to `^(?:.*/)?[^/]*\.spec\.rb$`
- Matches: `spec/user.spec.rb` (dot separator — uncommon in RSpec)
- Does NOT match: `spec/models/user_spec.rb` (underscore — standard RSpec convention)

**The gap**: A user configuring `**/*.spec.rb` for a standard RSpec project would find
that the gate returns `strategy-deferred` ("no matching test files") rather than executing
their test files. The test suite's own TC-005 correctly uses `**/*_spec.rb` (which compiles
to `^(?:.*/)?[^/]*_spec\.rb$` and matches `spec/model_spec.rb`). The docs and the test
diverge on which pattern to recommend for Ruby.

**Historical note**: With the iteration-1 `[._]` behavior, `**/*.spec.rb` would have matched
`user_spec.rb` via `_` → `[._]`. The docs example was written during this PR; it reflects
an assumption about pattern semantics that no longer holds after the `\.` fix.

**No runtime break** for existing users (no one has deployed this change yet). But a user
who reads the docs and configures `["**/*.spec.rb"]` for a standard RSpec project would
observe a silent `strategy-deferred` (no test files selected), while the correct pattern is
`["**/*_spec.rb"]`.

**Suggested fix**: Change the Ruby example to `"**/*_spec.rb"` to match the RSpec convention
and align with TC-005. The Go example (`**/*_test.go`) is already correct.

---

## Path-by-path verdict

| Path | Gate/floor invariant held? | Note |
|------|---------------------------|------|
| `\.` semantics in `matchesGlob` | ✓ | D3-strict, verified by TC-015/016/017; aligns with spec.md:53 |
| `**/*_test.*` false-positive for `_test_`-named helpers | ✓ fixed | Previously selected via `[._]`; now excluded. TC-017 pins this. |
| Default patterns cover JS/TS test files | ✓ | `foo.test.ts`, `bar.spec.ts`, `baz_test.ts` all still selected |
| Pipeline routing `strategy-deferred → verification` | ✓ | Transition table unchanged (types.ts:252); test TC-026 unchanged |
| `diffPathsBetweenCommits` with narrowed paths | ✓ | Same as iter 1 analysis |
| `runTestsAtCommit` with narrowed files | ✓ | Receives same or fewer files vs iter 1 |
| `isExcludedPath` backward compat re-export | ✓ | `gate.ts:27` re-export unchanged |
| Gate ↔ floor selection parity | ✓ | Same shared function, same behavioral change |
| Config `scopedTestPatterns: []` → CONFIG_INVALID | ✓ | Validation unchanged; runtime fallback in `resolveScopedTestPatterns` is an independent defense |
| docs/configuration.md Ruby example | ✗ see F-001 | `**/*.spec.rb` does not match `_spec.rb` files with `\.` |

---

## Summary

The two findings from iteration 1 are resolved. The `[._]` → `\.` change correctly
implements D3 and the spec.md clarification. TC-017 now has assertions that pin the
strict-dot behavior.

One new finding (F-001): the Ruby example in `docs/configuration.md` (`**/*.spec.rb`)
does not match the standard RSpec file naming convention (`_spec.rb`) with the now-correct
`\.` implementation. The correct pattern for RSpec is `**/*_spec.rb`, which is what TC-005
already uses.

No implementation paths introduce a newly broken adjacent-mechanism assumption. The gate's
`strategy-deferred` routing is already established. The floor's fail-closed behavior on
empty selection is unchanged.
