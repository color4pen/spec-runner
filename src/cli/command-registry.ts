/**
 * Command registry for the specrunner CLI.
 * Single CommandSpec tree is the canonical source for parser / help / dispatch / guards.
 * No external dependencies.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { runInit } from "./init.js";
import { runManagedSetup, runManagedStatus, runManagedReset } from "./managed.js";
import { runLogin } from "./login.js";
import { runCredentialsSet, CREDENTIALS_SET_USAGE } from "./credentials.js";
import { runRun, runRunCore } from "./run.js";
import { runPs } from "./ps.js";
import { runDoctor } from "./doctor.js";
import { runArchive } from "./archive.js";
import { runAttach } from "./attach.js";
import { runCancel } from "./cancel.js";
import { runPrune } from "./prune.js";
import { runResume } from "./resume.js";
import { runReopen } from "./reopen.js";
import { runJobShow } from "./job-show.js";
import { runJobStats } from "../core/command/job-stats.js";
import { runInboxRun } from "./inbox.js";
import { runConfigEffective } from "./config-effective.js";
import { executeTemplate, executeValidate } from "../core/command/request.js";
import { executePrompt } from "../core/command/request-prompt.js";
import { executeList } from "../core/command/request-list.js";
import { executeNew } from "../core/command/request-new.js";
import { executeRulesNew } from "../core/command/rules-new.js";
import { executeReviewersNew } from "../core/command/reviewers-new.js";
import { showUsage } from "../core/command/usage-show.js";
import { showUsageSummary } from "../core/command/usage-summary.js";
import { resolveWithFallback as storeResolve } from "../core/request/store.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../core/step/step-names.js";
import { FlagParseError } from "./flag-parser.js";
import type { FlagDef, ParsedArgs } from "./flag-parser.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { logError, stderrWrite, resolveLogLevel } from "../logger/stdout.js";
import { SpecRunnerError, EXIT_CODE } from "../errors.js";
import type { CommandContext } from "./command-context.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { SLUG_REGEX } from "../util/validation-patterns.js";
import { isDetachedChild, detachSelf } from "../core/command/detach.js";
import { parseRequestMdRaw } from "../parser/request-md.js";
import { runJobWait } from "./job-wait.js";
import { runGuide, GUIDE_TOPICS } from "../core/command/guide.js";
import { runFromIssue } from "./from-issue.js";
import { runResumeFromIssue } from "./resume-from-issue.js";
import { runArchiveFromIssue } from "./archive-from-issue.js";
import { getOriginInfo } from "../git/remote.js";

/** Path-traversal guard for jobId; accepts full UUIDs and short prefixes. */
const VALID_JOB_ID_CHARS = /^[a-f0-9-]+$/;

// ---------------------------------------------------------------------------
// CommandSpec types (canonical)
// ---------------------------------------------------------------------------

export interface ArgSpec {
  name: string;
  required: boolean;
  count?: number;
}

export interface CommandHelp {
  /** Group header for top-level USAGE listing (e.g. "Job commands"). */
  group?: string;
  /** Text line(s) to include in top-level USAGE listing. */
  summary?: string;
  /** Full text for --help output. */
  detail?: string;
}

export type CommandHandler = (parsed: ParsedArgs, ctx?: CommandContext) => Promise<void>;

export interface CommandSpec {
  /** Full command path, e.g. ["job", "start"]. */
  path: string[];
  /** Short description. */
  summary: string;
  /** Flag definitions. */
  flags?: Record<string, FlagDef>;
  /** Positional argument definitions. */
  args?: ArgSpec[];
  /** Whether this command requires a git repo root. */
  requiresRepo?: boolean;
  /** Whether this command is rejected when CWD is inside a specrunner worktree. */
  worktreeGuard?: boolean;
  /** Visibility classification (audience metadata; not yet used for help grouping). */
  visibility?: "normal" | "operator" | "maintenance" | "repair" | "compatibility";
  /** If set, this is an alias for the given canonical path. */
  aliasOf?: string[];
  /** Help text for --help and top-level USAGE listing. */
  help?: CommandHelp;
  /** Handler function (undefined for pure-parent specs). */
  handler?: CommandHandler;
  /** Child subcommands. */
  children?: Record<string, CommandSpec>;
}

// ---------------------------------------------------------------------------
// Resolve / enumerate API
// ---------------------------------------------------------------------------

interface ResolveOk {
  status: "ok";
  spec: CommandSpec;
  /** Canonical path of the resolved spec (follows aliases). */
  canonicalPath: string[];
  /** Tokens the user actually typed (including alias name). */
  invokedAs: string[];
  /** Remaining args after the command path tokens. */
  restArgs: string[];
}
interface ResolveError {
  status: "unknown-command" | "unknown-subcommand" | "needs-subcommand";
  token?: string;
  parent?: string;
  availableChildren?: string[];
}
export type ResolveResult = ResolveOk | ResolveError;

/** Walk COMMANDS to find a spec at the given path. */
function specByPath(p: string[]): CommandSpec | undefined {
  let cur: CommandSpec | undefined = COMMANDS[p[0] ?? ""];
  for (let i = 1; i < p.length; i++) {
    cur = cur?.children?.[p[i]!];
  }
  return cur;
}

function resolveSpec(
  spec: CommandSpec,
  canonicalPath: string[],
  invokedAs: string[],
  restArgs: string[],
): ResolveResult {
  // Alias: redirect to target spec
  if (spec.aliasOf) {
    const target = specByPath(spec.aliasOf);
    if (!target) return { status: "unknown-command", token: invokedAs[0] };
    return { status: "ok", spec: target, canonicalPath: spec.aliasOf, invokedAs, restArgs };
  }

  // No children: leaf spec — consume all restArgs as positionals/flags
  if (!spec.children) {
    return { status: "ok", spec, canonicalPath, invokedAs, restArgs };
  }

  // Has children — check restArgs[0] for a child name
  const next = restArgs[0];
  if (next && !next.startsWith("-")) {
    const child = spec.children[next];
    if (child) {
      return resolveSpec(child, [...canonicalPath, next], [...invokedAs, next], restArgs.slice(1));
    }
    // next is not a child name
    if (spec.handler) {
      // default-action node (e.g. doctor): treat next as positional
      return { status: "ok", spec, canonicalPath, invokedAs, restArgs };
    }
    return {
      status: "unknown-subcommand",
      token: next,
      parent: canonicalPath[0],
      availableChildren: Object.keys(spec.children),
    };
  }

  // restArgs[0] is missing or a flag (starts with -)
  if (spec.handler) {
    return { status: "ok", spec, canonicalPath, invokedAs, restArgs };
  }
  return {
    status: "needs-subcommand",
    parent: canonicalPath[0],
    availableChildren: Object.keys(spec.children),
  };
}

/**
 * Resolve a token array (process.argv.slice(2)) to a CommandSpec and metadata.
 * Handles aliases and children. Returns an error result for unknown/missing commands.
 */
export function resolveCommand(tokens: string[]): ResolveResult {
  const name = tokens[0];
  if (!name) return { status: "unknown-command", token: "" };
  const spec = COMMANDS[name];
  if (!spec) return { status: "unknown-command", token: name };
  return resolveSpec(spec, [name], [name], tokens.slice(1));
}

/**
 * Resolve the effective requiresRepo for a command path, supporting parent→child inheritance.
 * Walks the path from root to leaf; the most-specific (deepest) explicit value wins.
 * If no node in the path has an explicit value, returns false.
 * Exported for testing (TC-010/TC-011) and used by dispatch.
 */
export function resolveEffectiveRequiresRepo(
  registry: Record<string, CommandSpec>,
  path: string[],
): boolean {
  let cur: CommandSpec | undefined;
  let effective = false;
  for (let i = 0; i < path.length; i++) {
    const name = path[i]!;
    cur = i === 0 ? registry[name] : cur?.children?.[name];
    if (!cur) break;
    if (cur.requiresRepo !== undefined) effective = cur.requiresRepo;
  }
  return effective;
}

/**
 * Enumerate all executable command paths from the registry.
 * By default returns only canonical paths. Pass `{ includeAliases: true }` to include aliases.
 */
export function listCommandPaths(opts?: { includeAliases?: boolean }): string[][] {
  const result: string[][] = [];
  for (const [name, spec] of Object.entries(COMMANDS)) {
    collectPaths(spec, [name], opts ?? {}, result);
  }
  return result;
}

function collectPaths(
  spec: CommandSpec,
  currentPath: string[],
  opts: { includeAliases?: boolean },
  result: string[][],
): void {
  if (spec.aliasOf) {
    if (opts.includeAliases) result.push(currentPath);
    return;
  }
  // Executable (leaf or default-action)
  if (spec.handler) result.push(currentPath);
  // Recurse into children
  if (spec.children) {
    for (const [childName, child] of Object.entries(spec.children)) {
      collectPaths(child, [...currentPath, childName], opts, result);
    }
  }
}

// ---------------------------------------------------------------------------
// Usage constants (kept as exports for tests that import them directly)
// ---------------------------------------------------------------------------

export const RULES_USAGE = `Usage: specrunner rules new <step-name> <rule-slug>

Scaffold a step-specific rules file at specrunner/rules/<step-name>/<NN>-<rule-slug>.md.

Arguments:
  <step-name>   Agent step name (see valid steps below)
  <rule-slug>   Kebab-case identifier for the rule (e.g. no-inline-comment)

Valid agent step names:
  ${AGENT_STEP_NAMES.join(", ")}

  Note: CLI steps (verification, pr-create) are not accepted
  because the executor ignores rules for CLI steps.

Numbering:
  Files are numbered automatically with a 2-digit zero-padded prefix (01-, 02-, ...).
  The prefix is determined by scanning existing files and using max + 1.
  An empty directory starts at 01-.

Template:
  The generated file includes a leading comment explaining the rules format,
  and three recommended sections:
    ## やめてほしいこと  (what to avoid)
    ## こうしてほしいこと (what to do instead)
    ## 例外             (exceptions)
  These headings are suggestions — the CLI does not enforce them.

Ordering:
  The numeric prefix determines follow-up execution order (ascending).
  Tip: place your most important rules last to leverage recency bias.

Delivery:
  Each rule file may declare a delivery mode in its YAML frontmatter:

    ---
    delivery: followup
    ---

  delivery: followup (default)
    The rule is delivered as a post-work follow-up prompt after the main
    work turn completes. Use for post-hoc verification and style checks.

  delivery: prompt
    The rule is injected into the main work prompt before the agent starts,
    after artifacts and resume context but before the completion directive.
    Use for behavioral constraints that must be active during the work turn
    (e.g. forbidden commands, off-limits files, mandatory tool usage).

  Files without a delivery frontmatter default to followup (backward compat).
  An unknown delivery value causes the step to fail before the agent starts.

Examples:
  specrunner rules new implementer no-inline-comment
  specrunner rules new code-review prefer-explicit-types

Options:
  --help, -h    Show this help message
`;

export const REVIEWERS_USAGE = `Usage: specrunner reviewers new <name>

Scaffold a custom reviewer definition file at specrunner/reviewers/<name>.md.

Arguments:
  <name>   Reviewer name (lowercase alphanumeric, hyphens, underscores; must start with a letter or digit)

The generated file includes:
  - Frontmatter with name, maxIterations, and commented-out activation conditions
  - Required sections: ## 目的 / ## 観点 / ## 判定基準

Activation conditions (optional — add to frontmatter to enable selective activation):
  paths:         glob patterns for changed files (at least one must match)
  requestTypes:  request types that activate this reviewer

Examples:
  specrunner reviewers new security
  specrunner reviewers new perf-check

Options:
  --help, -h    Show this help message
`;

export const RUNTIME_RESET_USAGE = `Usage: specrunner runtime reset [--force]

Delete the Anthropic Environment from the provider and clear managed config.

Note: Anthropic-side agent resources are NOT deleted (no agent delete API available)
      and remain as orphans on the provider side.

Options:
  --force   Skip confirmation prompt (including when runtime is not managed)
  --help    Show this help message
`;

export const NO_DETAILED_HELP_USAGE = "No detailed help available.\nRun 'specrunner --help' for the command list.\n";

export const JOB_RESUME_USAGE = `Usage: specrunner job resume <slug> [options]
       specrunner job resume --from-issue <n> [options]

Resume a halted or awaiting-resume job.

Arguments:
  <slug>              Job slug to resume. Resolved by slug first; if not found,
                      falls back to a short Job ID prefix.
                      Mutually exclusive with --from-issue.

Options:
  --from-issue <n>    Locate the resumable job by GitHub issue number instead of slug.
                      Locator resolution: scans issue comments for the latest escalation
                      marker (→ jobId), then enumerates Development-linked branches and
                      confirms identity by matching jobId / issueNumber / branch name in
                      the branch-borne checkpoint. Rebind is performed automatically when
                      no local job state is found. Mutually exclusive with positional <slug>.
                      When no Development-linked branch is found, use:
                        specrunner job attach --branch <branch>
                        specrunner job resume <slug>
  --from <step>       Override the start step (default: recorded resumePoint step).
                      Valid steps: ${[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")}
                      Note: jobs with custom reviewers also accept: regression-gate,
                      custom-reviewers, or reviewer member names (member names are
                      mapped to the custom-reviewers coordinator).
                      Note: bite-evidence is an internal step not intended for regular
                      operator use.
  --force             Override the 3× consecutive escalation guard and resume anyway.
  --verbose           More detailed log output.
  --quiet             Suppress informational log output.
  --prompt <text>     Inject operator guidance into the agent context at resume.
                      ⚠  Do not pass untrusted external input directly.
                      Mutually exclusive with --prompt-file.
  --prompt-file <path>  Read operator guidance from a file (alternative to --prompt).
                      Mutually exclusive with --prompt.
  --json              Output structured JSON result. Mutually exclusive with --detach.
  --no-worktree       Resume without a git worktree.
  --apply-canon       Commit dirty protected canon paths as an operator-apply commit
                      before resuming. Required (fail-closed) when you have edited
                      protected canon files (e.g. spec.md, design.md) and want to adopt
                      the changes into the synthesized-commits ledger.
  --adopt-commits     Adopt publish-range commits not in the synthesized-commits ledger
                      before resuming. Required (fail-closed) when you have made commits
                      to the worktree branch outside the pipeline.
  --wontfix <indices> Mark regression-gate findings as wontfix (comma-separated 1-based indices,
                      e.g. --wontfix 1,3). Requires --wontfix-reason. Exits with code 2 if
                      the gate has not run, indices are out of range, or reason is missing.
  --wontfix-reason <text>
                      Mandatory reason for the wontfix disposition. Required when --wontfix
                      is specified.
  --detach            Start resume in detached mode. Parent waits until the job is registered
                      (or reports a start failure), then exits. Use
                      'job wait <slug>' to monitor progress. Mutually exclusive with --json.
  --help, -h          Show this help message.

Mutually exclusive pairs:
  --detach     /  --json         (only one output mode can be active at a time)
  --prompt     /  --prompt-file  (only one operator guidance source at a time)
  --from-issue /  <slug>         (only one job locator at a time)
`;

export const INBOX_RUN_USAGE = `Usage: specrunner inbox run [options]

Scan GitHub issues for approval-labeled and /resume-triggered events.
Starts new jobs from approved issues and resumes awaiting-resume jobs.
Exits after one pass. Does not run as a daemon.

Options:
  --dry-run          Show what would happen without executing any effects
  --limit <n>        Override inbox.maxStartsPerRun config for this run (0 = no new starts)
  --json             Output structured JSON result
  --verbose          More detailed output
  --quiet            Suppress informational output
  --help, -h         Show this help message
`;

export const CONFIG_EFFECTIVE_USAGE = `Usage: specrunner config effective [options]

Show each standard agent step's effective model, maxTurns, timeoutMs, and the source
that supplied each value. Deterministic CLI-only steps are not listed.

Options:
  --type <requestType>  Resolve byRequestType entries for a request type
  --json                Output stable JSON with full source metadata
  --help, -h            Show this help message

Request types:
  new-feature, bug-fix, spec-change, refactoring, chore

Note: managed runtime ignores configured model for execution, but this command still
shows the configured effective value.
`;

export const LOGIN_USAGE = `Usage: specrunner login [options]

Authenticate with GitHub via Device Flow and store the token in
~/.config/specrunner/credentials.json (0600).

If a valid GitHub token is already present (from GH_TOKEN / GITHUB_TOKEN env
or 'gh auth login'), the Device Flow is skipped automatically.

For headless Claude Code or Anthropic API key storage, use:
  specrunner credentials set claude-code
  specrunner credentials set anthropic-api-key

Options:
  --force       Always run the Device Flow even when a valid token exists
  --help, -h    Show this help message
`;

export const PRUNE_USAGE = `Usage: specrunner job prune [options]

Remove orphan worktrees and orphan sidecar directories that have no associated
non-terminal job state. This cleans up resources left behind when a process died
or a job was archived/canceled.

  Orphan worktrees: directories under .git/specrunner-worktrees/ with no active job.
  Orphan sidecars:  directories under .specrunner/local/ for archived, canceled,
                    or otherwise missing jobs.

By default runs as a dry-run (lists orphans without deleting). Use --force to delete.

Worktrees with uncommitted or unpushed changes are always skipped (even with --force).
Active job sidecars (running / awaiting-* / failed / terminated) are never touched.

Options:
  --force     Delete orphan worktrees and sidecar directories (default: dry-run)
  --help, -h  Show this help message
`;

export const ARCHIVE_USAGE = `Usage: specrunner job archive <slug> [options]
       specrunner job archive --from-issue <n> [options]

Archive the completed change folder, remove worktree, and update job status.

Plain archive (without --with-merge): pushes an archive record commit to the feature branch
and leaves the job in awaiting-archive until the PR is merged. After the PR is merged,
re-run the same command to complete the transition (archived status + worktree cleanup).

Use --with-merge to wait for CI, merge the PR, and complete the full cleanup in one step.

Arguments:
  <slug>            Slug of the request to archive.

Options:
  --from-issue <n>       Issue number to archive from (finds completed marker and closing PR).
                         Mutually exclusive with <slug>: specify exactly one.
  --with-merge           Wait for PR checks to pass, merge, then archive
  --merge-wait-ms <ms>   Override the wait timeout for --with-merge (in milliseconds).
                         For unlimited wait, set archive.mergeWaitTimeoutMs: null in config.
  --help, -h             Show this help message

Note: <slug> and --from-issue are mutually exclusive. Specify exactly one.
`;

export const REOPEN_USAGE = `Usage: specrunner job reopen <slug> --from <step> --reason <text> [options]

Reopen an awaiting-archive job and restart the pipeline from the specified step.
The associated PR must be OPEN (not merged or closed).

This is an operator-scoped action: --from and --reason are both required.
Prior evidence (steps, artifacts, reviewer statuses) is preserved; new iterations
are appended without overwriting existing results.

Arguments:
  <slug>              Slug of the job to reopen (required).

Options:
  --from <step>       Pipeline step to restart from (required).
                      Valid steps: ${[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")}
                      Note: jobs with custom reviewers also accept: regression-gate,
                      custom-reviewers, or reviewer member names (member names are
                      mapped to the custom-reviewers coordinator).
  --reason <text>     Operator rationale for the reopen (required, recorded in journal).
  --verbose           More detailed output
  --quiet             Suppress informational output
  --json              Output structured JSON result
  --no-worktree       Run without a git worktree
  --help, -h          Show this help message
`;

export const DOCTOR_USAGE = `Usage: specrunner doctor [options]

Diagnose environment, configuration, and authentication prerequisites.
Runs all checks and reports pass/warn/fail per check with hints for remediation.

Options:
  --json      Output results as machine-readable JSON (schema: { summary, results[] })
  --help, -h  Show this help message
`;

// ---------------------------------------------------------------------------
// resolveSlugForDetach (kept in this file per handler-in-registry constraint)
// ---------------------------------------------------------------------------

function resolveSlugForDetach(input: string, cwd: string): string | null {
  if (SLUG_REGEX.test(input)) return input;

  const absPath = path.resolve(cwd, input);
  if (fs.existsSync(absPath)) {
    try {
      const content = fs.readFileSync(absPath, "utf-8");
      const raw = parseRequestMdRaw(content, absPath);
      if (raw.slug && SLUG_REGEX.test(raw.slug)) return raw.slug;
    } catch {
      // ignore — fall through
    }
  }

  try {
    const resolved = storeResolve(cwd, input);
    if (fs.existsSync(resolved)) {
      const content = fs.readFileSync(resolved, "utf-8");
      const raw = parseRequestMdRaw(content, resolved);
      if (raw.slug && SLUG_REGEX.test(raw.slug)) return raw.slug;
    }
  } catch {
    // ignore
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared flag sets
// ---------------------------------------------------------------------------

const RUN_JOB_FLAGS = {
  verbose: { type: "boolean" },
  quiet: { type: "boolean" },
  json: { type: "boolean" },
  "no-worktree": { type: "boolean" },
  issue: { type: "integer", min: 1 },
  detach: { type: "boolean" },
  "from-issue": { type: "integer", min: 1 },
} as const satisfies Record<string, FlagDef>;

// ---------------------------------------------------------------------------
// Shared handler (job start / run alias)
// ---------------------------------------------------------------------------

async function runJobHandler(parsed: ParsedArgs, ctx?: CommandContext): Promise<void> {
  const fromIssue = typeof parsed.flags["from-issue"] === "number" ? parsed.flags["from-issue"] : undefined;
  const hasPositional = parsed.positional !== undefined;

  // --- Presence check: need exactly one of positional or --from-issue ---
  if (fromIssue === undefined && !hasPositional) {
    logError("Usage error: 'job start' requires a <slug|file> positional or --from-issue <n>");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  // --- Exclusivity: --from-issue + positional ---
  if (fromIssue !== undefined && hasPositional) {
    logError("Usage error: --from-issue and positional <slug|file> are mutually exclusive");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  // --- Exclusivity: --from-issue + --issue ---
  if (fromIssue !== undefined && parsed.flags["issue"] !== undefined) {
    logError("Usage error: --from-issue and --issue are mutually exclusive (--from-issue includes issue linkage)");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  if (parsed.flags["detach"] && parsed.flags["json"]) {
    logError("--detach and --json are mutually exclusive");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  // --- Route --from-issue before generic detach branch ---
  if (fromIssue !== undefined) {
    const logLevel = resolveLogLevel({
      quiet: !!parsed.flags["quiet"],
      verbose: !!parsed.flags["verbose"],
      debug: !!parsed.flags["debug"],
    });
    const code = await runFromIssue(
      fromIssue,
      { detach: !!parsed.flags["detach"], logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] },
      ctx,
    );
    process.exit(code);
  }

  // --- Positional path (confirmed present) ---
  const requestMdPath = parsed.positional!;

  if (parsed.flags["detach"] && !isDetachedChild(process.env as Record<string, string | undefined>)) {
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    const slug = resolveSlugForDetach(requestMdPath, ctx?.repoRoot ?? process.cwd());
    if (!slug) {
      logError(`Cannot resolve slug from '${requestMdPath}'. Provide a valid slug or request.md path with --detach.`);
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    const code = await detachSelf({
      args: process.argv.slice(2),
      repoRoot,
      slug,
      env: process.env as Record<string, string | undefined>,
    });
    process.exit(code);
  }

  const logLevel = resolveLogLevel({
    quiet: !!parsed.flags["quiet"],
    verbose: !!parsed.flags["verbose"],
    debug: !!parsed.flags["debug"],
  });
  // --issue is now validated as integer by the parser (min: 1)
  const issue = typeof parsed.flags["issue"] === "number" ? parsed.flags["issue"] : undefined;

  // Positional + --issue: route through issue-target for Development linked branch registration
  if (issue !== undefined) {
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    let config;
    try {
      config = await loadConfigWithOverlay(repoRoot, repoRoot);
    } catch (err) {
      logError(`Failed to load config: ${(err as Error).message}`);
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    const githubHost = resolveGitHubHost(config.github);
    const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
    let githubToken: string;
    try {
      const result = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
      githubToken = result.token;
    } catch (err) {
      logError(`Failed to resolve GitHub token: ${(err as Error).message}`);
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    let owner: string;
    let repo: string;
    try {
      const origin = await getOriginInfo(repoRoot, githubHost);
      owner = origin.owner;
      repo = origin.name;
    } catch (err) {
      logError(`Failed to resolve git origin: ${(err as Error).message}`);
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);
    const { startWithIssueLink } = await import("../core/issue-target/start.js");
    const code = await startWithIssueLink({
      repoRoot,
      requestMdPath,
      issueNumber: issue,
      githubClient,
      owner,
      repo,
      // Closure carries the CLI flags (logLevel / json / no-worktree) so the issue-target
      // route preserves the same runRunCore contract as the plain positional route.
      startPrimitive: (path, opts) =>
        runRunCore(path, { ...opts, logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] }),
    });
    process.exit(code);
  }

  await runRun(requestMdPath, { logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] });
}

// ---------------------------------------------------------------------------
// USAGE generation
// ---------------------------------------------------------------------------

function generateTopLevelUsage(): string {
  const groups: Record<string, string[]> = {};
  const groupOrder = [
    "Request commands",
    "Job commands",
    "Rules commands",
    "Reviewer commands",
    "Environment commands",
    "Inbox commands",
    "Aliases",
    "Guide",
  ];

  function collect(spec: CommandSpec): void {
    if (spec.help?.group && spec.help?.summary) {
      const g = spec.help.group;
      (groups[g] ??= []).push(spec.help.summary);
    }
    if (spec.children) {
      for (const child of Object.values(spec.children)) collect(child);
    }
  }
  for (const spec of Object.values(COMMANDS)) collect(spec);

  const lines: string[] = ["Usage: specrunner <command> [options]", ""];
  for (const g of groupOrder) {
    const entries = groups[g];
    if (!entries?.length) continue;
    lines.push(`${g}:`);
    for (const entry of entries) lines.push(entry);
    lines.push("");
  }
  lines.push("Options:");
  lines.push("  --help, -h    Show this help message");
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// COMMANDS registry (CommandSpec tree)
// ---------------------------------------------------------------------------

export const COMMANDS: Record<string, CommandSpec> = {
  init: {
    path: ["init"],
    summary: "config scaffold",
    flags: {
      runtime: { type: "string", values: ["managed", "local"] as const },
      provider: { type: "string", values: ["anthropic", "openai"] as const },
    },
    requiresRepo: true,
    visibility: "normal",
    help: {
      group: "Environment commands",
      summary: "  init                            config scaffold",
    },
    handler: async (parsed, ctx) => {
      const runtimeRaw = parsed.flags["runtime"] as string | undefined;
      const runtime = runtimeRaw as "managed" | "local" | undefined;
      const providerRaw = parsed.flags["provider"] as string | undefined;
      const provider = providerRaw as "anthropic" | "openai" | undefined;
      process.exit(await runInit({ runtime, provider, repoRoot: ctx!.repoRoot! }));
    },
  },

  login: {
    path: ["login"],
    summary: "GitHub Device Flow OAuth",
    flags: {
      force: { type: "boolean" },
      provider: {
        type: "string",
        deprecated: {
          message: (value?: string): string => {
            if (value === "github") {
              return "specrunner login is now GitHub-only. The --provider flag is no longer needed. Run: specrunner login";
            }
            if (value === "claude") {
              return "specrunner login is GitHub-only now. To store a Claude Code token for headless runs, use: specrunner credentials set claude-code";
            }
            return "specrunner login is GitHub-only. The --provider flag has been removed.";
          },
        },
      },
    },
    visibility: "normal",
    help: {
      group: "Environment commands",
      summary: "  login                           GitHub Device Flow OAuth",
      detail: LOGIN_USAGE,
    },
    handler: async (parsed) => {
      process.exit(await runLogin({ force: !!parsed.flags["force"] }));
    },
  },

  credentials: {
    path: ["credentials"],
    summary: "Credential management",
    visibility: "normal",
    children: {
      set: {
        path: ["credentials", "set"],
        summary: "Store a credential",
        flags: {},
        args: [{ name: "name", required: true }],
        visibility: "normal",
        help: {
          group: "Environment commands",
          summary: "  credentials set <name>          headless 用 credential を credentials.json(0600) に保存",
          detail: CREDENTIALS_SET_USAGE,
        },
        handler: async (parsed) => {
          const name = parsed.positional!;
          process.exit(await runCredentialsSet(name));
        },
      },
    },
  },

  /** Alias: job start */
  run: {
    path: ["run"],
    summary: "job start の互換 alias",
    aliasOf: ["job", "start"],
    visibility: "compatibility",
    help: {
      group: "Aliases",
      summary: "  run <slug|file>                 job start の互換 alias\n  run <slug|file> --detach        agent session 向け: 登録完了まで待機後に return (job wait で監視)",
    },
  },

  request: {
    path: ["request"],
    summary: "Request management commands",
    visibility: "normal",
    children: {
      new: {
        path: ["request", "new"],
        summary: "Create a request",
        flags: {
          type: { type: "string" },
        },
        args: [{ name: "slug", required: true }],
        requiresRepo: true,
        visibility: "normal",
        help: {
          group: "Request commands",
          summary: "  request new <slug>              template から request.md を作る",
        },
        handler: async (parsed, ctx) => {
          const slug = parsed.positional!;
          const requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature";
          process.exit(await executeNew(slug, requestType, ctx!.repoRoot!));
        },
      },
      prompt: {
        path: ["request", "prompt"],
        summary: "Output request creation prompt",
        flags: {},
        visibility: "normal",
        help: {
          group: "Request commands",
          summary: "  request prompt                  起票プロンプトを stdout に出力（セッションへの知識注入）",
        },
        handler: async () => {
          process.exit(executePrompt());
        },
      },
      ls: {
        path: ["request", "ls"],
        summary: "List active requests",
        flags: {},
        visibility: "normal",
        help: {
          group: "Request commands",
          summary: "  request ls                      active 配下の request 一覧",
        },
        handler: async () => {
          process.exit(await executeList(process.cwd()));
        },
      },
      template: {
        path: ["request", "template"],
        summary: "Print request template",
        flags: {
          type: { type: "string" },
        },
        visibility: "normal",
        help: {
          group: "Request commands",
          summary: "  request template                雛形 markdown を stdout",
        },
        handler: async (parsed) => {
          const requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature";
          process.exit(executeTemplate(requestType));
        },
      },
      validate: {
        path: ["request", "validate"],
        summary: "Validate a request file",
        flags: {},
        args: [{ name: "file-or-slug", required: true }],
        visibility: "normal",
        help: {
          group: "Request commands",
          summary: "  request validate <file|slug>    構文 / 規律 check",
        },
        handler: async (parsed) => {
          const input = parsed.positional!;
          let filePath = path.resolve(process.cwd(), input);
          if (!fs.existsSync(filePath)) {
            if (!SLUG_REGEX.test(input)) {
              logError(`Invalid slug '${input}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/`);
              process.exit(2);
            }
            const slugResolved = storeResolve(process.cwd(), input);
            if (!fs.existsSync(slugResolved)) {
              logError(`'${input}' is neither a file path nor an active request slug.`);
              stderrWrite("Hint: Use 'specrunner request ls' to see available slugs.");
              process.exit(1);
            }
            filePath = slugResolved;
          }
          process.exit(await executeValidate(filePath));
        },
      },
    },
  },

  job: {
    path: ["job"],
    summary: "Job management commands",
    visibility: "normal",
    children: {
      start: {
        path: ["job", "start"],
        summary: "Start a job",
        flags: RUN_JOB_FLAGS,
        args: [{ name: "slug|file", required: false }],
        worktreeGuard: true,
        visibility: "normal",
        help: {
          group: "Job commands",
          summary: "  job start <request-slug|file>   pipeline 開始、jobId 発行\n  job start ... --detach          agent session 向け: 登録完了まで待機後に return (job wait で監視)\n  job start ... --issue <number>  起点 issue に紐付け (terminal 時にコメント通知)\n  job start --from-issue <n>      issue 本文を request として直接起動 (fidelity skip・base-branch guard・--issue/positional 排他)",
        },
        handler: runJobHandler,
      },
      ls: {
        path: ["job", "ls"],
        summary: "List jobs",
        flags: {
          active: { type: "boolean" },
          all: { type: "boolean" },
          status: { type: "string", values: ["running", "awaiting-resume", "awaiting-archive", "failed", "terminated", "archived", "canceled"] as const },
          json: { type: "boolean" },
        },
        visibility: "normal",
        help: {
          group: "Job commands",
          summary: "  job ls [--json]                 全 job 一覧（区分付き運用ビュー）",
        },
        handler: async (parsed, ctx) => {
          let githubClient = null;
          try {
            let githubHost = "github.com";
            let githubApiBaseUrl = "https://api.github.com";
            try {
              const cfg = await loadConfigWithOverlay();
              githubHost = resolveGitHubHost(cfg.github);
              githubApiBaseUrl = resolveGitHubApiBaseUrl(cfg.github);
            } catch {
              // Config not available — use defaults
            }
            const { token } = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
            githubClient = createGitHubClient(fetch, token, githubApiBaseUrl);
          } catch {
            // No token available — PR merge check will be skipped
          }
          process.exit(await runPs(
            {
              active: !!parsed.flags["active"],
              all: !!parsed.flags["all"],
              status: parsed.flags["status"] as string | undefined,
              json: !!parsed.flags["json"],
              repoRoot: ctx!.repoRoot ?? ctx!.invokerCwd,
            },
            githubClient,
          ));
        },
      },
      show: {
        path: ["job", "show"],
        summary: "Show job state",
        flags: {},
        args: [{ name: "jobId|slug", required: true }],
        visibility: "normal",
        help: {
          group: "Job commands",
          summary: "  job show <jobId|slug>           job state 詳細",
        },
        handler: async (parsed, ctx) => {
          process.exit(await runJobShow(
            parsed.positional!,
            { repoRoot: ctx?.repoRoot ?? ctx?.invokerCwd },
          ));
        },
      },
      wait: {
        path: ["job", "wait"],
        summary: "Wait for a job to settle",
        flags: {},
        args: [{ name: "slug", required: true }],
        visibility: "normal",
        help: {
          group: "Job commands",
          summary: "  job wait <slug>                 job が settle するまで block (process-death gate)",
        },
        handler: async (parsed, ctx) => {
          const slug = parsed.positional;
          if (!slug) {
            stderrWrite("Error: 'job wait' requires a <slug> argument.");
            process.exit(EXIT_CODE.ARG_ERROR);
          }
          const repoRoot = ctx?.repoRoot ?? process.cwd();
          process.exit(await runJobWait(slug, { repoRoot }));
        },
      },
      cancel: {
        path: ["job", "cancel"],
        summary: "Cancel a job",
        flags: {
          force: { type: "boolean" },
          purge: { type: "boolean" },
          "all-terminated": { type: "boolean" },
          yes: { type: "boolean" },
          "restore-draft": { type: "boolean" },
        },
        args: [{ name: "jobId", required: false }],
        requiresRepo: true,
        visibility: "normal",
        help: {
          group: "Job commands",
          summary: "  job cancel <jobId>              job を cancel して cleanup (--restore-draft で request.md を drafts/ へ復元)",
        },
        handler: async (parsed, ctx) => {
          const jobId = parsed.positional;
          if (jobId !== undefined && !VALID_JOB_ID_CHARS.test(jobId)) {
            logError("invalid jobId format");
            process.exit(EXIT_CODE.ARG_ERROR);
          }
          // SpecRunnerError propagates to bin/specrunner.ts unified catch
          process.exit(
            await runCancel({
              jobId,
              force: !!parsed.flags["force"],
              purge: !!parsed.flags["purge"],
              allTerminated: !!parsed.flags["all-terminated"],
              yes: !!parsed.flags["yes"],
              restoreDraft: !!parsed.flags["restore-draft"],
              repoRoot: ctx!.repoRoot!,
            }),
          );
        },
      },
      resume: {
        path: ["job", "resume"],
        summary: "Resume a halted job",
        flags: {
          from: { type: "string" },
          force: { type: "boolean" },
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
          prompt: { type: "string" },
          "prompt-file": { type: "string" },
          json: { type: "boolean" },
          "no-worktree": { type: "boolean" },
          "apply-canon": { type: "boolean" },
          "adopt-commits": { type: "boolean" },
          detach: { type: "boolean" },
          "from-issue": { type: "integer", min: 1 },
          wontfix: { type: "string" },
          "wontfix-reason": { type: "string" },
        },
        args: [{ name: "slug", required: false }],
        worktreeGuard: true,
        visibility: "normal",
        help: {
          group: "Job commands",
          summary: "  job resume <slug>               halted job を再開\n  job resume <slug> --detach      agent session 向け: 登録完了まで待機後に return (job wait で監視)\n  job resume <slug> --adopt-commits  adopt operator-made commits into the egress ledger\n  job resume --from-issue <n>     issue 番号から escalation marker を特定して再開 (rebind 内包)",
          detail: JOB_RESUME_USAGE,
        },
        handler: async (parsed, ctx) => {
          if (parsed.flags["detach"] && parsed.flags["json"]) {
            logError("--detach and --json are mutually exclusive");
            process.exit(EXIT_CODE.ARG_ERROR);
          }

          const fromIssue = typeof parsed.flags["from-issue"] === "number" ? parsed.flags["from-issue"] : undefined;

          // Exclusivity: --from-issue + positional slug
          if (fromIssue !== undefined && parsed.positional !== undefined) {
            logError("Usage error: --from-issue and positional <slug> are mutually exclusive");
            process.exit(EXIT_CODE.ARG_ERROR);
          }

          // Prompt resolution (shared by both --from-issue and slug paths)
          const promptText = parsed.flags["prompt"] as string | undefined;
          const promptFile = parsed.flags["prompt-file"] as string | undefined;

          if (promptText !== undefined && promptFile !== undefined) {
            throw new FlagParseError("--prompt and --prompt-file are mutually exclusive.");
          }

          let resolvedPrompt: string | undefined;
          if (promptFile !== undefined) {
            try {
              resolvedPrompt = fs.readFileSync(path.resolve(process.cwd(), promptFile), "utf-8");
            } catch (err) {
              logError(`Cannot read prompt file '${promptFile}': ${(err as Error).message}`);
              process.exit(1);
            }
          } else {
            resolvedPrompt = promptText;
          }

          if (resolvedPrompt !== undefined) {
            stderrWrite("Warning: --prompt の内容は agent prompt に直接注入されます。外部入力をそのまま渡さないでください。");
          }

          const logLevel = resolveLogLevel({
            quiet: !!parsed.flags["quiet"],
            verbose: !!parsed.flags["verbose"],
            debug: !!parsed.flags["debug"],
          });

          // --from-issue path
          if (fromIssue !== undefined) {
            const code = await runResumeFromIssue(
              fromIssue,
              {
                detach: !!parsed.flags["detach"],
                prompt: resolvedPrompt,
                from: parsed.flags["from"] as string | undefined,
                force: !!parsed.flags["force"],
                applyCanon: !!parsed.flags["apply-canon"],
                adoptCommits: !!parsed.flags["adopt-commits"],
                wontfix: parsed.flags["wontfix"] as string | undefined,
                wontfixReason: parsed.flags["wontfix-reason"] as string | undefined,
                noWorktree: !!parsed.flags["no-worktree"],
                json: !!parsed.flags["json"],
                logLevel,
                cwd: process.cwd(),
                repoRoot: ctx?.repoRoot,
              },
              ctx,
            );
            process.exit(code);
          }

          // Normal slug path — slug is required when --from-issue is absent
          if (!parsed.positional) {
            throw new FlagParseError("Usage error: 'job resume' requires a <slug> argument or --from-issue <n>");
          }

          if (parsed.flags["detach"] && !isDetachedChild(process.env as Record<string, string | undefined>)) {
            const slug = parsed.positional;
            if (!SLUG_REGEX.test(slug)) {
              logError(`Invalid slug '${slug}' for --detach.`);
              process.exit(EXIT_CODE.GENERAL_ERROR);
            }
            const repoRoot = ctx?.repoRoot ?? process.cwd();
            const code = await detachSelf({
              args: process.argv.slice(2),
              repoRoot,
              slug,
              env: process.env as Record<string, string | undefined>,
            });
            process.exit(code);
          }

          try {
            await runResume(parsed.positional, {
              from: parsed.flags["from"] as string | undefined,
              force: !!parsed.flags["force"],
              logLevel,
              cwd: process.cwd(),
              repoRoot: ctx?.repoRoot,
              prompt: resolvedPrompt,
              json: !!parsed.flags["json"],
              noWorktree: !!parsed.flags["no-worktree"],
              applyCanon: !!parsed.flags["apply-canon"],
              adoptCommits: !!parsed.flags["adopt-commits"],
              wontfix: parsed.flags["wontfix"] as string | undefined,
              wontfixReason: parsed.flags["wontfix-reason"] as string | undefined,
            });
          } catch (err: unknown) {
            if (err instanceof SpecRunnerError) {
              stderrWrite(`Error: ${err.message}`);
              stderrWrite(`Hint: ${err.hint}`);
              process.exit(err.exitCode);
            }
            stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
        },
      },
      reopen: {
        path: ["job", "reopen"],
        summary: "Reopen an awaiting-archive job",
        flags: {
          from: { type: "string" },
          reason: { type: "string" },
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
          json: { type: "boolean" },
          "no-worktree": { type: "boolean" },
        },
        args: [{ name: "slug", required: true }],
        worktreeGuard: true,
        visibility: "operator",
        help: {
          group: "Job commands",
          summary: "  job reopen <slug>               awaiting-archive job を指定 step から再開",
          detail: REOPEN_USAGE,
        },
        handler: async (parsed, ctx) => {
          const fromStep = parsed.flags["from"] as string | undefined;
          const reason = parsed.flags["reason"] as string | undefined;

          if (!fromStep) {
            logError("--from <step> is required for 'job reopen'.");
            process.exit(EXIT_CODE.ARG_ERROR);
          }
          if (!reason) {
            logError("--reason <text> is required for 'job reopen'.");
            process.exit(EXIT_CODE.ARG_ERROR);
          }

          const logLevel = resolveLogLevel({
            quiet: !!parsed.flags["quiet"],
            verbose: !!parsed.flags["verbose"],
            debug: !!parsed.flags["debug"],
          });

          try {
            await runReopen(parsed.positional!, {
              from: fromStep,
              reason,
              logLevel,
              cwd: process.cwd(),
              repoRoot: ctx?.repoRoot,
              json: !!parsed.flags["json"],
              noWorktree: !!parsed.flags["no-worktree"],
            });
          } catch (err: unknown) {
            if (err instanceof SpecRunnerError) {
              stderrWrite(`Error: ${err.message}`);
              stderrWrite(`Hint: ${err.hint}`);
              process.exit(err.exitCode);
            }
            stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
        },
      },
      attach: {
        path: ["job", "attach"],
        summary: "Attach a remote branch checkpoint",
        flags: {
          branch: { type: "string" },
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
        },
        requiresRepo: true,
        worktreeGuard: true,
        visibility: "operator",
        help: {
          group: "Job commands",
          summary: "  job attach --branch <branch>    remote branch の quiescent checkpoint を attach する",
        },
        handler: async (parsed, ctx) => {
          const branch = parsed.flags["branch"] as string | undefined;
          if (!branch) {
            logError("--branch <branch> is required for 'job attach'.");
            process.exit(EXIT_CODE.ARG_ERROR);
          }
          const logLevel = resolveLogLevel({
            quiet: !!parsed.flags["quiet"],
            verbose: !!parsed.flags["verbose"],
            debug: !!parsed.flags["debug"],
          });
          try {
            process.exit(
              await runAttach({
                branch,
                cwd: process.cwd(),
                repoRoot: ctx!.repoRoot!,
                logLevel,
              }),
            );
          } catch (err: unknown) {
            if (err instanceof SpecRunnerError) {
              stderrWrite(`Error: ${err.message}`);
              stderrWrite(`Hint: ${err.hint}`);
              process.exit(err.exitCode);
            }
            stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
        },
      },
      archive: {
        path: ["job", "archive"],
        summary: "Archive a completed change folder",
        flags: {
          "with-merge": { type: "boolean" },
          // ponytail: lenient parse — behavior preservation; strict integer typing forbidden (TC-027)
          // mergeWaitMs is lenient: invalid values (non-numeric) are silently ignored
          "merge-wait-ms": { type: "string" },
          "from-issue": { type: "integer", min: 1 },
        },
        args: [{ name: "slug", required: false }],
        worktreeGuard: true,
        visibility: "normal",
        help: {
          group: "Job commands",
          summary: "  job archive <slug>              archive record を記帳し、PR merge 後に archived + cleanup を完了する",
          detail: ARCHIVE_USAGE,
        },
        handler: async (parsed, ctx) => {
          const slug = parsed.positional as string | undefined;
          const fromIssue = parsed.flags["from-issue"] as number | undefined;
          const withMerge = !!parsed.flags["with-merge"];

          // Strict XOR: exactly one of slug or --from-issue
          if (fromIssue !== undefined && slug !== undefined) {
            logError("'job archive': <slug> and --from-issue are mutually exclusive. Specify exactly one.");
            process.exit(EXIT_CODE.ARG_ERROR);
          }
          if (fromIssue === undefined && slug === undefined) {
            logError("'job archive': either <slug> or --from-issue is required.");
            stderrWrite(ARCHIVE_USAGE);
            process.exit(EXIT_CODE.ARG_ERROR);
          }

          // Lenient parse of --merge-wait-ms (shared by both paths)
          let mergeWaitMs: number | undefined;
          const mergeWaitMsRaw = parsed.flags["merge-wait-ms"] as string | undefined;
          if (mergeWaitMsRaw !== undefined) {
            const parsed_ms = parseInt(String(mergeWaitMsRaw), 10);
            if (!Number.isNaN(parsed_ms) && parsed_ms >= 0) {
              mergeWaitMs = parsed_ms;
            }
            // Ignore invalid values (non-numeric) — lenient behavior
          }

          try {
            if (fromIssue !== undefined) {
              process.exit(
                await runArchiveFromIssue(fromIssue, { withMerge, mergeWaitMs, cwd: process.cwd(), }, ctx),
              );
            } else {
              process.exit(
                await runArchive({
                  slug: slug!,
                  withMerge,
                  cwd: process.cwd(),
                  mergeWaitMs,
                }),
              );
            }
          } catch (err: unknown) {
            if (err instanceof SpecRunnerError) {
              stderrWrite(`Error: ${err.message}`);
              stderrWrite(`Hint: ${err.hint}`);
              process.exit(err.exitCode);
            }
            stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
        },
      },
      prune: {
        path: ["job", "prune"],
        summary: "Remove orphan worktrees and sidecars",
        flags: {
          force: { type: "boolean" },
        },
        requiresRepo: true,
        worktreeGuard: true,
        visibility: "maintenance",
        help: {
          group: "Job commands",
          summary: "  job prune [--force]             orphan worktree・sidecar を列挙（--force で削除）",
          detail: PRUNE_USAGE,
        },
        handler: async (parsed, ctx) => {
          try {
            process.exit(
              await runPrune({
                force: !!parsed.flags["force"],
                repoRoot: ctx!.repoRoot!,
              }),
            );
          } catch (err: unknown) {
            if (err instanceof SpecRunnerError) {
              stderrWrite(`Error: ${err.message}`);
              stderrWrite(`Hint: ${err.hint}`);
              process.exit(err.exitCode);
            }
            stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
        },
      },
      stats: {
        path: ["job", "stats"],
        summary: "Show job statistics",
        flags: {
          json: { type: "boolean" },
        },
        requiresRepo: true,
        visibility: "normal",
        help: {
          group: "Job commands",
          summary: "  job stats [--json]              run 単位の統計（コスト・収束回数・所要時間）を集計",
        },
        handler: async (parsed, ctx) => {
          process.exit(await runJobStats({ cwd: ctx!.repoRoot!, json: !!parsed.flags["json"] }));
        },
      },
    },
  },

  config: {
    path: ["config"],
    summary: "Configuration commands",
    visibility: "normal",
    children: {
      effective: {
        path: ["config", "effective"],
        summary: "Show effective configuration",
        flags: {
          type: { type: "string" },
          json: { type: "boolean" },
        },
        visibility: "normal",
        help: {
          group: "Environment commands",
          summary: "  config effective [--type <t>]   Show effective step model/maxTurns/timeoutMs and source",
          detail: CONFIG_EFFECTIVE_USAGE,
        },
        handler: async (parsed, ctx) => {
          process.exit(await runConfigEffective({
            requestType: parsed.flags["type"] as string | undefined,
            json: !!parsed.flags["json"],
            repoRoot: ctx?.repoRoot,
          }));
        },
      },
    },
  },

  inbox: {
    path: ["inbox"],
    summary: "Inbox commands",
    visibility: "normal",
    children: {
      run: {
        path: ["inbox", "run"],
        summary: "Auto-fire jobs from inbox",
        flags: {
          "dry-run": { type: "boolean" },
          // --limit is integer (min 0) — validated by parser
          limit: { type: "integer", min: 0 },
          json: { type: "boolean" },
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
        },
        requiresRepo: true,
        worktreeGuard: true,
        visibility: "normal",
        help: {
          group: "Inbox commands",
          summary: "  inbox run                       issue から job を自動発火 (承認ラベル + /resume)",
          detail: INBOX_RUN_USAGE,
        },
        handler: async (parsed, ctx) => {
          // --limit is now validated as integer by the parser (min: 0)
          const limit = typeof parsed.flags["limit"] === "number" ? parsed.flags["limit"] : undefined;
          process.exit(
            await runInboxRun({
              dryRun: !!parsed.flags["dry-run"],
              limit,
              json: !!parsed.flags["json"],
              verbose: !!parsed.flags["verbose"],
              quiet: !!parsed.flags["quiet"],
              repoRoot: ctx!.repoRoot!,
            }),
          );
        },
      },
    },
  },

  rules: {
    path: ["rules"],
    summary: "Rules management commands",
    visibility: "normal",
    help: {
      detail: RULES_USAGE,
    },
    children: {
      new: {
        path: ["rules", "new"],
        summary: "Scaffold a rules file",
        flags: {},
        args: [{ name: "step-name rule-slug", required: true, count: 2 }],
        visibility: "normal",
        help: {
          group: "Rules commands",
          summary: "  rules new <step> <slug>         step 用の rules ファイルを scaffold",
        },
        handler: async (parsed) => {
          const stepName = parsed.positionals[0]!;
          const ruleSlug = parsed.positionals[1]!;
          process.exit(await executeRulesNew(stepName, ruleSlug, process.cwd()));
        },
      },
    },
  },

  reviewers: {
    path: ["reviewers"],
    summary: "Reviewer management commands",
    visibility: "normal",
    help: {
      detail: REVIEWERS_USAGE,
    },
    children: {
      new: {
        path: ["reviewers", "new"],
        summary: "Scaffold a reviewer definition",
        flags: {},
        args: [{ name: "name", required: true }],
        visibility: "normal",
        help: {
          group: "Reviewer commands",
          summary: "  reviewers new <name>            カスタムレビューワーの雛形を scaffold",
        },
        handler: async (parsed) => {
          const name = parsed.positional!;
          process.exit(await executeReviewersNew(name, process.cwd()));
        },
      },
    },
  },

  runtime: {
    path: ["runtime"],
    summary: "Runtime resource management",
    visibility: "normal",
    children: {
      setup: {
        path: ["runtime", "setup"],
        summary: "Set up Anthropic runtime",
        flags: {},
        visibility: "normal",
        help: {
          group: "Environment commands",
          summary: "  runtime setup|status|reset      Manage Anthropic runtime resources",
        },
        handler: async () => {
          process.exit(await runManagedSetup());
        },
      },
      status: {
        path: ["runtime", "status"],
        summary: "Show runtime status",
        flags: {},
        visibility: "normal",
        handler: async () => {
          process.exit(await runManagedStatus());
        },
      },
      reset: {
        path: ["runtime", "reset"],
        summary: "Delete the Anthropic Environment",
        flags: {
          force: { type: "boolean" },
        },
        visibility: "normal",
        help: {
          detail: RUNTIME_RESET_USAGE,
        },
        handler: async (parsed) => {
          process.exit(await runManagedReset({ force: !!parsed.flags["force"] }));
        },
      },
    },
  },

  doctor: {
    path: ["doctor"],
    summary: "Diagnose environment prerequisites",
    flags: {
      json: { type: "boolean" },
    },
    // requiresRepo: false (default) — doctor is runnable outside a repo
    visibility: "normal",
    help: {
      group: "Environment commands",
      summary: "  doctor                          Diagnose environment / config / auth prerequisites",
      detail: DOCTOR_USAGE,
    },
    handler: async (parsed, ctx) => {
      // default action: run diagnostics
      try {
        process.exit(await runDoctor({
          json: !!parsed.flags["json"],
          repoRoot: ctx?.repoRoot,
          invokerCwd: ctx?.invokerCwd,
        }));
      } catch (err: unknown) {
        stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(EXIT_CODE.GENERAL_ERROR);
      }
    },
    children: {
      repair: {
        path: ["doctor", "repair"],
        summary: "Repair slug occupancy sidecar",
        args: [{ name: "slug", required: true }],
        requiresRepo: true, // override: repair requires repo even though doctor doesn't
        visibility: "repair",
        help: { detail: "Usage: specrunner doctor repair <slug>\n\nRepair the occupancy sidecar for the given slug.\n" },
        handler: async (parsed, ctx) => {
          const slug = parsed.positional;
          if (!slug) {
            stderrWrite("Error: specrunner doctor repair requires a <slug> argument\n");
            stderrWrite("Usage: specrunner doctor repair <slug>\n");
            process.exit(2);
            return;
          }
          const repoRoot = ctx?.repoRoot ?? process.cwd();
          try {
            const { repairSlugOccupancySidecar } = await import("../core/occupancy/repair.js");
            const result = await repairSlugOccupancySidecar(repoRoot, slug);
            stderrWrite(result.message + "\n");
            process.exit(0);
          } catch (err: unknown) {
            stderrWrite(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
            process.exit(EXIT_CODE.GENERAL_ERROR);
          }
        },
      },
    },
  },

  guide: {
    path: ["guide"],
    summary: "Show operator guide for a topic",
    args: [{ name: "topic", required: false }],
    // requiresRepo intentionally absent: guide works outside a git repo
    visibility: "normal",
    help: {
      group: "Guide",
      summary: `  guide [topic]                   運用ガイドを表示 (topics: ${GUIDE_TOPICS.map((t) => t.name).join(" ")})`,
    },
    handler: async (parsed) => {
      process.exit(runGuide(parsed.positional));
    },
  },

  usage: {
    path: ["usage"],
    summary: "Show request usage",
    flags: {},
    args: [{ name: "slug", required: false }],
    visibility: "operator",
    handler: async (parsed) => {
      const slug = parsed.positional;
      if (slug) {
        process.exit(await showUsage(slug, process.cwd()));
      } else {
        process.exit(await showUsageSummary(process.cwd()));
      }
    },
  },
};

// ---------------------------------------------------------------------------
// Top-level USAGE (generated from CommandSpec tree)
// ---------------------------------------------------------------------------

export const USAGE: string = generateTopLevelUsage();
