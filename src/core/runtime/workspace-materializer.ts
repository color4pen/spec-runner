/**
 * WorktreeMaterializationPlan: discriminated union describing how to materialize
 * a worktree for a job. Each variant corresponds to one of the five setup arms
 * in LocalRuntime.setupWorkspace():
 *
 *   - "no-worktree"                      : opts.noWorktree === true; use cwd as-is
 *   - "resume-existing"                  : existingWorktreePath is present on disk
 *   - "resume-recreated"                 : existingWorktreePath was recorded but deleted
 *   - "resume-without-recorded-worktree" : existingWorktreePath === null (no record)
 *   - "new-run"                          : fresh run; fetch → create new worktree
 */
export type WorktreeMaterializationPlan =
  | { kind: "no-worktree" }
  | { kind: "resume-existing"; worktreePath: string }
  | { kind: "resume-recreated"; remoteBaseRef: string }
  | { kind: "resume-without-recorded-worktree"; remoteBaseRef: string }
  | { kind: "new-run"; remoteBaseRef: string; branchName?: string };
