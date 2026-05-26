# SpecRunner

A self-hosted CLI that drives multi-step development pipelines using Anthropic Claude.

## Status

Self-host pipeline complete as of 2026-04-30 (PR #40 merged).

## Quick Start

```bash
# 1. Initialize config scaffold
specrunner init

# 2. Authenticate with GitHub
specrunner login

# 3. Create a new request from template
specrunner request new my-feature

# 4. (Edit specrunner/drafts/my-feature.md)

# 5. Start the pipeline
specrunner job start my-feature

# 6. Check job status
specrunner job ls

# 7. Finish (PR merge + archive) when awaiting-merge
specrunner job finish my-feature
```

### Failure / resume flow

```bash
specrunner job ls               # Find the failed job
specrunner job resume my-feature  # Resume from last checkpoint
```

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
specrunner job finish <slug>               Squash-merge PR + archive (1-PR model)
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

## Troubleshooting

### Silent exit (process exits without error)

If `specrunner run` or `specrunner resume` exits unexpectedly without error output:

1. Enable pipeline diagnostic logging:
   ```bash
   SPECRUNNER_DEBUG=pipeline specrunner run <request>
   ```
2. Check which boundary log point was the last one emitted — this identifies where the event loop exited prematurely.
3. The job state will have been transitioned to `awaiting-resume` by the exit guard. Run `specrunner resume <slug>` to continue.
