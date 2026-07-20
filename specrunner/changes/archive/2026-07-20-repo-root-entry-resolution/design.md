# Design: CLI repo-root resolution unified at entry

## Context

Several CLI commands implicitly assume `process.cwd() === <repo root>`. Repo-root
resolution (`resolveRepoRoot` in `src/util/repo-root.ts`) is applied per-command at
each author's discretion: some commands route through it (`job prune` / `job cancel`
/ `inbox` / `attach` / `job show` / `job ls`), while others use `process.cwd()`
directly as the base for internal-state paths (`.specrunner/`, `specrunner/drafts`,
`specrunner/changes`). When such a command is launched from a subdirectory, it does
not error — it silently derives wrong paths and returns wrong results.

Confirmed symptoms (observed against the current tree; file:line verified during design):

- `job stats` from a subdirectory reports `0 runs` (from repo root: full run set).
  Cause: `command-registry.ts:683` passes `process.cwd()` into
  `runJobStats({ cwd })` (`job-stats.ts:347`), which lists state under `<cwd>`.
- `doctor` from a subdirectory produces false diagnostics. Cause: `doctor.ts:174`
  sets `DoctorContext.cwd = process.cwd()`, and 9 checks join `ctx.cwd` with
  `specrunner/` / `.specrunner/` (e.g. `workflow-structure.ts`,
  `local-state-writable.ts`, `orphan-sidecars.ts`,
  `orphan-worktrees.ts:39` passes `repoRoot: ctx.cwd`).
- `request new` from a subdirectory writes `<subdir>/specrunner/drafts/<slug>/…`.
  Cause: `command-registry.ts:334` passes `process.cwd()` into
  `executeNew(slug, type, cwd)` → `request/store.ts` joins `<cwd>/specrunner/drafts`.

Distribution is `npm install -D` + `npx`, and `npx` searches upward for
`node_modules`, so subdirectory launch is a first-class invocation path. The set of
directories from which the CLI *starts* is therefore wider than the set from which
it *behaves correctly*.

The codebase already has the mechanisms this change reuses:

- `resolveRepoRoot(cwd?)` returns the enclosing worktree root via
  `git rev-parse --show-toplevel`, or `null` outside a repo.
- A graceful-degradation idiom `(await resolveRepoRoot()) ?? process.cwd()` already
  exists at `job-show.ts:42` and `ps.ts:87`.
- A grep-based architecture ratchet exists in
  `tests/unit/architecture/core-invariants.test.ts` + `arch-allowlist.ts`, with
  delete-only, CODEOWNERS-gated governance and a T-04-style regression guard.

## Goals / Non-Goals

**Goals**:

- Constrain the role of `process.cwd()` in the CLI to exactly two things:
  (a) the origin for repo-root discovery, and
  (b) the base for resolving user-supplied relative-path arguments.
  All internal-state paths derive from the repo root.
- Resolve the repo root **once** at command dispatch and pass it to the handler as
  context. Commands declare whether they require a repo; a repo-required command
  launched outside a repo stops with one unified, non-zero-exit error.
- Make the three symptom paths (`doctor`, `job stats`, `request new`) behave
  identically whether launched from the repo root or from a subdirectory.
- Add a mechanical tooth: an architecture invariant asserting that every
  `process.cwd()` occurrence in `src/` is covered by an allowlist entry, governed by
  the existing delete-only ratchet.

**Non-Goals**:

- Burning down the allowlisted, un-converted `process.cwd()` sites (the
  command-registry remainder, `config/store.ts`, `inbox`, etc.) — split to
  follow-up requests.
- Changing error/hint wording consistency broadly (separate request).
- CI packaged smoke test (separate request).
- Changing `resolveRepoRoot` itself.
- Editing `architecture/` model documentation. The tooth is self-contained in the
  test + allowlist data files.

## Decisions

### D1 — Resolve repo root once at dispatch; inject as a `CommandContext`

At command dispatch (in `bin/specrunner.ts`), after flag parsing and the existing
worktree guard, resolve the repo root exactly once from the invoker cwd and build a
`CommandContext = { repoRoot: string | null; invokerCwd: string }`. Pass it as a
second argument to the command handler.

- A new leaf-safe module `src/cli/command-context.ts` exports the `CommandContext`
  type and a small, injectable builder (`buildCommandContext(invokerCwd, resolveFn?)`)
  plus a guard (`assertRepoAvailable(ctx, commandName)`). The builder takes an
  injectable resolver so the dispatch logic is unit-testable without a real git repo.
- `CommandDef.handler` becomes `(parsed: ParsedArgs, ctx: CommandContext) => Promise<void>`.
  TypeScript still accepts existing handlers written as `(parsed) => …` or `() => …`
  (fewer parameters is assignable), so only the handlers that consume `ctx` are edited.

**Rationale — why dispatch-time single resolution, not per-command `resolveRepoRoot`.**
The defect *is* per-command opt-in: an optional convention applied at each author's
discretion. A convention that must be remembered at every new call site leaks at
scale — that is the exact failure being fixed. Resolving once at the single dispatch
choke point makes correct base-path derivation the default and removes the per-command
decision entirely.

**Alternatives considered.**
- *Per-command `resolveRepoRoot` convention, enforced by review.* Rejected: this is
  the current structure; conventions leak with codebase growth.
- *Resolve lazily only inside commands that need it.* Rejected: reintroduces the
  per-command decision; the single choke point is the structural fix.

### D2 — `requiresRepo` declaration + one unified out-of-repo error

`CommandDef` (and each subcommand `CommandDef`) gains an optional
`requiresRepo?: boolean` (default `false`). At dispatch, after building the context,
if `def.requiresRepo && ctx.repoRoot === null`, emit one unified error and exit
non-zero (ARG_ERROR / exit 2), consistent with `NOT_GIT_REPO` / `WORKTREE_GUARD`.
A `repoRequiredError(command)` factory in `src/errors.ts` (reusing the existing
`NOT_GIT_REPO` code so no new exit-code mapping is needed) carries a prescription:
run `git init` or `cd` into a repository, then re-run.

This change annotates only the commands converted here — `request new` and
`job stats` — as `requiresRepo: true`. `doctor` stays `requiresRepo: false`
(see D4). The remaining commands keep the default `false`; annotating each is a
mechanical follow-up and is intentionally deferred to keep this PR reviewable.

**Rationale.** `requiresRepo` is a per-command declaration (requirement 2) with the
smallest surface that satisfies the converted paths without changing the
out-of-repo behavior of unrelated commands.

**Alternatives considered.**
- *Tri-state enum (`required` / `optional` / `none`).* Rejected: `optional` and
  `none` behave identically at dispatch (resolve best-effort, never error); the
  distinction adds vocabulary without behavior. A boolean is sufficient.

### D3 — Convert `job stats` and `request new` to repo-root base

- `job stats` (`command-registry.ts:683`): pass `ctx.repoRoot` into
  `runJobStats({ cwd, json })`. `runJobStats`'s option key stays `cwd` (its unit
  tests pass a directory directly); semantically the dispatch now supplies the repo
  root. The in-command specrunner-worktree guard keeps operating on the supplied
  base, preserving current guard behavior (D5).
- `request new` (`command-registry.ts:334`): pass `ctx.repoRoot` into
  `executeNew(slug, type, repoRoot)`. `executeNew` / `request/store.ts` are
  unchanged (they already treat their base argument as the repo root).

Both handlers rely on `requiresRepo: true` (D2) guaranteeing `ctx.repoRoot` is
non-null; the handlers pass it as the base (documented at the call site).

**Rationale.** Minimal, surgical edits at the two call sites that currently conflate
invoker cwd with repo root. Downstream functions keep stable signatures, so their
existing unit tests remain unchanged (they pass a base directory directly, which is
exactly the repo root under the fixed semantics).

### D4 — `doctor`: carry repo root in `DoctorContext`, keep repo-optional

- `DoctorContext` gains `repoRoot?: string | null` (optional, so existing check unit
  tests that build a mock context without it still typecheck and behave as before).
- The 9 repo/storage checks that currently use `ctx.cwd` as the repo root switch to
  an effective base `ctx.repoRoot ?? ctx.cwd`. When `repoRoot` is present (the
  production case, and the only case the subdir-equivalence criterion exercises),
  checks use the root; when absent (outside a repo), they fall back to invoker cwd —
  the established `job-show.ts:42` / `ps.ts:87` degradation idiom — which preserves
  today's out-of-repo behavior.
- `runDoctor` accepts the dispatch-resolved values via
  `runDoctor({ json, repoRoot?, invokerCwd? })`. `invokerCwd` defaults to
  `process.cwd()` and `repoRoot`, when not supplied, is resolved from `invokerCwd`
  (so `runDoctor({ json })` — used by existing tests — keeps working standalone).
  `DoctorContext.cwd` is set to the invoker cwd; `DoctorContext.repoRoot` to the
  resolved root. The duplicate `resolveRepoRoot(process.cwd())` at `doctor.ts:114`
  reuses the already-resolved `repoRoot`.
- `doctor` stays `requiresRepo: false`: outside a repo it still runs to completion.
  `git-repository` (required, `repo` category) continues to fail outside a repo, so
  repo checks are reported as fail (current behavior), and the exit code stays 1.

**Rationale.** The requirement is explicit that `DoctorContext` holds the repo root
*separately* from the invoker cwd and that checks use the root, while `doctor` must
remain runnable outside a repo (it is the first command a mid-setup user runs).
Making `repoRoot` optional on the context and using the existing `?? cwd`
degradation idiom achieves the subdir equivalence with zero churn to the many
existing check unit tests.

**Alternatives considered.**
- *Overload `ctx.cwd = repoRoot ?? invokerCwd` in the assembly, leave checks
  untouched.* Rejected: the requirement wants the two roles held as distinct fields
  and checks to reference the repo-root field explicitly; conflation is the original
  defect.
- *Require repo for `doctor` too.* Rejected: killing the primary diagnostic command
  with "no repo" defeats diagnosis during first-time setup.

### D5 — Preserve worktree semantics

No change to `resolveRepoRoot`: inside a job worktree it returns the *enclosing*
worktree root. Because dispatch resolves through `resolveRepoRoot`, a command run
inside a job worktree receives that worktree's root as its base — identical to
today. `job stats`'s internal specrunner-worktree guard therefore fires exactly as
before (it inspects the supplied base, which is the enclosing worktree root).

### D6 — Tooth: `process.cwd()` in `src/` is allowlist-gated

Add an architecture invariant (tag `CWD`) to
`tests/unit/architecture/core-invariants.test.ts`: grep `src/` for `process.cwd()`,
exclude test files and comment lines (reusing the file's existing `grepE` /
`parseGrepOutput` / `isCommentLine` / `filterViolations` helpers), and assert that
every remaining match is covered by a `CWD` allowlist entry. Include a liveness
assertion (raw matches > 0) and a T-04-style regression guard proving a synthetic,
un-allowlisted `process.cwd()` is detected.

Seed `arch-allowlist.ts` with every current non-comment, non-test `process.cwd()`
occurrence in `src/` **except** the sites this change converts. Each entry is
classified in its comment as either:

- **permanent-legit** — role (a) repo-root discovery origin
  (`repo-root.ts`, `load-config-with-overlay.ts`, `init.ts` toplevel resolve,
  `job-show.ts`/`ps.ts` degradation, `doctor` invoker-cwd default) or role (b)
  relative-path base (`command-registry.ts:381` validate arg,
  `command-registry.ts:538` `--prompt-file`, `request.ts:150` validate cwd) or a
  dependency-injection default (`deps.cwd ?? process.cwd()` in pipeline/step/runtime
  code); or
- **debt** — an un-converted internal-state derivation to be burned down by a
  follow-up (the command-registry remainder: `354/362/363/388/562/599/640/753/767/819/821`,
  plus `config/store.ts:148`, `inbox.ts:32`).

Governance follows the existing ratchet: entries may only be removed (paired with a
code fix); additions require CODEOWNERS review. The scan is `src/`-wide so a new
`process.cwd()` anywhere in `src/` (outside the allowlist) trips the test.

**Rationale.** Requirement 4 mandates a mechanical, one-directional tooth over the
whole of `src/`, seeded with the current sites and marking legitimate role-(a)/(b)
uses as permanent. This mirrors the established B-6 (`process.env`) ratchet.

**Alternatives considered.**
- *One-shot conversion of all `process.cwd()` sites.* Rejected: it would touch every
  command and produce an unreviewable PR. The incremental ratchet is the established
  discipline.
- *Content-filter DI defaults out of the scan (like the B-6 `stripSecrets`
  exemption) to shrink the seed.* Rejected: the requirement explicitly wants
  legitimate uses enumerated in the allowlist and distinguished by comment, not
  filtered away.

## Risks / Trade-offs

- [Risk] Adding a `git rev-parse` call to every dispatched command adds latency and a
  subprocess to commands that never touch the repo root (e.g. `login`).
  → Mitigation: `resolveRepoRoot` is a single, fast git call already run by
  `doctor` / `ps` / `job-show`; it degrades to `null` (no throw) outside a repo.
  Resolution runs after `--help`/`--version` short-circuits and after flag parsing.

- [Risk] `request new` / `job stats` now emit a hard error outside a repo instead of
  silently misbehaving — a behavior change.
  → Mitigation: this is the intended correction (requirement 2). Existing unit tests
  call `executeNew` / `runJobStats` directly (not via dispatch), so they are
  unaffected; there is no main()-driven test that runs these outside a repo.

- [Risk] The `CWD` allowlist seed is large (~40 entries) and must exactly match
  (file suffix + content substring). A missed entry fails the test on first run.
  → Mitigation: the failing test prints every un-allowlisted occurrence; the
  implementer seeds from that list. `arch-allowlist.ts` is CODEOWNERS-gated, so the
  large seed is expected to require owner approval at merge.

- [Risk] Within a single file, two identical `process.cwd()` lines collapse to one
  (file, pattern) allowlist entry, so a future identical line in the same file would
  be auto-covered (a known grep-ratchet property shared with B-6).
  → Mitigation: acceptable — such lines are DI defaults (legitimate); a new
  `process.cwd()` in a *different* file or with *different* content is still caught,
  which is what the regression guard (T5) pins.

- [Risk] Making `DoctorContext.repoRoot` optional could let a future check forget to
  prefer it and read `ctx.cwd`.
  → Mitigation: the doctor subdir-equivalence test (T1) with its mutation check
  (revert-to-cwd must fail) pins that the converted checks use the repo root.

## Open Questions

None blocking. Whether to document the `CWD` invariant in `architecture/model.md`
§4 is deferred: the tooth is fully self-contained in the test and allowlist data
files, and editing `architecture/` is out of scope for this change.

## Migration Plan

Pure internal refactor of path derivation and dispatch; no persisted state, config,
or on-disk layout changes. No migration or rollback steps. Reverting the change
restores the prior (buggy) cwd-based behavior with no data implications.
