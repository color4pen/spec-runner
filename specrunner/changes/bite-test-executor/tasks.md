# Tasks: run materialized tests in the isolated worktree under a repo's own runner

<!-- Implementer: read specrunner/changes/bite-test-executor/design.md and spec.md first.
     Do NOT modify .specrunner/config.json (dogfood enablement is out of scope).
     Do NOT modify src/core/port/runtime-strategy.ts (no port-signature change; the new
     field rides on the existing `config` parameter). -->

## T-01: Add the opt-in `scopedTestCommand` config field and its validation

- [ ] In `src/config/schema/types.ts`, add `scopedTestCommand?: string` to the `VerificationConfig`
      interface (currently `commands?` + `coverage?` at `types.ts:142-158`), with a doc comment:
      "Command that runs only the test files appended as trailing arguments (file-scopable). Opt-in;
      enables scoped isolated execution under custom `commands`. Provider-neutral."
- [ ] In `src/config/schema/validation.ts`, add `scopedTestCommand: optional(nonEmptyString("must
      be a non-empty string."))` to the `verification` object schema (`validation.ts:264-298`),
      reusing the existing `nonEmptyString` helper (`validation.ts:118`). Do not introduce a new
      helper.
- [ ] Do NOT edit `.specrunner/config.json`.

**Acceptance Criteria**:
- A config whose `verification` declares both `commands` and a non-empty `scopedTestCommand`
  validates successfully and the field is preserved on the resolved config.
- A config whose `verification` declares only `commands` validates successfully with
  `scopedTestCommand` absent (no regression to existing verification-config tests).
- `scopedTestCommand: ""` (empty string) is rejected by validation.
- `typecheck` passes.

## T-02: Rework `LocalRuntime.runTestsAtCommit` — dependency symlink + scoped per-file execution

- [ ] In `src/core/runtime/local.ts:901-982`, replace the custom-commands bail (`local.ts:938-943`)
      with the D3 precedence:
  - `scopedTestCommand` = `config.verification?.scopedTestCommand?.trim()`. When it is a non-empty
    string → **scoped path**.
  - Else if `config.verification?.commands` is non-empty → return `{ kind: "unavailable", reason:
    "custom verification.commands present but no scopedTestCommand configured (scoped isolated
    execution is opt-in)" }`.
  - Else → **default path**, unchanged (`bun test <file>` via `this.spawnFn`, `cwd = tmpBase`).
- [ ] **Scoped path — dependency resolution (D1)**: after a successful `git worktree add`, verify
      `<cwd>/node_modules` exists (e.g. `fs.stat`/`fs.access`); if absent, return `{ kind:
      "unavailable" }` (fail-closed) without running tests. Otherwise create the symlink
      `<tmpBase>/node_modules` → `<cwd>/node_modules` (`fs.symlink(path.join(cwd, "node_modules"),
      path.join(tmpBase, "node_modules"), "dir")`); track that it was created.
- [ ] **Scoped path — per-file execution (D3)**: for each `testFile`, run a single `sh -c`
      invocation `<scopedTestCommand> '<shell-quoted testFile>'` via the verification `spawnCommand`
      (`src/core/verification/commands.ts:56`) with `cwd = tmpBase` and `env = process.env` (secrets
      are stripped inside `spawnCommand`; `<tmpBase>/node_modules/.bin` is prepended to `PATH`
      because `cwd = tmpBase`). Import it under an alias (e.g.
      `import { spawnCommand as spawnScopedCommand } from "../verification/commands.js"`) to avoid
      colliding with the `spawnCommand` already imported from `../../util/spawn.js` (`local.ts:23`).
      Push `{ file: testFile, passed: result.exitCode === 0 }`. Wrap each invocation so a spawn
      throw becomes `{ file, passed: false }` (mirror the existing per-file catch at
      `local.ts:953-956`).
- [ ] Single-quote-escape each `testFile` before appending (e.g. wrap in single quotes and replace
      any `'` with `'\''`) so paths with spaces/special characters cannot mis-split under `sh -c`.
- [ ] **Cleanup (D4)**: in the existing `finally`, when the symlink was created, remove it first via
      `fs.rm(path.join(tmpBase, "node_modules"), { force: true })` (unlinks the symlink; never
      follows it) BEFORE the existing `git worktree remove --force` + `fs.rm(tmpBase, { recursive,
      force })` fallback.
- [ ] Update the method's leading JSDoc (`local.ts:888-900`) to describe the scoped/default/bail
      branches and the `node_modules` symlink. Do not change the method signature.
- [ ] Do NOT edit `src/core/port/runtime-strategy.ts` or `src/core/runtime/managed.ts`.

**Acceptance Criteria**:
- `scopedTestCommand` set: custom `verification.commands` no longer causes a bail; each test file is
  run individually and per-file `{ file, passed }` is returned (`passed` iff exit 0).
- `scopedTestCommand` unset + custom commands present: returns `{ kind: "unavailable" }`.
- No custom commands + no `scopedTestCommand`: default `bun test` path is byte-for-behavior
  unchanged.
- Scoped path with `<cwd>/node_modules` absent: returns `{ kind: "unavailable" }`, no test run.
- The method never throws; failed `worktree add`, non-existent OID, and spawn errors yield
  `unavailable`.
- `typecheck` passes.

## T-03: Update the backward-compat test to the opt-in premise and add the scoped `ran` case

- [ ] In `src/core/runtime/__tests__/bite-evidence-isolated-exec.test.ts`, update the existing case
      at `:103-107` ("custom verification.commands → unavailable") so its intent is explicit: config
      has custom `commands` and NO `scopedTestCommand` → `unavailable` (opt-in not enabled). Keep it
      asserting `kind === "unavailable"` (do not assert on the reason text).
- [ ] Add a case: config with custom `commands` AND a `scopedTestCommand` that resolves (e.g. a
      zero-dependency runner over the existing self-contained fixture) → `{ kind: "ran" }`.

**Acceptance Criteria**:
- The updated `unavailable` case passes and documents the `scopedTestCommand`-unset premise.
- The new `scopedTestCommand`-set case returns `{ kind: "ran" }` with a per-file result.
- All other pre-existing cases in this file pass unchanged (including empty-testFiles, cleanup,
  non-existent OID, and the default `bun test` path).

## T-04: Real-runtime integration test — dependency resolution and scoped per-file pass/fail (T1/T2/T4)

- [ ] Add a real-`LocalRuntime` integration test (extend
      `src/core/runtime/__tests__/bite-evidence-isolated-exec.test.ts` or add a sibling
      `*-scoped-exec.test.ts`) using a real throwaway git repo:
  - Build a hand-made dependency under `<repo>/node_modules/<dep>` (a `package.json` + entry
    module) — no network install.
  - Commit a test file that imports `<dep>` and asserts on it, runnable by a hermetic runner (e.g.
    `scopedTestCommand: "bun test"` with a `bun:test` fixture built via string concatenation so the
    no-bun-imports scanner does not flag the source, matching the existing fixture pattern at
    `:56-60`).
  - Config: `{ verification: { commands: [...], scopedTestCommand: "<runner>" } }`.
  - Assert `runTestsAtCommit(oid, [testFile], repo, config)` → `{ kind: "ran" }` with correct
    per-file `passed`.
- [ ] **Break-check (T2)**: with the same setup but the dependency source removed/renamed (so the
      symlink cannot resolve `<dep>`), assert the result is no longer a passing `ran` — either
      `{ kind: "unavailable" }` (no `node_modules`) or `ran` with `passed === false`.
- [ ] **Per-file granularity (T4)**: run at least two materialized test files where one passes and
      one fails, and assert each file's `passed` independently reflects its own outcome.
- [ ] Assert the source `<repo>/node_modules` still exists after a run (cleanup does not delete the
      symlink target).

**Acceptance Criteria**:
- Real `LocalRuntime` + custom `verification.commands` + `scopedTestCommand` over a real repo with a
  real dependency returns `{ kind: "ran" }` with correct per-file pass/fail (no fakes).
- Removing the `node_modules` source flips the result away from a passing `ran`.
- A mixed pass/fail file set is identified per file.
- The source `node_modules` survives cleanup; no `specrunner-bite-evidence` worktree remains.

## T-05: End-to-end tooth test — gate/floor bite green via real runtime (T5)

- [ ] Add a test that drives the real `runBiteEvidenceGate` (`src/core/step/bite-evidence/gate.ts`)
      and/or `deriveAchievedAssurance` (`src/core/archive/achieved-assurance.ts`) through a real
      `LocalRuntime` (NOT the fake in
      `tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts`):
  - Real git repo with a base commit (materialized test present, implementation absent → test red)
    and a candidate commit (implementation present → test green), each addressable by OID, with a
    real `node_modules` for the dependency the test needs.
  - Config with custom `verification.commands` + `scopedTestCommand`.
  - Provide job state so base OID = test-materialize commit, candidate OID = implementer commit
    (follow the state shape used by existing gate/floor tests, e.g.
    `src/core/step/bite-evidence/__tests__/gate.test.ts` and the archive floor tests).
- [ ] Assert the gate produces a per-file `BiteEvidenceRecord` with `baseResult: "red"`,
      `candidateResult: "green"`, `verified: true` (verdict `passed`).
- [ ] Assert `deriveAchievedAssurance` records `biteEvidence` as achieved for the same real run
      (base-red established for every materialized test file).

**Acceptance Criteria**:
- With `scopedTestCommand` configured and real base-red/candidate-green execution, the gate returns
  a verified record and the floor derivation records `biteEvidence` as achieved — from real
  execution results, not a fake.

## T-06: Backward-compat and full verification (T6)

- [ ] Run the full suite and confirm the default path (no custom commands), managed (`unavailable`),
      and all pre-existing bite-evidence / pipeline / floor / achieved-assurance tests are green,
      except the single case whose premise T-03 updates.
- [ ] Confirm `.specrunner/config.json` and `src/core/port/runtime-strategy.ts` are unchanged in the
      diff.

**Acceptance Criteria**:
- `bun run typecheck` passes.
- `bun run test` passes (green), with only the T-03 case intentionally updated.
- `git diff` shows no changes to `.specrunner/config.json` or `src/core/port/runtime-strategy.ts`.
