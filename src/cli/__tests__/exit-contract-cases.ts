/**
 * Exit contract case definitions for cli-exit-contract.test.ts.
 *
 * Each case is pure data: `{ id, argv, setup }`.
 * The `setup` field describes how mocks should be configured for the case.
 * The harness (exit-contract-harness.ts) interprets the setup value.
 *
 * 23 cases covering all 11 exit-code classifications from the design:
 *   success-zero, primitive-nonzero, handler-usage-error, handler-semantic-error,
 *   flag-parse-error, specrunner-error-exit2, specrunner-error-exit1,
 *   unexpected-error, top-level-help, command-help, version, no-args,
 *   unknown-command, unknown-subcommand, needs-subcommand,
 *   worktree-guard, repo-guard, and various mutex-flag errors.
 */

export type SetupKind =
  | { kind: "archive-resolve"; value: number }
  | { kind: "archive-reject-specrunner-error"; code: string; hint: string; message: string; exitCode: number }
  | { kind: "archive-reject-plain"; message: string }
  | { kind: "worktree"; isWorktree: true; mainWorktreePath: string }
  | { kind: "no-repo" }
  | { kind: "none" };

export interface ExitContractCase {
  id: string;
  argv: string[];
  setup: SetupKind;
}

export const EXIT_CONTRACT_CASES: ExitContractCase[] = [
  {
    id: "EC-01-success-zero",
    argv: ["job", "archive", "my-slug"],
    setup: { kind: "archive-resolve", value: 0 },
  },
  {
    id: "EC-02-primitive-nonzero",
    argv: ["job", "archive", "my-slug"],
    setup: { kind: "archive-resolve", value: 7 },
  },
  {
    id: "EC-03-handler-usage-error",
    argv: ["job", "archive"],
    setup: { kind: "none" },
  },
  {
    id: "EC-04-handler-semantic-error",
    argv: ["request", "validate", "BAD_SLUG"],
    setup: { kind: "none" },
  },
  {
    id: "EC-05-flag-parse-error",
    argv: ["run", "--issue", "abc", "my-slug"],
    setup: { kind: "none" },
  },
  {
    id: "EC-06-specrunner-error-exit2",
    argv: ["job", "archive", "my-slug"],
    setup: {
      kind: "archive-reject-specrunner-error",
      code: "ARCHIVE_FAILED",
      hint: "check your slug",
      message: "archive failed",
      exitCode: 2,
    },
  },
  {
    id: "EC-07-specrunner-error-exit1",
    argv: ["job", "archive", "my-slug"],
    setup: {
      kind: "archive-reject-specrunner-error",
      code: "ARCHIVE_FAILED",
      hint: "check your repo",
      message: "archive failed with exit 1",
      exitCode: 1,
    },
  },
  {
    id: "EC-08-unexpected-error",
    argv: ["job", "archive", "my-slug"],
    setup: { kind: "archive-reject-plain", message: "boom" },
  },
  {
    id: "EC-09-top-level-help",
    argv: ["--help"],
    setup: { kind: "none" },
  },
  {
    id: "EC-10-command-help",
    argv: ["job", "archive", "--help"],
    setup: { kind: "none" },
  },
  {
    id: "EC-11-version",
    argv: ["--version"],
    setup: { kind: "none" },
  },
  {
    id: "EC-12-no-args",
    argv: [],
    setup: { kind: "none" },
  },
  {
    id: "EC-13-unknown-command",
    argv: ["nope"],
    setup: { kind: "none" },
  },
  {
    id: "EC-14-unknown-subcommand",
    argv: ["job", "nope"],
    setup: { kind: "none" },
  },
  {
    id: "EC-15-needs-subcommand",
    argv: ["request"],
    setup: { kind: "none" },
  },
  {
    id: "EC-16-worktree-guard",
    argv: ["job", "archive", "my-slug"],
    setup: { kind: "worktree", isWorktree: true, mainWorktreePath: "/main/repo" },
  },
  {
    id: "EC-17-repo-guard",
    argv: ["job", "stats"],
    setup: { kind: "no-repo" },
  },
  {
    id: "EC-18-start-from-issue-positional-exclusive",
    argv: ["job", "start", "--from-issue", "5", "my-slug"],
    setup: { kind: "none" },
  },
  {
    id: "EC-19-start-from-issue-issue-exclusive",
    argv: ["job", "start", "--from-issue", "5", "--issue", "3"],
    setup: { kind: "none" },
  },
  {
    id: "EC-20-start-detach-json-exclusive",
    argv: ["job", "start", "--detach", "--json", "my-slug"],
    setup: { kind: "none" },
  },
  {
    id: "EC-21-resume-from-issue-positional-exclusive",
    argv: ["job", "resume", "--from-issue", "5", "my-slug"],
    setup: { kind: "none" },
  },
  {
    id: "EC-22-archive-slug-from-issue-exclusive",
    argv: ["job", "archive", "my-slug", "--from-issue", "5"],
    setup: { kind: "none" },
  },
  {
    id: "EC-23-resume-missing-slug",
    argv: ["job", "resume"],
    setup: { kind: "none" },
  },
];
