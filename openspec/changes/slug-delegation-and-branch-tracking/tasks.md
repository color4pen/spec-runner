## 1. Database Schema Extension

- [x] 1.1 Add `branch_name` (TEXT, nullable) and `base_branch` (TEXT, nullable) columns to `requests` table in `src/lib/db/schema.ts`. Update the `Request` / `NewRequest` inferred types
- [x] 1.2 Create idempotent migration to add `branch_name` and `base_branch` columns to existing `requests` table (`ALTER TABLE requests ADD COLUMN` with IF NOT EXISTS or error suppression)

## 2. Custom Tool Handler Infrastructure

- [x] 2.1 Create `src/lib/custom-tool-handler.ts` with `handleCustomToolUse()` dispatcher function. Accept session DB id, managed session ID, and Custom Tool Use event data. Route by `event.name` to registered handlers. Return `user.custom_tool_result` content
- [x] 2.2 Implement error handling in dispatcher: catch handler errors and unknown tool names, return error description as tool result to prevent session hanging in idle state

## 3. register_branch Custom Tool

- [x] 3.1 Define `register_branch` tool schema constant (name, description, input_schema with `slug`, `branch_name`, `request_id` properties) in a shared location importable by both `custom-tool-handler.ts` and session creation code
- [x] 3.2 Implement `register_branch` handler in `custom-tool-handler.ts`: validate input (non-empty slug matching kebab-case pattern, non-empty branch_name, valid request_id), update `requests.branch_name` in DB, return success/error result
- [x] 3.3 Send `user.custom_tool_result` event to Anthropic API via `client.beta.sessions.events.send()` with the `custom_tool_use_id` and handler result content

## 4. SSE Stream Route Extension

- [x] 4.1 Extend the SSE loop in `src/app/api/sessions/[id]/stream/route.ts` to detect `session.status_idle` with `stop_reason.type === 'requires_action'` and dispatch to `handleCustomToolUse()`
- [x] 4.2 Ensure the SSE loop does NOT break on `requires_action` (only breaks on `end_turn`). The session resumes to `running` after `user.custom_tool_result` is sent
- [x] 4.3 Forward `requires_action` events to the client SSE stream so the UI can display Custom Tool activity

## 5. Propose Session Modifications

- [x] 5.1 Update `buildProposeMessage()` in `src/lib/propose-utils.ts`: remove `branchName` and `slug` parameters, add `requestId` parameter, include instructions for agent to determine slug, create branch, and call `register_branch` Custom Tool
- [x] 5.2 Include slug generation guidelines in the message: kebab-case, date prefix `YYYY-MM-DD-`, English words derived from title, max 60 characters
- [x] 5.3 Update `startPropose()` in `src/lib/propose-actions.ts`: remove `generateSlug()` / `generateBranchName()` calls, remove branch existence check and deletion, pass `requestId` to `buildProposeMessage()`
- [x] 5.4 Add `register_branch` Custom Tool definition to session creation in `createBoundSession()` or `startPropose()` — pass `tools` array with the Custom Tool definition when creating the Managed Agents session

## 6. Session Completion Handler Update

- [x] 6.1 Update `handleProposeCompleted()` in `src/lib/session-completion-handler.ts`: read `request.branch_name` from DB, use it for branch verification if non-null, fall back to deterministic derivation if null

## 7. Change Folder Viewer Update

- [x] 7.1 Update `getChangeFolderFiles()` in `src/lib/propose-actions.ts`: use DB `branch_name` when available, extract slug from branch_name for change folder path, fall back to deterministic derivation when null
- [x] 7.2 Update `getChangeFolderFileContent()` in `src/lib/propose-actions.ts`: use DB `branch_name` when available, fall back to deterministic derivation when null. Ensure path traversal validation still works with dynamic slug
- [x] 7.3 Expose `branch_name` in `RequestSummary` / `getRequestDetail()` response so the UI can access it

## 8. UI: Diff URL and branch_name Display

- [x] 8.1 Add diff URL link to request detail view in `workspace-client.tsx`: display `https://github.com/{owner}/{repo}/compare/{base}...{branch_name}` when `branch_name` is non-null. Open in new tab with `rel="noopener noreferrer"`
- [x] 8.2 Use repository `defaultBranch` (or `main` fallback) as the base branch for the compare URL

## 9. Tests

- [x] 9.1 Add tests for `register_branch` input validation: empty slug, empty branch_name, invalid slug format, valid input
- [x] 9.2 Add tests for Custom Tool dispatcher: known tool routing, unknown tool error, handler error propagation
- [x] 9.3 Update existing `propose-session` tests to reflect removed slug pre-computation and updated `buildProposeMessage()` signature
- [x] 9.4 Add tests for change folder viewer fallback logic: with DB branch_name, without DB branch_name (fallback)
