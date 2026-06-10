# Spec: SECURITY.md を追加する（脆弱性報告窓口の明示）

## Requirements

### Requirement: リポジトリ直下に SECURITY.md が存在しなければならない

The repository MUST contain a `SECURITY.md` file at the repository root (resolvable from the repo
root working directory). It MUST be written in English, consistent with `README.md`.

#### Scenario: SECURITY.md がリポジトリ直下に存在する

**Given** the drift-guard test runs with the repository root as the working directory
**When** it resolves `SECURITY.md` at the repo root and stats it
**Then** the file exists and is a regular file

### Requirement: SECURITY.md は報告方法・対応方針・スコープの節を備えなければならない

`SECURITY.md` MUST contain four sections covering supported versions, how to report a vulnerability,
response expectations, and scope. The section headings MUST be `## Supported Versions`,
`## Reporting a Vulnerability`, `## Response Expectations`, and `## Scope`.

#### Scenario: 4 つの必須節見出しが存在する

**Given** the contents of `SECURITY.md`
**When** the drift-guard test scans for headings
**Then** all four headings (`## Supported Versions`, `## Reporting a Vulnerability`,
`## Response Expectations`, `## Scope`) are present

### Requirement: 報告窓口は GitHub Private vulnerability reporting を一次窓口として案内しなければならない

The `## Reporting a Vulnerability` section MUST direct reporters to GitHub's Private vulnerability
reporting (Security tab → "Report a vulnerability") as the primary intake channel, and MUST NOT
introduce an email or bug-bounty channel.

#### Scenario: 報告導線のキーフレーズが存在する

**Given** the contents of `SECURITY.md`
**When** the drift-guard test searches the body
**Then** it contains the phrase "Report a vulnerability"
**And** it does not mention a bug bounty or monetary reward

### Requirement: Supported Versions は 0.x の最新 minor のみを policy として示さなければならない

The `## Supported Versions` section MUST state that only the latest released minor of the `0.x` line
receives security fixes, expressed as a policy rather than a pinned patch version (e.g. it MUST NOT
hardcode `0.2.0`).

#### Scenario: サポート方針が最新 minor に限定されている

**Given** the `## Supported Versions` section
**When** a reader reviews it
**Then** it conveys that only the latest `0.x` minor is supported and does not pin a specific patch

### Requirement: Scope は README の trust model を参照しなければならない

The `## Scope` section MUST reference README's trust model (the `## Assumptions & Supported Scope` /
`### Trust model` content) and distinguish in-scope vulnerabilities (e.g. credential/secret leakage,
privilege escalation beyond granted scopes, escaping the intended worktree/permission boundary) from
out-of-scope cases that depend on unsupported premises (e.g. prompt injection requiring an untrusted
third-party `request.md`, or running on untrusted commit history).

#### Scenario: scope が trust model を参照する

**Given** the contents of `SECURITY.md`
**When** the drift-guard test searches the body case-insensitively
**Then** it references the README trust model (contains the phrase "trust model")
**And** the `## Scope` section presents both in-scope and out-of-scope examples

### Requirement: 本変更は README を変更してはならず品質ゲートを green に保たなければならない

This change MUST add `SECURITY.md` (and the drift-guard test) only, MUST NOT modify `README.md` or any
source under `src/`, and MUST keep the verification gate (`build`, `typecheck`, `test`, `lint`) green.

#### Scenario: README とソースが不変で品質ゲートが green

**Given** the change is applied
**When** `git diff` is inspected and the verification gate is run
**Then** the only added files are `SECURITY.md` and `tests/unit/docs/security-policy.test.ts`
**And** `README.md` and `src/` are unchanged
**And** `bun run typecheck` and `bun run test` (and the build / lint gate) pass
