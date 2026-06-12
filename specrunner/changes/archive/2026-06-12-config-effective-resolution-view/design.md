# Design: Effective Step Config Resolution View

## Context

Step execution settings are resolved in two phases:

1. User global config (`~/.config/specrunner/config.json`) and project local config (`.specrunner/config.json`) are deep-merged, with project local values overriding user global values at the same path.
2. `getStepExecutionConfig` resolves each field through the existing priority chain: step `byRequestType`, step, defaults `byRequestType`, defaults, step definition default, and SDK default for nullable fields.

The current merge and resolver return only effective values. They do not retain whether a winning value came from user global or project local, nor which resolution level won. This made the observed 2026-06-12 failure hard to diagnose: a user-global `steps.design.byRequestType.bug-fix.model` silently won over a project-local `steps.defaults.model`.

## Goals / Non-Goals

**Goals**:

- Add a read-only CLI surface that shows effective `model`, `maxTurns`, and `timeoutMs` for every standard agent step.
- Show the winning source for each displayed field as both a config layer (`user`, `project`, `stepdef`, or `sdk`) and a resolution level/path.
- Support request-type-aware display via a request type option.
- Keep existing execution semantics identical by reusing the current merge and resolution rules.
- Add regression coverage for the observed global-step-over-project-defaults case, request-type-dependent output, and step definition fallback.

**Non-Goals**:

- Do not change config precedence, merge semantics, or the step resolution chain.
- Do not change the config schema.
- Do not add config editing or migration behavior.
- Do not display managed-agent registered model internals; `model` remains the configured local-runtime value even though managed runtime ignores it for execution.

## Decisions

### D1. Add `specrunner config effective` as the command surface

The feature SHALL add a new parent command `config` with subcommand `effective`. The command displays effective step execution config for standard agent-backed steps from `AGENT_STEP_NAMES`.

Recommended usage:

```text
specrunner config effective --type bug-fix
specrunner config effective --type new-feature --json
```

When `--type` is omitted, the command resolves the same way runtime resolution does with no request type: `byRequestType` levels are skipped. The output header must make this explicit as `requestType: none`.

Rationale: This is an inspection command for config, not an environment health check. A dedicated `config effective` command keeps `doctor` focused on pass/warn/fail diagnostics and allows the command to have table-oriented output without distorting doctor check semantics.

Alternatives considered:

- Extend `doctor`: rejected because the output is not a health check and should not affect doctor exit code.
- Add `config show`: rejected because it could imply raw config display; this feature is specifically about effective step resolution with source attribution.

### D2. Implement attribution with a new read-only trace API beside the existing resolver

Add a new helper in the config layer, for example `resolveStepExecutionConfigTrace`, that returns the same effective values as `getStepExecutionConfig` plus per-field source metadata. The existing `getStepExecutionConfig` function must remain behaviorally unchanged and should continue to be used by runtime adapters.

The trace API should accept:

- the validated merged config used for value resolution,
- the user global config when present,
- the project local overlay when present,
- the step name,
- the hardcoded step defaults,
- the optional request type.

For each field, it should walk the same candidate order as `getStepExecutionConfig` and return the first defined value. `null` is a defined value for `maxTurns` and `timeoutMs`, exactly as today.

Rationale: Keeping runtime execution on the existing resolver lowers regression risk. A separate trace API can be tested for equality with the existing resolver while carrying additional metadata for the CLI.

Alternatives considered:

- Modify `getStepExecutionConfig` to return source data: rejected because that widens a hot runtime API used by adapters.
- Reconstruct attribution from the merged config only: rejected because the merged config has already lost the user/project layer information.

### D3. Source attribution is path-based and field-specific

The trace API SHALL attribute a winning config value to `project` when the project local overlay explicitly defines the winning candidate path. Otherwise it SHALL attribute that config value to `user` when the user global config defines the path. Step definition and SDK fallbacks SHALL be attributed as `stepdef` and `sdk`.

Each field is resolved independently. For example, `model` can come from `project:steps.defaults.model` while `maxTurns` comes from `user:steps.design.maxTurns`.

Source metadata shape should include:

- `layer`: `project | user | stepdef | sdk`
- `level`: one of `step.byRequestType`, `step`, `defaults.byRequestType`, `defaults`, `stepdef`, `sdk`
- `path`: the concrete config path when applicable, such as `steps.design.byRequestType.bug-fix.model`
- `value`: the effective value

Rationale: The observed failure is only diagnosable if source includes both dimensions: user vs project and resolution level. Field-specific attribution is necessary because different fields may win from different levels.

Alternatives considered:

- Show only the winning path: rejected because it does not answer whether the value came from global or project config.
- Show only user/project: rejected because it does not explain why a step-level value beat defaults.

### D4. Use the canonical agent step list and existing step definitions

The command SHALL display standard agent-backed steps in `AGENT_STEP_NAMES` order. It should derive hardcoded defaults from the same step definitions used by the pipeline rather than duplicating model constants in the command.

CLI-only steps (`verification`, `pr-create`) are excluded from the initial display because `model`, `maxTurns`, and `timeoutMs` apply to agent execution config. If a future CLI step gains these settings, that should be handled as a separate design.

Rationale: The feature is about agent runtime settings and should not show misleading `n/a` rows for deterministic CLI steps.

Alternatives considered:

- Include all pipeline steps: rejected because deterministic CLI steps do not have meaningful model resolution.
- Hardcode the list in the new command: rejected because `AGENT_STEP_NAMES` is already the canonical source.

### D5. Provide human table output and JSON output

Human output should be a compact table with one row per step and columns for the three fields. Each cell should include value and source, for example:

```text
step          model                                      maxTurns             timeoutMs
design        claude-sonnet-4-6 (user:L1 steps.design.byRequestType.bug-fix.model)  30 (stepdef)       null (sdk)
implementer   gpt-5.5 (project:L4 steps.defaults.model)                         30 (stepdef)       null (sdk)
```

JSON output should be available through `--json` for stable tests and future tooling. It should include the request type, config paths loaded, and an array of step records with per-field value/source objects.

Rationale: Human output is needed for interactive diagnosis; JSON keeps tests from depending on spacing and enables downstream automation.

Alternatives considered:

- Human output only: rejected because source-rich table formatting is brittle to test.
- JSON output only: rejected because the original incident needs an ergonomic CLI inspection command.

## Risks / Trade-offs

[Risk] Duplicating the resolution walk in the trace API could drift from `getStepExecutionConfig`.
Mitigation: Share small candidate-building helpers where practical and add tests asserting traced effective values equal `getStepExecutionConfig` for representative cases.

[Risk] Loading user and project configs separately may accidentally validate a partial project overlay as a full config.
Mitigation: Add a provenance loader that mirrors `loadConfig` internals: validate user global as full config, parse/migrate project local as partial overlay, deep merge, validate merged output, and keep the raw overlay only for source attribution.

[Risk] Table output may become too wide with long model names and paths.
Mitigation: Keep JSON complete and allow human cells to use concise labels (`user:L1`, `project:L4`, `stepdef:L5`, `sdk:L6`) while preserving the path.

[Risk] Unknown request-type strings could hide typos.
Mitigation: Reuse the known request type set for CLI validation if it is exported; otherwise fail on empty strings and document the accepted known values in usage. Do not change schema behavior.

## Open Questions

- Should `config effective` eventually include custom reviewer steps? This design excludes them because reviewer definitions are dynamic and not part of the canonical pipeline step list.
- Should a later command expose raw merged config? That is useful but separate from source-aware effective step resolution.
