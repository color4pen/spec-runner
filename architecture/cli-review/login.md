# `login` review

Status: **reviewed after auth/setup merge #1001**  
Verdict: **KEEP**, GitHub authentication only. The auth surface is now substantially correct; one setup-boundary side effect remains.

Post-change baseline: `main@bb435a1c1c8dced532c6a699726cf08388098128` (`auth-setup-ux`, #1001).

## User goal

Make SpecRunner able to authenticate to GitHub when no higher-priority GitHub credential source is already usable.

`login` is a reasonable top-level convenience because GitHub is the product's collaboration/PR backend rather than an interchangeable agent provider. It must not become a generic provider credential router.

## Current contract after #1001

```text
specrunner login [--force]
```

Public meaning is now GitHub Device Flow only.

Before starting Device Flow, non-force login resolves the same effective source used by runtime:

```text
GH_TOKEN
→ GITHUB_TOKEN
→ gh auth token
→ credentials.json
```

It then validates the effective token:

- valid -> report source and exit 0 without Device Flow;
- invalid `credentials.json` -> run Device Flow and replace the stored credential;
- invalid higher-priority env / `gh` source -> fail and tell the user to repair that source instead of writing an ineffective lower-priority token;
- unknown/network failure -> fail-safe without overwriting an unverified existing token;
- no token -> first-time Device Flow.

`--force` is explicitly defined by the auth ADR as an unconditional Device Flow escape hatch. The command reports that it stored a SpecRunner credential; it does not claim that this credential became the runtime-effective source while a higher-priority source exists.

## What #1001 resolved

### 1. `login` is GitHub-only

The mixed provider mux is gone from the public surface.

```text
specrunner login
```

is GitHub authentication only.

Headless credentials moved to:

```text
specrunner credentials set claude-code
specrunner credentials set anthropic-api-key
```

This matches the responsibility boundary from the original review.

### 2. Runtime credential precedence and login validation are aligned

The previous false-success shape is fixed. `login` resolves the same highest-priority source as runtime and validates that source before deciding whether Device Flow is useful.

In particular:

```text
GH_TOKEN = expired
credentials.json = valid
```

no longer causes `login` to skip because a lower-priority valid token happens to exist. The effective expired source wins the diagnosis, which is the correct invariant.

### 3. Deprecated `--provider` has a real compatibility mechanism

The registry keeps `provider` only as deprecated parser metadata, not as a normal active flag. `FlagDef.deprecated` throws a migration-specific `FlagParseError` before dispatch.

The public help omits the old flag, while old syntax can still explain the successor:

```text
login --provider claude
-> credentials set claude-code
```

This is the right shape and is reusable for future CLI removals.

### 4. Secret storage has left login

Claude Code token and Anthropic API key storage now use the dedicated `credentials set` command with hidden TTY input / stdin support. The old echoing `readline.question` path is gone from login.

### 5. Setup guidance is doctor-first

`init` now points to `doctor`, and README Quick Start no longer requires unconditional login. Existing `gh auth login` or env credentials can satisfy GitHub auth without running SpecRunner login.

This resolves the discoverability problem from the initial review.

## Remaining finding

### `login` still bootstraps user-global config after Device Flow

After successful Device Flow, the command still checks `~/.config/specrunner/config.json` and creates:

```json
{
  "version": 1,
  "agents": {}
}
```

when it is absent.

That behavior was not required to change by `auth-setup-ux`, so #1001 can be conformant while this CLI-review concern remains.

The responsibility boundary is still awkward:

```text
init
  owns config scaffold

login
  should own GitHub authentication state
```

With the now-established flow:

```text
init -> doctor -> missing setup only -> doctor
```

there is even less reason for `login` to create unrelated config state. A user intentionally invoking login before init should not accidentally receive a partial config scaffold from an authentication verb.

**Direction:** remove `saveConfig` / config-file creation from `login`. It may read config best-effort to resolve GitHub host, but should not write config. Missing config belongs to `doctor -> specrunner init`.

This is a CLI ownership cleanup, not a blocker for the merged auth/setup request.

## Desired user-facing shape

Normal setup:

```text
specrunner init
specrunner doctor
# if GitHub auth is already valid, no login
```

When GitHub auth is genuinely missing:

```text
specrunner login
```

Headless credential storage:

```text
claude setup-token
specrunner credentials set claude-code

specrunner credentials set anthropic-api-key
# or SPECRUNNER_API_KEY
```

## Final verdict

- Top-level placement: **KEEP**
- Name: **KEEP**
- Meaning: **GitHub authentication only**
- Effective-source resolution + validation: **RESOLVED by #1001**
- `--provider`: **REMOVED from public surface; migration-only deprecated metadata is correct**
- Claude/API-key storage: **MOVED to `credentials set`**
- `--force`: **accepted as explicitly documented unconditional Device Flow escape hatch**
- Setup discoverability: **doctor-first, resolved**
- Config scaffold side effect: **REMOVE in a later CLI cleanup**
