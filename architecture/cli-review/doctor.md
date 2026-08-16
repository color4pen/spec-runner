# `doctor` review

Status: **reviewed after auth/setup merge #1001**  
Verdict: **KEEP as the setup/readiness navigator. KEEP `doctor repair <slug>` under doctor, but make it a real repair-scoped subcommand rather than an inline positional escape hatch.**

Post-change baseline: `main@bb435a1c1c8dced532c6a699726cf08388098128` (`auth-setup-ux`, #1001).

Current forms:

```text
specrunner doctor [--json]
specrunner doctor repair <slug>   # still implemented as inline special handling
```

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

After #1001 the human formatter also makes readiness explicit:

```text
fail == 0
-> Ready to run.
-> Next: specrunner request new <slug>
```

Warnings do not block readiness. This is the correct model for optional/headless capabilities.

## Verdict

### Keep `doctor` top-level and make it the setup traffic controller

`doctor` deserves a short top-level verb because it is the cross-cutting readiness surface. Do not move it under `runtime`, `config`, or a new `setup` namespace.

The onboarding loop is now correctly reflected in the product:

```text
specrunner init
specrunner doctor
# doctor points to missing setup only
specrunner doctor
# Ready to run
```

Object-specific state commands remain separate:

```text
runtime status  = what is the managed runtime state?
doctor          = can SpecRunner operate here, and what should I do next?
```

### Keep plain `doctor` read-only

The existing architecture gets this right: checks inspect and report. Do not add a broad `doctor --fix` that mutates every fixable condition.

## What #1001 resolved

### 1. Readiness now means `fail == 0`

Human output prints `Ready to run.` even when warnings remain. This lets attended users be ready without configuring headless-only credentials.

Exit semantics already matched this rule and remain:

```text
any fail -> exit 1
pass/warn only -> exit 0
```

### 2. Headless Claude credential is correctly optional and points to a real command

Missing Claude Code OAuth token remains a warning and now says it is needed only for cron / inbox headless runs. The remediation points to:

```text
claude setup-token
specrunner credentials set claude-code
```

The dead `login --provider claude` guidance is gone.

### 3. Dead SpecRunner command guidance now has a mechanical guard

The auth/setup request introduced tests that reject stale doctor hints which name nonexistent CLI commands. This is a useful property of doctor as the setup navigator: prescriptions are no longer trusted prose only.

### 4. README/init now route through doctor

The normal setup path no longer teaches unconditional `specrunner login`. `doctor` is now the source of truth for what is actually missing on the machine.

## `doctor repair <slug>` verdict

### Keep the repair under `doctor`

The slug-occupancy design explicitly made broken-invariant adjudication a doctor action and restricted this surgery family to `cancel` / `doctor`. The doctor check detects a sidecar mismatch; the repair is allowed only when exactly one non-terminal job makes the correct answer mechanically unique.

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

Do not move this to a generic `job repair`.

### But make it a real subcommand

This remains unchanged after #1001. `doctor repair` is still parser folklore: `doctor` declares an optional positional and the handler checks whether the first token is `repair`.

Consequences:

- registry/help cannot enumerate it structurally,
- it cannot own `requiresRepo: true` independently from plain doctor,
- it cannot own its own visibility/usage/error adapter,
- guide/hint validation cannot reason about the path through the same command metadata.

**Direction:** future CommandSpec should express a default diagnostic action plus the repair child:

```text
doctor
  default action: diagnose
  visibility: normal
  requiresRepo: false

  repair <slug>
    visibility: repair/operator
    requiresRepo: true
```

## Remaining findings

### 1. `doctor repair` can still silently operate outside a repository

Plain `doctor` intentionally works outside a repo. The inline repair path inherits that outer behavior and falls back to `process.cwd()` when no repo root exists.

A repository surgery command should never scan arbitrary cwd and then succeed with "nothing to repair".

**Direction:** `doctor repair` must require a resolved repo root and use only dispatch-resolved repo identity.

### 2. Repair still collapses structured errors

`repairSlugOccupancySidecar` can throw structured `SpecRunnerError` values, but the inline CLI branch catches all errors and exits `GENERAL_ERROR`.

**Direction:** once repair is a real command, use the common structured error adapter so invalid slug, ambiguity and other deliberate error semantics survive to the CLI.

### 3. Invalid GitHub-token guidance is still one hop too indirect

Doctor knows the effective GitHub token source (`env`, `gh`, `credentials`). But `github-token-valid` still gives the same HTTP 401 hint for every source:

```text
Run specrunner login to re-authenticate.
```

After #1001 this is no longer dangerous because `specrunner login` itself resolves the effective source and refuses ineffective Device Flow for an invalid higher-priority env/gh credential. It then explains the real repair.

So the previous false-repair bug is resolved at the auth boundary, but doctor is not yet the shortest possible traffic controller:

```text
expired GH_TOKEN
-> doctor: run specrunner login
-> login: fix/unset GH_TOKEN
```

instead of:

```text
expired GH_TOKEN
-> doctor: fix/unset GH_TOKEN
```

**Direction:** low/medium UX cleanup, not an auth correctness blocker. Let the `github-token-valid` check use `ctx.githubTokenSource` to prescribe the active source directly:

- env -> unset/update the named variable,
- gh -> `gh auth login` for the host,
- credentials -> `specrunner login`,
- network uncertainty -> retry/connectivity warning.

This would better fulfill doctor's role as the single setup navigator.

### 4. `doctor --help` still describes diagnosis only

This follows from the inline-repair shape. Once `repair` is structurally represented, detailed doctor help can show it in an operator/repair section without crowding normal onboarding.

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

## Final verdict

- Top-level `doctor`: **KEEP**
- Setup/readiness role: **RESOLVED and strengthened by #1001**
- Ready semantics: **RESOLVED (`fail == 0`)**
- Headless credential hint: **RESOLVED**
- Dead CLI guidance guard: **RESOLVED**
- Source-aware GitHub invalid hint: **still desirable as direct-navigation UX, but no longer correctness-critical**
- `doctor repair` placement: **KEEP under doctor**
- `doctor repair` registry shape / repo guard / structured errors: **still needs cleanup in CommandSpec work**

## Machine-contract implications

Doctor exposes a requirement the current `CommandDef | ParentCommandDef` model cannot express cleanly: a command can have a default action **and** named subcommands with different guards/visibility.

A future CommandSpec should support:

- default handler/action for `doctor`,
- child `repair <slug>`,
- inherited vs overridden `requiresRepo`,
- visibility/audience (`normal` vs `repair/operator`),
- per-action args/flags/help,
- structured error adaptation,
- and command references used by doctor hints / guide validation.
