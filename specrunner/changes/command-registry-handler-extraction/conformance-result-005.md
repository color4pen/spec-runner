# Conformance Result — Iteration 5

**Change**: command-registry-handler-extraction  
**Base commit**: `483c75f7`  
**Reviewer**: conformance agent  

---

## Evidence Summary

| Category | Checked | Notes |
|---|---|---|
| Normative items (request.md acceptance criteria) | 12 | All checked |
| Normative items (spec.md Requirements/Scenarios) | 9 Requirements, 18 Scenarios | All checked |
| Design decisions (D1–D7) | 7 | Context only, not a conformance gate |
| Tasks (T-01–T-23) | 23 | All marked ✅; context only |
| Implementation files reviewed | 30+ | command-registry.ts, handler modules, tests, metrics.md |

---

## 1. Inline Handler Extraction (Request §1, Spec Req-1)

**Result: PASS**

- `grep -c "handler: async" src/cli/command-registry.ts` → **0** (was 29 at base)
- Architecture ratchet Check 1 verifies this at runtime via `handler.name` and via AST scan (`findInlineHandlerNodes`) — both catch named-function-expression inlines as well as anonymous arrow functions
- 29 inline handlers extracted across 22 destination modules (7 new, 15 existing)
- All new handler modules confirmed to exist: `job-start-handler.ts`, `job-resume-handler.ts`, `job-archive-handler.ts`, `request-handlers.ts`, `scaffold-handlers.ts`, `guide-handler.ts`, `usage-handler.ts`

## 2. process.exit Removal from Registry (Request §4, Spec Req-2)

**Result: PASS**

- `grep -c "process.exit" src/cli/command-registry.ts` → **0** (was 67 at base)
- Architecture ratchet Check 2 verifies this with comment stripping + text search
- Exit code for `--detach` + `--json` case verified in `job-resume-handler.ts` → `process.exit(EXIT_CODE.ARG_ERROR)` preserved

## 3. Dependency Direction (Request §3, Spec Req-3)

**Result: PASS**

- `grep -rn "import.*command-registry" src/cli/*.ts | grep -v "type {" | grep -v "command-registry.ts"` → **0 results**
- Architecture ratchet Check 3 (AST-based, dynamic file enumeration, excludes `command-registry.ts` itself, type-only imports excluded) verifies no handler module value-imports the registry
- Check 6 verifies no `./`-prefixed dynamic imports in `src/cli/` (was 3 violations before T-19; now 0)
- Check 5 (Tarjan SCC algorithm) verifies no value-import cycles within `src/cli/`

## 4. Behavioral Preservation (Request §4, Spec Req-4)

**Result: PASS**

- Verification step passed: **836 test files, 12648 tests passed**
- `bin/specrunner.ts` diff from base: **empty** (`git diff 483c75f7 -- bin/specrunner.ts` produces no output) — D6 design decision (duck-type guard rollback) is in place
- Error boundary (`instanceof FlagParseError` / `instanceof SpecRunnerError`) unchanged

## 5. CLI Contract Identity (Request §5, Spec Req-4, Req-5, Req-6)

**Result: PASS**

- `cli-contract-snapshot.test.ts` uses `expect(normalizeCommandsTree(COMMANDS)).toEqual(baseFixture)` — NOT `toMatchSnapshot`
- `cli-contract.base.json` fixture generated from base commit `483c75f7` and committed
- `__snapshots__` directory does not exist (toMatchSnapshot removed per T-21)
- `cli-contract-normalize.ts` covers: `path`, `summary`, `visibility`, `aliasOf`, `requiresRepo`, `worktreeGuard`, `args` (name/required/count), `flags` (type/min/values/deprecated, key-sorted), `help` (group/summary/detail), `hasHandler`, `children` (key-sorted, recursive) — full D5 coverage
- ARCHIVE_USAGE re-exported from command-registry.ts: `export { ARCHIVE_USAGE } from "./archive.js"` ✅
- LOGIN_USAGE, JOB_RESUME_USAGE, REOPEN_USAGE remain as direct exports in command-registry.ts ✅

## 6. Architecture Ratchet (Request §6, Spec Req-1 Scenario 2, Req-3 Scenarios 2–3)

**Result: PASS**

Architecture ratchet `src/cli/__tests__/architecture-ratchet.test.ts` contains all 6 required checks:

| Check | Method | What it detects |
|---|---|---|
| 1 | Runtime `handler.name` + AST (`findInlineHandlerNodes`) | Inline handlers (anonymous AND named function expressions) |
| 2 | Comment-stripped source text | `process.exit` in command-registry.ts |
| 3 | AST (`@typescript-eslint/parser`), dynamic file enumeration | Handler → registry value-import cycles |
| 4 | Comment-stripped source, regex | Parallel CLI contract exports |
| 5 | AST import graph + Tarjan SCC | Value-import cycles within src/cli/ |
| 6 | AST `ImportExpression` scan | `./`-prefixed dynamic imports within src/cli/ |

Checks 3, 5, 6 use dynamic file enumeration (no hardcoded list), so new handler modules are automatically covered.  
Regression examples embedded in test for Checks 1, 3, 6 confirm detectors catch violations.

## 7. COMMANDS Tree as Sole CLI Contract (Spec Req-4 Scenario 1)

**Result: PASS**

- `grep -rn "export const COMMANDS" src/cli/*.ts` → only `command-registry.ts:549` ✅
- No parallel command registries created; handler modules have no flag/help/alias definitions
- Architecture ratchet Check 4 enforces this mechanically

## 8. Registry Imports (Request §3, Spec Req-3 Scenario 3)

**Result: PASS**

Registry imports at HEAD:
- `CREDENTIALS_SET_USAGE` from `./credentials.js` — help/detail string (CLI metadata)
- `AGENT_STEP_NAMES`, `CLI_STEP_NAMES` from step-names — used in flag `values` arrays
- `type FlagDef` — type-only import
- `GUIDE_TOPICS` — used in help.summary template
- `ARCHIVE_USAGE` from `./archive.js` — imported and re-exported (D3)
- Handler function references (handleInit, handleLogin, …) — 20 named handler imports

No `fs`, `path`, `resolveGitHubToken`, `createGitHubClient`, `loadConfigWithOverlay`, `parseRequestMdRaw`, or `SLUG_REGEX` remain in command-registry.ts.

## 9. USAGE Constants Importable from Registry (Spec Req-7)

**Result: PASS**

- `ARCHIVE_USAGE` re-exported from archive.ts: `export { ARCHIVE_USAGE } from "./archive.js"` ✅
- `LOGIN_USAGE`, `JOB_RESUME_USAGE`, `REOPEN_USAGE`, `USAGE` remain direct exports in command-registry.ts ✅
- Test imports like `import { ARCHIVE_USAGE } from "../command-registry.js"` continue to resolve

## 10. metrics.md (Spec Req-9, T-23)

**Result: PASS with note**

`specrunner/changes/command-registry-handler-extraction/metrics.md` exists and covers all 10 required items from request.md:

1. command-registry.ts LOC: 1696 → 1084
2. Inline handler count: 29 → 0
3. Named handler reference count: 30 → 30
4. Registry process.exit: 67 → 0
5. Repository-wide process.exit (production): 95 → 98 [**see note below**]
6. Registry fs/credential/GitHub client imports: 4 → 0
7. Handler module count and family table: 3 new dedicated modules
8. Value-import SCC count: 0 → 0
9. CLI contract comparison target count: 30
10. src/cli dynamic `./` import count: 0 → 3 → 0

**Note on item 5** (process.exit count): The production count went from 95 (base) to 98 (HEAD), a difference of +3. Investigation shows this is attributable to new JSDoc comment lines added to handler functions (e.g., `* Wraps runCredentialsSet and calls process.exit with the returned code.` in credentials.ts, init.ts, login.ts). At the real-code level, exactly 67 process.exit calls were moved from registry to handler files (net zero change in executable statements). The metrics.md documents the T-19 before/after comparison (98→98) under T-23's acceptance criteria, which is accurate for that phase but does not explicitly show the base→HEAD comparison. The spec scenario's grep command (`grep -r "process.exit" src/ --include="*.ts" | wc -l`) gives 104 (base) vs 131 (HEAD), where the +27 difference is primarily from new test files required by other spec requirements (architecture-ratchet tests, CLI contract snapshot tests). No process.exit logic was added, reduced, or return-contracted.

The spec scenario's exact command fails (104 ≠ 131) but the normative MUST — "R3a は process.exit の集約・削減・return contract 化を行わない" — is satisfied: all 67 calls were moved 1:1 without aggregation, reduction, or contract change.

## 11. bin/specrunner.ts Unchanged (Spec Req-8)

**Result: PASS**

`git diff 483c75f7 -- bin/specrunner.ts` produces no output — base parity confirmed.

---

## Normative Items Not Fully Satisfied

### Finding F-1 (LOW)

**Spec requirement**: Req-8 / "Requirement: repository 全体の process.exit 件数が変化しない"  
**Scenario**: "件数が同一である（削減も増加もしていない）" using `grep -r "process.exit" src/ --include="*.ts" | wc -l`  
**Observation**: Base = 104; HEAD = 131 (+27). Production-only (excluding tests) = 95 → 98 (+3 from JSDoc comment lines).  
**Root cause**: The spec's scenario grep command captures comment lines and test-file references. New handler functions were documented with JSDoc comments mentioning `process.exit` (+3 lines: credentials.ts, init.ts, login.ts). New test files required by Spec Req-5/6 (architecture-ratchet, CLI contract snapshot) also reference `process.exit` in mocks/assertions.  
**Normative MUST status**: Satisfied — no process.exit logic was aggregated, reduced, or return-contracted. All 67 real code calls were moved 1:1 from registry to handlers.  
**Fix target**: spec-fixer — the scenario command should exclude comment lines and test files to accurately measure what the MUST intends (e.g., `grep -r "process\.exit" src/ --include="*.ts" | grep -v '\.test\.\|__tests__\|^\s*\*\|^\s*//' | wc -l`).

---

## Overall Assessment

All normative acceptance criteria from request.md are met:

| # | Criterion | Status |
|---|---|---|
| 1 | inline handler 29→0 | ✅ |
| 2 | registry = declaration + named handler refs | ✅ |
| 3 | registry has no filesystem/credential/GitHub client command processing | ✅ |
| 4 | registry process.exit 67→0 | ✅ |
| 5 | exit call conditions/order/codes unchanged, handler-side | ✅ |
| 6 | handler→registry value-import cycle = 0 | ✅ |
| 7 | CommandSpec remains sole CLI contract | ✅ |
| 8 | CLI structural comparison matches base | ✅ |
| 9 | existing contract tests green (836 files, 12648 tests) | ✅ |
| 10 | architecture ratchet with 6 AST/runtime checks | ✅ |
| 11 | verification green | ✅ |
| 12 | no observable behavior changes | ✅ (bin unchanged, no CLI contract diff) |

One low-severity finding (F-1) relates to the spec scenario's measurement method for the process.exit count requirement. The normative MUST is satisfied; the finding is a spec-fixer issue.
