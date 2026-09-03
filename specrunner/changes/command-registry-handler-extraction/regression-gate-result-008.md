# Regression Gate Result — Iteration 8

**Branch**: refactor/command-registry-handler-extraction-8e40e1f4  
**Date**: 2026-09-03  
**Ledger items**: 9  
**Regressions found**: 0

---

## Evidence Per Finding

### [ea1921d9] LOW — Ratchet Check 3 scope limited to enumerated files

**Verdict**: FIXED

Check 3 (`architecture-ratchet.test.ts:241`) uses `listCliTsFiles()` (line 77–82), which dynamically calls `fs.readdirSync(CLI_DIR)` and filters for `.ts` files. No hardcoded list is present. Future new handler modules in `src/cli/` are automatically included.

---

### [64a0c9b9] MEDIUM — Check 3 uses line-split regex instead of @typescript-eslint/parser

**Verdict**: FIXED

`findValueImportsFrom` (lines 219–238) uses `tseParse` from `@typescript-eslint/parser` to build an AST, iterates over `ast.body` nodes, and matches `ImportDeclaration` nodes with `importKind !== "type"`. No newline-splitting or regex is used. A regression guard test at line 260 confirms multi-line imports are detected.

---

### [d581ef8e] LOW — Uses ctx!.invokerCwd instead of process.cwd()

**Verdict**: SUPERSEDED (per operator ruling, iter 7 escalation)

The authoritative requirement is `ctx!.invokerCwd` per tasks.md T-14 and TC-023. `scaffold-handlers.ts` (lines 14, 20) correctly uses `ctx!.invokerCwd`. No action needed.

---

### [8ac21166] MEDIUM — Check 3 still uses regex; multi-line imports not detected

**Verdict**: FIXED

Same as `64a0c9b9`. `findValueImportsFrom` is fully AST-based. Multiline imports are detected. A regression guard test explicitly verifies this (line 260–267).

---

### [fc81c003] MEDIUM — Check 3 uses line-splitting regex

**Verdict**: FIXED

Same as `64a0c9b9` and `8ac21166`. The AST-based implementation is in place and regression-guard tested.

---

### [34230411] LOW — Ratchet Check 1 misses named inline function expressions

**Verdict**: FIXED

Check 1 now includes a second test at lines 169–174 that uses AST-based `findInlineHandlerNodes` (lines 121–153). This function uses `isFunctionNode` to detect both `ArrowFunctionExpression` and `FunctionExpression` nodes regardless of name. A regression guard test at lines 177–181 confirms named inline function expressions (`handler: async function myFn() {}`) are caught.

---

### [14176e46] LOW — findValueImportsFrom silently passes unparseable files

**Verdict**: FIXED

`findValueImportsFrom` (lines 219–238) has no try-catch. The doc comment at lines 210–218 explicitly states: "Parse errors are intentionally re-thrown". A parse failure surfaces as a thrown exception in the ratchet test, not a silent empty array.

---

### [7bdae8c0] MEDIUM — Uses process.cwd() instead of ctx!.invokerCwd

**Verdict**: FIXED (confirmed by operator ruling)

`scaffold-handlers.ts` line 14: `ctx!.invokerCwd` is passed to `executeRulesNew`.  
`scaffold-handlers.ts` line 20: `ctx!.invokerCwd` is passed to `executeReviewersNew`.  
No `process.cwd()` call appears in either handler. Operator ruling (iter 7) confirms `ctx!.invokerCwd` is the correct value.

---

### [799d92c0] LOW — listCliTsFiles and listCliTsFilesNoTests have identical implementations

**Verdict**: FIXED

`listCliTsFiles` (lines 77–82): reads `CLI_DIR`, filters `.ts` excluding `.d.ts` — includes test files.  
`listCliTsFilesNoTests` (lines 402–406): delegates to `listCliTsFiles()` then additionally filters out `.test.ts` and `.spec.ts` files.  
The two functions have clearly distinct behavior; `listCliTsFilesNoTests` is a proper subset filter of `listCliTsFiles`.

---

## Summary

All 9 ledger findings are either FIXED or SUPERSEDED. No regressions detected.

| Ref | Severity | Status |
|---|---|---|
| ea1921d9 | LOW | Fixed |
| 64a0c9b9 | MEDIUM | Fixed |
| d581ef8e | LOW | Superseded |
| 8ac21166 | MEDIUM | Fixed |
| fc81c003 | MEDIUM | Fixed |
| 34230411 | LOW | Fixed |
| 14176e46 | LOW | Fixed |
| 7bdae8c0 | MEDIUM | Fixed |
| 799d92c0 | LOW | Fixed |
