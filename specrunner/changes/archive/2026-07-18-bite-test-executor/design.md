# Design: run materialized tests in the isolated worktree under a repo's own runner

## Context

`RuntimeStrategy.runTestsAtCommit` is the only mechanism that produces "achieved" bite
provenance: it checks out a materialized-test commit in an isolated detached worktree and runs
only the materialized test files at that OID, returning per-file pass/fail. It is consumed by:

- the in-loop bite-evidence gate — `src/core/step/bite-evidence/gate.ts:161-198` runs tests at
  base and candidate OIDs and treats `unavailable` as `strategy-deferred`;
- the archive floor derivation — `src/core/archive/achieved-assurance.ts:217-246` runs tests at
  the base OID and treats `unavailable` as "biteEvidence not achieved".

The current `LocalRuntime.runTestsAtCommit` (`src/core/runtime/local.ts:901-982`) cannot run a
real test in this repo for two independent reasons:

1. **Custom-commands bail.** When `config.verification.commands` is non-empty it returns
   `{ kind: "unavailable", reason: "Cannot scope custom verification.commands to individual test
   files" }` (`local.ts:938-943`). This repo's `.specrunner/config.json` defines custom commands
   (`build` / `typecheck` / `test` / `lint`), so this branch is always taken.
2. **No dependency resolution in the isolated worktree.** The non-bail path creates the isolated
   worktree under `os.tmpdir()` via `git worktree add --detach` (`local.ts:913-922`) and runs
   `bun test <file>` with `cwd = tmpBase` (`local.ts:945-957`). It never links or installs
   `node_modules`. `node_modules` is gitignored and the worktree lives outside the repo tree, so
   upward resolution does not reach it. The existing coverage
   (`src/core/runtime/__tests__/bite-evidence-isolated-exec.test.ts`) uses a zero-dependency
   `bun:test` fixture, which does not exercise this gap.

### Verified current-code facts

- `runTestsAtCommit(oid, testFiles, cwd, config)` already receives `config`
  (`local.ts:901-906`); its return type is `IsolatedTestResult`
  (`src/core/port/runtime-strategy.ts:86-88`), a DU of `{ kind: "ran"; results }` /
  `{ kind: "unavailable"; reason }`. The port method is optional on `RuntimeStrategy` and required
  on `RealRuntimeStrategy` (`runtime-strategy.ts:628-690`).
- Normal verification resolves the repo's runner via `spawnCommand`
  (`src/core/verification/commands.ts:56-99`): it runs `sh -c <command>` with
  `<cwd>/node_modules/.bin` (and an optional hoist root) prepended to `PATH`. `bun run test` →
  `vitest` resolves from this `.bin`. `local.ts` already imports from `../verification/`
  (`evaluateTestCoverage`, `local.ts:48`), so reusing this executor introduces no new module edge.
- Ordinary job worktrees get their `node_modules` from `WorktreeManager.create`
  (`src/core/worktree/manager.ts:156-178`), which installs once at creation. The isolated
  worktree gets no such install.
- `VerificationConfig` (`src/config/schema/types.ts:142-158`) currently declares only `commands?`
  and `coverage?`. Its zod schema (`src/config/schema/validation.ts:264-298`) validates only those
  two; unknown keys are stripped. A `nonEmptyString` helper already exists at
  `validation.ts:118`.
- `ShellCommand = string | { name?: string; run: string }` (`types.ts:91`).
- `ManagedRuntime.runTestsAtCommit` always returns `unavailable`
  (`src/core/runtime/managed.ts:620-627`) — structural (no local worktree). Unchanged here.
- The existing bail reason string is duplicated as a literal inside a **test fake**
  (`tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts:137`). That fake is
  self-contained, so changing the real reason string does not affect it.

## Goals / Non-Goals

**Goals**

- Make `runTestsAtCommit` resolve dependencies in the isolated worktree by symlinking the job
  worktree's `node_modules` into it, so tests requiring dependencies actually run.
- Add an opt-in, provider-neutral `VerificationConfig.scopedTestCommand?: string` that declares a
  command which runs the given test files (appended as trailing arguments) and only those files.
- When `scopedTestCommand` is set, run each materialized test file individually as
  `<scopedTestCommand> <file>` in the isolated worktree using the same `node_modules/.bin`-on-`PATH`
  executor as normal verification, preserving per-file pass/fail (exit 0 = passed).
- Preserve fail-closed backward compatibility: custom commands without `scopedTestCommand` still
  return `unavailable`; the zero-config default path is unchanged; managed stays `unavailable`.
- Preserve the never-throw contract and finally-style cleanup of the isolated worktree and the
  symlink.
- Prove the executor runs real tests with a real `LocalRuntime` against a real git repo (not a
  fake), including an end-to-end proof that the gate/floor tooth bites green.

**Non-Goals**

- **Per-scenario (single test-case) execution** (`<runner> <file> -t "<TC-ID>"`). This requires a
  test-materialize naming discipline that forces the TC-ID into the `it()`/`describe()` title
  (currently a comment is allowed; `src/core/verification/test-coverage.ts` greps file-level) plus
  a template to carry `-t`. Separate request. Known residue: a file mixing real and hollow cases
  cannot be isolated at file granularity.
- **Enabling `scopedTestCommand` in this repo's `.specrunner/config.json`** (and any
  `minimumAssurance` change). That imposes bite cost on every forward job and touches the
  guard-config surface — a separate, intentional config change. This change delivers the
  capability plus proof; the tooth bites in real dogfood only when that config is enabled.
- **Installing dependencies in the isolated worktree.** Symlinking is chosen over install.
- Changing the `runTestsAtCommit` port signature, the gate/floor decision logic, provenance/offline
  verification, or the fast pipeline.

## Decisions

### D1: Resolve isolated-worktree dependencies by symlinking the job worktree's `node_modules`

Before running scoped tests, create `<tmpBase>/node_modules` as a symlink pointing at
`<cwd>/node_modules` (`cwd` is the job worktree). If `<cwd>/node_modules` does not exist, return
`{ kind: "unavailable" }` (fail-closed) without running tests.

Each `runTestsAtCommit` call builds its own isolated worktree and symlinks from `cwd`. The gate
calls the method twice — base OID and candidate OID — and both resolve dependencies from the same
`cwd = <job worktree>` `node_modules`. Running the **base OID source** against the **candidate's**
`node_modules` is intentional: dependencies are near-invariant across a request, and a dependency
removed by the candidate resolves-fails at base (red), which is the safe direction for a base-red
tooth.

- **Rationale**: A symlink is O(1) and needs no network; the alternative of a full install runs
  twice (base + candidate) at high cost. Symlinking from `cwd` reuses the install that
  `WorktreeManager.create` already performed for the job worktree. Fail-closed on a missing
  `node_modules` keeps the floor honest (no silent pass on a mis-provisioned worktree).
- **Alternatives considered**:
  - *Full install in each isolated worktree.* Rejected: two installs per gate run, high cost;
    the candidate `node_modules` is a safe superset for the base source.
  - *Nest the isolated worktree under the job worktree so upward resolution finds `node_modules`.*
    Rejected: nested git worktrees are an inconsistency source.
  - *Install at the base OID.* Rejected: cost, and the base lockfile may not even resolve the
    candidate's newly-added dependency.

### D2: Declare a provider-neutral opt-in `VerificationConfig.scopedTestCommand?: string`

Add `scopedTestCommand?: string` to `VerificationConfig` (`types.ts:142-158`) and a matching
`scopedTestCommand: optional(nonEmptyString(...))` to the verification zod object
(`validation.ts:264-298`), reusing the existing `nonEmptyString` helper. Semantics: "a command to
which one or more test-file paths can be appended as trailing arguments, running only those files".
For this repo that value is `"bun run test"` (not set here — see Non-Goals).

- **Rationale**: The command must be declared, not inferred. A runner cannot be auto-detected
  reliably, and not every project's `test` command is file-scopable (e.g. `make test`). An explicit
  opt-in field keeps the default fail-closed and lets a project state the capability precisely.
  `scopedTestCommand` is provider-neutral (no runner name baked in), matching the project rule
  against upstream-provider-specific names in own-CLI config.
- **Alternatives considered**:
  - *Auto-detect the runner.* Rejected: brittle.
  - *Assume the existing `test` command is file-scopable.* Rejected: some commands cannot be scoped.
  - *A `{files}` placeholder template.* Rejected as heavier than trailing-argument append; the
    trailing-append contract is sufficient for the target runners and simpler to validate.

### D3: Under custom commands, run per file via the scoped command with `node_modules/.bin` on `PATH`

Restructure `runTestsAtCommit`'s execution selection (replacing the current bail at
`local.ts:938-943`) with this precedence:

1. `scopedTestCommand` set (trimmed non-empty) → **scoped path**: apply D1 (symlink; unavailable if
   `node_modules` absent), then for each test file run `<scopedTestCommand> <file>` as a single
   `sh -c` invocation via the verification `spawnCommand` executor with `cwd = tmpBase` (so
   `<tmpBase>/node_modules/.bin` — the symlink target's `.bin` — is on `PATH`). Each file path is
   shell-quoted. `passed = (exitCode === 0)`, one `{ file, passed }` per file.
2. `scopedTestCommand` unset **and** `config.verification.commands` non-empty → return
   `{ kind: "unavailable" }` (backward-compat, fail-closed). The reason text is clarified to name
   the missing `scopedTestCommand` opt-in.
3. Otherwise (no custom commands, no `scopedTestCommand`) → **default path**, unchanged:
   `bun test <file>` via `this.spawnFn` with `cwd = tmpBase`, no symlink.

Per-file granularity is preserved in all paths because hollow detection depends on it: the gate and
floor require every materialized test file to have its own `passed` result
(`gate.ts:225-255`, `achieved-assurance.ts:229-238`).

- **Rationale**: Reusing the verification `spawnCommand` gets the exact `node_modules/.bin`-on-`PATH`
  resolution that makes `bun run test` → `vitest` work in normal verification; the scoped executor
  therefore behaves identically to how the repo's runner runs in-pipeline. A per-file loop keeps
  each file's exit code distinct.
- **Alternatives considered**:
  - *Single invocation over all files + a JSON reporter.* Rejected: runner-dependent, and a single
    exit code collapses per-file hollow detection.
  - *Keep using `this.spawnFn` (no shell/PATH) for the scoped path.* Rejected: `this.spawnFn` runs
    an argv directly without `sh -c` or the `.bin` PATH, so `bun run test` → `vitest` would not
    resolve; the verification executor is the established resolution seam.

### D4: Preserve never-throw and finally-style cleanup, including the symlink

Keep the `try/finally` shape. In `finally`, remove the symlink first
(`fs.rm(<tmpBase>/node_modules, { force: true })` — this unlinks the symlink itself, never
following it into `cwd`), then remove the worktree via the existing `git worktree remove --force`
with the `fs.rm(tmpBase, { recursive, force })` fallback. Spawn errors, a failed `worktree add`,
and a non-existent OID all yield `unavailable`; unexpected throws are caught and returned as
`unavailable`.

- **Rationale**: Removing the symlink before the recursive worktree removal makes it explicit that
  the linked-to `node_modules` is never deleted. `fs.rm` on a symlink unlinks the link (via
  `lstat`), so neither the explicit removal nor the fallback recurses into the real dependency tree.
- **Alternatives considered**:
  - *Rely on `git worktree remove --force` to clean the symlink.* Rejected as less explicit and
    dependent on git's traversal treatment of an untracked symlink; explicit `unlink` is safer.

### D5: No port-signature change; managed and the port interface are untouched

The new `scopedTestCommand` rides on the already-present `config: SpecRunnerConfig` parameter of
`runTestsAtCommit`. `src/core/port/runtime-strategy.ts` and its `RealRuntimeStrategy` intersection
are **not** modified (avoiding the guarded `src/core/port/**` surface).
`ManagedRuntime.runTestsAtCommit` continues to return `unavailable` unchanged.

- **Rationale**: The capability is purely an implementation change inside `LocalRuntime` plus a
  config-schema addition. No consumer (`gate.ts`, `achieved-assurance.ts`) changes, because they
  already pass `config` through.
- **Alternatives considered**:
  - *Add a dedicated port parameter for the scoped command.* Rejected: `config` already carries it;
    a new parameter would churn the port and every caller.

### D6: Prove the tooth with real `LocalRuntime` wiring, not fakes

The integration proof (T1/T2/T4) and the end-to-end tooth proof (T5) must instantiate a real
`LocalRuntime` and run against a real git repo with a real `node_modules`, asserting real
`{ kind: "ran" }` per-file pass/fail — and, for the break-check, asserting that removing the
`node_modules` source makes the result no longer `ran` (or the tests fail). T5 must drive the real
`runBiteEvidenceGate` and/or `deriveAchievedAssurance` through the real runtime so the proof is an
execution result, not a fake's canned answer.

- **Rationale**: A fake runtime that returns `{ kind: "ran" }` proves nothing about dependency
  resolution or scoped execution; the whole gap is in the real subprocess/worktree/symlink wiring.
  The break-check anchors the dependency-resolution claim by showing it fails without the symlink.
- **Alternatives considered**:
  - *Assert only through a fake runtime.* Rejected: the fake cannot exercise the symlink or the
    scoped executor — the exact surfaces this change adds.

## Risks / Trade-offs

- [Risk] **`git worktree remove --force` or the recursive fallback could traverse the symlink and
  delete the real `node_modules`.** → Mitigation (D4): the symlink is `fs.rm`-unlinked first;
  `fs.rm` uses `lstat` and never follows a symlink; a test asserts the source `node_modules`
  survives a run.
- [Risk] **Running the base OID source against the candidate's `node_modules` could mask a
  dependency regression.** → Mitigation (D1): intentional and safe-direction — a removed dependency
  fails to resolve at base (red); dependencies are near-invariant within a request. Documented.
- [Risk] **File paths from `git diff` fed into `sh -c` could mis-split on spaces/special
  characters.** → Mitigation (D3): each file path is single-quote-escaped before appending.
- [Risk] **Changing the bail reason string could break a test asserting on it.** → Mitigation: the
  only other occurrence is a self-contained fake literal
  (`merge-then-archive-floor-provenance.test.ts:137`) unaffected by real-code text; the existing
  real-runtime test asserts only `kind`, not `reason`.
- [Risk] **Real-runtime integration tests are slower and spawn subprocesses.** → Mitigation: a
  hermetic fixture (throwaway git repo, hand-built `node_modules/<dep>`, a lightweight runner) with
  generous per-test timeouts, matching the existing isolated-exec test's style.

## Open Questions

None. Test-fixture runner choice (a hermetic `bun test` runner vs. a real `vitest` install) is left
to the implementer per the acceptance criteria; the design constrains only that the fixture require
a real dependency resolved via the symlink and run through a real `LocalRuntime`.

## Migration Plan

Purely additive and opt-in:

- `VerificationConfig.scopedTestCommand?` is optional; existing configs (absent field) validate and
  behave unchanged. This repo's `.specrunner/config.json` is intentionally not modified.
- The default (no custom commands) path and the managed `unavailable` path are unchanged, so all
  existing bite-evidence / floor / achieved-assurance tests stay green except the one whose premise
  is updated to state the `scopedTestCommand`-unset opt-in explicitly.
- No rollback data migration; reverting the schema field and the `LocalRuntime` execution branch
  restores prior behavior exactly.
