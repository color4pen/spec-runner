# `login` review

Status: **reviewed**  
Verdict: **KEEP**, narrowed to GitHub authentication only.

Baseline implementation:

- `src/cli/login.ts`
- `src/cli/command-registry.ts` (`COMMANDS.login`)
- `src/core/credentials/github.ts`
- `tests/unit/cli/login.test.ts`
- `src/cli/__tests__/login.test.ts`

## User goal

Make SpecRunner able to authenticate to GitHub when no higher-priority GitHub credential source is already usable.

`login` is a reasonable top-level convenience because GitHub is the product's collaboration/PR backend rather than an interchangeable agent provider. It should not become a generic provider credential router.

## Current contract

```text
specrunner login [--provider github|claude] [--force]
```

The default GitHub path:

1. warns when `GH_TOKEN` / `GITHUB_TOKEN` exists;
2. skips only when `credentials.json` already contains a GitHub token;
3. otherwise runs SpecRunner's GitHub Device Flow;
4. creates a minimal user-global config if it does not exist;
5. saves the GitHub token to `credentials.json`.

The Claude path is not an interactive Claude login. It tells the user to run `claude setup-token`, reads the resulting token, and stores it in `credentials.json`.

Runtime GitHub token resolution is a different chain:

```text
GH_TOKEN
→ GITHUB_TOKEN
→ gh auth token
→ credentials.json
```

For GHES the analogous enterprise env vars and `gh auth token --hostname` are used before `credentials.json`.

## What is good

- Bare `specrunner login` already has a clear historical meaning: GitHub Device Flow.
- Device Flow provides a useful fallback for users who do not already authenticate through `gh` or environment variables.
- Credentials are stored separately from config and written through the 0600 credential store.
- GitHub host is read from config best-effort, allowing GHES-aware Device Flow.
- `--force` provides an explicit overwrite escape hatch for SpecRunner-owned stored credentials.

## Findings

### 1. `--provider` combines two different verbs

```text
GitHub Device Flow = authenticate
Claude setup-token copy = store a headless credential
```

These are not two providers of the same operation.

The Claude branch exists specifically to bridge headless/cron environments where the upstream Claude Code credential store is unavailable. It belongs under explicit credential storage, for example:

```text
specrunner credentials set claude-code
```

**Direction:** remove active `--provider` from `login`; bare `login` means GitHub only. Preserve old `login --provider claude` only as a hidden/deprecated migration surface that points to the replacement command.

### 2. `login` does not use the real GitHub resolution chain

The command currently checks env vars only for warnings and checks `credentials.json` only for skip behavior. It does not consult `gh auth token` before starting Device Flow.

This means a user already authenticated through `gh auth login` can be asked to authenticate again even though normal SpecRunner execution would already work.

**Direction:** before Device Flow, resolve the same effective source used at runtime and verify it. If it is valid, print the source and exit 0.

### 3. A higher-priority invalid credential cannot be repaired by writing a lower-priority credential

Example:

```text
GH_TOKEN = expired
credentials.json = fresh token created by Device Flow
```

Normal execution still resolves `GH_TOKEN` first. Therefore "Device Flow succeeded" can still leave the product unusable.

The same issue applies to `GITHUB_TOKEN` and `gh auth token` when they are the effective source.

**Direction:** if the effective higher-priority source is invalid, do not claim success by writing `credentials.json`. Tell the user to repair/remove that source. Device Flow is a meaningful repair only when SpecRunner-owned credentials are absent/invalid or no higher-priority source shadows them.

### 4. `--force` needs source-aware semantics

Today `--force` means "run Device Flow even if SpecRunner already has a stored token". With the runtime resolution chain considered, blindly forcing Device Flow while `GH_TOKEN` or `gh auth token` is active just creates an ignored lower-priority token.

**Direction:** define `--force` as bypassing/replacing the SpecRunner-owned GitHub credential, not as bypassing reality. A higher-priority active source must still be reported; if it shadows the stored credential, the command should make that explicit rather than imply the new credential became effective.

Whether `--force` should refuse while a higher-priority source is active or allow storage with a clear "not effective until X is removed" warning can be finalized in the auth/setup UX design. It must not silently report a misleading effective login.

### 5. `login` also creates user-global config

After successful Device Flow, `login` creates a minimal global config when none exists. Tests explicitly pin both branches (`config exists` and `config missing`).

This is unrelated to authentication and duplicates setup ownership with `init`.

With the desired setup flow:

```text
init → doctor → only missing setup → doctor
```

there is no good reason for `login` to bootstrap config as a side effect.

**Direction:** remove config creation from `login`. Authentication should touch authentication state only. If configuration is missing, `doctor` should prescribe `specrunner init`.

### 6. Claude token input is not secret-safe

The current default prompt uses `readline.question()` with stdout, so the pasted token is echoed. This is acceptable only as evidence that the operation should leave `login`; the replacement credential-storage command must use secret input semantics (TTY hidden input, non-TTY stdin path as specified by the auth/setup UX request).

### 7. Migration compatibility is not representable cleanly in the current command registry

If `provider` is removed from `COMMANDS.login.flags`, the generic parser rejects `login --provider claude` before the handler can emit a migration-specific error.

A future command spec needs a distinction such as:

```text
active flag
hidden/deprecated migration flag
```

or an equivalent legacy argv interception mechanism. Deprecated syntax must not appear as recommended help surface.

### 8. Login behavior is pinned in two test suites

Both `tests/unit/cli/login.test.ts` and `src/cli/__tests__/login.test.ts` contain Claude-provider login contracts. When the command is split, both suites must be migrated or consolidated; otherwise old behavior can survive as test-shaped sediment.

This is implementation cleanup rather than a CLI design decision, but it matters for safely removing the mixed surface.

## Desired user-facing shape

Normal setup:

```text
specrunner init
specrunner doctor
# doctor says GitHub auth is already available → no login needed
```

When GitHub auth is genuinely missing:

```text
specrunner login
# GitHub Device Flow
```

Headless agent credentials:

```text
claude setup-token
specrunner credentials set claude-code
```

Managed runtime credential:

```text
specrunner credentials set anthropic-api-key
# or SPECRUNNER_API_KEY
```

These credential-storage commands are advanced/headless setup surface and should be discoverable through `doctor` / `guide`; normal attended users should not need to memorize them.

## Final verdict

- Top-level placement: **KEEP**
- Name: **KEEP**
- Meaning: **GitHub authentication only**
- `--provider`: **REMOVE from active surface; retain migration guidance for old Claude syntax**
- Claude token storage: **MOVE to `credentials set claude-code`**
- Managed API key storage: **do not add to login; use credential storage/env**
- Existing runtime auth sources: **resolve + validate before Device Flow**
- Config scaffold side effect: **REMOVE**
- `--force`: **retain, but make source-aware and non-misleading**
- Setup discoverability: **doctor-first; login is conditional, not mandatory**
