## Purpose

TBD

## Requirements

### Requirement: release-please GitHub Actions workflow is created

`.github/workflows/release-please.yml` SHALL exist with the following invariants:

- Trigger: `push: branches: [main]`
- Uses `google-github-actions/release-please-action@v4`
- `release-type: node` (package.json version を自動更新)
- `permissions: contents: write` および `pull-requests: write` を明示する
- `GITHUB_TOKEN` を使用し、Personal Access Token は不要とする

#### Scenario: release-please workflow runs on main push

- **GIVEN** a commit is pushed to the `main` branch with a `feat:` prefix in the commit message
- **WHEN** the `release-please.yml` workflow is triggered
- **THEN** release-please-action creates or updates a version bump pull request
- **AND** the PR updates `package.json` version and `CHANGELOG.md`

### Requirement: publish.yml trigger is unchanged

`.github/workflows/publish.yml` SHALL retain its `v*` tag push trigger without modification.

release-please が作成した tag (`v*` 形式) により publish.yml が自動起動し、二重 publish は発生しない。

#### Scenario: tag creation triggers publish pipeline

- **GIVEN** release-please merges a version bump PR and creates a `v*` tag
- **WHEN** the `publish.yml` workflow evaluates its trigger
- **THEN** publish.yml runs (the `v*` pattern matches release-please's default tag format)
- **AND** publish.yml is NOT modified as part of this change

### Requirement: TYPE_CONFIG includes conventionalPrefix for each request type

`src/config/type-config.ts` SHALL define a `conventionalPrefix` field on each request type entry with the following mapping:

| request type  | conventionalPrefix |
|---------------|--------------------|
| `new-feature` | `feat`             |
| `bug-fix`     | `fix`              |
| `spec-change` | `feat`             |
| `refactoring` | `refactor`         |
| `chore`       | `chore`            |

#### Scenario: TYPE_CONFIG exposes conventionalPrefix for new-feature

- **GIVEN** the `TYPE_CONFIG` map exported from `src/config/type-config.ts`
- **WHEN** `TYPE_CONFIG.get("new-feature")` is accessed
- **THEN** the returned entry has `conventionalPrefix === "feat"`

#### Scenario: TYPE_CONFIG exposes conventionalPrefix for bug-fix

- **GIVEN** the `TYPE_CONFIG` map exported from `src/config/type-config.ts`
- **WHEN** `TYPE_CONFIG.get("bug-fix")` is accessed
- **THEN** the returned entry has `conventionalPrefix === "fix"`

### Requirement: PR title is rendered with conventional commits prefix

`renderPrTitle()` SHALL prepend `<conventionalPrefix>: ` to the request title when generating the PR title.

The resulting format SHALL be `<prefix>: <title>` (e.g., `feat: release-please による自動バージョニング`), enabling release-please to parse the squash merge commit message correctly.

#### Scenario: renderPrTitle returns prefixed title for new-feature

- **GIVEN** a parsed request with type `"new-feature"` and title `"release-please による自動バージョニング"`
- **WHEN** `renderPrTitle(parsedRequest)` is called
- **THEN** the returned string equals `"feat: release-please による自動バージョニング"`

#### Scenario: renderPrTitle returns prefixed title for bug-fix

- **GIVEN** a parsed request with type `"bug-fix"` and title `"Fix token expiry handling"`
- **WHEN** `renderPrTitle(parsedRequest)` is called
- **THEN** the returned string equals `"fix: Fix token expiry handling"`

### Requirement: package.json version is set to 0.1.0

`package.json` SHALL have `"version": "0.1.0"` as the starting point for release-please automation.

#### Scenario: package.json has version 0.1.0

- **GIVEN** the root `package.json` of the repository
- **WHEN** the `version` field is read
- **THEN** it equals `"0.1.0"`
