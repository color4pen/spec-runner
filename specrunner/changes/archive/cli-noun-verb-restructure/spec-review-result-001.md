# Spec Review Result — cli-noun-verb-restructure

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-20

---

## Summary

Change folder contains all required artifacts (request.md, design.md, tasks.md, specs/, delta-specs/). The design is internally coherent and well-grounded in repo conventions (`gh` / `docker` noun-verb idiom, `ParentCommandDef` pattern reuse). However, two structural blockers prevent approval: (1) the delta spec format is split between `delta-specs/*.md` (non-canonical, never applied) and `specs/<cap>/spec.md` (canonical, but underspecified); (2) no `## Renamed` / `## Removed` sections exist in any capability delta, meaning the auto-classification merge will silently leave all legacy baseline Requirements intact alongside the new noun-verb ones — producing self-contradictory specs after archive. Fixes are mechanical and do not require design changes.

---

## Findings

| # | Severity | Area | Finding |
|---|----------|------|---------|
| F1 | CRITICAL | Delta spec coverage | `specs/cli-commands/spec.md` lacks individual `### Requirement:` blocks for `request new <slug>`, `request rm <slug>`, `job show` 6-field schema, and the `Aliases:` line in `--help`. These appear only inside prose tables or in `delta-specs/cli-commands.md` (non-canonical). ACs for slug-collision error, "Created: ..." stderr message, "Request not found" wording, and `job show` field enumeration are therefore not formally testable from the merged baseline. |
| F2 | CRITICAL | Delta spec auto-classification mismatch | Per `specs/spec-merge/spec.md` and `specs/delta-spec-rule/spec.md`, a `### Requirement: X` is classified as **modified** only when X matches a baseline header. No `## Renamed` or `## Removed` sections are present in any of the four capability deltas (`cli-commands`, `cli-finish-command`, `cli-resume-command`, `managed-cli-commands`). Result: all new Requirements are treated as ADDED, leaving every legacy `specrunner ps/run/finish/resume/managed/request create/request list` Requirement intact in the merged spec — contradicting the noun-verb refactor. |
| F3 | HIGH | Delta spec format duplication | Two parallel delta-spec layouts exist: `delta-specs/*.md` (legacy notation, content-rich) and `specs/<cap>/spec.md` (canonical, read by merge pipeline). `delta-specs/` is a dead artifact that is never applied. tasks.md Task 8 instructs updating `delta-specs/...` but this has no effect on the baseline. |
| F4 | HIGH | Coverage gap — `request generate` progress messages | The baseline Requirement `specrunner request create / specrunner request review は LLM 呼び出しの進捗を stderr に出力する` survives verbatim after merge (no `## Renamed` block). After archive, baseline says `request create` while the binary only accepts `request generate`. |
| F5 | HIGH | Coverage gap — `Aliases:` section in `--help` | The `### Requirement: specrunner --help は主語別グルーピングで表示される` block in `specs/cli-commands/spec.md` does not include the required `Aliases:` section showing `run`. Task 6 AC states "Aliases セクションに `run` が記載されている" but the spec does not enforce it. |
| F6 | HIGH | Legacy Requirement orphans — `specrunner run` preflight | The baseline has a Requirement: `specrunner run の preflight は GitHub token 取得元を info ログに出力する`. After merge (with no `## Renamed`), this Requirement survives with `specrunner run` wording while the top-level `run` is removed. Should be renamed to `specrunner job start ...` or explicitly `## Removed`. |
| F7 | HIGH | Security — slug path traversal | `request show`, `request rm`, `request new` resolve `slug` directly via path join (e.g., `path.join(cwd, ACTIVE_SUBDIR, slug, "request.md")`) with no slug validation. Inputs like `../../etc` or `..%2Fevil` (shell-decoded) escape `specrunner/requests/active/`. Particularly dangerous for `request rm` (recursive delete). Require a regex guard (e.g., `/^[a-z0-9][a-z0-9-]{0,63}$/`) or `path.resolve` containment check. Neither design.md nor specs mandate this. |
| F8 | MEDIUM | Security — `job rm <jobId>` character whitelist | `job rm` forwards `jobId` to `runRm()` which opens `jobs/<jobId>.json`. No explicit jobId character whitelist is stated in design.md. Lower risk than F7 (jobs are under `~/.local/share/specrunner`), but worth a one-line note. |
| F9 | MEDIUM | Worktree guard test coverage — `job show` / `job rm` | request.md AC line 143 says "`job ls` / `job rm` は linked worktree 内でも実行できる". The spec scenario at `specs/cli-commands/spec.md` covers only `job ls`; `job rm` worktree-allowed scenario is absent. `job show` worktree behavior is also unspecified. |
| F10 | MEDIUM | `request review --json` regression risk | The new umbrella Requirement for `request review <slug|file>` does not mention the `--json` flag already implemented in `command-registry.ts`. Task 2's `request` rewrite may silently drop it. |
| F11 | MEDIUM | `cli-resume-command` baseline Requirements survive with `specrunner resume` wording | `specs/cli-resume-command/spec.md` is a thin "RENAME only" narrative block. Without `## Renamed`, the 3 baseline Requirements about `--from` still read `specrunner resume`. |
| F12 | LOW | Task ordering — transient un-guarded state between Task 4 and Task 1 | Task 1 modifies `WORKTREE_GUARDED_COMMANDS` (removes `finish`/`resume`); Task 4 removes old top-level command entries. If Task 1 runs first, between Task 1 and Task 4 the top-level `finish`/`resume` exist without worktree guard — transient regression. Reorder Task 4 before Task 1 or batch them. |
| F13 | LOW | Help output wording inconsistency | request.md lists `runtime setup\|status\|reset` as one entry; `specs/cli-commands/spec.md:56` shows `Manage Anthropic runtime resources` but design AD-10 shows `Anthropic Managed Agents 管理`. Minor — align wording. |
| F14 | LOW | ADR path not in design.md | request.md AC requires ADR recording 5 judgments; tasks.md Task 10 specifies the ADR filename pattern. design.md does not reference the ADR path. Acceptable but worth aligning. |

---

## Requirements Mapping

| # | request.md AC | specs/ (canonical) | Status |
|---|---|---|---|
| 1 | `request new/generate/ls/show/rm/validate/template/review` work | umbrella Req exists; individual Reqs for `new`/`rm`/`show` missing | partial (F1) |
| 2 | `job start/ls/show/rm/resume/finish` work | umbrella Req exists; `job show` 6-field schema not in canonical | partial (F1) |
| 3 | `run <slug>` sole alias | `specs/cli-commands/spec.md:147-154` | covered |
| 4 | Old top-level `ps`/`rm`/`resume`/`finish` → `Unknown command` | new Req present; baseline old Reqs not removed | partial (F2) |
| 5 | `runtime setup/status/reset` works | `specs/managed-cli-commands/spec.md` new Req | partial (F2 — baseline `managed` Reqs survive) |
| 6 | Old `managed` → `Unknown command: managed` | covered in canonical | covered |
| 7 | `job start/resume/finish` worktree-guarded | `specs/cli-commands/spec.md:156-170` | covered |
| 8 | `job ls`/`job rm` work in linked worktree | `job ls` scenario exists; `job rm` absent | partial (F9) |
| 9 | `request review <slug>` resolves slug | `specs/cli-commands/spec.md:92-95` | covered |
| 10 | `job start <slug\|file>` accepts both | `specs/cli-commands/spec.md:122-130` | covered |
| 11 | `--help` subject-grouped | Req exists; `Aliases:` section missing | partial (F5) |
| 12 | README rewritten | tasks.md Task 7 | task-only (no spec) |
| 13–16 | 4 capability specs updated via delta | all have new-format canonical files; `## Renamed`/`## Removed` absent | partial (F2) |
| 17 | `request create` → `Unknown subcommand` | covered | covered |
| 18 | `request list` → `Unknown subcommand` | covered | covered |
| 19 | `request show <slug>` → stdout | scenario in canonical; no formal Req block | partial (F1) |
| 20 | `job show` 6-field output | scenario/table in canonical; no formal Req | partial (F1) |
| 21 | `job unknown` → error message | covered | covered |
| 22 | typecheck + test green | tasks.md Task 9 | task-only |
| 23 | ADR records 5 judgments | tasks.md Task 10 | task-only |

---

## Recommended Fixes

Fixes are mechanical — no design change required.

1. **Consolidate delta format**: move all content from `delta-specs/*.md` into `specs/<cap>/spec.md`; delete `delta-specs/`. (F3)
2. **Add `## Renamed` blocks** in all 4 capability deltas, mapping every baseline header that contains `specrunner finish` / `specrunner resume` / `specrunner run` / `specrunner ps` / `managed` / `request create` / `request list` to its new noun-verb form. (F2, F4, F11)
3. **Add `## Removed` blocks** for baseline Requirements that are genuinely gone (e.g., the `specrunner` バイナリは 6 つのサブコマンドを提供する umbrella, `specrunner run の preflight は...`). (F2, F6)
4. **Add individual `### Requirement:` blocks** for `request new`, `request rm`, `request show` output behavior, `job show` 6-field schema, and `Aliases:` line in `--help` to `specs/cli-commands/spec.md`. (F1, F5)
5. **Add slug validation requirement** to `specs/cli-commands/spec.md` and design.md: `request new/show/rm/validate/review` MUST reject slugs not matching `/^[a-z0-9][a-z0-9-]{0,63}$/` with exit code 2. Add corresponding task. (F7)
6. **Reorder tasks**: Task 4 (delete old top-level commands) must run before or atomically with Task 1 (update `WORKTREE_GUARDED_COMMANDS`) to avoid transient regression window. (F12)
7. **Add `job show`/`job rm` worktree-allowed scenarios** to spec and corresponding tests in Task 3. (F9)
8. **Preserve `--json` flag** for `request review` explicitly in the new Requirement and Task 2 scope. (F10)
