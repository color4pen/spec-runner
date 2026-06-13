# Design: Headless Claude Code Credential

## Context

`inbox run` and other local-runtime jobs can be launched from cron/headless environments where macOS Keychain is unavailable. Claude Code authentication currently depends on upstream `CLAUDE_CODE_OAUTH_TOKEN` being present in the process environment when Keychain cannot be read, which pushes users toward storing that secret directly in crontab.

SpecRunner already has a machine-local credential authority at `~/.config/specrunner/credentials.json`, written with mode `0600` through atomic writes. GitHub token resolution and managed Anthropic API key resolution already use this file. Local Claude Code execution builds the SDK environment in `src/adapter/claude-code/agent-runner.ts` via `stripSecrets(process.env)`, which is the injection point for a headless-safe Claude Code OAuth token.

The upstream contract is still the environment variable name `CLAUDE_CODE_OAUTH_TOKEN`; that name is consumed by `@anthropic-ai/claude-agent-sdk` / Claude Code CLI and must be used only at SDK invocation time.

## Goals / Non-Goals

**Goals**:

- Allow `specrunner login` to store a Claude Code OAuth token in `credentials.json` without writing it to config or job state.
- Resolve the Claude Code OAuth token for local runtime as `CLAUDE_CODE_OAUTH_TOKEN` env first, then `credentials.json`.
- Inject the resolved token into the Claude Agent SDK `options.env` only when the process env does not already provide `CLAUDE_CODE_OAUTH_TOKEN`.
- Extend the credential requirement matrix so local runtime declares the Claude Code credential alongside GitHub.
- Make `specrunner doctor` display the Claude Code credential source as env, credentials.json, or unset.
- Preserve existing users who already set `CLAUDE_CODE_OAUTH_TOKEN` in crontab.

**Non-Goals**:

- Do not change GitHub, Codex, or managed Anthropic API-key credential behavior except where shared types must accept the new field.
- Do not add Keychain or OS secret-store integration.
- Do not implement token rotation or `claude setup-token` automation.
- Do not persist `CLAUDE_CODE_OAUTH_TOKEN` into config, job state, logs, or crontab.

## Decisions

### D1. Store the token as `anthropic.claudeCodeOAuthToken`

Use credential key `anthropic.claudeCodeOAuthToken` and extend `CredentialsFile` to:

```json
{
  "anthropic": {
    "apiKey": "...",
    "claudeCodeOAuthToken": "..."
  }
}
```

**Rationale**: The existing credential naming convention is provider-scoped dot paths such as `github.token` and `anthropic.apiKey`. The token belongs to Anthropic/Claude Code but is not the managed runtime API key, so a separate `anthropic.*` field avoids overloading `anthropic.apiKey`.

**Alternatives considered**:

- `claude.token`: shorter, but introduces a second provider namespace for Anthropic-owned credentials.
- `claudeCode.oauthToken`: precise, but less consistent with the existing provider-first convention.
- Reuse `anthropic.apiKey`: rejected because Claude Code OAuth tokens and Anthropic API keys are different upstream credentials with different consumers.

### D2. Add a dedicated Claude Code OAuth resolver

Add a resolver in the credentials layer, for example `resolveClaudeCodeOAuthToken(env, { optional })`, that returns `{ token, source: "env" | "credentials" }` or `undefined` when optional and unset. Its resolution order is:

1. `env.CLAUDE_CODE_OAUTH_TOKEN`
2. `credentials.json` field `anthropic.claudeCodeOAuthToken`
3. unset / typed error when required

**Rationale**: This keeps env precedence explicit for backward compatibility and gives doctor / agent runner a shared source-of-truth for source reporting.

**Alternatives considered**:

- Inline reads in `agent-runner.ts`: rejected because doctor and tests need the same behavior.
- Extend `resolveSpecRunnerApiKey`: rejected because managed API key and Claude Code OAuth token are distinct credentials.

### D3. Inject only into the local Claude SDK environment

Before constructing or finalizing `queryOptions.env` in `src/adapter/claude-code/agent-runner.ts`, build the env from `stripSecrets(process.env)`, resolve the Claude Code OAuth token with env precedence, and then set `CLAUDE_CODE_OAUTH_TOKEN` on `queryOptions.env` whenever the resolver returns a non-empty value.

**Rationale**: `stripSecrets(process.env)` must not be the last writer for `CLAUDE_CODE_OAUTH_TOKEN`, because an env-provided token needs to reach the SDK and still take precedence over any file-backed fallback. Injecting at the adapter boundary keeps the secret out of broader process-level state while preserving env-first resolution.

**Alternatives considered**:

- Mutate `process.env`: rejected because it widens secret lifetime and side effects.
- Put the credential into config / context: rejected because config is not a secret store and context may be persisted or logged.

### D4. Keep existing `specrunner login` behavior as the default and add provider selection

Keep bare `specrunner login` authenticating GitHub for backward compatibility. Add an explicit provider path, preferably `specrunner login --provider claude`, that interactively prompts for the token produced by `claude setup-token`, trims surrounding whitespace, rejects empty input, warns when `CLAUDE_CODE_OAUTH_TOKEN` is already set, and saves the token via `saveCredentials`.

**Rationale**: Existing scripts and user muscle memory expect `specrunner login` to mean GitHub Device Flow. A provider flag adds the new flow without changing existing command semantics.

**Alternatives considered**:

- Make bare `specrunner login` ask for all missing credentials: rejected because it would surprise existing users and complicate non-interactive behavior.
- Add a new top-level command: rejected because credential management already belongs under `login`.

### D5. Declare local Claude Code credential requirements without making preflight fail unnecessarily

Extend `CredentialKey` and `requirementsFor("local")` with `{ key: "anthropic.claudeCodeOAuthToken", envVar: "CLAUDE_CODE_OAUTH_TOKEN" }`. Update prereq/preflight handling so this requirement is source-aware and compatible with existing Claude Code login environments: env and credentials are pass; unset should produce actionable doctor/preflight guidance only where the existing runtime flow already requires credential validation.

**Rationale**: The matrix should describe all runtime credentials used by preflight, doctor, and bootstrap, but the change must not break local users whose Claude Code CLI can still authenticate interactively outside cron.

**Alternatives considered**:

- Omit the matrix change: rejected by the request and would leave doctor/preflight inconsistent.
- Treat missing Claude Code token as an unconditional hard failure before every local run: risky because it may block interactive Keychain-backed users outside headless usage.

### D6. Show doctor source without printing secret values

Add doctor context fields for the Claude Code OAuth source and a check/result that reports one of:

- `CLAUDE_CODE_OAUTH_TOKEN` from env
- `credentials.json` from `anthropic.claudeCodeOAuthToken`
- unset, with hint to run `claude setup-token` and then `specrunner login --provider claude`

Human and JSON doctor output must include the source/status but never the token.

**Rationale**: The main operational need is to verify that crontab can remove the secret and that SpecRunner will resolve it from the credential file.

**Alternatives considered**:

- Only test the resolver and omit doctor display: rejected because source visibility is an explicit requirement.
- Include masked token prefixes: rejected because source is enough and token material should not appear in diagnostic output.

## Migration Plan

Existing users who set `CLAUDE_CODE_OAUTH_TOKEN` continue to work because env remains highest priority. To migrate to file-backed headless usage:

1. Run `claude setup-token` and copy the generated long-lived OAuth token.
2. Run `specrunner login --provider claude` and paste the token at the prompt.
3. Run `specrunner doctor` and confirm the Claude Code credential source is `credentials.json`.
4. Remove `CLAUDE_CODE_OAUTH_TOKEN=...` from crontab and rotate/reissue the old token if it was exposed.

Rollback is to set `CLAUDE_CODE_OAUTH_TOKEN` in the environment again; env precedence bypasses the stored credential.

## Risks / Trade-offs

[Risk] `anthropic.apiKey` and Claude Code OAuth token could be confused by implementers or users.  
Mitigation: Use distinct field names, help text, doctor labels, and tests that prove each resolver reads only its intended field.

[Risk] The env filter may strip `CLAUDE_CODE_OAUTH_TOKEN` before SDK execution.  
Mitigation: Inject the resolved token after `stripSecrets` into the SDK-only env object and add an agent-runner test that observes `queryOptions.options.env`.

[Risk] Login prompt handling could echo secrets or make tests brittle.  
Mitigation: Use the existing CLI I/O style if available; otherwise add injectable stdin/stdout dependencies for unit tests and avoid logging the token.

[Risk] Tightening local preflight could break non-headless users relying on Claude Code's own auth store.  
Mitigation: Keep missing Claude Code token as diagnostic guidance unless the existing local runtime path already treats declared runtime credentials as required.

## Open Questions

- Should `specrunner login --provider anthropic` be reserved for `anthropic.apiKey` in a separate follow-up, or should this change accept only `--provider claude` for the OAuth token?
- Should doctor display the source label as `credentials` for consistency with existing internals or `credentials.json` for user clarity? The implementation should choose one stable string and lock it in tests.
