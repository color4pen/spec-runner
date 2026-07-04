# Configuration Reference

- [Config layers](#config-layers)
- [Environment variables](#environment-variables)
- [Steps](#steps--per-step-model-and-execution-config)
- [Models](#models--custom-model-registry)
- [Workspace setup](#workspace-setup)
- [Verification](#verification)
- [Test placement](#test-placement)
- [Inbox](#inbox)
- [Archive](#archive)
- [Pipeline](#pipeline)
- [Logs](#logs)
- [Progress display](#progress-display)
- [GitHub Enterprise (GHES)](#github-enterprise-ghes)
- [Transient error retries](#transient-error-retries)

## Config layers

SpecRunner uses a two-layer config system. Project local is deep-merged on top of user global — only specify the fields you want to change.

| Layer | Path | Created by |
|---|---|---|
| User global | `~/.config/specrunner/config.json` (XDG_CONFIG_HOME) | `specrunner init` |
| Project local | `<repo>/.specrunner/config.json` | Hand-created |

`specrunner init` configures `.gitignore` with `.specrunner/*` + `!.specrunner/config.json`, so the project config can be committed and shared while machine-generated state (`jobs/`, `logs/`, etc.) stays ignored.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SPECRUNNER_API_KEY` | Managed runtime only | Anthropic API key. Not needed for local runtime. |
| `GH_TOKEN` | See Authentication | GitHub token (highest priority). For automation contexts (cron, CI). |
| `GITHUB_TOKEN` | See Authentication | GitHub token (second priority). Injected by GitHub Actions. |

## Steps — per-step model and execution config

Each step can be configured with `model`, `maxTurns`, and `timeoutMs`. A `byRequestType` object selects a different config based on the request type.

```jsonc
{
  "steps": {
    "defaults": {
      "model": "claude-sonnet-4-6",
      "maxTurns": null,
      "timeoutMs": null
    },
    "design": {
      "model": "claude-opus-4-6[1m]",
      "byRequestType": {
        "chore": { "model": "claude-sonnet-4-6" },
        "bug-fix": { "model": "claude-sonnet-4-6" }
      }
    },
    "code-review": {
      "model": "claude-sonnet-4-6",
      "byRequestType": {
        "spec-change": { "model": "claude-opus-4-6[1m]" }
      }
    }
  }
}
```

- `maxTurns`: `null` = unlimited (do not pass maxTurns to SDK). Positive integer = limit.
- `timeoutMs`: `null` = no timeout. Positive integer = milliseconds.
- `byRequestType` keys are request type names (`bug-fix`, `spec-change`, `new-feature`, `refactoring`, `chore`). Nesting is 1-level only.

### Resolution order (first defined wins)

1. `steps.<step>.byRequestType.<requestType>.<field>`
2. `steps.<step>.<field>`
3. `steps.defaults.byRequestType.<requestType>.<field>`
4. `steps.defaults.<field>`
5. Step hardcoded default
6. SDK default

> Under the **managed** runtime, `model` / `byRequestType.model` are ignored — managed agents use their pre-registered model.

## Models — custom model registry

SpecRunner ships with a built-in model registry. To add new models or override provider assignments:

```jsonc
{
  "models": {
    "claude-opus-4-6[1m]": { "provider": "anthropic" },
    "my-custom-model": { "provider": "anthropic" }
  }
}
```

User entries override built-ins. OpenAI models cannot be used with the managed runtime.

## Workspace setup

After `git worktree add`, SpecRunner normally installs dependencies by detecting the package manager from the lockfile. Set `workspace.setup` to replace this with any command list — making worktree setup language-agnostic (symmetric with `verification.commands`).

```jsonc
{
  "workspace": {
    "setup": [
      "uv sync"
    ]
  }
}
```

**Schema**: `(string | { name?: string; run: string })[]`

- `string`: executed as `sh -c "<command>"`
- `{ run: "cmd" }`: object form without label
- `{ name: "label", run: "cmd" }`: object form with label displayed on failure

**Execution model**:
- Each command runs via `sh -c` (POSIX shell — pipes, redirects, variable expansion work)
- Sequential execution in array order, fail-fast (first non-zero exit stops the sequence)
- On failure: worktree is cleaned up (`git worktree remove --force` + `rm -rf`) and an error is thrown

**Default behaviour when `workspace.setup` is absent**:
- If any lockfile (`pnpm-lock.yaml`, `bun.lockb`, `bun.lock`, `yarn.lock`, `package-lock.json`) or `package.json` exists in the repository root → detect package manager and run install (existing behaviour for JS/TS projects)
- If no lockfile and no `package.json` → skip install (non-JS / greenfield projects pass without configuration)

**Empty array `[]`** is valid and means "explicitly skip install" — useful to disable the default install even in a JS project with lockfiles.

**Examples**:

```jsonc
// Python project (uv)
{ "workspace": { "setup": ["uv sync"] } }

// Go project
{ "workspace": { "setup": ["go mod download"] } }

// Rust project
{ "workspace": { "setup": ["cargo fetch"] } }

// Multi-step with label
{
  "workspace": {
    "setup": [
      { "name": "deps", "run": "pip install -r requirements.txt" },
      { "name": "dev-deps", "run": "pip install -r requirements-dev.txt" }
    ]
  }
}

// Explicitly skip install even for a JS project (e.g. deps managed by CI)
{ "workspace": { "setup": [] } }
```

## Verification

By default, the verification step detects and runs `build`, `typecheck`, `test`, and `lint` scripts from `package.json`. **Node.js / Bun projects are the primary supported target** for this default mode.

For other languages, set `verification.commands`:

```jsonc
{
  "verification": {
    "commands": ["ruff check", { "name": "type", "run": "mypy" }, "pytest -v"]
  }
}
```

Commands are executed in order via `sh -c`. First non-zero exit code stops the sequence (fail-fast). Each entry can be a plain string or an object with `run` (required) and `name` (optional label).

## Test placement

By default, the implementer follows the existing test placement pattern in the project. Set `tests.placement` to declare the convention explicitly:

### Sibling (test next to source)

```jsonc
{
  "tests": {
    "placement": {
      "style": "sibling"
      // optional: "suffix": ".spec.ts"   (default: ".test.ts")
    }
  }
}
```

`src/foo/bar.ts` → `src/foo/bar.test.ts`

### Mirror (tests/ tree mirrors src/)

```jsonc
{
  "tests": {
    "placement": {
      "style": "mirror",
      "testsRoot": "tests",
      "sourceRoot": "src"
      // optional: "suffix": ".spec.ts"   (default: ".test.ts")
    }
  }
}
```

`src/foo/bar.ts` → `tests/foo/bar.test.ts`

When `sourceRoot` is omitted, the full source path is preserved under `testsRoot/` (e.g. `src/foo/bar.ts` → `tests/src/foo/bar.test.ts`).

## Inbox

```jsonc
{
  "inbox": {
    "approveLabel": "specrunner-approved",
    "maxStartsPerRun": 3
  }
}
```

| Key | Default | Description |
|---|---|---|
| `inbox.approveLabel` | `"specrunner-approved"` | GitHub label that marks an issue as ready to start |
| `inbox.maxStartsPerRun` | `3` | Max new jobs per `inbox run`. `0` = resume-only mode |

## Archive

```jsonc
{
  "archive": {
    "mergeWaitTimeoutMs": 600000,
    "mergeWaitPollIntervalMs": 15000,
    "protectedPaths": [".github/workflows/**", "release-please-config.json"]
  }
}
```

| Key | Default | Description |
|---|---|---|
| `archive.mergeWaitTimeoutMs` | `600000` (10 min) | Max wait for PR checks to become green. `null` = unlimited. `0` = no wait |
| `archive.mergeWaitPollIntervalMs` | `15000` (15s) | Interval between check-status polls |
| `archive.protectedPaths` | `[]` | Glob patterns for files that must not be auto-merged. Matching PRs escalate instead |

## Pipeline

```jsonc
{
  "pipeline": {
    "maxRetries": 2
  }
}
```

| Key | Default | Description |
|---|---|---|
| `pipeline.maxRetries` | `2` | Max spec-review → spec-fixer loop iterations (does not affect code-review or verification loops). Range: 1-10 |

## Logs

```jsonc
{
  "logs": {
    "maxJobs": 20
  }
}
```

| Key | Default | Description |
|---|---|---|
| `logs.maxJobs` | `20` | Max job log entries retained in `.specrunner/logs/`. Range: 1-1000 |

## Progress display

```jsonc
{
  "progress": {
    "heartbeatIntervalSec": 30
  }
}
```

| Key | Default | Description |
|---|---|---|
| `progress.heartbeatIntervalSec` | `30` (TTY) / `60` (non-TTY) | Heartbeat interval in seconds. `0` or `null` disables |

## GitHub Enterprise (GHES)

```jsonc
{
  "github": {
    "host": "ghes.corp.example.com",
    "apiBaseUrl": "https://ghes.corp.example.com/api/v3"
  }
}
```

When absent, defaults to `github.com` / `api.github.com`. `apiBaseUrl` is derived from `host` when not explicitly set.

## Transient error retries

```jsonc
{
  "transientRetry": {
    "maxRetries": 3,
    "baseDelayMs": 1000
  }
}
```

| Key | Default | Description |
|---|---|---|
| `transientRetry.maxRetries` | `3` | Max automatic retries on transient errors. `0` = disable |
| `transientRetry.baseDelayMs` | `1000` | Base delay for first retry (doubles on each subsequent retry) |

Applied to local runtime runners only; ignored by managed runtime.
