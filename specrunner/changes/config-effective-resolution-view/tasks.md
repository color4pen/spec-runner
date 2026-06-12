# Tasks: Effective Step Config Resolution View

## T-01: Add source-aware config loading support

- [ ] Add a config-layer helper that loads user global config and project local overlay separately while mirroring `loadConfig` behavior.
- [ ] Preserve the validated merged config for actual value resolution.
- [ ] Preserve enough raw or migrated project overlay data to determine whether a winning path was explicitly supplied by project local config.
- [ ] Return config path metadata for user global and project local paths so `--json` can report what was considered.
- [ ] Ensure missing user global and missing project local files follow the same success/error behavior as `loadConfig`.

**Acceptance Criteria**:
- The helper does not validate a partial project local overlay as a standalone full config when user global config exists.
- Existing `loadConfig` behavior and callers are unchanged.
- Unit tests cover user-only, project-only, and user-plus-project loading paths.

## T-02: Implement source-aware step resolution tracing

- [ ] Add a read-only trace API beside `getStepExecutionConfig`, returning effective values plus source metadata for `model`, `maxTurns`, and `timeoutMs`.
- [ ] Use the same candidate priority as `getStepExecutionConfig`: step `byRequestType`, step, defaults `byRequestType`, defaults, stepdef, SDK.
- [ ] Treat `null` as a defined value for `maxTurns` and `timeoutMs`; only `undefined` falls through.
- [ ] Attribute config candidates to `project` when the project overlay defines the winning path, otherwise to `user` when user global defines it.
- [ ] Attribute hardcoded model/maxTurns/timeoutMs fallbacks to `stepdef` and nullable SDK fallbacks to `sdk`.
- [ ] Add tests asserting traced effective values match `getStepExecutionConfig` for representative request-type and fallback cases.

**Acceptance Criteria**:
- The observed case is fixed in tests: user global `steps.design.byRequestType.bug-fix.model` wins over project local `steps.defaults.model`, and source is reported as user level `step.byRequestType`.
- Request-type-specific values produce different traces for different `--type` values.
- A config-unset step reports hardcoded model source as `stepdef`.
- SDK fallback for an unset nullable field reports source as `sdk`.

## T-03: Add the `specrunner config effective` CLI command

- [ ] Add a `config` parent command and an `effective` subcommand to the command registry.
- [ ] Support `--type <requestType>` and `--json` flags.
- [ ] When `--type` is omitted, resolve without request type and label the output as `requestType: none`.
- [ ] Use `AGENT_STEP_NAMES` order and the existing step definitions to obtain hardcoded step defaults.
- [ ] Exclude deterministic CLI-only steps (`verification`, `pr-create`) from this command.
- [ ] Return a non-zero exit code on invalid flags or config load errors, matching existing CLI error handling style.

**Acceptance Criteria**:
- `specrunner config effective --type bug-fix` prints all standard agent steps with `model`, `maxTurns`, and `timeoutMs`.
- `specrunner config effective --type bug-fix --json` prints valid JSON with request type and per-field source records.
- `specrunner config effective` skips `byRequestType` levels and explicitly reports `requestType: none`.

## T-04: Format human and JSON output

- [ ] Add a small formatter for human-readable output that includes value and concise source labels for each field.
- [ ] Add a JSON formatter with stable object keys suitable for tests.
- [ ] Include concrete config paths for config-derived sources, such as `steps.design.byRequestType.bug-fix.model`.
- [ ] Keep complete source metadata in JSON even if human output abbreviates labels.

**Acceptance Criteria**:
- Human output is readable in a typical terminal and includes enough source information to diagnose global step settings beating project defaults.
- JSON output includes `layer`, `level`, and `path` for config-derived sources.
- Formatter tests do not depend on fragile table spacing beyond essential labels and values.

## T-05: Add regression and CLI tests

- [ ] Add unit tests for the trace resolver covering project defaults, global per-step request type override, request type changes, stepdef fallback, SDK fallback, and `null` stop-fallback behavior.
- [ ] Add CLI-level tests for `config effective --json` using isolated temp config paths and project roots.
- [ ] Add at least one human-output smoke test checking that the command prints step names, values, and source labels.
- [ ] Keep existing config schema and merge tests unchanged except for any exported constants needed by the new command.

**Acceptance Criteria**:
- The acceptance criteria from the request are covered by automated tests.
- No tests require real home-directory config files.
- `bun run typecheck && bun run test` passes.

## T-06: Update command help and documentation touchpoints

- [ ] Add `config effective` to top-level CLI usage text.
- [ ] Add concise subcommand usage text showing `--type` and `--json`.
- [ ] Document that managed runtime ignores configured `model` for execution but the command still shows the configured effective value.

**Acceptance Criteria**:
- `specrunner --help` lists the new config command.
- Invalid `specrunner config effective` usage reports actionable help.
- Documentation changes are limited to command/help text needed for this feature.
