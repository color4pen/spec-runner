## Why

The change folder viewer added in PR #6 has two usability issues: (1) clicking a directory like `specs/` triggers `getFileContent()` which fails because the GitHub Contents API returns an array for directories, not a base64-encoded file, and (2) after starting a propose session, the UI navigates to the SSE streaming view, making it hard to return to the request detail page where the change folder viewer lives.

## What Changes

- Fix the change folder viewer to handle directory entries: when a user clicks a `type: 'dir'` entry, expand it inline by fetching subdirectory contents via `getDirectoryContents()` instead of calling `getFileContent()`
- Add recursive directory listing support to `getChangeFolderFiles()` so the initial load already includes nested files (e.g., `specs/app-layout/spec.md`)
- Remove the automatic navigation to SSE streaming view after propose session startup; instead, keep the user on the request detail page and show session progress inline (status badge + expandable stream panel)

## Capabilities

### New Capabilities

- `directory-navigation`: Handle `type: 'dir'` entries in the change folder viewer by expanding subdirectory contents inline, supporting arbitrarily nested file trees

### Modified Capabilities

- `change-folder-viewer`: Add recursive directory traversal to initial file listing and directory click handling; render nested file tree with indentation
- `propose-session`: Remove auto-navigation to streaming view after session start; show inline session status on request detail page

## Impact

- `src/lib/github-api.ts` — `getDirectoryContents()` gains optional recursive mode or a new `getDirectoryContentsRecursive()` function
- `src/lib/propose-actions.ts` — `getChangeFolderFiles()` uses recursive directory listing; new server action for fetching subdirectory contents on demand
- `src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx` — change folder viewer renders tree with expandable directories; propose session start stays on request detail; inline status display
- Existing tests must continue to pass; no schema changes
