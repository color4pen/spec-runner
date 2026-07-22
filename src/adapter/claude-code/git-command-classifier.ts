/**
 * git-command-classifier.ts — permission-layer-git-write-denial
 *
 * Pure lexical classifier for git commands. Determines whether a shell command
 * (or compound command) contains a git state-mutation operation.
 *
 * Leaf module: no imports from src/ — pure lexical analysis only (TC-010).
 *
 * Design D2 (permission-layer-git-write-denial):
 *   - Splits on shell connectors (&&, ||, |, ;, &, newline) and classifies each segment.
 *   - Skips leading VAR=value env var assignments.
 *   - Skips git global options that take a separate value token
 *     (-C, -c, --git-dir, --work-tree, --namespace, --exec-path) and the --opt=value form.
 *   - Classifies subcommand against ALWAYS_MUTATING and CONDITIONAL lists.
 *   - If any segment is a mutation → whole command is mutation.
 *
 * Residual (not detected): shell variable expansion, redirects, editor-mediated writes.
 * These are caught by the commit layer (pipeline-sole-committer #893).
 */

/**
 * Verdict returned by classifyGitCommand.
 * - mutation: the command contains a git state-mutation operation.
 * - read-or-nongit: the command is read-only git or not a git command.
 */
export type GitCommandVerdict =
  | { kind: "mutation"; subcommand: string }
  | { kind: "read-or-nongit" };

/**
 * Git subcommands that always perform state mutation.
 *
 * Design D2 (permission-layer-git-write-denial) full list:
 * commit, commit-tree, push, add, reset, checkout, switch, restore, clean,
 * merge, rebase, cherry-pick, revert, rm, mv, am, apply, pull,
 * update-ref, update-index, filter-branch, fast-import, gc, prune.
 */
const ALWAYS_MUTATING = new Set([
  "commit",
  "commit-tree",
  "push",
  "add",
  "reset",
  "checkout",
  "switch",
  "restore",
  "clean",
  "merge",
  "rebase",
  "cherry-pick",
  "revert",
  "rm",
  "mv",
  "am",
  "apply",
  "pull",
  "update-ref",
  "update-index",
  "filter-branch",
  "fast-import",
  "gc",
  "prune",
]);

/**
 * Git subcommands with conditional behavior (read or write depending on flags/args).
 */
const CONDITIONAL = new Set(["branch", "tag", "stash", "remote"]);

/**
 * Read-only git subcommands (closed allowlist).
 *
 * Any git subcommand NOT in this set and NOT in CONDITIONAL is treated as a
 * mutation (deny). The original blocklist default (unknown → read) was fail-open:
 * `git config alias.p push` (config unclassified → allowed) followed by `git p`
 * (unknown alias → allowed) reached a direct push in two innocuous-looking
 * commands. Unknown-deny closes that class; newly needed read commands are added
 * here explicitly (the deny message tells the agent read-only git is available).
 */
const READ_ONLY = new Set([
  "status",
  "diff",
  "diff-tree",
  "diff-index",
  "log",
  "show",
  "show-ref",
  "rev-parse",
  "rev-list",
  "blame",
  "grep",
  "ls-files",
  "ls-tree",
  "ls-remote",
  "describe",
  "shortlog",
  "cat-file",
  "for-each-ref",
  "name-rev",
  "merge-base",
  "count-objects",
  "check-ignore",
  "check-attr",
  "var",
  "help",
  "version",
  "--version",
]);

/**
 * Git global options that take a separate value argument (space-separated form).
 * e.g., git -C /path commit  →  skip "-C" and "/path" to reach "commit".
 */
const GLOBAL_OPTS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
]);

/**
 * Split a compound shell command into individual segments on shell connectors.
 * Connectors: &&, ||, |, ;, &, newline.
 */
function splitSegments(command: string): string[] {
  return command.split(/&&|\|\||[|;&\n]/).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Naive whitespace tokenization (no quote handling beyond outer-quote stripping).
 */
function tokenize(segment: string): string[] {
  return segment.trim().split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Strip surrounding single or double quotes from a token.
 */
function stripQuotes(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

/**
 * Returns true if the token looks like a shell environment variable assignment (VAR=value).
 */
function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/**
 * Returns the basename (last path component after '/') of a string.
 */
function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

/**
 * Classify CONDITIONAL subcommands (branch, tag, stash) based on their trailing arguments.
 */
function classifyConditional(subcommand: string, remainingArgs: string[]): GitCommandVerdict {
  if (subcommand === "branch") {
    // No args → list → read
    if (remainingArgs.length === 0) return { kind: "read-or-nongit" };

    // Flags that always indicate a mutation operation on a branch (short and long forms).
    // Design D2 explicit list: -d/-D/--delete, -m/-M/--move, -c/-C/--copy, -f/--force,
    // -u/--set-upstream-to, --unset-upstream, --edit-description.
    // --set-upstream-to may appear as --set-upstream-to=<upstream> (=value form)
    // or as bare --set-upstream-to followed by a value token; both are covered here.
    const isBranchMutationFlag = (a: string): boolean =>
      ["-D", "-d", "-m", "-M", "-c", "-C", "-u", "-f"].includes(a) ||
      a === "--delete" ||
      a === "--move" ||
      a === "--copy" ||
      a === "--force" ||
      a === "--set-upstream-to" ||
      a.startsWith("--set-upstream-to=") ||
      a === "--unset-upstream" ||
      a === "--edit-description";

    // --list / -l → read (unless combined with a mutation flag)
    if (remainingArgs.some((a) => a === "--list" || a === "-l")) {
      if (remainingArgs.some(isBranchMutationFlag)) {
        return { kind: "mutation", subcommand };
      }
      return { kind: "read-or-nongit" };
    }

    // Deletion / move / rename / upstream flags → mutation
    if (remainingArgs.some(isBranchMutationFlag)) {
      return { kind: "mutation", subcommand };
    }

    // Read-only filter flags that consume one value token (the value is NOT a branch name).
    // e.g. git branch --contains abc123 → lists branches containing that commit (read).
    // Without this exception, the value token (abc123) would match the positional-arg
    // check below and produce a false-positive mutation verdict.
    const READ_FILTER_FLAGS = new Set([
      "--contains", "--no-contains",
      "--merged", "--no-merged",
      "--points-at", "--sort",
    ]);
    const consumedValueTokens = new Set<string>();
    for (let i = 0; i < remainingArgs.length - 1; i++) {
      const arg = remainingArgs[i]!;
      if (READ_FILTER_FLAGS.has(arg)) {
        const next = remainingArgs[i + 1]!;
        if (!next.startsWith("-")) consumedValueTokens.add(next);
      }
    }

    // Positional argument (branch name) → create → mutation
    // (tokens consumed as values of read-only filter flags are excluded)
    if (remainingArgs.some((a) => !a.startsWith("-") && !consumedValueTokens.has(a))) {
      return { kind: "mutation", subcommand };
    }

    return { kind: "read-or-nongit" };
  }

  if (subcommand === "tag") {
    // No args → list → read
    if (remainingArgs.length === 0) return { kind: "read-or-nongit" };
    // -l / --list → read
    if (remainingArgs.some((a) => a === "-l" || a === "--list")) {
      return { kind: "read-or-nongit" };
    }
    // Any flag (-a, -d, -f …) or positional arg (tag name) → mutation
    return { kind: "mutation", subcommand };
  }

  if (subcommand === "stash") {
    // Bare `git stash` → push (mutation)
    if (remainingArgs.length === 0) return { kind: "mutation", subcommand };
    const action = remainingArgs[0];
    // list / show → read
    if (action === "list" || action === "show") return { kind: "read-or-nongit" };
    // pop, drop, push, apply, branch, clear … → mutation
    return { kind: "mutation", subcommand };
  }

  if (subcommand === "remote") {
    // Bare `git remote` / -v → list → read; show / get-url → read.
    // add / remove / rename / set-url / prune / set-head … → mutation
    // (set-url could redirect a later pipeline push — treat every non-read form as mutation).
    if (remainingArgs.length === 0) return { kind: "read-or-nongit" };
    const first = remainingArgs[0]!;
    if (first === "-v" || first === "--verbose" || first === "show" || first === "get-url") {
      return { kind: "read-or-nongit" };
    }
    return { kind: "mutation", subcommand };
  }

  // CONDITIONAL exhausted — callers only reach here for subcommands in the set.
  return { kind: "mutation", subcommand };
}

/**
 * Classify a single shell segment as mutation or read/non-git.
 */
function classifySegment(segment: string): GitCommandVerdict {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return { kind: "read-or-nongit" };

  // Skip leading environment variable assignments (VAR=value)
  let idx = 0;
  while (idx < tokens.length && isEnvAssignment(tokens[idx]!)) {
    idx++;
  }
  if (idx >= tokens.length) return { kind: "read-or-nongit" };

  // The first remaining token must be `git` (or path ending with `/git`)
  const cmdToken = stripQuotes(tokens[idx]!);
  const cmdBase = basename(cmdToken);
  if (cmdBase !== "git") {
    return { kind: "read-or-nongit" };
  }
  idx++;

  // Parse git global options to find the subcommand
  while (idx < tokens.length) {
    const tok = tokens[idx]!;
    // --opt=value form: single token, skip
    if (tok.startsWith("--") && tok.includes("=")) {
      idx++;
      continue;
    }
    // Known options that consume the next token as their value
    if (GLOBAL_OPTS_WITH_VALUE.has(tok)) {
      idx += 2; // skip option + value
      continue;
    }
    // Other flags (single or double dash, no known value) → skip single token
    if (tok.startsWith("-")) {
      idx++;
      continue;
    }
    // First bare token is the subcommand
    break;
  }

  if (idx >= tokens.length) return { kind: "read-or-nongit" };

  const subcommand = tokens[idx]!;
  const remainingArgs = tokens.slice(idx + 1);

  if (ALWAYS_MUTATING.has(subcommand)) {
    return { kind: "mutation", subcommand };
  }

  if (CONDITIONAL.has(subcommand)) {
    return classifyConditional(subcommand, remainingArgs);
  }

  if (READ_ONLY.has(subcommand)) {
    return { kind: "read-or-nongit" };
  }

  // Unknown git subcommand → mutation (fail-closed allowlist inversion).
  // Unknown includes: config (alias-definition evasion vector), worktree, submodule,
  // notes, reflog, symbolic-ref, repack, and any user-defined alias. A blocklist
  // default here was the fail-open path to `git config alias.p push && git p`.
  return { kind: "mutation", subcommand };
}

/**
 * Classify a shell command (possibly compound with &&, ||, |, ;, etc.) as git mutation or not.
 *
 * Returns `{ kind: "mutation", subcommand }` if any segment contains a git state-mutation
 * operation. Returns `{ kind: "read-or-nongit" }` if all segments are read-only git or
 * non-git commands.
 *
 * Classification is conservative lexical: shell variable expansion, redirects, and
 * editor-mediated writes are NOT detected (residual — commit layer handles them).
 *
 * @param command - The shell command string (may include &&, ||, |, ;, etc.)
 */
export function classifyGitCommand(command: string): GitCommandVerdict {
  const segments = splitSegments(command);
  for (const segment of segments) {
    const verdict = classifySegment(segment);
    if (verdict.kind === "mutation") return verdict;
  }
  return { kind: "read-or-nongit" };
}
