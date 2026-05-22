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
