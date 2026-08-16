# `config` review

Status: **reviewed**  
Verdict: **KEEP** as a read/diagnostic namespace. Do not turn it into a generic mutation API just to absorb `init --provider`.

Baseline implementation:

- `src/cli/config-effective.ts`
- `src/cli/command-registry.ts` (`COMMANDS.config`)
- `src/config/store.ts`
- `src/config/step-config.ts`
- `docs/configuration.md`

## User goal

Understand which execution configuration SpecRunner will actually use after user-global config, project-local overlay, request type overrides, step-specific settings and built-in defaults are resolved.

This is an advanced but legitimate diagnostic need. The command answers a question that is difficult to answer reliably by reading one JSON file.

## Current contract

```text
specrunner config effective [--type <requestType>] [--json]
```

It is read-only.

It reports:

- user-global config path + existence
- project-local config path + existence
- effective `model`, `maxTurns`, `timeoutMs` for every standard agent step
- the source layer/path for each resolved value
- request-type-specific resolution when `--type` is supplied

The config storage model is intentionally two-layer:

```text
~/.config/specrunner/config.json
        +
<repo>/.specrunner/config.json
        ↓ deep merge
    effective config
```

Project-local config is currently hand-created; `init` creates/maintains the user-global scaffold and repository directories, but not the project-local config file.

## What is good

- `effective` exposes resolved behavior, not merely raw config text.
- Source attribution is first-class, so the command is useful when a project overlay or `byRequestType` value unexpectedly wins.
- `--json` gives a stable machine-readable form without introducing another config interpretation path.
- It works outside a repository using global config only.
- The subcommand has detailed help and validates request types against `TYPE_CONFIG`.
- Keeping config editing as direct JSON preserves the config file as the obvious source of truth.

## Findings

### 1. `config` is currently an inspection namespace, not a configuration-management API

That is a strength, not a missing feature.

There is no `config set`, `config edit`, or persistent `provider` field. Runtime provider selection is derived from the configured model name. `init --provider` is only a scaffold-time preset that expands into concrete model names.

Therefore adding something like:

```text
specrunner config set provider openai
```

would create a CLI concept that does not exist in the config schema and would need to invent mutation semantics for multiple step model fields.

**Direction:** do not move `init --provider` into `config` merely to fix the init UX.

### 2. Resolve the `init --provider` problem as scaffold semantics

The earlier `init` review held provider ownership pending this review. This review resolves that hold:

- model/provider preset selection may remain an `init` convenience for first user-global scaffold creation;
- it must be named/documented as a scaffold/default preset rather than implying a persistent project provider switch;
- when the user-global config already exists, an explicit preset flag must never be silently ignored;
- the CLI should tell the user which config layer/path now owns the value and that future changes are made in config JSON/project overlay.

Whether the final spelling is `--default-provider`, `--preset`, or another clearer name can be decided in the auth/setup UX design. The important boundary is that `config` should not gain a fake provider mutation API.

### 3. `config --help` has no parent-level usage

`config effective --help` is good, but `COMMANDS.config` itself has no `usage` string. Therefore `specrunner config --help` does not explain what the namespace contains; dispatch falls back to the generic `config effective` usage line/error behavior.

This is the same structural problem found in `init`: parent/command help is optional rather than derived from the registry.

**Direction:** future `CommandSpec` should derive parent help from registered subcommands and summaries automatically.

### 4. `effective` is deliberately narrower than the full config

It shows step execution fields (`model`, `maxTurns`, `timeoutMs`) and their sources, not every config domain such as workspace, verification, inbox, archive, GitHub, etc.

The name `effective` is still acceptable because this command was created specifically as the step-resolution view, and its detailed help states that scope. Do not widen it into a generic config dump without a concrete user need; doing so would create a second serialization surface for the entire schema.

If future diagnostics need other domains, prefer focused views or `doctor` checks rather than making `config effective` a kitchen sink.

### 5. Manual project-local creation is acceptable for now

The docs explicitly say project-local `.specrunner/config.json` is hand-created. That is not automatically a CLI UX defect: project config is versioned project policy and direct editing keeps it reviewable.

A future `config init --local`/scaffold command could be justified if repeated setup pain appears, but there is no evidence yet that another command is needed.

## Desired user-facing shape

```text
specrunner config effective
specrunner config effective --type bug-fix
specrunner config effective --json
```

The namespace remains primarily diagnostic/read-only.

For changing config, the product should continue to point to the concrete owning file/layer rather than hide mutation behind opaque setters.

## Final verdict

- Top-level placement: **KEEP**
- `config effective`: **KEEP**
- Name `effective`: **KEEP**
- Read-only/source-attribution responsibility: **KEEP**
- Add generic `config set`: **DO NOT ADD without a separate proven need**
- Move `init --provider` here: **NO**
- Parent `config --help`: **must improve through derived command help**
- Project-local config creation command: **HOLD; no evidence it is needed yet**
