# Design: Repo root resolved exactly once per invocation

## Context

Dispatch-time single repo-root resolution is already in place: `bin/specrunner.ts`
calls `buildCommandContext(process.cwd())` once per invocation and passes a
`CommandContext { repoRoot, invokerCwd }` to every handler
(`src/cli/command-context.ts`). The ADR
`specrunner/adr/2026-07-20-cwd-role-boundary-dispatch-context.md` records the
"exactly once (one root resolution per invocation)" contract.

The contract is not fully reached in code: several handlers ignore the injected context
and re-resolve the root independently. Verified against the current tree:

| Handler | Site | Current resolution |
|---|---|---|
| `src/cli/init.ts` | `:74` | `spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })` |
| `src/cli/inbox.ts` | `:32,:46` | `const cwd = process.cwd()` → `resolveRepoRootOrFail(cwd)` |
| `src/cli/prune.ts` | `:36,:42` | dynamic `import` of `resolveRepoRootOrFail` → `resolveRepoRootOrFail()` |
| `src/cli/cancel.ts` | `:60` | `resolveRepoRootOrFail()` |
| `src/cli/config-effective.ts` | `:57,:65` | `options.cwd ?? process.cwd()` → `resolveRepoRoot(cwd)` |
| `src/cli/job-show.ts` | `:42` | `(await resolveRepoRoot()) ?? process.cwd()` |
| `src/cli/bootstrap.ts` | `:36` | `resolveRepoRoot(cwd)` |
| `src/cli/attach.ts` | `:66` | `(await resolveRepoRoot(cwd)) ?? cwd` |
| `src/cli/ps.ts` | `:87` | `opts.repoRoot ?? (await resolveRepoRoot()) ?? process.cwd()` |

Existing structures that stay:

- `src/cli/command-context.ts` — the single production resolution point.
- `src/cli/doctor.ts:113` and `src/cli/load-config-with-overlay.ts:24` — DI fallbacks
  that resolve only when a pre-resolved value is not injected. Out of scope to change.
- `tests/unit/architecture/arch-allowlist.ts` — the `CWD` `process.cwd()` ratchet
  (delete-only). `tests/unit/architecture/core-invariants.test.ts:1449` — the CWD
  invariant (`T-05`) that gates it.

Separately, the ADR's `D5` section labels the CWD ratchet `B-13`
(`…dispatch-context.md:76,:78,:152,:168`). `architecture/model.md:91` already uses
`B-13` for the StepExecutor single-writer invariant. The collision exists only in the
ADR document; the code (`arch-allowlist.ts` `invariant: "CWD"`) and tests
(`core-invariants.test.ts:1001` `B-13 … StepExecutor`; `:1449` `CWD invariant … (T-05)`)
have no collision.

## Goals / Non-Goals

**Goals**:

- Remove handler-internal repo-root re-resolution; handlers consume `ctx.repoRoot` /
  `ctx.invokerCwd`.
- Add a machine tooth that fixes "handlers do not resolve the repo root" so future
  commands cannot silently reintroduce the defect.
- Burn down the CWD ratchet allowlist entries for the converted sites (delete-only).
- Make the CWD ratchet identifier unique (remove `B-13` from the CWD context) without
  changing any ADR decision or renumbering `model.md`.

**Non-Goals**:

- Changing `resolveRepoRoot` / `resolveRepoRootOrFail` implementations (`src/util/repo-root.ts`).
- Changing the `doctor` / `load-config-with-overlay` DI-fallback structure.
- Changing non-root dispatch pre-processing (`detectWorktree`, worktree guards).
- Changing the ADR's decision (the two-role cwd boundary).
- Converting commands not listed above (`request generate/ls/validate`, `rules new`,
  `reviewers new`, `usage`, `job archive`) — their CWD debt entries remain.

## Decisions

### D1: Handlers receive the resolved root through `CommandContext`; only registry handlers touch `ctx`

Each affected registry handler in `src/cli/command-registry.ts` is switched to the
`(parsed, ctx) => …` form (the `CommandDef.handler` type already allows the second
`ctx` argument; dispatch always supplies it). The handler passes the resolved root into
the underlying `runXxx` function through an explicit argument/option; the `runXxx`
function no longer resolves anything.

**Rationale**: the defect is per-command optional application of `resolveRepoRoot`
(ADR `D2`). Consuming the dispatch value at the registry boundary keeps the single
choke point authoritative and leaves each `runXxx` a pure consumer that is trivial to
test by injection.

**Alternatives considered**: keep per-command `resolveRepoRoot` calls with a review
convention — rejected by the request's architect evaluation (optional application is the
original defect). Lazily resolve inside each handler on first need — reintroduces
per-command decisions.

### D2: Repo-required commands rely on `requiresRepo` + the dispatch guard; individual error branches are removed

`init`, `inbox run`, `job prune`, `job cancel`, and `job attach` are declared
`requiresRepo: true`. Dispatch (`bin/specrunner.ts:103` / `:149`) then guarantees
`ctx.repoRoot` is non-null before the handler runs, emitting the unified
`repoRequiredError` (exit 2) otherwise. Each handler's own repo-resolution error branch
(the `try { resolveRepoRootOrFail() } catch` blocks; init's git-availability gate) is
removed, and the handler uses `ctx.repoRoot!`.

`job cancel`'s argument-exclusivity checks stay inside `runCancel` and continue to run on
direct calls; on the full dispatch path the repo guard fires first (both paths still
exit non-zero for their respective errors).

**Rationale**: the request requires repo-required commands to fold their bespoke errors
into the unified error via the existing `requiresRepo` declaration.

**Alternatives considered**: keep bespoke per-handler error messages — contradicts the
request ("handler 内の個別エラーを統一エラーに置換").

**Consequence (init)**: `runInit`'s current gate distinguishes "not a git repo"
(exit code 128) from "git binary unavailable" (exit code null) with different messages
(`init.ts:79-90`). After folding into the dispatch guard, both collapse to
`resolveRepoRoot` → `null` → the unified `repoRequiredError`; the "please install git"
distinction is intentionally dropped. The existing in-handler-gate tests
(`tests/init-git-guard.test.ts` `TC-002`/`TC-003`, and the anti-regression test in
`tests/init.test.ts`) are relocated to assert the dispatch-level `requiresRepo` behavior.

### D3: Repo-optional read/degrade commands consume `ctx.repoRoot ?? ctx.invokerCwd` (no re-resolution)

`job show`, `job ls` (`runPs`), `config effective`, and `job resume`→`bootstrap` stay
repo-optional (they degrade gracefully outside a repo).

- `job show` (`runJobShow`) gains a `repoRoot` argument; the registry passes
  `ctx.repoRoot ?? ctx.invokerCwd`. The internal `resolveRepoRoot()` at `:42` is removed;
  `printJobState`'s `repoRoot: string = process.cwd()` default parameter stays (role-a DI
  default, already allowlisted).
- `config effective` (`runConfigEffective`) replaces its `cwd` option with
  `repoRoot?: string | null`; the registry passes `ctx?.repoRoot`. It forwards
  `repoRoot ?? undefined` to `loadConfigWithSourceMetadata`; `resolveRepoRoot` and the
  `options.cwd ?? process.cwd()` derivation are removed.
- `job resume` threads the root: the registry passes `repoRoot: ctx?.repoRoot` into
  `runResume`; `ResumeOptions` gains `repoRoot?: string | null`; `runResumeCore` forwards
  it to `bootstrap`. `bootstrap` gains a `repoRoot: string | null` parameter used for
  `loadConfig(repoRoot ?? undefined)`; its `resolveRepoRoot(cwd)` at `:36` is removed. The
  `cwd` argument to `bootstrap` (worktree base for `createRuntime`) is unchanged. This
  preserves current behavior (outside a repo, `repoRoot` is null → `loadConfig(undefined)`,
  same as today) with no re-resolution on the production path.

### D4: `ps.ts` keeps its `resolveRepoRoot` fallback as a DI seam; the production caller supplies the root

`src/cli/ps.ts` already exposes an `opts.repoRoot` DI seam used by its test suite. Per the
request, `ps.ts` stays a DI-fallback file: its
`opts.repoRoot ?? (await resolveRepoRoot()) ?? process.cwd()` line (`:87`) is unchanged.
The `job ls` registry handler passes `repoRoot: ctx.repoRoot ?? ctx.invokerCwd`, so in
production `opts.repoRoot` is always a string and the internal `resolveRepoRoot`
fallback never fires. `ps.ts` is therefore listed in the exactly-once allowlist (D5),
and its CWD entry `CWD-ps-root-resolve` remains.

**Rationale**: `job show` (no pre-existing DI seam) is fully converted to a clean
consumer, while `ps.ts` (established `opts.repoRoot` seam + tests that inject through it)
is kept as a DI fallback, matching the request's explicit split.

**Alternatives considered**: also strip `resolveRepoRoot` from `ps.ts` and degrade to the
injected cwd — cleaner tooth (one fewer allowed file), but contradicts the request, which
names `ps.ts` among the DI fallbacks to retain.

### D5: The exactly-once tooth = a grep invariant over `src/cli/` with a fixed DI-fallback allowlist

Add a `describe` block to `tests/unit/architecture/core-invariants.test.ts` (reusing the
existing `grepE` / `parseGrepOutput` / `isCommentLine` helpers):

- **Confinement**: `grepE("resolveRepoRoot", "src/cli")`, drop test files
  (`__tests__/`, `.test.ts`) and comment lines; every remaining match's file MUST be in a
  fixed allowed set `{ command-context.ts, doctor.ts, load-config-with-overlay.ts, ps.ts }`.
  Any match outside the set is a violation.
- **No direct git resolution**: `grepE("show-toplevel", "src/cli")` (non-test, non-comment)
  MUST be empty — no handler resolves the root via `git rev-parse`.
- **Liveness**: the raw non-comment `resolveRepoRoot` match count in `src/cli/` MUST be
  greater than zero (the four allowed files keep it live).
- **Regression guard (T2 破壊確認)**: a synthetic match in a converted handler file (e.g.
  `src/cli/inbox.ts`) is flagged; a synthetic match in an allowed file (`src/cli/ps.ts`)
  is suppressed.

The allowed-file set is stored as a dedicated named export in
`tests/unit/architecture/arch-allowlist.ts` (e.g. `RESOLVE_REPO_ROOT_ALLOWED_FILES`),
separate from `ARCH_ALLOWLIST`. It is a fixed structural carve-out — not a delete-only
burn-down list — but living in the CODEOWNERS-gated allowlist file prevents the pipeline
from expanding it without review.

**Rationale**: a grep/import invariant catches new commands that forget to consume `ctx`;
runtime resolution-count tests can only count paths that tests exercise (rejected by the
request's architect evaluation). Scanning for `show-toplevel` additionally covers the
`init` pattern, which `resolveRepoRoot`-only greps would miss.

**Alternatives considered**: fold the allowed set into `ARCH_ALLOWLIST` with a new
`invariant` tag — mixes a permanent structural carve-out into the delete-only ratchet,
muddying its "shrinks only" governance.

### D6: Burn down the four converted CWD allowlist entries (delete-only)

Remove exactly these `CWD` entries from `arch-allowlist.ts`, each in lockstep with the
corresponding code removal:

- `CWD-init-git-spawn` — `init.ts` no longer spawns `git rev-parse`.
- `CWD-job-show-root-resolve` — `job-show.ts:42` re-resolution removed.
- `CWD-inbox-debt` — `inbox.ts` no longer derives `const cwd = process.cwd()`.
- `CWD-config-effective-di-default` — `config-effective.ts` no longer has
  `options.cwd ?? process.cwd()`.

`CWD-ps-root-resolve` and `CWD-job-show-print-default` stay (those `process.cwd()`
occurrences remain and are legitimate). No entries are added, so the CWD entry count
strictly decreases.

**Rationale**: the CWD ratchet is delete-only; each converted site must drop its entry
and its code together so the CWD invariant (`T-05`) stays green.

### D7: Fix the CWD-ratchet identifier collision in the ADR only

In `specrunner/adr/2026-07-20-cwd-role-boundary-dispatch-context.md`, replace the four
`B-13` references (`:76`, `:78`, `:152`, `:168`) with the ratchet's established identifier
— the `CWD` invariant (test describe `CWD invariant … (T-05)`). The ADR's decision text,
mechanism, and alternatives are unchanged.

**Rationale**: the request's architect evaluation rejects renumbering `model.md`'s stable
`B-13` (StepExecutor single-writer) and rejects registering a new `model.md` `B` number
here (the ADR itself defers `model.md` CWD documentation). Aligning the ADR to the
identifier the code/tests already use is the lowest-risk fix and touches only the
document.

**Alternatives considered**: renumber `model.md` `B-13` — moving a stable invariant
identifier rots every existing reference. Register a new `B-NN` in `model.md` for CWD —
out of scope (the ADR defers it) and unnecessary since `CWD`/`T-05` already name it.

## Risks / Trade-offs

- [Risk] Converting `init`/`bootstrap` changes their `runXxx` signatures, so direct-call
  tests (`tests/init*.test.ts`, `tests/unit/cli/{cancel,config-effective,job-show,prune-combined}.test.ts`,
  `tests/attach/attach-cli.test.ts`, resume tests) that mock `resolveRepoRoot*` or pass
  `cwd` need injection-path updates. → Mitigation: these are exactly the "cwd 注入経路の
  期待更新" the request permits; behavior-level assertions stay, only the injection seam
  changes. Add per-command subdir-equivalence tests to pin the new contract.
- [Risk] `init` loses the "git binary unavailable" diagnostic (D2 consequence). →
  Mitigation: document it; `doctor` still reports git/repo health, and git-absence is
  degenerate for a git-centric CLI. Relocate `TC-002`/`TC-003` to the dispatch level.
- [Risk] Marking `job attach` `requiresRepo: true` changes outside-repo behavior from
  "degrade to cwd then fail later" to "unified error up front". → Mitigation: attach
  genuinely requires a repo (fetch + worktree materialize); the earlier, clearer error is
  an improvement. Documented as intentional.
- [Risk] The exactly-once allowlist could be widened by a future change to hide a new
  re-resolution. → Mitigation: the allowed set lives in the CODEOWNERS-gated allowlist
  file; expansion requires human review.

## Open Questions

None.
