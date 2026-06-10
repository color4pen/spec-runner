## Requirements

### Requirement: publish.yml trigger is unchanged

`.github/workflows/publish.yml` SHALL retain its `v*` / `specrunner-v*` tag push trigger AND add a `workflow_dispatch` trigger with a required `tag` input (string, e.g. `v0.2.0`).

publish.yml の責務は build + publish のみとする。`typecheck` および `test` step は含まない（branch protection で merge 前に CI green が保証されているため、同一 SHA への二重検証は冗長）。

workflow_dispatch トリガーの場合、`inputs.tag` で指定された tag の SHA を checkout し、build → publish を実行する。tag push トリガーの場合は `github.ref_name` を使用する。

#### Scenario: tag creation triggers publish pipeline

**Given** release-please merges a version bump PR and creates a `v*` tag
**When** the `publish.yml` workflow evaluates its trigger
**Then** publish.yml runs (the `v*` pattern matches release-please's default tag format)
**And** the workflow executes `bun install`, `bun run build`, and `npm publish` steps only (no typecheck or test)

#### Scenario: workflow_dispatch triggers publish for a specific tag

**Given** a previous publish run failed for tag `v0.2.0` due to a transient npm error
**When** a maintainer triggers `publish.yml` via workflow_dispatch with input `tag: v0.2.0`
**Then** the workflow checks out the commit pointed to by tag `v0.2.0`
**And** executes `bun install`, `bun run build`, and `npm publish`

### Requirement: publish failure is visible in job summary

`publish.yml` SHALL output publish results to `$GITHUB_STEP_SUMMARY`.

成功時はパッケージの tag 情報を表示する。失敗時は失敗した旨と workflow_dispatch による再実行手順を案内する。

#### Scenario: successful publish writes summary

**Given** the `npm publish` step completes successfully for tag `v0.2.0`
**When** the summary step executes
**Then** `$GITHUB_STEP_SUMMARY` contains the published tag information

#### Scenario: failed publish writes recovery instructions

**Given** the `npm publish` step fails for tag `v0.2.0`
**When** the failure summary step executes (triggered by `if: failure()`)
**Then** `$GITHUB_STEP_SUMMARY` contains the failure message and instructions to re-run via workflow_dispatch

### Requirement: branch protection requires ci check before merge

main branch の branch protection で `ci`（ci.yml の job 名）が required status check として設定されていることを前提とする。これにより release PR を含む全 PR は CI green でなければ merge できず、赤い SHA にタグが打たれることを防止する。

本 requirement は GitHub リポジトリ設定の構成であり、コードによる自動化は MUST NOT とする。セットアップ手順の明文化のみを SHALL とする。

#### Scenario: release PR cannot merge with failing CI

**Given** a release PR created by release-please exists on main
**When** the `ci` status check is failing (red)
**Then** the PR merge button is blocked by branch protection
**And** release-please cannot merge the PR, so no tag is created for the failing SHA
