# Regression Gate Result — Iteration 7

## Evidence Report

All 9 ledger findings were verified against the current branch state.
One contradiction was found between findings [3] and [8] that requires operator decision.

---

### [1] ea1921d9 — Ratchet Check 3 scope limited to enumerated files

**Status: FIXED — not regressed**

`listCliTsFiles()` at `src/cli/__tests__/architecture-ratchet.test.ts` lines 77–82 uses
`fs.readdirSync(CLI_DIR)` to dynamically enumerate all `.ts` files in `src/cli/`.
No hardcoded list is present. Future handler modules are automatically included.

---

### [2] 64a0c9b9 — Check 3 uses line-split regex instead of @typescript-eslint/parser

**Status: FIXED — not regressed**

`findValueImportsFrom()` (lines 219–238) uses `tseParse` from `@typescript-eslint/parser`
for AST-based analysis. It iterates `ast.body` looking for `ImportDeclaration` nodes with
`importKind !== "type"` and a matching source value. A regression guard test at line 261
verifies that multi-line imports are detected.

---

### [3] d581ef8e — Uses ctx!.invokerCwd instead of process.cwd() (per finding [3])

**Status: CONTRADICTION WITH FINDING [8] — decision-needed**

Finding [3] claims that T-14 and TC-023 require `process.cwd()`. The iteration-6 regression
gate reported finding [3] as "FIXED" when the code used `process.cwd()`. The current code
has reverted to `ctx!.invokerCwd`:

```
src/cli/scaffold-handlers.ts line 14:
  process.exit(await executeRulesNew(..., ctx!.invokerCwd));

src/cli/scaffold-handlers.ts line 20:
  process.exit(await executeReviewersNew(..., ctx!.invokerCwd));
```

However, the actual specification (tasks.md T-14, lines 252–254) and test-cases.md TC-023
(lines 322–324) both explicitly require `ctx!.invokerCwd`:

> T-14: `handleRulesNew` → `process.exit(await executeRulesNew(..., ctx!.invokerCwd))`
> T-14: cwd は `process.cwd()` を直接呼ばず `ctx!.invokerCwd` を渡す
> TC-023: `handleRulesNew` は `executeRulesNew(..., ctx!.invokerCwd)` を呼び出す

Finding [3]'s premise is factually incorrect about what T-14/TC-023 specify. The current
code is correct per the spec. This directly contradicts finding [8] which correctly
identifies `ctx!.invokerCwd` as the required value.

Fixing finding [3] (switching to `process.cwd()`) would violate finding [8] and the spec.
Keeping the current state (which satisfies finding [8] and the spec) leaves finding [3]
technically "regressed" from the iter-6 perspective.

**Operator decision required**: accept the current `ctx!.invokerCwd` implementation (which
satisfies T-14, TC-023, and finding [8]) and retire finding [3] `d581ef8e` as superseded
by the corrected spec, OR provide an authoritative ruling on which value to use.

---

### [4] 8ac21166 — Check 3 still uses regex; multi-line imports not detected

**Status: FIXED — not regressed**

Same as finding [2]. `findValueImportsFrom()` uses AST traversal via `@typescript-eslint/parser`.
The multi-line import regression guard confirms correctness.

---

### [5] fc81c003 — Check 3 uses line-splitting regex — multi-line imports from command-registry are not detected

**Status: FIXED — not regressed**

Same as findings [2] and [4]. `findValueImportsFrom()` uses `@typescript-eslint/parser`
AST-based traversal. Regression guard tests at lines 261–276 verify both multi-line value
import detection and that type-only multi-line imports are excluded.

---

### [6] 34230411 — Ratchet Check 1 misses named inline function expressions

**Status: FIXED — not regressed**

`findInlineHandlerNodes()` (lines 121–153) uses `isFunctionNode()` which detects both
`FunctionExpression` and `ArrowFunctionExpression` nodes via AST traversal. The test
"findInlineHandlerNodes detects a named inline function expression on handler:" (lines 177–181)
verifies that `handler: async function myFn() {}` is caught. Both the runtime check (`.name`)
and the AST check (parse the registry file) are present.

---

### [7] 14176e46 — findValueImportsFrom silently passes unparseable files

**Status: FIXED — not regressed**

`findValueImportsFrom()` (lines 219–238) explicitly re-throws parse errors. The comment at
lines 220–222 states: "Let parse errors propagate — callers (the ratchet tests) must not
swallow them, as that would silently skip import detection on broken files." There is no
try-catch block wrapping `tseParse()`; syntax errors propagate to the test layer.

---

### [8] 7bdae8c0 — Uses process.cwd() instead of ctx!.invokerCwd (per finding [8])

**Status: FIXED — not regressed**

The current code uses `ctx!.invokerCwd` throughout:
- `src/cli/scaffold-handlers.ts` line 14: `ctx!.invokerCwd`
- `src/cli/scaffold-handlers.ts` line 20: `ctx!.invokerCwd`
- `src/cli/usage-handler.ts` line 16: `ctx!.invokerCwd`
- `src/cli/usage-handler.ts` line 18: `ctx!.invokerCwd`

This matches the operator ruling referenced in T-14 (code-review iter 1 Finding 2) and TC-023.

Note: Finding [8] contradicts finding [3]. See finding [3] analysis above.

---

### [9] 799d92c0 — listCliTsFiles and listCliTsFilesNoTests have identical implementations

**Status: FIXED — not regressed**

`listCliTsFilesNoTests()` (lines 401–406) now delegates to `listCliTsFiles()` and adds a
filter for test files:

```typescript
function listCliTsFilesNoTests(): string[] {
  return listCliTsFiles().filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts"),
  );
}
```

The two functions have distinct bodies. `listCliTsFilesNoTests` excludes `*.test.ts` and
`*.spec.ts` files, which `listCliTsFiles` includes. A future change to one cannot silently
diverge from the other because `listCliTsFilesNoTests` is implemented as a filtered view of
`listCliTsFiles`.

---

## Evidence Summary

| Ref | Finding | Status |
|-----|---------|--------|
| ea1921d9 | Check 3 scope hardcoded list | FIXED |
| 64a0c9b9 | Check 3 line-split regex (design spec deviation) | FIXED |
| d581ef8e | ctx!.invokerCwd vs process.cwd() in scaffold-handlers.ts | CONTRADICTION with [8] |
| 8ac21166 | Check 3 regex; multi-line imports (operator ruling iter 1) | FIXED |
| fc81c003 | Check 3 regex; multi-line imports (operator ruling iter 1+2) | FIXED |
| 34230411 | Check 1 misses named inline function expressions | FIXED |
| 14176e46 | findValueImportsFrom silently passes unparseable files | FIXED |
| 7bdae8c0 | process.cwd() vs ctx!.invokerCwd (operator ruling) | FIXED |
| 799d92c0 | listCliTsFiles / listCliTsFilesNoTests identical implementations | FIXED |

**Checked**: 9 | **Skipped**: 0 | **Unverified**: 0
