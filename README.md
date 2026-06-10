# SpecRunner

A self-hosted CLI that drives multi-step development pipelines using Anthropic Claude.

## Stability

SpecRunner is currently **0.x**. While it is used in production for this project's own development, the state and config file formats may receive breaking changes between any two releases.

Migrations are provided when formats change, but they ship in **minor releases** — not majors. Upgrade notes are included in each release changelog.

## How the Pipeline Works

SpecRunner reads a `request.md` file and drives a multi-step pipeline that produces a GitHub PR.

### Happy path

1. `request-review` — validates the request; escalates if the request is unclear or rejected
2. `design` — creates the branch and generates specification files
3. `spec-review` — reviews the spec; loops with `spec-fixer` until approved
4. `test-case-gen` — generates test case definitions from the approved spec
5. `implementer` — writes the implementation
6. `verification` — runs build / typecheck / test / lint; loops with `build-fixer` until passed
7. `code-review` — reviews the implementation; loops with `code-fixer` until approved
8. `conformance` — checks architecture conformance; returns to `implementer` if fixes are needed
9. `adr-gen` — generates an ADR when `request.adr` is `true`; passes through otherwise
10. `pr-create` — opens the GitHub PR

### Judge loops and escalation

Each judge step (`spec-review`, `code-review`) returns either `approved` or `needs-fix`. A `needs-fix` verdict routes to the paired fixer step and back to the judge, repeating until the judge approves or the iteration budget is exhausted.

`verification` works the same way: a `failed` result routes to `build-fixer`, then back to `verification`. A `conformance` `needs-fix` returns execution to `implementer` (full impl-phase re-entry).

**Escalation is not a failure.** It means an agent reached a point that requires human judgment — an ambiguous request, unresolved findings, or a build it cannot repair. When a job escalates, its state is preserved and can be resumed:

```bash
specrunner job resume <slug>
```

`request-review` is the front gate: `needs-discussion` and `reject` verdicts escalate immediately without looping, signalling that the request needs human clarification before the pipeline can proceed.

## Installation

SpecRunner is published to GitHub Packages. Add the registry entry to your `.npmrc` first:

```
@color4pen:registry=https://npm.pkg.github.com
```

Then install:

```bash
# As a dev dependency (recommended for project use)
npm install -D @color4pen/specrunner

# Or globally
npm install -g @color4pen/specrunner
```

## Quick Start

```bash
# 1. Initialize config scaffold + project directories
npx specrunner init

# 2. Authenticate with GitHub
npx specrunner login

# 3. Create a new request from template
npx specrunner request new my-feature

# 4. Edit the generated request file
#    specrunner/drafts/my-feature/request.md

# 5. Start the pipeline
npx specrunner run my-feature

# 6. Archive when awaiting-archive (merge + archive in one step)
npx specrunner job archive --with-merge my-feature
```

### Failure / resume flow

```bash
npx specrunner job ls                    # Find the failed job
npx specrunner job resume my-feature     # Resume from last checkpoint
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SPECRUNNER_API_KEY` | Managed runtime only | Anthropic API key. Not needed for local runtime. |

## Command Reference

### Request commands (static document operations)

```
specrunner request new <slug>              Create request.md from template
specrunner request generate "<text>"       Generate request.md via LLM
specrunner request ls                      List active requests
specrunner request validate <file|slug>    Validate request.md syntax (static, no LLM)
specrunner request template                Print scaffold template to stdout
specrunner request review <slug|file>      Architect review (one-shot LLM, stateless)
```

### Job commands (stateful execution)

```
specrunner job start <request-slug|file>   Start pipeline, issue jobId
specrunner job ls                          List all jobs
specrunner job show <jobId|slug>           Show job state details
specrunner job cancel <jobId>              Cancel job and cleanup
specrunner job resume <slug>               Resume a halted job
specrunner job archive <slug>              Archive change folder, teardown worktree, update status
```

### Environment commands

```
specrunner init                            Initialize config scaffold
specrunner login                           GitHub Device Flow OAuth
specrunner doctor                          Diagnose environment / config / auth
specrunner runtime setup                   Set up Anthropic Managed Agents (managed runtime)
specrunner runtime status                  Show managed runtime status
specrunner runtime reset                   Reset managed runtime config
```

### Aliases

```
specrunner run <slug|file>                 Alias for: job start <slug|file>
```

## Configuration

### User global config

SpecRunner stores its configuration at `~/.config/specrunner/config.json` (XDG_CONFIG_HOME).
Run `specrunner init` to create the initial scaffold.

### Project local config (per-repo override)

Place a partial config at `<repo-root>/.specrunner/config.json` to override settings for a specific repository.
The project local config is **deep-merged** on top of the user global config — you only need to specify the fields you want to change.

`specrunner init` configures `.gitignore` with `.specrunner/*` + `!.specrunner/config.json`, so `config.json` can be committed and shared with your team while machine-generated state (`jobs/`, `logs/`, etc.) stays ignored.

```jsonc
// <repo-root>/.specrunner/config.json
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

This example uses opus for design on `spec-change` / `new-feature` requests and sonnet for everything else (from user global).

### byRequestType — per-request-type model selection

Each step config supports a `byRequestType` object to select a different model based on the request type:

```jsonc
{
  "steps": {
    "code-review": {
      "model": "claude-sonnet-4-6",
      "byRequestType": {
        "spec-change": { "model": "claude-opus-4-6[1m]" }
      }
    }
  }
}
```

Resolution order (first defined wins):
1. `steps.<step>.byRequestType.<requestType>.<field>`
2. `steps.<step>.<field>`
3. `steps.defaults.byRequestType.<requestType>.<field>`
4. `steps.defaults.<field>`
5. Step hardcoded default
6. SDK default

> Note: under the **managed** runtime, `model` / `byRequestType.model` are ignored — managed agents use their pre-registered model. These fields are effective only under the **local** runtime.

## Runtime Modes

### Local runtime (default)

Runs agents locally via the Claude Agent SDK. No additional API key needed beyond the GitHub token.

```bash
specrunner init
specrunner login
specrunner job start my-feature
```

### Managed runtime (Anthropic Managed Agents)

Runs agents in Anthropic's cloud. Requires `SPECRUNNER_API_KEY` (Anthropic API key).

```bash
specrunner init
specrunner login
export SPECRUNNER_API_KEY=sk-ant-...
specrunner runtime setup
specrunner job start my-feature
```

## Cost

Figures are aggregated from this project's own archived runs (`specrunner/changes/archive/*/usage.json`, 278 requests), summing input, output, cache-creation, and cache-read tokens per request and pricing each invocation at its model's Anthropic list rate as of 2026-06-10.

| Metric | Tokens | USD |
|--------|--------|-----|
| Minimum | 0.64 M | $1.42 |
| Median | 6.1 M | $8.58 |
| Maximum | 117 M | $73.11 |

Cache reads account for ~94% of all tokens; applying the cache-read discount (0.1× the base input rate) is essential for accurate cost projection. The high end of the range includes requests that looped through fixer steps many times.

> The model used by each pipeline step is configurable (see [Configuration](#configuration)). Actual cost depends on request complexity, the number of fixer iterations, and the model selected.

## Assumptions & Supported Scope

### Trust model

`request.md` is treated as **trusted input**. SpecRunner is designed for solo use where the person who writes `request.md` also reviews and merges the resulting PR. Feeding `request.md` files authored by untrusted third parties is outside the supported use case.

### Verification gate coverage

By default (no `verification.commands` set), the verification step detects and runs the `build`, `typecheck`, `test`, and `lint` scripts from your `package.json`. **Node.js / Bun projects are the primary supported target** for this default mode. If no matching scripts are found and `verification.commands` is also unset, the verification gate is a no-op and code quality relies entirely on the review agents' judgment.

For projects in other languages (Python, Go, Rust, etc.), set `verification.commands` in your project config to run arbitrary verification commands:

```jsonc
// .specrunner/config.json
{
  "verification": {
    "commands": ["ruff check", { "name": "type", "run": "mypy" }, "pytest -v"]
  }
}
```

### Commit history trust

In repositories with external contributors, `git log` and `git diff` output is included in agent prompts. **Running SpecRunner on repositories with untrusted commit history is not recommended**, as malicious content in commit messages or diff output could influence agent behavior.

## Troubleshooting

### Lint failure in verification pipeline

If `bun run lint` (or a custom lint command in `verification.commands`) fails during verification:

1. Run auto-fix to resolve mechanical issues automatically:
   ```bash
   bun run lint --fix
   ```
2. Review remaining warnings manually — these require human judgment (e.g. intentional `any` usage, complex control flow).
3. Prefix intentionally unused variables with `_` to suppress `no-unused-vars` warnings (e.g. `_unused`).
4. Re-run `bun run lint` to confirm 0 warnings / 0 errors before committing.

### Silent exit (process exits without error)

If `specrunner run` or `specrunner resume` exits unexpectedly without error output:

1. Enable pipeline diagnostic logging:
   ```bash
   SPECRUNNER_DEBUG=pipeline specrunner run <request>
   ```
2. Check which boundary log point was the last one emitted — this identifies where the event loop exited prematurely.
3. The job state will have been transitioned to `awaiting-resume` by the exit guard. Run `specrunner resume <slug>` to continue.
