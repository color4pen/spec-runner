# `doctor` review

Status: **reviewed against current main; auth/setup follow-up pending**  
Verdict: **KEEP as the setup/readiness navigator. KEEP `doctor repair <slug>` under doctor, but make it a real repair-scoped subcommand rather than an inline positional escape hatch.**

Current forms:

```text
specrunner doctor [--json]
specrunner doctor repair <slug>   # implemented as inline special handling, not registry structure
```

Baseline note: current `main` is still `57d9e7411b9f6dd80cbaf63531febca56a4f4ab5` (0.4.10). The auth/setup UX change reviewed separately has not landed on main yet, so credential-related findings below describe the current implementation and the intended post-auth direction.

## User goal

Answer one question:

> Is this machine/repository ready to run SpecRunner, and if not, what should I do next?

This is broader than any object-specific `status` command. `runtime status` inspects managed-runtime state; `doctor` crosses runtime, config, auth, repository, agent/provider and storage boundaries to diagnose readiness and prescribe the next action.

## Current diagnostic contract

`runDoctor`:

1. is runnable outside a repository,
2. resolves repository root when available,
3. loads global + project config best-effort,
4. resolves GitHub / managed API / Claude headless credentials best-effort,
5. runs common checks plus checks for the configured runtime,
6. executes checks sequentially for deterministic output,
7. renders categorized human output or a JSON contract,
8. returns exit 1 when any check is `fail`, otherwise 0.

Warnings therefore do not make the environment non-ready. This is the correct exit-code model for the auth/setup direction: optional headless credentials may warn without blocking attended use.

## Verdict

### Keep `doctor` top-level and make it the setup traffic controller

`doctor` deserves a short top-level verb because it is the cross-cutting readiness surface. Do not move it under `runtime`, `config`, or a new `setup` namespace.

The intended onboarding loop should be:

```text
specrunner init
specrunner doctor
# doctor points to the next concrete action
```

Object-specific state commands remain separate:

```text
runtime status  = what is the managed runtime state?
doctor          = can SpecRunner operate here, and what should I do next?
```

### Keep plain `doctor` read-only

The existing architecture gets this right: checks only inspect and report. Do not add a broad `doctor --fix` that mutates every fixable condition. A diagnostic command is trustworthy because users can run it repeatedly without wondering what it changed.

## `doctor repair <slug>` verdict

### Keep the repair under `doctor`

The slug-occupancy design explicitly made broken-invariant adjudication a doctor action and restricted this surgery family to `cancel` / `doctor`. The doctor check detects a sidecar mismatch; the repair is allowed only when exactly one non-terminal job makes the correct answer mechanically unique.

That is a good responsibility boundary:

```text
doctor
  detects inconsistency
  -> points to repair only when machine-decidable

doctor repair <slug>
  performs that narrow repair

multiple candidate jobs
  -> no auto repair
  -> human chooses which job to cancel
```

Do not move this to a generic `job repair`; that would broaden the job API around an internal invariant and weaken the original boundary.

### But make it a real subcommand

Today `doctor repair` is not represented as command structure. `doctor` declares an optional positional named `subcommand`, then its handler manually inspects `parsed.positionals[0] === "repair"`.

Consequences:

- the registry cannot enumerate the repair path,
- `doctor --help` does not describe it,
- it cannot own its own positional contract / usage / visibility,
- it cannot declare `requiresRepo: true` independently from plain doctor,
- future guide/help validation cannot reason about it.

**Direction:** model doctor as a parent command with a default diagnostic action plus a structured repair child, or otherwise let CommandSpec express a default action and named subcommands. The public model should be machine-readable even if repair is de-emphasized in terse help.

Suggested metadata shape:

```text
doctor
  default action: diagnose
  visibility: normal
  requiresRepo: false

  repair <slug>
    visibility: repair/operator
    requiresRepo: true
```

The important property is not the exact TypeScript shape; it is that the repair path stops being parser folklore.

## Findings

### 1. `doctor repair` can silently operate outside a repository

Plain `doctor` intentionally works outside a repo. The inline repair path inherits that outer behavior and currently falls back to:

```ts
const repoRoot = ctx?.repoRoot ?? process.cwd();
```

If invoked outside a repository, the repair core can scan an arbitrary cwd and report `nothing to repair` with exit 0. That is false success for a repository surgery command.

**Direction:** `doctor repair` must require a resolved repository and use only dispatch-resolved `repoRoot`. Outside a repo, return the standard repo-required argument/setup error rather than falling back to cwd.

### 2. Current repair exit handling collapses structured errors

`repairSlugOccupancySidecar` validates the slug and can throw structured `SpecRunnerError` values, including ambiguity. The inline command catches every error and exits `GENERAL_ERROR`, discarding the error's intended exit code/hint structure.

**Direction:** use the same structured error adapter as other CLI commands. Invalid slug should be an argument error; ambiguity should retain its deliberate failure semantics and actionable enumeration.

### 3. GitHub auth diagnosis knows the active source but its invalid-token prescription is not source-aware

Doctor already records GitHub token source (`env`, `gh`, `credentials`) and the presence check even tells the user whether `$GH_TOKEN` / `$GITHUB_TOKEN` won.

But `github-token-valid` currently says `Run specrunner login to re-authenticate` on HTTP 401 regardless of source.

That is incorrect when the invalid active source is higher priority than credentials:

```text
GH_TOKEN=expired
credentials.json=fresh
```

Running `specrunner login` and saving another credential does not repair runtime behavior because the expired environment variable still shadows it.

**Direction after auth/setup cleanup:** validation failure must prescribe repair of the active source:

- env source -> unset/fix the named env variable,
- `gh` source -> `gh auth login` / re-authenticate the host,
- credentials source -> `specrunner login`,
- network uncertainty -> warn and retry; never classify as invalid.

This is the doctor-side expression of the credential precedence invariant from the login review.

### 4. Headless Claude credential is already correctly non-blocking, but its hint is stale

For local runtime, missing Claude Code OAuth token is `warn`, not `fail`, because it is only required for headless cron operation. That status is correct and should remain.

The current hint still points to the old `specrunner login --provider claude` surface. The auth/setup change should replace this with the dedicated credentials command.

This also confirms the readiness rule: **ready means no failures, not all checks pass.** Warnings may remain for optional/unattended capabilities.

### 5. Next-step derivation is useful but currently too small to be the sole guidance source

The formatter derives an ordered `Next steps` list for a few failed checks (git repository, origin, config, GitHub auth). This is a good pattern because dependency ordering avoids random remediation order.

However many checks rely only on their local hint, and warning remediation is intentionally excluded from the final list.

**Direction:** keep the distinction:

- each fail/warn owns a concrete local next action,
- the final `Next steps` section contains only blocking actions that benefit from ordering/deduplication,
- do not require every warning to name a SpecRunner command when the real remedy is external (for example connectivity).

When `guide` exists, operationally complex hints may point to a guide topic, but the first actionable command must remain visible at the failure site.

### 6. `doctor` outside a repo should remain supported

`git-repository` failing outside a repo is not a reason to make doctor itself repo-required. Being able to run doctor from an unprepared directory is part of its setup-navigator role.

The asymmetry is intentional:

```text
doctor               repo optional, diagnosis only
doctor repair <slug> repo required, mutation
```

This is another reason the current single `CommandDef` plus inline positional branch is insufficient: parent/default action and repair child have different guards.

### 7. Human and JSON output are appropriately separate contracts

Human output groups checks by stable categories and adds remediation guidance. JSON emits `{ summary, results[] }` with status, required, message and optional hint/details.

KEEP `--json`. It makes doctor useful for CI/setup scripts without forcing callers to parse decorated text.

Do not let repair inherit `--json` implicitly. If structured repair output is ever needed, define its own result contract deliberately.

### 8. `doctor --help` is decent but currently describes only diagnosis

The diagnostic help accurately describes `--json`, but the hidden inline repair path is absent. Once repair is a structured child, help can distinguish normal and repair surfaces rather than pretending the latter does not exist.

Suggested terse shape:

```text
specrunner doctor [--json]

Diagnose readiness and show next actions.

Repair / operator:
  doctor repair <slug>   Repair a uniquely-resolvable slug occupancy sidecar mismatch
```

If repair is intentionally omitted from top-level terse help, it must still appear in `doctor --help`, `guide`, and the originating doctor finding through the same command metadata. No dead hidden incantations.

## Desired shape

```text
specrunner doctor [--json]
specrunner doctor repair <slug>
```

Semantics:

```text
doctor
  read-only
  runnable anywhere
  readiness + next-action router
  exit 0 when fail count == 0

doctor repair
  narrow mechanical repair
  repo-required
  contextual/operator visibility
  never guesses when multiple candidates exist
```

## Auth/setup integration still pending on main

Once the auth/setup change lands, re-check only the credential-related details, not the command placement decision:

- GitHub invalid-source guidance is precedence-aware,
- missing headless Claude credential remains warn,
- headless hints use `credentials set ...`,
- `Ready`/exit semantics use `fail === 0`,
- every fail/warn has a concrete next action without requiring a CLI command where none exists.

The structural verdict for `doctor` does not depend on that merge.

## Machine-contract implications

Doctor exposes a requirement the current `CommandDef | ParentCommandDef` model cannot express cleanly: a command can have a default action **and** named subcommands with different guards/visibility.

A future CommandSpec should support:

- a default handler/action for `doctor`,
- child `repair <slug>`,
- inherited vs overridden `requiresRepo`,
- visibility/audience (`normal` vs `repair/operator`),
- per-action args/flags/help,
- structured error adaptation,
- and command references used by doctor hints / guide validation.

This is stronger evidence for CommandSpec than adding another special-case branch to the registry.