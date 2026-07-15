# SpecRunner

[![npm version](https://img.shields.io/npm/v/@color4pen/specrunner)](https://www.npmjs.com/package/@color4pen/specrunner)

**request.md in, pull request out** — a self-hosted AI CI/CD runner powered by Anthropic Claude.

Full documentation: [`docs/`](docs/README.md).

## Quick Start

```bash
npm install -D @color4pen/specrunner
npx specrunner init
npx specrunner login

# Create a request, edit it, run the pipeline
npx specrunner request new my-feature
#  → specrunner/drafts/my-feature/request.md
npx specrunner run my-feature

# Review the PR, then archive
npx specrunner job archive --with-merge my-feature
```

When a job escalates (ambiguous request, unresolvable findings, unfixable build), its state is preserved — resume it directly:

```bash
specrunner job resume my-feature
```

Running SpecRunner on a schedule against approved GitHub issues is an operational option — see [Automation with GitHub Issues](#automation-with-github-issues) below and the [operations runbook](docs/operations.md).

## How the Pipeline Works

1. **request-review** — validates the request; escalates if unclear or rejected
2. **design** — creates branch, generates spec files
3. **spec-review** / **spec-fixer** — reviews the spec; loops until approved
4. **test-case-gen** — generates test case definitions
5. **implementer** — writes the implementation
6. **verification** / **build-fixer** — runs build/typecheck/test/lint; loops until passed
7. **code-review** / **code-fixer** — reviews the code; loops until approved
8. **conformance** — checks architecture conformance; returns to implementer if needed
9. **adr-gen** — generates an ADR when `request.adr` is `true`
10. **pr-create** — opens the GitHub PR

Each judge step returns `approved` or `needs-fix`. Verdicts are derived by the CLI from agent findings — agents never judge their own work. When iteration budgets are exhausted, the job escalates for human input.

## Installation

```bash
# As a dev dependency (recommended)
npm install -D @color4pen/specrunner

# Or globally
npm install -g @color4pen/specrunner
```

Provider SDKs (`@anthropic-ai/claude-agent-sdk` for local runtime, `@openai/codex-sdk` for Codex) ship as optional dependencies and install by default. Their prebuilt platform binaries dominate install size — roughly **200 MB each (~400 MB combined)** (measured on macOS arm64: claude-agent-sdk ≈216 MB, codex-sdk ≈188 MB; sizes vary by OS/arch and SDK version). Most users need only one runtime. To cut install size by ~200 MB, install with `--omit=optional` and add only the SDK you use:

```bash
npm install -D --omit=optional @color4pen/specrunner
npm install -D @anthropic-ai/claude-agent-sdk   # Claude (local runtime, default)
# or
npm install -D @openai/codex-sdk                # Codex
```

## Configuration

Two layers, deep-merged (project overrides global):

| Layer | Path | Created by |
|---|---|---|
| User global | `~/.config/specrunner/config.json` | `specrunner init` |
| Project local | `<repo>/.specrunner/config.json` | Hand-created (partial overlay) |

```jsonc
// .specrunner/config.json — project local example
{
  "version": 1,
  "steps": {
    "defaults": { "model": "claude-sonnet-4-6" },
    "design": {
      "byRequestType": {
        "spec-change": { "model": "claude-opus-4-6[1m]" },
        "new-feature": { "model": "claude-opus-4-6[1m]" }
      }
    }
  }
}
```

For the full configuration reference (environment variables, verification commands, test placement, inbox settings, archive settings, log retention, GitHub Enterprise host), see [docs/configuration.md](docs/configuration.md).

## Extending the Review Chain

- **Rules** (`specrunner/rules/<step>/*.md`) — extra discipline injected into a step's prompt. No extra session.
- **Custom reviewers** (`specrunner/reviewers/<name>.md`) — independent review lens with its own convergence loop, budget, and model override. Declared as data (purpose / criteria / judgment sections in markdown), validated at job start, and run as a **parallel fan-out** after `code-review` — member reviewers execute concurrently, with only their commit/push serialized (FIFO mutex). Scoped with `paths` globs and `requestTypes`.
- **Regression gate** — runs automatically when custom reviewers are present. Re-checks every fixed finding against the final code.

Scaffold a definition: `specrunner reviewers new <name>`.

The extensible surface is the review chain. The pipeline shape is code, not configuration.

## Automation with GitHub Issues

For unattended operation, SpecRunner can poll GitHub issues instead of running from drafts.

`specrunner inbox run` polls for issues with the approval label (default: `specrunner-approved`) and:

- **Starts** new jobs from issues whose body is a valid `request.md`
- **Resumes** jobs when a `/resume` comment is posted after escalation
- **Rejects** issues that fail validation (posts a comment with the error)

Basic flow: create a GitHub issue whose body follows the `request.md` format → apply the approval label → the next `inbox run` picks it up.

Schedule it with cron, launchd, or GitHub Actions to run the pipeline without touching the CLI. See [docs/operations.md](docs/operations.md) for the full unattended-loop runbook (authentication layers, crontab setup, scheduling examples, failure resilience).

## Authentication

Token resolution order: `GH_TOKEN` env > `GITHUB_TOKEN` env > `gh auth token` > `credentials.json`.

| Context | Setup |
|---|---|
| Interactive | `specrunner login` (device flow) |
| GitHub Actions | `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` (injected automatically) |
| Self-hosted / cron | Fine-grained PAT via `GH_TOKEN` env var (expires after at most 1 year; must be rotated) |

Automation contexts (cron, CI, always-on schedulers) cannot run device flow and typically cannot reach the interactive keychain. Use the `GH_TOKEN` env var for these contexts. See [docs/operations.md](docs/operations.md) for the full authentication setup.

Run `specrunner doctor` to see which source is currently resolved.

## Runtime Modes

**Local (default)** — runs agents locally via the Claude Agent SDK. No API key needed beyond the GitHub token.

**Managed** — runs agents in Anthropic's cloud. Requires `SPECRUNNER_API_KEY`.

```bash
export SPECRUNNER_API_KEY=sk-ant-...
specrunner runtime setup
specrunner run my-feature
```

## Command Reference

### Request commands

```
specrunner request new <slug>              Create request.md from template
specrunner request generate "<text>"       Generate request.md via LLM
specrunner request ls                      List active requests
specrunner request validate <file|slug>    Validate request.md syntax
specrunner request template                Print scaffold template to stdout
```

### Job commands

```
specrunner run <slug|file>                 Start pipeline (alias: job start)
specrunner job ls                          List all jobs
specrunner job show <jobId|slug>           Show job state
specrunner job resume <slug>               Resume a halted job
specrunner job cancel <jobId>              Cancel job and cleanup
specrunner job archive <slug>              Archive and teardown
specrunner job stats [--json]             Run-level statistics (cost, convergence, duration)
```

### Environment commands

```
specrunner init                            Initialize config scaffold
specrunner login                           GitHub Device Flow OAuth
specrunner doctor                          Diagnose environment / config / auth
specrunner runtime setup                   Set up managed runtime
specrunner runtime status                  Show managed runtime status
specrunner runtime reset                   Reset managed runtime config
```

### Inbox & extension commands

```
specrunner inbox run                       Poll approved issues, start / resume jobs
specrunner rules new <step> <slug>         Scaffold a rules file
specrunner reviewers new <name>            Scaffold a custom reviewer definition
```

See [docs/request-authoring.md](docs/request-authoring.md) for how to write effective requests.

## Cost

Actual cost depends on request complexity, fixer iterations, and model selected. Cache reads dominate token volume. Measured figures from this project's own runs are in [docs/cost.md](docs/cost.md).

## Design Principles

- **Verdicts are derived, not self-reported.** Review agents return findings; the CLI derives verdicts, verifies file:line references, and owns all transitions. Agents never judge their own work.
- **State lives in your repository, not in a process.** Job history is branch-borne. Kill the process, reboot — the next run picks up where things stood.
- **Runs anywhere Node runs.** One `npm install` and a crontab line. No daemon, no Docker, no SaaS.

The reasoning behind these choices is in [docs/design-philosophy.md](docs/design-philosophy.md).

## Built by itself

Every feature was implemented, reviewed, and merged by this pipeline running on its own repository.

## Stability

SpecRunner is **0.x**. State and config file formats may receive breaking changes between releases. Migrations are provided in minor releases with upgrade notes in the changelog.

## Assumptions

- **Trust model**: `request.md` is trusted input. Designed for solo use where the author also reviews and merges the PR.
- **Workspace setup**: Worktree dependency install is language-agnostic. When no lockfile or `package.json` is found, install is skipped automatically. For non-JS projects (Python, Go, Rust, etc.) or explicit control, set `workspace.setup` in config (e.g. `["uv sync"]`, `["go mod download"]`). See [docs/configuration.md](docs/configuration.md#workspace-setup).
- **Verification**: Default verification detects Node.js/Bun `package.json` scripts. For other languages, set `verification.commands` in config. See [docs/configuration.md](docs/configuration.md#verification).
- **Commit history trust**: `git log` / `git diff` output is included in agent prompts. Running on repositories with untrusted commit history is not recommended.

## Troubleshooting

### Lint failure in verification pipeline

1. Run `bun run lint --fix` to resolve mechanical issues
2. Review remaining warnings manually
3. Prefix unused variables with `_` to suppress `no-unused-vars`

### Silent exit (process exits without error)

1. Enable diagnostic logging: `SPECRUNNER_DEBUG=pipeline specrunner run <request>`
2. Check which boundary log point was last emitted
3. Job state is preserved — run `specrunner job resume <slug>` to continue
