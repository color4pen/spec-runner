# Spec: doctor-reads-project-config

## Requirements

### Requirement: doctor SHALL run all checks against project-local overlay config

`specrunner doctor` SHALL resolve the project-local `.specrunner/config.json` overlay
and merge it with the user-global config before passing the resolved config to any check.
This MUST use the existing `loadConfigWithOverlay()` helper (same as run-family commands)
so that overlay semantics are maintained from a single source of truth.

When git repository root cannot be resolved (the command is run outside a git repo),
doctor MUST fall back to user-global config only — same behavior as before this change.

When no config file exists at all, doctor MUST continue to propagate `configLoadError`
so that the `config-file-exists` check can distinguish ENOENT from malformed JSON.

#### Scenario: project-local designLayer.enabled overlays user-global config

**Given** a git repository whose `.specrunner/config.json` contains `{"designLayer": {"enabled": true}}`
**And** the user-global config does not set `designLayer.enabled`
**When** `specrunner doctor` is executed inside that repository
**Then** `ctx.config.get("designLayer.enabled")` returns `true` for all checks

#### Scenario: project-local runtime key overlays user-global config

**Given** a git repository whose `.specrunner/config.json` contains `{"runtime": "managed"}`
**And** the user-global config sets `"runtime": "local"`
**When** `specrunner doctor` is executed inside that repository
**Then** the `runtime` variable resolved in `doctor.ts` equals `"managed"`

#### Scenario: outside a git repo — falls back to user-global only

**Given** the current working directory is not inside any git repository
**When** `specrunner doctor` is executed
**Then** only the user-global config is used (project-local overlay is not applied)
**And** the command completes without error caused by the missing git root

#### Scenario: no config file — configLoadError propagates

**Given** neither user-global nor project-local config files exist
**When** `specrunner doctor` is executed
**Then** `configLoadError` is set and passed to `buildDoctorConfig`
**And** the `config-file-exists` check returns `status: "fail"` with an appropriate message

---

### Requirement: aozu-cli check SHALL verify binary existence when designLayer.enabled is true in project-local config

When `designLayer.enabled` is `true` in the resolved config (including project-local overlay),
the `aozu-cli` check MUST NOT return the "disabled" pass early-exit.
Instead it MUST execute `<command> --version` to verify the binary is present.
If the binary is not found or exits non-zero, the check MUST return `status: "fail"`.
If the binary is found and exits zero, the check MUST return `status: "pass"`.

#### Scenario: project-local enables designLayer — aozu binary absent → fail

**Given** a git repository whose `.specrunner/config.json` sets `designLayer.enabled: true`
**And** the `aozu` binary is not present in PATH (execFile throws)
**When** the `aozu-cli` check runs with the resolved (overlaid) DoctorContext
**Then** the check returns `status: "fail"` with a message indicating aozu is not installed

#### Scenario: project-local enables designLayer — aozu binary present → pass

**Given** a git repository whose `.specrunner/config.json` sets `designLayer.enabled: true`
**And** the `aozu` binary is present in PATH (execFile resolves successfully)
**When** the `aozu-cli` check runs with the resolved (overlaid) DoctorContext
**Then** the check returns `status: "pass"` with a message confirming aozu is available

#### Scenario: designLayer disabled (default) — aozu check passes without binary check

**Given** neither user-global nor project-local config sets `designLayer.enabled: true`
**When** the `aozu-cli` check runs
**Then** the check returns `status: "pass"` with message indicating design layer is disabled
**And** `execFile` is NOT called
