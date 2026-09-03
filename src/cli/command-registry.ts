/**
 * Command registry for the specrunner CLI.
 * Single CommandSpec tree is the canonical source for parser / help / dispatch / guards.
 * All handler implementations live in per-command or per-family modules.
 */

import { CREDENTIALS_SET_USAGE } from "./credentials.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../core/step/step-names.js";
import type { FlagDef } from "./flag-parser.js";
import { GUIDE_TOPICS } from "../core/command/guide.js";

// Handler imports (T-03 through T-15)
import { handleInit } from "./init.js";
import { handleLogin } from "./login.js";
import { handleCredentialsSet } from "./credentials.js";
import { handleRequestNew, handleRequestPrompt, handleRequestLs, handleRequestTemplate, handleRequestValidate } from "./request-handlers.js";
import { handleJobStart } from "./job-start-handler.js";
import { handleJobLs, handleJobStats } from "./ps.js";
import { handleJobShow } from "./job-show.js";
import { handleJobWait } from "./job-wait.js";
import { handleJobCancel } from "./cancel.js";
import { handleJobResume } from "./job-resume-handler.js";
import { handleJobReopen } from "./reopen.js";
import { handleJobAttach } from "./attach.js";
import { handleJobArchive } from "./job-archive-handler.js";
import { ARCHIVE_USAGE } from "./archive.js";
export { ARCHIVE_USAGE } from "./archive.js";
import { handleJobPrune } from "./prune.js";
import { handleConfigEffective } from "./config-effective.js";
import { handleInboxRun } from "./inbox.js";
import { handleRuntimeSetup, handleRuntimeStatus, handleRuntimeReset } from "./managed.js";
import { handleDoctor, handleDoctorRepair } from "./doctor.js";
import { handleRulesNew, handleReviewersNew } from "./scaffold-handlers.js";
import { handleGuide } from "./guide-handler.js";
import { handleUsage } from "./usage-handler.js";

import type { CommandHandler } from "./command-handler.js";
export type { CommandHandler } from "./command-handler.js";

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

export const REOPEN_USAGE = `Usage: specrunner job reopen <slug> --reason <text> [options]

Transitions an awaiting-archive job to awaiting-resume without executing the pipeline.
The associated PR must be OPEN (not merged or closed).

This is an operator-scoped lifecycle action: --reason is required.
Prior evidence (steps, artifacts, reviewer statuses) is preserved.

After reopen, run 'specrunner job resume <slug> --from <step> [--prompt ...]' to start pipeline execution.

Arguments:
  <slug>              Slug of the job to reopen (required).

Options:
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
    handler: handleInit,
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
    handler: handleLogin,
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
        handler: handleCredentialsSet,
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
        handler: handleRequestNew,
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
        handler: handleRequestPrompt,
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
        handler: handleRequestLs,
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
        handler: handleRequestTemplate,
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
        handler: handleRequestValidate,
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
        handler: handleJobStart,
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
        handler: handleJobLs,
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
        handler: handleJobShow,
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
        handler: handleJobWait,
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
        handler: handleJobCancel,
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
        handler: handleJobResume,
      },
      reopen: {
        path: ["job", "reopen"],
        summary: "Reopen an awaiting-archive job",
        flags: {
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
          summary: "  job reopen <slug>               awaiting-archive job を awaiting-resume に遷移する",
          detail: REOPEN_USAGE,
        },
        handler: handleJobReopen,
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
        handler: handleJobAttach,
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
        handler: handleJobArchive,
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
        handler: handleJobPrune,
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
        handler: handleJobStats,
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
        handler: handleConfigEffective,
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
        handler: handleInboxRun,
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
        handler: handleRulesNew,
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
        handler: handleReviewersNew,
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
        handler: handleRuntimeSetup,
      },
      status: {
        path: ["runtime", "status"],
        summary: "Show runtime status",
        flags: {},
        visibility: "normal",
        handler: handleRuntimeStatus,
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
        handler: handleRuntimeReset,
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
    handler: handleDoctor,
    children: {
      repair: {
        path: ["doctor", "repair"],
        summary: "Repair slug occupancy sidecar",
        args: [{ name: "slug", required: true }],
        requiresRepo: true, // override: repair requires repo even though doctor doesn't
        visibility: "repair",
        help: { detail: "Usage: specrunner doctor repair <slug>\n\nRepair the occupancy sidecar for the given slug.\n" },
        handler: handleDoctorRepair,
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
    handler: handleGuide,
  },

  usage: {
    path: ["usage"],
    summary: "Show request usage",
    flags: {},
    args: [{ name: "slug", required: false }],
    visibility: "operator",
    handler: handleUsage,
  },
};

// ---------------------------------------------------------------------------
// Top-level USAGE (generated from CommandSpec tree)
// ---------------------------------------------------------------------------

export const USAGE: string = generateTopLevelUsage();
