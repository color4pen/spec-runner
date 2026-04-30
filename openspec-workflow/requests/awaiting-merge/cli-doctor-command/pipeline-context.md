# Pipeline Context — cli-doctor-command

## Paths

- **request-md**: openspec-workflow/requests/active/cli-doctor-command/request.md
- **request-path**: openspec-workflow/requests/active/cli-doctor-command
- **change-folder**: openspec/changes/cli-doctor-command/
- **slug**: cli-doctor-command
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-cli-doctor-command
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: new-feature
- **branch**: feat/cli-doctor-command

## Workflow Options

- enabled: [test-case-generator, adr]

## Spec Review Configuration

- **agents**: [architect]
- **emphasis**: CLI subcommand 設計の整合性、外部依存の明示、DoctorCheck interface の一貫性、ADR 必要性
- **result**: openspec-workflow/requests/active/cli-doctor-command/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**:
  - 各 DoctorCheck の独立 unit test（DoctorContext mock 経由）
  - exit code 仕様（0: pass/warn のみ、1: fail あり、2: doctor crash）
  - `--json` 出力フォーマット契約
  - bin/specrunner.ts の doctor case dispatch
  - help message に doctor が表示される

## Code Review Configuration

- **emphasis**: DoctorCheck interface の一貫性、port パターンとの整合、外部依存（fetch / fs / child_process）の inject 漏れ、exit code 仕様の遵守

## Module Analysis Configuration

- **output**: openspec/changes/cli-doctor-command/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う

## Notes

- model-context-size: 1M
- model-context-size-source: request-meta
- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
- retries: なし
- Step 9.5 実行履歴:
  - Step 9.5: recommended: [security-reviewer]

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md

## Fixup Review Scope

- **review-scope**:
  - bin/specrunner.ts
  - src/cli/doctor.ts
  - src/core/doctor/types.ts
  - src/core/doctor/checks/agents/definition-drift.ts
  - src/core/doctor/checks/config/file-exists.ts
  - src/core/doctor/checks/repo/git-repository.ts
  - src/core/doctor/checks/repo/github-origin.ts
  - src/core/doctor/checks/runtime/bun.ts
  - src/core/doctor/checks/runtime/git.ts
  - src/core/doctor/checks/storage/jobs-writable.ts
  - src/core/doctor/checks/storage/old-state-files.ts
  - tests/core/doctor/mock-context.ts
  - tests/core/doctor/doctor-cli.test.ts
  - tests/core/doctor/checks/agents/definition-drift.test.ts
  - tests/core/doctor/checks/auth/anthropic-key-valid.test.ts
  - tests/core/doctor/checks/auth/github-token-valid.test.ts
  - tests/core/doctor/checks/config/file-exists.test.ts
  - tests/core/doctor/checks/repo/git-repository.test.ts
  - tests/core/doctor/checks/storage/jobs-writable.test.ts
  - tests/core/doctor/checks/storage/old-state-files.test.ts
