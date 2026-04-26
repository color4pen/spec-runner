## 1. Server-side: Directory contents server action

- [x] 1.1 Add `getChangeFolderDirectoryContents(requestId, dirPath)` server action to `src/lib/propose-actions.ts` — authenticate, verify ownership, validate `dirPath` starts with `openspec/changes/{slug}/` and has no `..`, call `getDirectoryContents()`, return `DirectoryEntry[]`
- [x] 1.2 Add unit/integration test for `getChangeFolderDirectoryContents()` — valid path returns entries, path traversal rejected, non-owned request rejected

## 2. UI: Tree state management

- [x] 2.1 Add `expandedDirs` state (`Set<string>`) and `dirChildren` state (`Map<string, DirectoryEntry[]>`) to `WorkspaceClient` for tracking expanded directories and their cached children
- [x] 2.2 Add `handleToggleDirectory(dirPath)` handler — if already expanded, collapse (remove from set); if collapsed, call `getChangeFolderDirectoryContents()`, store result in `dirChildren`, add to `expandedDirs`

## 3. UI: Tree rendering

- [x] 3.1 Extract the file list rendering into a recursive `renderFileTree(entries, depth)` helper that indents children based on depth and distinguishes directories (trailing `/` or folder indicator) from files
- [x] 3.2 Wire directory entries to `handleToggleDirectory()` and file entries to `handleLoadChangeFolderFileContent()`; show "Empty directory" for expanded dirs with no children

## 4. UI: Propose session navigation fix

- [x] 4.1 In `handleStartPropose()`, remove the `connectStream()` call and `setSelectedManagedSessionId()` assignment so the user stays on the request detail page after session startup
- [x] 4.2 Ensure the session list refreshes after propose start so the new propose session appears with its status badge; verify the existing SSE idle handler (`session.status_idle`) still refreshes sessions on completion

## 5. Verification

- [x] 5.1 Run existing tests (`bun test`) and confirm all pass
- [ ] 5.2 Manual verification: click `specs/` directory in change folder viewer — should expand to show subdirectories, not throw an error
- [ ] 5.3 Manual verification: start a propose session — should stay on request detail page, not navigate to SSE stream
