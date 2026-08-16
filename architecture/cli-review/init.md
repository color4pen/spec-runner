# `init` review

Status: **reviewed**  
Verdict: **KEEP**, with responsibility cleanup pending `config` review.

Baseline implementation:

- `src/cli/init.ts`
- `src/cli/command-registry.ts` (`COMMANDS.init`)
- `tests/init.test.ts`
- `src/config/store.ts`

## User goal

Prepare a Git repository so SpecRunner can be used there.

That is a natural top-level lifecycle action. `init` should remain easy to discover and safe to run repeatedly.

## Current contract

Registry surface:

```text
specrunner init [--runtime managed|local] [--provider anthropic|openai]
```

`requiresRepo: true`.

Actual side effects:

1. If user-global config does not exist, create `~/.config/specrunner/config.json` (0600) with model defaults.
2. Ensure `.gitignore` entries for `.specrunner` state.
3. Ensure `specrunner/drafts/`.
4. Ensure `specrunner/changes/`.

It does **not** create project-local `.specrunner/config.json`; that layer is an optional overlay.

`--runtime` is already deprecated and returns argument error. `--provider` is only resolved inside the "global config does not exist" branch.

## What is good

- Idempotent repo bootstrap is exactly what `init` should be.
- Repo requirement is declared at dispatch level instead of being rediscovered inside the handler.
- Existing global config is not overwritten.
- Project scaffold is still repaired/ensured when global config already exists.
- Global config is written atomically with 0600 via the config store.

## Findings

### 1. `init` currently owns two scopes

It combines:

```text
repository bootstrap
+ first-ever user-global model default bootstrap
```

The first is per repository. The second is per user/machine and normally executes only once.

This is why `--provider` behaves strangely: it looks like a project-init option but actually seeds `steps.defaults.model` in the user-global config. On later repositories the same flag has no effect because the global config already exists.

The existing behavior was intentional (`provider-aware-init` explicitly kept provider resolution inside the config-missing branch), but it is still a weak CLI contract: the command name and flag scope do not match.

**Direction:** do not decide this in isolation. Review `config` next and choose between:

- keeping bootstrap convenience but renaming/defining the flag as a user default (for example `--default-provider`) and explicitly reporting when the global default already exists, or
- moving user-global default mutation to the `config` surface and narrowing `init` toward repo bootstrap.

The auth/setup UX request's "never silently ignore provider flag" is required either way.

### 2. Deprecated `--runtime` is represented as an active registry flag

The handler only rejects `--runtime managed|local`; it is migration compatibility, not current functionality.

Keeping a compatibility shim can be correct, but a future command spec should distinguish:

```text
active flag
hidden/deprecated compatibility flag
```

so help/guide validation does not treat deprecated syntax as recommended interface.

### 3. `init --help` has no detailed help

`COMMANDS.init` has no `usage`. The entrypoint therefore emits `NO_DETAILED_HELP_USAGE` for `specrunner init --help` even though `init` has flags and nontrivial global-vs-project semantics.

This is not a documentation nicety. It makes the current CLI contract undiscoverable exactly where the behavior is surprising.

**Direction:** command-specific help should become mandatory/derived from the command spec rather than optional handwritten strings.

### 4. Post-init guidance is currently wrong for the desired setup flow

On first global config creation, `init` unconditionally prints:

```text
Run 'specrunner login' to authenticate with GitHub (required for PR creation).
```

But GitHub auth may already resolve from `GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`.

The auth/setup UX request should replace this with a `doctor`-first next step.

## Desired user-facing shape

At minimum:

```text
specrunner init
# scaffold/repair only
# then: specrunner doctor
```

A second run should remain safe and useful for repairing missing project scaffold.

Provider/default-model selection is **HOLD pending `config` review** rather than being cemented into `init` during the auth cleanup.

## Final verdict

- Top-level placement: **KEEP**
- Name: **KEEP**
- Repo scaffold responsibility: **KEEP**
- Global config existence bootstrap: **KEEP for now**
- Provider/default-model ownership: **HOLD until `config` review**
- Deprecated runtime compatibility: **keep only as explicit deprecated/hidden surface if compatibility is still needed**
- Detailed help: **must improve**
- Next-step guidance: **doctor-first**
