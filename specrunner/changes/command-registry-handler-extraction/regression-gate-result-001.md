# Regression Gate Result — Iteration 1

## Evidence

### Finding [1] — ea1921d9 (LOW)
**Claim**: Check 3 scope was limited to a hardcoded file list.

**Verification**: `src/cli/__tests__/architecture-ratchet.test.ts` defines `listCliTsFiles()` (lines 65–70) using `fs.readdirSync(CLI_DIR).filter(f => f.endsWith(".ts") && !f.endsWith(".d.ts"))`. This is fully dynamic; no hardcoded list exists. `design.md` line 121 explicitly documents "ハードコードリストに依存しないことで" (dynamic enumeration). **Fix is present — no regression.**

### Finding [2] — 64a0c9b9 (MEDIUM)
**Claim**: Check 3 used line-split regex instead of `@typescript-eslint/parser`.

**Verification**: `src/cli/__tests__/architecture-ratchet.test.ts` defines `findValueImportsFrom()` (lines 115–139) which calls `tseParse(source, ...)` (imported as `parse` from `@typescript-eslint/parser`) and iterates `ast.body` looking for `ImportDeclaration` nodes with `importKind !== "type"`. No line-splitting regex is used for cycle detection. **Fix is present — no regression.**

### Finding [3] — d581ef8e (LOW)
**Claim**: `scaffold-handlers.ts` and `usage-handler.ts` use `ctx!.invokerCwd` instead of `process.cwd()` as specified in tasks.md T-14 and TC-023.

**Verification**: 
- `src/cli/scaffold-handlers.ts:14`: `process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, ctx!.invokerCwd))`
- `src/cli/scaffold-handlers.ts:20`: `process.exit(await executeReviewersNew(parsed.positional!, ctx!.invokerCwd))`
- `src/cli/usage-handler.ts:16`: `process.exit(await showUsage(slug, ctx!.invokerCwd))`
- `src/cli/usage-handler.ts:18`: `process.exit(await showUsageSummary(ctx!.invokerCwd))`

`ctx!.invokerCwd` is still used in all four call sites. The spec deviation from tasks.md T-14 / TC-023 is still present. **Finding is still present — regression.**

### Finding [4] — 8ac21166 (MEDIUM)
**Claim**: Check 3 still uses line-by-line regex; multi-line imports not detected.

**Verification**: Same as Finding [2] — `findValueImportsFrom()` uses full AST traversal. Additionally, a regression-guard test (lines 161–168) verifies the helper catches a multi-line value import (`import {\n  COMMANDS\n} from "../command-registry.js"`). **Fix is present — no regression.**

### Finding [5] — fc81c003 (MEDIUM)
**Claim**: Check 3 splits source by newline and misses multi-line imports from command-registry.

**Verification**: Same as Findings [2] and [4]. The AST-based `findValueImportsFrom` implementation and the multi-line detection test (`findValueImportsFrom detects a multi-line value import from command-registry`, lines 161–168) are both present. **Fix is present — no regression.**

## Summary

| # | Provenance Ref | Severity | Status |
|---|---------------|----------|--------|
| 1 | ea1921d9 | LOW | Fixed |
| 2 | 64a0c9b9 | MEDIUM | Fixed |
| 3 | d581ef8e | LOW | **Regression** |
| 4 | 8ac21166 | MEDIUM | Fixed |
| 5 | fc81c003 | MEDIUM | Fixed |
