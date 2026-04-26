## Context

The change folder viewer (PR #6) displays files from `openspec/changes/{slug}/` on the propose branch via the GitHub Contents API. Two issues exist:

1. **Directory handling bug**: `getDirectoryContents()` returns entries with `type: 'dir'` for subdirectories (e.g., `specs/`). When a user clicks these, the UI calls `getFileContent()` which expects a single base64-encoded file. The API returns an array for directories, hitting the `throw new Error('Unexpected response format from GitHub Contents API')` path in `getFileContent()`.

2. **Navigation flow**: `handleStartPropose()` calls `connectStream()` and sets `selectedManagedSessionId`, which switches the UI to the SSE chat view. The user loses the request detail context and cannot easily return to view the change folder after completion.

Current file structure of a typical change folder:
```
openspec/changes/{slug}/
  .openspec.yaml
  proposal.md
  design.md
  tasks.md
  specs/
    capability-a/
      spec.md
    capability-b/
      spec.md
```

## Goals / Non-Goals

**Goals:**
- Directory entries in the change folder viewer expand to show their contents instead of causing an API error
- Nested files (e.g., `specs/app-layout/spec.md`) are viewable in the change folder viewer
- Propose session startup keeps the user on the request detail page with inline progress feedback

**Non-Goals:**
- Markdown rendering (currently displayed as `<pre>` plain text; rendering is a separate enhancement)
- Infinite depth recursion safeguard beyond GitHub API's natural limits
- Change folder editing or write-back capability

## Decisions

### D1: Recursive listing at initial load vs. lazy expand on click

**Decision**: Hybrid approach — `getChangeFolderFiles()` performs a shallow listing; the UI lazily fetches subdirectory contents when a user clicks a directory entry.

**Rationale**: The change folder is typically small (5-10 files, 1-2 levels deep), so recursive fetch on every initial load would work but adds unnecessary API calls for directories the user may never open. Lazy expansion keeps initial load fast and lets the UI show structure progressively.

**Alternative considered**: Full recursive fetch at initial load via a new `getDirectoryContentsRecursive()` helper. Rejected because it couples API cost to directory depth rather than user intent. Can be added later if latency on click becomes a UX issue.

### D2: New server action `getChangeFolderDirectoryContents()` vs. reusing `getChangeFolderFiles()`

**Decision**: Add a new server action `getChangeFolderDirectoryContents(requestId, dirPath)` that wraps `getDirectoryContents()` with the same ownership verification and path-traversal guard as `getChangeFolderFileContent()`.

**Rationale**: Reusing `getChangeFolderFiles()` would require it to accept an optional subpath parameter, overloading its current purpose. A dedicated action is clearer and mirrors the existing `getChangeFolderFileContent()` pattern.

### D3: Inline session status instead of navigation

**Decision**: After `startPropose()`, do not call `connectStream()` or set `selectedManagedSessionId`. Instead, add a session status badge in the request detail view that reflects the propose session's current state (active, waiting, completed). Optionally, add an "Open Stream" button to let the user navigate to the chat view explicitly.

**Rationale**: The request detail page is the primary workspace for reviewing change folder artifacts. Auto-navigating away breaks the user's context. The SSE stream is useful for debugging but not essential for the propose flow — the user mainly cares about the final artifacts.

### D4: Tree state management in the UI

**Decision**: Extend `changeFolderFiles` state to a tree structure using a flat array with a `children` field on directory entries, populated lazily. Track expanded directories in a `Set<string>` state.

**Rationale**: A flat array with lazy children avoids deep state nesting while preserving the ability to render indented tree nodes. The expanded set provides O(1) toggle checks.

## Risks / Trade-offs

- **GitHub API rate limits on deep trees**: Each directory expansion is a separate API call. For deeply nested structures this could hit rate limits. Mitigation: change folders are shallow by convention (max 3 levels); add a depth guard in the UI if needed.
- **Race condition on rapid clicks**: User could click multiple directories before any fetch completes. Mitigation: disable directory click while a fetch is pending (existing `isPending` from `useTransition` handles this).
- **Stale session status**: The inline status badge relies on the session list already fetched. The existing `session.status_idle` SSE handler already calls `getRequestDetail()` to refresh sessions, which covers the completion case. For intermediate states, the user can click "Refresh" on the session row.
