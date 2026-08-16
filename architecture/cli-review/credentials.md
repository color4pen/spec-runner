# `credentials` review

Status: **reviewed after auth/setup merge #1001**  
Verdict: **KEEP top-level namespace**, but treat it as advanced/headless setup surface rather than normal onboarding.

Post-change baseline: `main@bb435a1c1c8dced532c6a699726cf08388098128` (`auth-setup-ux`, #1001).

Current forms:

```text
specrunner credentials set claude-code
specrunner credentials set anthropic-api-key
```

## User goal

Persist a secret in SpecRunner's own 0600 credential store specifically for execution environments where upstream interactive/keychain authentication is unavailable or inappropriate.

This is intentionally different from `login`:

```text
login
  = perform GitHub authentication

credentials set
  = store an already-issued secret for headless use
```

## Verdict

### Keep `credentials` top-level

The new namespace is justified. Moving these operations under `login` recreates the provider/auth verb confusion that #1001 removed.

A generic `config set` is also the wrong home because credentials have different persistence, secrecy and lifecycle requirements from configuration.

The plural noun matches the underlying user-global artifact (`credentials.json`) and leaves room for a small family of secret-storage operations without pretending each credential type is its own authentication provider.

### Keep it de-emphasized

Normal attended setup should remain:

```text
init
-> doctor
-> only run credentials set when doctor says a headless/managed secret is needed
```

Users should not need to memorize this command during Quick Start.

## Current contract

`credentials set <name>` accepts exactly two semantic names in the handler:

```text
claude-code
anthropic-api-key
```

Behavior:

- TTY input is read without echo;
- non-TTY input is read from stdin for cron/script use;
- empty secrets are rejected;
- `claude-code` writes the Claude Code OAuth token through the existing credential store;
- `anthropic-api-key` writes the managed-runtime API key through the existing credential store;
- successful storage points back to `specrunner doctor` for verification;
- the command is user-global and correctly does **not** require a repository.

## What is good

### 1. Responsibility is narrow

The command does not perform provider login flows, mutate runtime configuration, or provision managed resources. It stores a secret and stops.

### 2. Secret input semantics match the command's purpose

The former echoing Claude token path has been replaced with a dedicated secret-input utility. TTY and piped-stdin behavior are explicit and testable through injected streams.

### 3. It does not expose read/list commands for secret values

There is no `credentials show` or `credentials ls` that risks turning a convenience command into a secret-exfiltration surface. KEEP that restraint.

If users later need diagnostics, `doctor` should report presence/source without printing secret material.

## Findings

### 1. Credential-name domain is still handler-local

The accepted names are defined as a local constant in `src/cli/credentials.ts`, while the command registry only declares an unconstrained positional `<name>`.

That works, but it means parser/help/completion/validation cannot derive the same value domain mechanically.

**Direction:** future CommandSpec should support enum/dynamic positional domains just as it should for typed flags:

```text
credentials set <claude-code|anthropic-api-key>
```

The handler should receive an already-validated credential kind rather than reparsing a raw string.

This is not a reason to change the command surface now.

### 2. Do not grow this into a general credential manager without a real user need

There is currently no evidence for:

```text
credentials list
credentials show
credentials export
```

and those verbs create additional security and compatibility obligations.

If deletion becomes necessary, a narrowly-scoped `unset` could be considered later, but should be driven by an actual recovery/user goal rather than namespace symmetry.

## Desired shape

```text
specrunner credentials set <name>
```

with advanced/headless visibility and doctor-first discovery.

No additional subcommands are justified by the current product needs.

## Final verdict

- Top-level namespace: **KEEP**
- `set`: **KEEP**
- Audience: **advanced/headless setup**
- Repository requirement: **none, correctly user-global**
- Secret input: **correct after #1001**
- Additional list/show/export verbs: **do not add**
- Machine contract: **move credential-name enum into CommandSpec when command definitions are normalized**
