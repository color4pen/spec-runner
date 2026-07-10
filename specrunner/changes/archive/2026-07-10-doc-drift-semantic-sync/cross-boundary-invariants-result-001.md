# Cross-Boundary Invariants Review — doc-drift-semantic-sync — iter 1

## Reviewer
cross-boundary-invariants

## Purpose
diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope of Changes

```
README.md                                      |   2 +-
architecture/domain-model.md                   |   2 +-
src/core/pipeline/registry.ts                  |   4 +-   (comments only)
tests/unit/docs/doc-drift-sync.test.ts         | 145 +++ (new)
specrunner/changes/doc-drift-semantic-sync/... | (pipeline artifacts)
```

---

## Findings

### F-01 — README `code-review` token: existing drift guard stays intact [PASS]

`readme-pipeline-sync.test.ts` asserts that `README.md` contains every value from `STEP_NAMES`, including `"code-review"`. The new README line is:

> "…run as a **parallel fan-out** after `code-review` — member reviewers execute concurrently…"

The literal token `code-review` is preserved. The existing guard produces no false failure. ✓

### F-02 — registry.ts: only comment text changed [PASS]

`git diff` confirms that the only mutations in `src/core/pipeline/registry.ts` are the JSDoc comment strings at lines 27 and 166. The `steps` arrays, transitions, role assignments, and all exported descriptor objects are untouched. `STANDARD_DESCRIPTOR.steps.length` remains 13; `DESIGN_ONLY_DESCRIPTOR.steps.length` 1; `FAST_DESCRIPTOR.steps.length` 9. The new test derives expected values from these live descriptor objects (`descriptor.steps.length`), so the guard is self-consistent. ✓

### F-03 — domain-model.md `status` clause: unchanged text on same line [PASS]

Line 20 after the fix:

```
`version` は `1 | 2`（新規 state は 2、旧 version 1 は read 時に 2 へ normalize）。`status` は `JobStatus` の列挙内（validateJobState が強制）。
```

The axis-(b) guard uses `` /`version` は[^。]*。/ `` which stops at the first `。`. The extracted clause is:

> `` `version` は `1 | 2`（新規 state は 2、旧 version 1 は read 時に 2 へ normalize）。 ``

The `status` clause that follows is not consumed. The guard does not touch or invalidate the `status` clause. The invariant note "正確なフィールドはコードが正典" on line 21 is untouched. ✓

### F-04 — Axis (b) regex scope: no cross-contamination from config schema [PASS]

`SCHEMA_PATH = path.resolve(process.cwd(), "src/state/schema.ts")`. This file contains exactly one `version:` line:

```ts
  version: 1 | 2;   // line 252
```

`src/config/schema.ts` contains `version: 1;` and `version: literal(1, ...)` but is never read by the test. The regex `/version:\s*([\d\s|]+);/` on `src/state/schema.ts` matches uniquely and parses `[1, 2]`. No cross-contamination from the config layer. ✓

### F-05 — Axis (a) pattern anchoring: no false positives from `fast.*` context [PASS]

Other occurrences of `fast` in registry.ts (lines 110 and 158, both `pipeline.fast.forbiddenSurfaces`) do not match `/fast\s*\((\d+)-step/g` because they don't have the `(N-step` suffix. The only match is line 166: `fast (9-step slim with scope)`. ✓

### F-06 — `Standard\s+` vs `standard\s*\(` coverage of both registry comment sites [PASS]

Two patterns guard the standard pipeline:

- `/Standard\s+(\d+)-step/g` → matches line 27: `Standard 13-step pipeline descriptor.` (capital S, space before N)
- `/standard\s*\((\d+)-step\)/g` → matches line 166: `standard (13-step)` (lower s, paren-wrapped)

Both patterns use `\s*` / `\s+` that accommodate spacing variations. Both captures equal `STANDARD_DESCRIPTOR.steps.length = 13`. If either annotation were reverted to 12, the assertion `expect(n).toBe(expected)` would fail. If either were deleted, the "at least one match" assertion would fail. Dual-site coverage is complete. ✓

### F-07 — `version` regex with whitespace in capture group: parsing is robust [PASS]

`([\d\s|]+)` captures `1 | 2` including surrounding spaces. After `.split("|").map(s => s.trim()).filter(s => s.length > 0).map(Number)` the result is `[1, 2]`. A future union like `1 | 2 | 3` or `1|2|3` (no spaces) yields the correct member set either way. No brittle edge on the current or plausible future declaration forms. ✓

### F-08 — `cwd()` convention matches established sibling test [PASS]

`readme-pipeline-sync.test.ts` uses `path.resolve(process.cwd(), "README.md")` — the same convention as `doc-drift-sync.test.ts`. Verification confirmed green (`test: passed`, 18.7s). The import path `../../../src/core/pipeline/registry.js` from `tests/unit/docs/` resolves correctly to the repo root. ✓

### F-09 — domain-model.md `version` clause: both union members present in clause [PASS]

Extracted clause: `` `version` は `1 | 2`（新規 state は 2、旧 version 1 は read 時に 2 へ normalize）。 ``

`"1"` appears in `` `1 | 2` `` and again in `旧 version 1 は`. `"2"` appears in `` `1 | 2` `` and in `新規 state は 2`. Both `.toContain("1")` and `.toContain("2")` pass. If reverted to "`version` は常に 1", `"2"` is absent and the guard fails as intended. ✓

---

## Non-Issues (Noted but not flagged)

- **Single `version:` occurrence in state schema** — Safe today; would become a latent risk only if a second `version:`-typed field were added to `JobState` (not anticipated given the interface design). The design's risk note acknowledges this.
- **Clause extraction fragility** — `` /`version` は[^。]*。/ `` could mis-scope on prose restructuring. Mitigated: T-03 fixes the clause to a stable form and the design documents the expected shape in a comment inside the test.
- **Unguarded parallelism prose** — README:94 now says "parallel fan-out" but no machine guard enforces it. Accepted per D6 (no crisp implementation flag to compare against). Out of scope for this change.

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| F-01: README `code-review` token | — | PASS |
| F-02: registry.ts comments-only change | — | PASS |
| F-03: `status` clause untouched | — | PASS |
| F-04: state vs config schema scope | — | PASS |
| F-05: fast pattern anchoring | — | PASS |
| F-06: standard dual-site coverage | — | PASS |
| F-07: version regex whitespace parsing | — | PASS |
| F-08: cwd() convention | — | PASS |
| F-09: version clause membership | — | PASS |

No cross-boundary invariant violations found. The three documentation fixes are accurate reflections of the implementation. The new guards derive truth from live implementation objects and parsed source text — no hardcoded literals. Existing tests remain green without modification.

- **verdict**: approved
