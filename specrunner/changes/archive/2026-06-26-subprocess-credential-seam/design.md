# Design: subprocess-credential-seam

## Context

PR #714 (credential-containment) routed the codex SDK, `util/git-exec.ts`, and
verification's `git show` through the `stripSecrets` seam and widened the B-6
tooth to `src/core` / `src/adapter` / `src/util`. The **same class of leak**
survives in modules that still `import` `node:child_process` directly and spawn
with the `env:` option omitted. Node's default behaviour then hands the child the
full `process.env` — `GH_TOKEN`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`,
`SPECRUNNER_API_KEY`, and every `*_TOKEN` / `*_API_KEY` / `*_SECRET` key.

### Leaking call-sites (baseline)

| # | File | Site | Why it matters |
|---|------|------|----------------|
| 1 | `src/git/dynamic-context.ts` | `runGit` → `execFileAsync("git", args, { cwd })` (L42) | Spawned **every pipeline run** at the start (`runner.ts:179` `collectDynamicContext(workspace.cwd, …)`) in the **agent-writable worktree cwd**. A malicious `.git/hooks` / `core.hooksPath` in the worktree can exfiltrate inherited secrets — exactly the threat credential-containment named. |
| 2 | `src/git/remote.ts` | `getOriginInfo` → `execFileAsync` `remote get-url origin` (L27) + `rev-parse --git-dir` (L43) | Spawned every run / inbox / archive (`preflight.ts:97`, `cli/inbox.ts`, `cli/archive.ts`). |
| 3 | `src/git/transport-auth.ts` | `getRawOriginUrl` → `execFileAsync` `remote get-url origin` (L159) | Spawned by `createTransportAuth` in local / managed / archive / cancel paths. |
| 4 | `src/cli/doctor.ts` | `buildExecFile` → `execFileAsync(file, args, { timeout, signal })` (L67) | composition-root, cwd = repo root, `--version` / `whoami` / origin reads only → relatively low risk, but still a leak of the same class. |

`grep -rn "env:" src/git/` returns 0 — no spawn in `src/git` passes an env.

### Why the existing tooth cannot catch this

The B-6 tooth (`core-invariants.test.ts`, `grepE("process\\.env", …)`) detects
**reads of `process.env`**. An env-omission spawn never writes `process.env` at
all — it inherits by default. So a spawn that forgets `env:` is invisible to a
`process.env` grep and ships green. Extending B-6's grep to `src/git` would not
help: there is no `process.env` token to find.

### Reference-safe sites (the seam already works)

- `src/util/spawn.ts` `spawnCommand` (L45-47) and `src/util/git-exec.ts`
  `runSubprocess` (L19) already pass `stripSecrets(process.env)` to the child.
  `runSubprocess` is the single git choke-point feeding `gitExec` /
  `gitExecExitCode`.
- `src/core/verification/commands.ts` (L70) and `runner.ts` (L78, L186, L308)
  already strip.
- `src/git/transport-auth.ts` injects GitHub auth via
  `git -c http.<scope>.extraheader=…` (per-invocation), **not** via env tokens —
  so removing secrets from git's env does not break push / fetch / clone.

## Goals / Non-Goals

**Goals**:

1. Every leaking subprocess (`src/git/{dynamic-context,remote,transport-auth}` and
   `src/cli/doctor.ts`) starts git with a `stripSecrets`-filtered env.
2. A structural tooth prevents the **env-omission** class of regression — one that
   the `process.env` grep cannot express.
3. Narrow the B-6 claude allowlist entry from a generic cast idiom to a
   site-specific identifier so future raw-env spawns in the same file are caught.
4. `typecheck && test` green; git push / fetch / log / diff / remote unaffected.

**Non-Goals**:

- Rolling back credential-containment / findings-parse-soundness (both accepted).
- Functional changes to `verification/commands.ts` / `verification/runner.ts`
  (already strip; only their import is allowlisted by the new tooth).
- managed `isGitHubDirectoryListing` JSON-array false-positive (separate, fail-safe).
- Bash reads of an on-disk `credentials.json` (FS / sandbox domain, not env hygiene).

## Decisions

### D1 — Structural tooth = ban direct `node:child_process` import outside the seam

A new architecture invariant (tag **B-12**) is enforced in
`core-invariants.test.ts`: grep `from ['"]node:child_process` across `src/` and
assert that only allowlisted files appear, filtered through `ARCH_ALLOWLIST` with
the same one-directional ratchet used by B-1…B-11 and DSM. The seam modules
(`util/spawn.ts`, `util/git-exec.ts`) and a small set of composition-root /
already-stripping sites are the only allowlisted importers.

**Rationale**: the leak is an *omission* (`env:` not written), which no
content-grep can see. Constraining the **import** converts the invisible omission
into a visible, grep-able fact: any module that wants to spawn must either route
through a seam that *always* strips, or be explicitly allowlisted (and then pinned
by its own env test). This is the architect-adopted "seam consolidation + direct
`node:child_process` ban" mechanism.

**Alternatives considered**:
- *Add `src/git` to the B-6 `process.env` grep* — **rejected**. B-6 looks for
  `process.env`; an env-omission spawn contains no such token, so the tooth stays
  green on the exact regression we must stop.
- *Per-site `env:` grep on spawn call lines* — rejected. The `env` argument is
  frequently on a different physical line from the spawn call; a line-based grep
  cannot reliably bind them, and the absence of an argument is not greppable.

### D2 — Consolidate the three `src/git` leaks onto the `git-exec` seam

`dynamic-context.ts`, `remote.ts`, and `transport-auth.ts` drop their direct
`node:child_process` imports and call `gitExec` / `gitExecExitCode` /
`runSubprocess` from `util/git-exec.ts` (leaf layer; `shared-kernel → leaf` is a
permitted DSM edge). The seam strips env transitively, so these sites need no
per-site `env:` knowledge.

- `dynamic-context.ts`: `runGit(cwd, args)` delegates to
  `gitExec(defaultSpawnFn, cwd, args)`. Contract is identical (trimmed stdout |
  `null`).
- `transport-auth.ts`: `getRawOriginUrl(cwd)` delegates to
  `gitExec(defaultSpawnFn, cwd, ["remote","get-url","origin"])`. Identical contract.

**Rationale**: the seam is the enforced strip point; routing through it is what D1's
tooth requires and removes the env decision from each site entirely.

**Alternatives considered**: *keep `node:child_process` in `src/git` and add
`env: stripSecrets(process.env)` per call, then allowlist the imports* — rejected.
It re-introduces the per-site decision the leak came from and weakens D1 (these
modules have no reason — no `timeout` / `signal` need — to bypass the seam).

### D3 — Preserve `remote.ts` error discrimination through the seam

`getOriginInfo` currently distinguishes "not a git repo" from "git repo but no
origin" by string-matching `err.message` (`"not a git repository"`, `"128"`,
`"No such remote"`) thrown by `execFile` on non-zero exit. `runSubprocess`
**resolves** (does not throw) on non-zero exit and **rejects** only on the spawn
`error` event (e.g. missing binary). The rewrite therefore:
- on `exitCode === 0` → parse `stdout`;
- on `exitCode !== 0` → probe `gitExecExitCode(… ["rev-parse","--git-dir"])`:
  `0` ⇒ throw the "Origin remote not configured" `SpecRunnerError("NOT_GIT_REPO")`;
  non-`0` ⇒ throw `notGitRepoError()`;
- on a thrown spawn error (catch) → throw `notGitRepoError()`.

The externally observable contract (which `SpecRunnerError` code surfaces) is
preserved while the fragile message-string matching is dropped.

**Rationale**: the `rev-parse` probe is what the old code already used inside its
`128` branch; promoting it to the primary discriminator is both seam-compatible and
more robust than locale-dependent message strings.

**Alternatives considered**: *inspect `stderr` substrings from `runSubprocess`* —
rejected; reproduces the locale-fragile string matching the rewrite removes.

### D4 — Doctor: keep `child_process`, strip env at the call, allowlist the import

`doctor.ts`'s `ExecFileFunction` needs `execFile` semantics with `timeout` **and**
`AbortSignal` (`signal`) — neither is offered by the `util/spawn.ts` seam, which is
`spawn`-based with `timeoutMs` only. So `doctor.ts` retains its `node:child_process`
import, adds `env: stripSecrets(process.env)` to the `execFileAsync` call inside
`buildExecFile`, and receives a B-12 allowlist entry justified as composition-root
needing `execFile timeout+signal`. `buildExecFile` is made injectable (optional
`execFileAsyncImpl` + `env` parameters defaulting to the real ones) so the strip is
unit-testable without mocking `promisify`.

**Rationale**: satisfies the acceptance option "strip **or** reasoned
composition-root allowlist" by doing **both** — the env is stripped (closing the
leak) and the import is allowlisted with a recorded reason (it genuinely cannot use
the current seam). It is not left unaddressed.

**Alternatives considered**: *migrate doctor to `util/spawn.ts`* — rejected; would
drop `AbortSignal`-based abort used by doctor's timeout checks. *Extend the seam to
accept an `AbortSignal`* — deferred (larger surface, see Open Questions).

### D5 — Narrow the B-6 claude allowlist to a site-specific identifier

The B-6 entry for `src/adapter/claude-code/agent-runner.ts` currently uses
`pattern: "as Record<string, string | undefined>"` — the file's generic cast idiom,
which would silently allow any *future* cast-bearing raw-env spawn in the same file.
The grep matches the `process.env` line (L271), while the resolver name
(`resolveClaudeCodeOAuthTokenFn`) sits on the preceding line (L270), so a
line-based allowlist cannot bind them today. The resolver call is collapsed onto a
single physical line so the matched line contains both `process.env` and
`resolveClaudeCodeOAuthTokenFn(`, and the allowlist pattern is narrowed to
`resolveClaudeCodeOAuthTokenFn(`. Per the `arch-allowlist.ts` MATCHING SEMANTICS,
coverage requires file + substring, so any other `process.env` line in that file is
no longer suppressed.

**Rationale**: aligns the entry with the allowlist governance ("specific enough to
identify this violation without covering future violations in the same file").

**Alternatives considered**: *keep two lines and match an L271-only substring* —
rejected; nothing on L271 uniquely distinguishes the legitimate resolver input from
a future leak. Collapsing to one line is a formatting-only, non-functional change.

### D6 — Record the seam-consolidation ruling

B-12 is a new structural invariant. Its rationale (subprocess spawn confined to the
strip seam; direct `node:child_process` import banned elsewhere) is recorded by the
ADR step (`adr: true`). Promotion of the canonical B-12 row into the
`architecture/model.md` §4 registry is an owner action under §7 (out-of-loop,
CODEOWNERS) and is **not** performed by the implementer; the tooth and its
allowlist (in `tests/unit/architecture/`) are the enforcement of record.

**Rationale**: respects the out-of-loop status of `architecture/model.md` while
still landing an enforced tooth in this change.

## Risks / Trade-offs

- [Risk] `remote.ts` rewrite changes the internal error path → **Mitigation**: D3
  preserves the `SpecRunnerError` code contract; the two existing tests that touch
  the spawn path (`git-remote.test.ts` TC-013 mock of `execFile`, TC-015 literal
  `"execFile"` assertion) are updated to the seam shape — TC-015's intent
  (shell-injection prevention) still holds because the seam uses
  `spawn(bin, args, { shell:false })` with an argument array, never a shell string.
- [Risk] Allowlisting `verification/*` and `doctor.ts` for B-12 looks like a hole →
  **Mitigation**: all three already strip and are pinned by env tests
  (`runner-git-show-env.test.ts` plus the new doctor env test); the allowlist is a
  ratchet (shrink-only, CODEOWNERS-gated), not an escape hatch.
- [Risk] `execFile` → `spawn` semantics differ (buffering, `maxBuffer`) →
  **Mitigation**: the affected commands (`remote get-url`, `rev-parse`, `log`,
  `diff --stat`) emit small output; `runSubprocess` already backs verification git
  calls in production.
- [Risk] git transport breaks after env strip → **Mitigation**: D2 changes only
  *read* commands; transport auth is extraheader-injected and env-independent;
  existing transport-auth tests cover push / fetch.

## Open Questions

- Should the `util/spawn.ts` seam grow an optional `AbortSignal` so `doctor.ts`
  can eventually drop its B-12 allowlist entry? Deferred; not required to close the
  leak (D4 strips at the call today).
