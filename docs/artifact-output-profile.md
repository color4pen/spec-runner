# Artifact-Output Profile

The `artifact-output` execution profile lets you run SpecRunner in environments where no Git
repository is available (CI sandbox, bare container, isolated directory). Instead of creating a
pull request, the profile writes a portable artifact bundle to the local filesystem.

## When to use

| Situation | Recommended profile |
|-----------|---------------------|
| Full Git repo + GitHub API access | `git-pr` (default) |
| No Git, no GitHub, need portable diff | `artifact-output` |
| Offline / air-gapped environment | `artifact-output` |

## Output structure

A successful run produces:

```
<run-parent-dir>/<run-id>/
  run.json              # Run metadata, status, metrics, resume declaration
  baseline.snapshot.json  # SHA-256 digest of source at run start
  candidate/            # Materialized working copy (agent's workspace)
  staging/              # Temporary staging area (removed after finalization)
  artifact/
    manifest.json       # Full run metadata and change summary
    changes.patch       # Unified diff (text files only; binary files omitted)
    verification.json   # Verification seam output
    review.json         # Review seam output
    payload/            # Final candidate workspace files
    APPLY.md            # Manual apply instructions
```

### APPLY.md

`APPLY.md` explains that changes are **not applied automatically**. It includes the baseline
digest as a precondition so the apply can verify the source hasn't drifted before patching:

```
## Precondition

Baseline digest: sha256:<64 hex chars>

Verify before applying:
  specrunner snapshot verify --digest sha256:<...> <source-root>
```

## Revision identity

The profile uses a SHA-256 digest of the directory tree instead of a Git commit OID:

- Each file's content, mode, and path contribute to the digest.
- Symlinks are recorded by their link target (not followed).
- `.git/` is excluded by default.
- Any I/O failure → **fail-closed** (`unavailable`, never `"no change"`).

The baseline digest is captured before the agent runs; the candidate digest is captured after
verification. These two digests appear in `manifest.json` and bound every evidence record.

## Revision binding

Each seam (verification, review) is wrapped in a **revision-binding envelope** that:

1. Snapshots the candidate directory before the seam call.
2. Runs the seam.
3. Snapshots the candidate directory again.
4. Compares digests — if they differ, the run halts with `revision-drift`.

This ensures no file system mutation can be silently attributed to the wrong seam.

### Cross-phase digest check (step 8.5)

After both verification and review complete, the orchestrator asserts
`verificationBoundDigest === reviewBoundDigest`. A mismatch means the candidate was mutated
between the two seams and the run halts.

## Supported pipelines

Only pipelines that contain no git-dependent steps can run under `artifact-output`:

| Pipeline | Supported |
|----------|-----------|
| `design-only` | ✅ |
| `fast` | ❌ (contains `pr-create`) |
| `standard` | ❌ (contains `pr-create`) |

Use `specrunner guide artifact-output` for the quick reference.

## Unsupported operations

| Operation | Capability required | Why absent |
|-----------|---------------------|------------|
| PR creation / merge | `git-remote-publish`, `github-api` | No GitHub access |
| Branch checkpoint | `branch-borne-state`, `git-revision` | No Git repo |
| Commit adopt | `git-commit-attribution`, `git-revision` | No Git repo |
| Egress ledger | `git-commit-attribution`, `branch-borne-state` | No Git repo |
| Archive record | `git-commit-attribution`, `branch-borne-state` | No Git repo |
| Issue-linked entry | `github-api` | No GitHub access |
| Remote reattach | `git-remote-publish`, `github-api` | No GitHub access |
| `--from-issue` entry | `github-api` | No GitHub access |

Any attempt to use issue-linked entry (`--from-issue`, `issueLinked`) is rejected at preflight.

## Git denial at the spawn boundary

Agent subprocesses run under a **git-denying spawn wrapper**. Any attempt to call `git` or `gh`
from inside an agent subprocess throws an error explaining the boundary:

```
Error: git is not available in agent subprocess (artifact-output profile).
       This is not a git repository context.
```

## Resume

`artifact-output` runs **do not support resume**. `run.json` always contains:

```json
{
  "resume": { "supported": false, "reason": "artifact-output profile does not support resume" }
}
```

## Metrics

A completed run exposes:

| Field | Description |
|-------|-------------|
| `durationMs` | Wall-clock time from start to finalization |
| `entryCount` | Number of entries in the candidate snapshot |
| `scannedBytes` | Total bytes of candidate files |
| `artifactBytes` | Total bytes of the artifact/ directory |
| `payloadBytes` | Total bytes of artifact/payload/ |
| `patchLines` | Number of lines in `changes.patch` |

## Source immutability guard

After every phase (including failures), the orchestrator re-snapshots the source root and
compares it to the baseline digest. If the source was mutated, `run.json` is updated with a
`source-mutated` annotation and the run status is set to `failed`.

## Architecture constraints

The following constraints apply to all modules under `src/core/artifact-output/` and
`src/core/snapshot/`:

- **B-1**: No import from `src/adapter/**`.
- **B-12**: No direct `import` of `node:child_process`.
- **CWD ratchet**: No call to `process.cwd()`.
- **Git-free**: No import of `git-exec`, `core/worktree/**`, `github-client`, or `src/git/**`.

These are enforced by `tests/unit/architecture/artifact-output-git-free.test.ts`.
