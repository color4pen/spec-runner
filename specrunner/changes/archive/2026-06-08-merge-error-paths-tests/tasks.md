# Tasks:

## T-01: Add error path tests to merge-then-archive.test.ts

- [x] TC-MTA-E01: `JobStateStore.list` throws → exitCode 2 with error message
- [x] TC-MTA-E02: initial `getPullRequest` throws (Step 2) → exitCode 1, escalation contains "PR status check (getPullRequest)"
- [x] TC-MTA-E03: `mergePullRequest` throws (Step 5) → exitCode 1, escalation contains "squash merge (REST API)"
- [x] TC-MTA-E04: `mergePullRequest` returns `{merged: false}` (Step 5) → exitCode 1, escalation contains "squash merge (REST API)"

**Acceptance Criteria**:
- [x] 4 error path test cases added to existing test file
- [x] TC-MTA-E01 verifies exitCode: 2 and message content
- [x] TC-MTA-E02/E03/E04 verify exitCode: 1 and escalation failedStep string
- [x] Existing tests show no regression (24 tests pass)
- [x] `bun run typecheck && bun run test` green
- [x] `bun run lint` green
