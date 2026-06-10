# Security Policy

## Supported Versions

Only the latest released minor of the `0.x` line receives security fixes. Older `0.x` minors are unsupported.

| Version | Supported |
|---------|-----------|
| 0.x (latest minor) | ✅ |
| 0.x (older minors) | ❌ |

## Reporting a Vulnerability

Please use **GitHub's Private vulnerability reporting** to report security issues:

1. Go to the **Security** tab of this repository.
2. Click **"Report a vulnerability"**.
3. Fill in the details and submit.

Do **not** open a public GitHub issue for security vulnerabilities. Private reporting keeps the details confidential until a fix is available.

## Response Expectations

This project is maintained by a single individual on a best-effort basis. There are no SLA guarantees. I will acknowledge and investigate reports as time allows, but response times may vary. Thank you for your patience.

## Scope

SpecRunner's trust model is documented in the [README § Assumptions & Supported Scope → Trust model](README.md#trust-model). The scope below is defined against that trust model.

### In scope

- **Privilege escalation**: a pipeline run acquiring GitHub permissions beyond those explicitly granted to the token.
- **Credential / secret leakage**: unintended exposure of GitHub tokens, API keys, or other credentials (e.g. leaking secrets from the environment into PR descriptions, logs, or agent output).
- **Worktree / permission boundary violation**: agent behavior that escapes the intended git worktree or file-system permission boundaries established by SpecRunner.

### Out of scope

- **Prompt injection via untrusted `request.md`**: `request.md` is treated as trusted input (see trust model). Running a `request.md` authored by an untrusted third party is outside the supported use case, and resulting agent misbehavior is not considered a vulnerability in SpecRunner.
- **Issues arising from untrusted commit history**: running SpecRunner on a repository with untrusted commit history is explicitly not recommended (see README). Prompt injection via malicious commit messages or diff output in such repositories is out of scope.
