# Spec: bundle-zod-runtime

## Requirements

### Requirement: dist/specrunner.js SHALL contain no external zod imports

After `bun run build`, the produced `dist/specrunner.js` MUST NOT contain any
bare import or require reference to the `zod` package (including subpaths such
as `zod/v4-mini` and `zod/v4`). All zod symbols used in `src/` SHALL be
resolved and inlined into the bundle by esbuild at build time.

#### Scenario: build produces a self-contained bundle

**Given** `tsup.config.ts` has `noExternal: ['zod']`
**When** `bun run build` completes successfully
**Then** `grep -E "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js` returns 0 matches

---

### Requirement: zod SHALL be listed only in devDependencies

`package.json` MUST have `zod` in `devDependencies` and MUST NOT have `zod`
in `dependencies`. Consumers installing the package SHALL NOT receive zod as a
transitive runtime dependency.

#### Scenario: package.json dependency classification

**Given** the change is applied
**When** `cat package.json` is inspected
**Then** `.dependencies` does not contain a `"zod"` key
**And** `.devDependencies` contains `"zod": "^4.0.0"`

---

### Requirement: the CLI SHALL start without a consumer-installed zod

`dist/specrunner.js` MUST be executable via Node without any `zod` package
present in the consumer's `node_modules`. No `ERR_UNSUPPORTED_DIR_IMPORT` or
`MODULE_NOT_FOUND` error for `zod` SHALL occur on startup.

#### Scenario: --help succeeds without external zod

**Given** `dist/specrunner.js` has been built with zod bundled
**When** `node dist/specrunner.js --help` is executed in an environment where
`node_modules/zod` is absent or corrupted
**Then** the process exits 0 and prints usage information without any
`ERR_UNSUPPORTED_DIR_IMPORT` error

---

### Requirement: existing tests and typecheck SHALL remain green

The change MUST NOT break any existing test or type-check. `bun test` and
`bun run typecheck` MUST both exit 0 after the change is applied.

#### Scenario: test suite passes after bundling change

**Given** T-01 and T-02 are applied (noExternal + devDeps move)
**When** `bun test` is executed
**Then** all tests pass (exit 0)

#### Scenario: typecheck passes after devDependencies move

**Given** `zod` is moved to `devDependencies`
**When** `bun run typecheck` is executed
**Then** TypeScript reports no errors (exit 0), because `devDependencies` are
available during local development and CI typecheck
