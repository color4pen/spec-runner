## 1. DB Schema Extension

- [x] 1.1 Add `enabled` column (TEXT, nullable, default null) to `requests` table in `src/lib/db/schema.ts`
- [x] 1.2 Add `'propose'` to the `role` enum in `sessions` table definition in `src/lib/db/schema.ts`
- [x] 1.3 Generate and apply Drizzle migration for the schema changes
- [x] 1.4 Verify existing tests pass with the schema changes (backward compatible: enabled is nullable)

## 2. Request Creation Extension

- [x] 2.1 Refactor `createRequest()` in `src/lib/request-actions.ts` to accept an options object `{ type, title, content, enabled? }` instead of positional parameters, and update all existing call sites
- [x] 2.2 Add validation for enabled values (allowed: `test-case-generator`, `adr`, `module-architect`, `security-reviewer`, `pattern-reviewer`)
- [x] 2.3 Serialize enabled array to JSON string and store in the `enabled` column
- [x] 2.4 Update `RequestSummary` interface to include `enabled: string | null`
- [x] 2.5 Update all return mappings in request-actions.ts to include the `enabled` field

## 3. Request Creation Form Extension

- [x] 3.1 Add enabled multi-select (checkbox group) to the request creation form in `workspace-client.tsx`
- [x] 3.2 Add state management for enabled selection (`useState<string[]>`)
- [x] 3.3 Pass enabled array to `createRequest()` call in `handleCreateRequest()`
- [x] 3.4 Define `ENABLED_OPTIONS` constant with label/value pairs for the checkbox group

## 4. Propose Session Startup

- [x] 4.1 Create `src/lib/propose-actions.ts` with `startPropose()` function
- [x] 4.2 Implement branch name generation: type prefix mapping (`new-feature` -> `feat/`, `spec-change` -> `change/`, `refactoring` -> `refactor/`, `bugfix` -> `fix/`) + slug derivation
- [x] 4.3 Implement `buildProposeMessage()` to construct the instruction message for the propose agent (branch name, openspec-propose instructions, request content, enabled options)
- [x] 4.4 Implement the startup flow: verify request ownership and draft status -> transition to in-progress -> Vault setup -> branch cleanup (delete existing) -> createBoundSession(role: 'propose') -> sendMessage
- [x] 4.5 Implement rollback on failure: revert request status to draft, cancel session if partially created
- [x] 4.6 Add slug storage: store the generated slug on the request record (or derive it deterministically from title + date)

## 5. Propose Session Completion Handler

- [x] 5.1 Add `case 'propose':` to the switch in `handleSessionCompleted()` in `src/lib/session-completion-handler.ts`
- [x] 5.2 Implement `handleProposeCompleted()`: update session status to completed, verify branch exists via `getBranchExists()`
- [x] 5.3 Do NOT create a PR on propose completion (unlike bootstrap)
- [x] 5.4 Keep request in `in-progress` status regardless of branch existence

## 6. GitHub API Extension

- [x] 6.1 Add `getDirectoryContents(token, owner, repo, path, ref)` to `src/lib/github-api.ts`
- [x] 6.2 Implement: call `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}`, return array of `{name, path, type, size}`, return empty array for 404
- [x] 6.3 Add `getFileContent(token, owner, repo, path, ref)` to `src/lib/github-api.ts`
- [x] 6.4 Implement: call `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}`, decode Base64 content, return string or null for 404

## 7. Change Folder Viewer UI

- [x] 7.1 Add a "View Change Folder" button/tab to the request detail view in `workspace-client.tsx`, visible when the request has a completed propose session
- [x] 7.2 Create a Server Action `getChangeFolderFiles()` in `src/lib/propose-actions.ts` that calls `getDirectoryContents()` for the change folder path on the request's branch
- [x] 7.3 Create a Server Action `getChangeFolderFileContent()` that calls `getFileContent()` for a specific file path
- [x] 7.4 Build the file tree sidebar: list proposal.md, design.md, tasks.md, and files under specs/
- [x] 7.5 Build the file content pane: render markdown content with basic formatting (whitespace-pre-wrap or a markdown renderer)
- [x] 7.6 Add file navigation: clicking a file in the tree loads and displays its content

## 8. Propose Session UI Integration

- [x] 8.1 Add "Start Propose" button to the request detail view, visible when request is in `draft` status and repository is bootstrapped
- [x] 8.2 Wire the button to call `startPropose()` with agent ID and environment ID (reuse the agent/environment selector pattern from bootstrap dialog)
- [x] 8.3 After propose starts, connect to the SSE stream for the propose session (reuse `connectStream()`)
- [x] 8.4 Show propose session in the sessions list with role badge `'propose'`
- [x] 8.5 Add status polling or SSE-based detection for propose completion to trigger change folder viewer availability

## 9. Testing

- [x] 9.1 Add unit tests for `createRequest()` with enabled parameter (valid values, invalid values, null)
- [x] 9.2 Add unit tests for branch name generation (all type-prefix mappings)
- [x] 9.3 Add unit tests for `buildProposeMessage()` output structure
- [x] 9.4 Add integration tests for `startPropose()` flow (mock Anthropic API and GitHub API)
- [x] 9.5 Add tests for `getDirectoryContents()` and `getFileContent()` (mock GitHub API responses)
- [x] 9.6 Add tests for propose completion handler (branch exists / does not exist scenarios)
- [x] 9.7 Verify existing bootstrap tests still pass (no regression from role enum change)
