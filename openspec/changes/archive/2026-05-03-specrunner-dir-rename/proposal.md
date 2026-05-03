# Proposal: SpecRunner Directory Rename

## Background / Why

### Pre-existing namespace leak and non-existent directory references

The SpecRunner CLI production code currently references `openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` as user-facing paths, but `openspec-workflow/` is an **internal dev tooling directory** containing ADRs, instincts, learned-patterns, and other development artifacts. This creates a namespace leak where production code depends on what should be an internal-only namespace.

Additionally, the codebase references directories that **do not exist** on the filesystem:

| Expected by code | Filesystem reality |
|------------------|-------------------|
| `active/` | ✅ Exists (1 entry) |
| `awaiting-merge/` | ❌ **Does not exist** |
| `merged/` | ✅ Exists (23 entries) |
| `canceled/` | ❌ **Does not exist** |
| (not referenced) | ⚠️ `done/` (5 entries, legacy from pre-CLI workflow) |

The `specrunner doctor` command has been emitting warnings for missing `awaiting-merge/` and `canceled/` directories since initial dogfooding. This was surfaced as a pre-existing bug during the first spec-review of the `specrunner-dir-rename` change.

### Design decision: `awaiting-merge` is JobStatus, not a filesystem directory

`awaiting-merge` represents a lifecycle state ("PR created, awaiting human merge"), not a filesystem location. It should be expressed as a **JobState.status value**, not as a separate directory. The filesystem layout should only contain `active/<slug>/` (work in progress) and `merged/<slug>/` (completed). The `specrunner finish` command will move directly from `active/<slug>/` to `merged/<slug>/` after creating the PR.

`canceled` is out of scope for the current SpecRunner implementation (no cancel command exists), so all references to it will be removed from code and specs.

### Naming inconsistency

```
~/.config/specrunner/config.json         ← Consistent
~/.local/share/specrunner/jobs/...       ← Consistent
specrunner CLI binary                    ← Consistent
package.json name: "spec-runner"         ← npm convention
<repo>/openspec-workflow/requests/...    ← LEAK
```

Only the repository directory deviates from the `specrunner` naming convention.

## What / Proposal

Rename `openspec-workflow/requests/` to `specrunner/requests/` and update all source code, tests, and specs to reference the new path. Simultaneously remove references to non-existent `awaiting-merge/` and `canceled/` directories.

The final filesystem structure will be:

```
<repo>/
├── specrunner/                                  ← NEW (user manual migration)
│   └── requests/
│       ├── active/<slug>/request.md             ← run input
│       └── merged/<slug>/...                    ← finish output
│
├── openspec/                                    ← Unchanged (openspec CLI domain)
│   ├── changes/<slug>/{proposal,design,tasks,specs}/
│   ├── specs/
│   └── project.md
│
└── openspec-workflow/                           ← Retained (dev tooling only)
    ├── adr/
    ├── instincts/
    ├── learned-patterns.md
    ├── review-lessons.md
    ├── constraints.md
    └── observations.jsonl
```

## Impact Scope

### A. Source code (4 files)

| File | Changes |
|------|---------|
| `src/cli/run.ts` (lines 121-125) | Update `CANONICAL_PATTERN` regex to `specrunner/requests/active/<slug>/` (remove `awaiting-merge` alternation) |
| `src/core/doctor/checks/repo/workflow-structure.ts` | Change `REQUIRED_DIRS` to `["active", "merged"]`, update path construction to `specrunner/requests/`, update messages |
| `src/core/finish/resolve-target.ts` | (1) Change auto-detection base from `awaiting-merge/` to `active/`, (2) Update cwd-pattern regex (line 225) to `specrunner/requests/active/<slug>/`, (3) Update variable names/comments/error messages |
| `src/core/finish/move-requests-dir.ts` | Change `git mv` source from `awaiting-merge/<slug>/` to `active/<slug>/`, keep destination as `merged/<slug>/`, update base path to `specrunner/requests/` |

### B. Delta specs (3 specs)

Create delta specs under `openspec/changes/specrunner-dir-rename/specs/`:

- `cli-commands/spec.md` — Update doctor check requirement (line 170): `REQUIRED_DIRS` to `{active, merged}`
- `cli-finish-command/spec.md` — Update slug detection requirements (lines 14, 15, 41): remove `awaiting-merge` references, use `specrunner/requests/active/<slug>/` only
- `job-state-store/spec.md` — Update `CANONICAL_PATTERN` requirement (lines 220, 235, 239): use `specrunner/requests/active/<slug>/` only

### C. Tests (6 files)

| File | Changes |
|------|---------|
| `tests/finish-orchestrator.test.ts` | Line 52 fixture path |
| `tests/finish-ps-integration.test.ts` | Lines 170, 176, 205, 213 fixture paths |
| `tests/finish-adversarial.test.ts` | Lines 53, 248 fixture paths |
| `tests/finish-resolve-target.test.ts` | Lines 44, 115, 136, 154 paths; **TC-131/TC-132/TC-133 rewrite** to test `active/` auto-detection |
| `tests/unit/core/pr-create/body-template.test.ts` | Line 19 fixture path |
| `tests/state/job-slug.test.ts` | Lines 119, 122, 129 `CANONICAL_PATTERN` tests; **remove `awaiting-merge` alternation test cases** |

### Out of scope

- **Filesystem migration** (user responsibility): Moving `openspec-workflow/requests/{active,done,merged}/*` to `specrunner/requests/{active,merged}/*` via `git mv`
- `openspec-workflow/{adr,instincts,...}` dev tooling (retained unchanged)
- JobStatus enum modifications (separate `job-status-lifecycle` change)
- `specrunner resume` / `specrunner cancel` implementation
- Agent name `openspec-workflow` rename
- Historical comments in `openspec/changes/archive/**`
- Backward compatibility: old paths will **not** continue to work (breaking change, complete cutover)

## Acceptance Criteria

- [ ] `grep -rn "openspec-workflow/requests" src/` returns **0 matches**
- [ ] `grep -rn "openspec-workflow/requests" tests/` returns **0 matches**
- [ ] `grep -rn "openspec-workflow/requests" openspec/specs/` returns **0 matches**
- [ ] `grep -rn "awaiting-merge" src/` returns **0 matches** (JobStatus value not introduced in this change)
- [ ] `grep -rn "awaiting-merge" tests/` returns **0 matches**
- [ ] `grep -rn "canceled" src/` returns **0 matches**
- [ ] `grep -rn "canceled" tests/` returns **0 matches**
- [ ] `src/core/doctor/checks/repo/workflow-structure.ts` has `REQUIRED_DIRS = ["active", "merged"] as const`
- [ ] `src/cli/run.ts` `CANONICAL_PATTERN` is `specrunner/requests/active/<slug>/<filename>.md` format without `awaiting-merge` alternation
- [ ] `src/core/finish/move-requests-dir.ts` performs `git mv` from `active/<slug>/` to `merged/<slug>/`
- [ ] `bun run build` passes
- [ ] `bun test` passes (all tests)
- [ ] Delta specs exist: `openspec/changes/specrunner-dir-rename/specs/{cli-commands,cli-finish-command,job-state-store}/spec.md`
- [ ] `openspec-workflow/{adr,instincts,...}` dev tooling is **unmodified**

## Dependencies

This change has no dependencies on other changes. The separate `job-status-lifecycle` change (which will introduce `awaiting-merge` as a JobStatus enum value) can be implemented after this change merges.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| User performs filesystem migration after merge | Doctor will warn/fail on missing `specrunner/requests/{active,merged}/`, existing dogfooding breaks | User must complete manual migration before merging this PR. Migration and merge are coordinated manual steps |
| Self-referential dogfooding: finish fails after merge | Local binary (pre-merge build) looks for `openspec-workflow/requests/awaiting-merge/<slug>/` which doesn't exist | Manual `gh pr merge` + manual `openspec archive --skip-specs --yes`. Next run uses new binary |
| Uncommitted request.md | If `openspec-workflow/requests/active/specrunner-dir-rename/request.md` isn't in main, it won't appear in PR | Propose agent has content via `deps.request.content`. Only impact: historical record not in repo. User can commit before run if desired |
| Git rename detection fails for 23 merged entries | `git log --follow` tracking breaks | User performs filesystem migration as `git mv` (preserving history) in separate commit |
| doctor `--json` consumers see REQUIRED_DIRS change | Check id/status remain stable; only message text changes | Minimal external impact. Check id stability is enforced in acceptance criteria |
