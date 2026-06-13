# Tasks:

## T-01: Extend credential schema and resolver

- [ ] Add `anthropic.claudeCodeOAuthToken` to `CredentialsFile` in `src/core/credentials/types.ts`.
- [ ] Update `src/core/credentials/credentials-io.ts` validation so `anthropic.apiKey` and `anthropic.claudeCodeOAuthToken` are independently optional strings when present.
- [ ] Add a dedicated resolver/saver for the Claude Code OAuth token, either in a new `src/core/credentials/claude-code.ts` module or a clearly named export from the credentials layer.
- [ ] Implement resolver precedence as `CLAUDE_CODE_OAUTH_TOKEN` env first, then `credentials.json` `anthropic.claudeCodeOAuthToken`.
- [ ] Keep secret values out of error messages and logs.
- [ ] Add unit tests for env precedence, credentials fallback, optional unset behavior, save behavior, preservation of existing `github.token`, and preservation of existing `anthropic.apiKey`.

**Acceptance Criteria**:
- `CredentialsFile` accepts `anthropic.claudeCodeOAuthToken` without weakening existing validation.
- Resolver returns source `"env"` when `CLAUDE_CODE_OAUTH_TOKEN` is set.
- Resolver returns source `"credentials"` when env is unset and credentials contain the token.
- Saving the Claude token preserves existing GitHub and Anthropic API-key credentials.

## T-02: Add Claude provider flow to `specrunner login`

- [ ] Extend login CLI parsing to support a provider selector such as `specrunner login --provider claude`.
- [ ] Preserve current bare `specrunner login` GitHub Device Flow behavior.
- [ ] Implement the Claude provider flow as interactive token input with empty-token rejection and no secret echo in logs.
- [ ] Warn when `CLAUDE_CODE_OAUTH_TOKEN` is already set because env will take precedence over the stored credential.
- [ ] With no `--force`, retain an existing stored `anthropic.claudeCodeOAuthToken`; with `--force`, overwrite it.
- [ ] Include actionable prompt/help text telling the user to generate the token with `claude setup-token`.
- [ ] Add CLI unit tests for provider dispatch, existing-token retention, force overwrite, env precedence warning, and empty input failure.

**Acceptance Criteria**:
- Existing GitHub login tests continue to pass without changing bare command semantics.
- `specrunner login --provider claude` stores the pasted token in `credentials.json` under `anthropic.claudeCodeOAuthToken`.
- The command never prints the token value.

## T-03: Inject the stored token into local Claude Code SDK env

- [ ] Update `src/adapter/claude-code/agent-runner.ts` to resolve the Claude Code OAuth token before SDK query execution.
- [ ] Build SDK env from `stripSecrets(process.env)` and then inject `CLAUDE_CODE_OAUTH_TOKEN` only into that SDK env object.
- [ ] Preserve process-env precedence: when `process.env.CLAUDE_CODE_OAUTH_TOKEN` is non-empty, pass that value to the SDK even if credentials also contain a token.
- [ ] Do not mutate `process.env`.
- [ ] Add agent-runner tests that capture `query` options and prove credentials injection when env is unset and env precedence when env is set.

**Acceptance Criteria**:
- A token stored by login is present as `options.env.CLAUDE_CODE_OAUTH_TOKEN` during local agent execution when the env var is absent.
- Existing env-based crontab users keep working because `CLAUDE_CODE_OAUTH_TOKEN` env wins over credentials.
- No token is added to persisted state or logs.

## T-04: Update runtime credential requirements and preflight behavior

- [ ] Extend `CredentialKey` in `src/core/credentials/requirements.ts` with `anthropic.claudeCodeOAuthToken`.
- [ ] Add `{ key: "anthropic.claudeCodeOAuthToken", envVar: "CLAUDE_CODE_OAUTH_TOKEN" }` to local runtime requirements.
- [ ] Update any preflight/prereq code that switches on credential keys so the new key resolves through the Claude Code OAuth resolver.
- [ ] Preserve managed runtime requirements as GitHub token plus `anthropic.apiKey`; do not make managed runtime depend on the Claude Code OAuth token.
- [ ] Update requirements/preflight tests for the new local matrix and source-aware resolution behavior.

**Acceptance Criteria**:
- `requirementsFor("local")` includes GitHub and Claude Code OAuth credentials.
- `requirementsFor("managed")` remains GitHub plus managed Anthropic API key.
- Preflight code handles the new key explicitly and does not fall through silently.

## T-05: Add doctor source reporting for Claude Code credential

- [ ] Extend `DoctorContext` with resolved Claude Code OAuth token presence/source fields, without exposing the token in formatted output.
- [ ] Resolve the Claude Code OAuth token best-effort in `src/cli/doctor.ts`.
- [ ] Add a doctor check that reports env, credentials.json, or unset for the Claude Code credential.
- [ ] Include a hint for unset local runtime: run `claude setup-token`, then `specrunner login --provider claude`.
- [ ] Update human and JSON formatter tests if needed so source metadata is visible and stable.
- [ ] Add doctor tests proving all three states: env, credentials.json, and unset.

**Acceptance Criteria**:
- `specrunner doctor` shows the Claude Code credential source without printing the token.
- Doctor JSON output contains a testable status/source for the Claude Code credential.
- Unset credentials produce actionable guidance for headless cron usage.

## T-06: Preserve credential file security contracts

- [ ] Confirm `saveCredentials` still writes through `atomicWriteJson` with mode `0600`.
- [ ] Add or update tests that save Claude credentials and assert the resulting file mode is not looser than `0600` on platforms where mode checks are reliable.
- [ ] Add or update merge tests to prove saving the Claude token does not remove `github.token` or `anthropic.apiKey`.
- [ ] Ensure malformed credential validation rejects non-string `anthropic.claudeCodeOAuthToken`.

**Acceptance Criteria**:
- Existing credentials file permission and atomic-write tests remain green.
- New Claude credential fields do not weaken or bypass existing credentials file validation.

## T-07: Documentation and verification

- [ ] Update user-facing CLI help/usage text for `specrunner login --provider claude`.
- [ ] Add a short operational note in the appropriate documentation telling users to remove `CLAUDE_CODE_OAUTH_TOKEN` from crontab after storing the token and verifying doctor output.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Fix any regressions in tests touched by credential source strings or requirements matrix counts.

**Acceptance Criteria**:
- User-facing help points to the Claude token login flow.
- `typecheck && test` is green.
- The implementation satisfies all request acceptance criteria.
