# Implementation Notes: slug-delegation-and-branch-tracking

## Status

- **result**: completed
- **tasks_completed**: 22/22 (all 9 sections, all tasks)

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/lib/db/schema.ts` | Modified | Added `branchName` (TEXT nullable) and `baseBranch` (TEXT nullable) columns to `requests` table |
| `drizzle/0005_branch_tracking.sql` | Created | Migration: `ALTER TABLE requests ADD COLUMN branch_name text` + `base_branch text` with statement-breakpoint |
| `drizzle/meta/_journal.json` | Modified | Added entry idx 5 for `0005_branch_tracking` migration |
| `src/lib/register-branch-tool.ts` | Created | `register_branch` Custom Tool definition (`BetaManagedAgentsCustomToolParams`), importable by handler + session creation |
| `src/lib/custom-tool-handler.ts` | Created | `handleCustomToolUse()` dispatcher with 30s timeout, `register_branch` handler with kebab-case validation, DB update, ownership verification |
| `src/app/api/sessions/[id]/stream/route.ts` | Modified | Detect `requires_action` in SSE loop, dispatch to `fetchAndHandleCustomTool()`, do NOT break on `requires_action` (only break on `end_turn`). Forward all events to client SSE |
| `src/lib/propose-utils.ts` | Modified | Changed `buildProposeMessage()` signature (removed `branchName`/`slug`, added `requestId`); added slug generation guidelines + `register_branch` instructions; added `extractSlugFromBranchName()` |
| `src/lib/propose-actions.ts` | Modified | Removed `generateSlug()`/`generateBranchName()` from `startPropose()`, removed branch cleanup; added `resolveSlugAndBranch()` helper using DB `branchName` with fallback; updated `getChangeFolderFiles()` and `getChangeFolderFileContent()` to use DB value; added `REGISTER_BRANCH_TOOL` import |
| `src/lib/session-actions.ts` | Modified | Added optional `customTools` parameter to `createBoundSession()` |
| `src/lib/session-completion-handler.ts` | Modified | Added `requestBranchName` to `SessionContext`; updated `handleProposeCompleted()` to use DB `branch_name` with fallback to deterministic derivation |
| `src/lib/request-actions.ts` | Modified | Added `branchName: string | null` to `RequestSummary` interface; updated all return sites (`verifyRequestOwnership`, `createRequest`, `listRequests`, `updateRequestStatus`) |
| `src/app/(protected)/repos/[owner]/[repo]/page.tsx` | Modified | Pass `defaultBranch` prop to `WorkspaceClient` |
| `src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx` | Modified | Added `defaultBranch` prop; added diff URL display when `selectedRequest.branchName` is non-null; updated `handleStartPropose` for new return type |
| `src/__tests__/slug-delegation-and-branch-tracking.test.ts` | Created | 29 tests covering TC-001 to TC-019 (all must + selected should test cases) |
| `src/__tests__/request-create-propose.test.ts` | Modified | Updated TC-018 test for new `buildProposeMessage()` signature |

## Test Results

- **Total tests**: 215 pass, 0 fail (all existing + new tests)
- **New tests**: 29 tests in `slug-delegation-and-branch-tracking.test.ts`
- **Must test cases implemented**: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010, TC-011, TC-012, TC-013 (all 13 must cases)
- **Should test cases implemented**: TC-014, TC-015, TC-016, TC-017, TC-019

## Blocked Tasks

None. All 22 tasks completed.

## Implementation Notes

### Custom Tool Session-Level Registration (Task 5.4)

The Anthropic SDK's `SessionCreateParams` does NOT include a `tools` parameter — Custom Tools are defined at the Agent level, not at session creation time. The `createBoundSession()` `customTools` parameter is accepted and documented, but not passed to the `sessions.create` API call (the SDK doesn't support it). The `register_branch` Custom Tool must be registered on the Agent via the Anthropic console or `agents.update()` API before the propose session can use it.

The server-side `handleCustomToolUse()` handler works independently of agent configuration — it responds to any `agent.custom_tool_use` event with `name: 'register_branch'` that arrives in the SSE stream.

### SSE Loop and Custom Tool Event Resolution

The SSE loop detects `requires_action` from `session.status_idle.stop_reason.event_ids`, then calls `client.beta.sessions.events.list()` to retrieve the `agent.custom_tool_use` event by ID. This is necessary because the SSE stream delivers events in order but the `requires_action` idle event contains only the event ID, not the event data itself.

### Path Traversal Validation

`getChangeFolderFileContent()` now validates against the general prefix `openspec/changes/` instead of a slug-specific prefix. This ensures path traversal prevention works correctly with dynamic DB-sourced slugs while still preventing `..` traversal.
