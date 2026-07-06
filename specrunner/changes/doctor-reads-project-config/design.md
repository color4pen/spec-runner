# Design: doctor-reads-project-config

## Context

`specrunner doctor` assembles a `DoctorContext` and runs a suite of checks to validate
the local environment. All checks reference `ctx.config` — a `DoctorConfig` wrapper built
from a `SpecRunnerConfig` that is loaded once at the top of `runDoctor()`.

The load call at `src/cli/doctor.ts:99` is:

```ts
rawConfig = await loadConfig();   // ← no repoRoot argument
```

`loadConfig(repoRoot?)` in `src/config/store.ts:94` only reads the project-local
`.specrunner/config.json` when `repoRoot` is supplied. Without it, doctor resolves
only the user-global config — project-local overlays are silently ignored.

The run-family commands already use a higher-level helper
`loadConfigWithOverlay(cwd?)` (`src/cli/load-config-with-overlay.ts`) which calls
`resolveRepoRoot(cwd)` and passes the result to `loadConfig(repoRoot)`. When the cwd
is outside a git repo, `resolveRepoRoot` returns `null` and the helper gracefully
falls back to user-global only.

The same single-line substitution in `doctor.ts` brings doctor in line with the
run-family config resolution without duplicating any logic.

## Goals / Non-Goals

**Goals**:

- Doctor reads project-local `.specrunner/config.json` overlay when run inside a git repo.
- All checks (designLayer, runtime, github, verification) receive the merged config automatically.
- `aozu-cli` check correctly fails when `designLayer.enabled: true` (project-local) and aozu is absent.
- Behavior outside git repos is unchanged (user-global only, no error).
- `configLoadError` propagation and the `config-file-exists` check semantics are preserved.

**Non-Goals**:

- Changing config schema, deep-merge rules, or overlay semantics.
- Fixing any other `loadConfig()` call-sites outside doctor.
- Adding new doctor checks or modifying existing check logic (aozu-cli behavior is already correct — the bug is that it never sees `designLayer.enabled: true`).
- Redesigning the malformed-project-local-config degradation path (current behavior maintained).

## Decisions

### D1: Replace `loadConfig()` with `loadConfigWithOverlay()` in doctor.ts

**Decision**: At `src/cli/doctor.ts:99`, replace:
```ts
rawConfig = await loadConfig();
```
with:
```ts
rawConfig = await loadConfigWithOverlay();
```
and add the corresponding import.

**Rationale**: `loadConfigWithOverlay()` encapsulates repo-root resolution and overlay
semantics in a single, already-tested helper used by the run family. Reusing it keeps
overlay logic in one place and avoids drift. Any future change to overlay behavior
(e.g., new config paths) automatically applies to doctor.

**Alternatives considered**:

- *Call `resolveRepoRoot` directly in doctor.ts then `loadConfig(repoRoot)`*: Equivalent
  logic but duplicates the resolution code. Two call-sites to maintain instead of one.
  Rejected.
- *Fix each affected check individually (e.g., re-read config inside `aozu-cli.ts`)*:
  Treats the symptom (designLayer only) while leaving the same hole open for runtime,
  github, verification overlays. Rejected.

### D2: Error-handling contract — best-effort unchanged

**Decision**: The `try/catch` around the config load call in `runDoctor()` is preserved.
`loadConfigWithOverlay` throws the same error types as `loadConfig` (SpecRunnerError
with `CONFIG_MISSING` or `CONFIG_INVALID`), so the existing catch block and
`configLoadError` propagation require no changes.

**Rationale**: The `config-file-exists` check relies on `ctx.config.loadError` being set
when the config file exists but is malformed (vs. ENOENT where `loaded: false`). This
contract is unchanged by the substitution.

### D3: Test placement — unit tests for aozu-cli check + integration-style test for doctor config loading

**Decision**: New tests live in two locations:
1. `src/core/doctor/checks/runtime/__tests__/aozu-cli.test.ts` — unit tests for
   `aozuCliCheck` covering project-local-enabled path (fail/pass) and disabled path.
2. `src/cli/__tests__/doctor-config-overlay.test.ts` — tests that exercise `runDoctor()`
   (or a sub-component) with a mocked `loadConfigWithOverlay` to verify that:
   - project-local runtime overlay reaches `ctx.config`
   - outside-git-repo case still works (user-global only)
   - `configLoadError` propagates

**Rationale**: The aozu-cli check is a pure function of `ctx.config` — testing it in
isolation with a fabricated `DoctorContext` is straightforward and fast. The overlay
wiring (that doctor actually calls `loadConfigWithOverlay`) is best verified at the
`runDoctor()` boundary rather than inside any individual check.

## Risks / Trade-offs

[Risk] `loadConfigWithOverlay` invokes git to resolve the repo root. If git is not
available in the environment, `resolveRepoRoot` may throw.
→ Mitigation: `resolveRepoRoot` already returns `null` on non-git directories and
swallows non-fatal errors. The existing best-effort catch in `runDoctor` covers any
residual throws. No additional handling needed.

[Risk] A malformed project-local config causes `loadConfigWithOverlay` to throw with
`CONFIG_INVALID`, which the existing `catch` block in `runDoctor` will capture as
`configLoadError`. This means doctor degrades gracefully — same as for a malformed
user-global config — rather than crashing.
→ This is acceptable and aligns with the existing design. No change needed.

## Open Questions

None. The design is fully resolved per architect evaluation in request.md.
