/**
 * Command registry for the specrunner CLI.
 * Defines all commands with their flag definitions and handler functions.
 * No external dependencies.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { runInit } from "./init.js";
import { runManagedSetup, runManagedStatus, runManagedReset } from "./managed.js";
import { runLogin } from "./login.js";
import { runRun } from "./run.js";
import { runPs } from "./ps.js";
import { runDoctor } from "./doctor.js";
import { runArchive } from "./archive.js";
import { runAttach } from "./attach.js";
import { runCancel } from "./cancel.js";
import { runPrune } from "./prune.js";
import { runResume } from "./resume.js";
import { runJobShow } from "./job-show.js";
import { runJobStats } from "../core/command/job-stats.js";
import { runInboxRun } from "./inbox.js";
import { runConfigEffective } from "./config-effective.js";
import { executeTemplate, executeValidate } from "../core/command/request.js";
import { executeCreate } from "../core/command/request-create.js";
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
import { ClaudeCodeOneShotQueryClient } from "../adapter/claude-code/one-shot-query-client.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { SLUG_REGEX } from "../util/validation-patterns.js";
/** Path-traversal guard for jobId; accepts full UUIDs and short prefixes. */
const VALID_JOB_ID_CHARS = /^[a-f0-9-]+$/;

export interface CommandDef {
  flags: Record<string, FlagDef>;
  positional?: { name: string; required: boolean; count?: number };
  usage?: string; // shown in error output for this command
  /**
   * When true, dispatch will check that repoRoot is non-null before invoking
   * the handler. If the invoker is outside a git repository, dispatch emits
   * the unified repo-required error (NOT_GIT_REPO, exit 2) and halts.
   */
  requiresRepo?: boolean;
  handler: (parsed: ParsedArgs, ctx?: CommandContext) => Promise<void>;
}

export interface ParentCommandDef {
  subcommands: Record<string, CommandDef>;
  usage?: string;
  /** Subcommand names that require worktree guard check before execution. */
  guardedSubcommands?: Set<string>;
}

export type CommandEntry = CommandDef | ParentCommandDef;

export const USAGE = `Usage: specrunner <command> [options]

Request commands:
  request new <slug>              template から request.md を作る
  request generate "<text>"       LLM 生成で request.md を作る
  request ls                      active 配下の request 一覧
  request validate <file|slug>    構文 / 規律 check
  request template                雛形 markdown を stdout

Job commands:
  job start <request-slug|file>   pipeline 開始、jobId 発行
  job start ... --issue <number>  起点 issue に紐付け (terminal 時にコメント通知)
  job ls [--json]                 全 job 一覧（区分付き運用ビュー）
  job show <jobId|slug>           job state 詳細
  job cancel <jobId>              job を cancel して cleanup (--restore-draft で request.md を drafts/ へ復元)
  job resume <slug>               halted job を再開
  job attach --branch <branch>    remote branch の quiescent checkpoint を attach する
  job archive <slug>              change folder 移動・worktree 撤去・status 更新
  job prune [--force]             orphan worktree・sidecar を列挙（--force で削除）
  job stats [--json]              run 単位の統計（コスト・収束回数・所要時間）を集計

Rules commands:
  rules new <step> <slug>         step 用の rules ファイルを scaffold

Reviewer commands:
  reviewers new <name>            カスタムレビューワーの雛形を scaffold

Environment commands:
  init                            config scaffold
  login                           GitHub Device Flow OAuth (default) or Claude Code token login
  config effective [--type <t>]   Show effective step model/maxTurns/timeoutMs and source
  doctor                          Diagnose environment / config / auth prerequisites
  runtime setup|status|reset      Manage Anthropic runtime resources

Inbox commands:
  inbox run                       issue から job を自動発火 (承認ラベル + /resume)

Aliases:
  run <slug|file>                 job start の互換 alias

Options:
  --help, -h    Show this help message
`;

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

/** @deprecated Use RUNTIME_RESET_USAGE */
export const MANAGED_RESET_USAGE = RUNTIME_RESET_USAGE;

export const NO_DETAILED_HELP_USAGE = "No detailed help available.\nRun 'specrunner --help' for the command list.\n";

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

Authenticate and store credentials in ~/.config/specrunner/credentials.json.
Bare 'specrunner login' keeps the existing GitHub Device Flow behavior.

Options:
  --provider <github|claude>  Credential provider to login. Default: github
  --force                     Overwrite an existing stored credential
  --help, -h                  Show this help message

Claude Code:
  Run 'claude setup-token', then run 'specrunner login --provider claude'
  and paste the generated OAuth token. After 'specrunner doctor' reports
  source: credentials.json, remove CLAUDE_CODE_OAUTH_TOKEN from crontab.
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

Archive the completed change folder, remove worktree, and update job status.
Merge must already be done before running this command (or use --with-merge).

Arguments:
  <slug>            Slug of the request to archive (required).

Options:
  --with-merge           Wait for PR checks to pass, merge, then archive
  --merge-wait-ms <ms>   Override the wait timeout for --with-merge (in milliseconds).
                         For unlimited wait, set archive.mergeWaitTimeoutMs: null in config.
  --dry-run              Reserved for future use
  --help, -h             Show this help message
`;

export const COMMANDS: Record<string, CommandEntry> = {
  init: {
    flags: {
      runtime: { type: "string", values: ["managed", "local"] as const },
      provider: { type: "string", values: ["anthropic", "openai"] as const },
    },
    handler: async (parsed) => {
      const runtimeRaw = parsed.flags["runtime"] as string | undefined;
      const runtime = runtimeRaw as "managed" | "local" | undefined;
      const providerRaw = parsed.flags["provider"] as string | undefined;
      const provider = providerRaw as "anthropic" | "openai" | undefined;
      process.exit(await runInit({ runtime, provider }));
    },
  },

  login: {
    flags: {
      force: { type: "boolean" },
      provider: { type: "string", values: ["github", "claude"] as const },
    },
    usage: LOGIN_USAGE,
    handler: async (parsed) => {
      const provider = (parsed.flags["provider"] as "github" | "claude" | undefined) ?? "github";
      process.exit(await runLogin({ force: !!parsed.flags["force"], provider }));
    },
  },

  /** Alias: job start <slug|file> */
  run: {
    flags: {
      verbose: { type: "boolean" },
      quiet: { type: "boolean" },
      json: { type: "boolean" },
      "no-worktree": { type: "boolean" },
      issue: { type: "string" },
    },
    positional: { name: "request.md|slug", required: true },
    handler: async (parsed) => {
      const requestMdPath = parsed.positional!;
      const logLevel = resolveLogLevel({
        quiet: !!parsed.flags["quiet"],
        verbose: !!parsed.flags["verbose"],
        debug: !!parsed.flags["debug"],
      });
      let issue: number | undefined;
      const issueRaw = parsed.flags["issue"] as string | undefined;
      if (issueRaw !== undefined) {
        const n = Number(issueRaw);
        if (!Number.isInteger(n) || n <= 0) {
          logError(`--issue requires a positive integer (got: ${issueRaw})`);
          process.exit(EXIT_CODE.ARG_ERROR);
        }
        issue = n;
      }
      await runRun(requestMdPath, { logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"], issue });
    },
  },

  request: {
    subcommands: {
      new: {
        flags: {
          type: { type: "string" },
        },
        positional: { name: "slug", required: true },
        requiresRepo: true,
        handler: async (parsed, ctx) => {
          const slug = parsed.positional!;
          const requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature";
          // ctx is guaranteed defined and repoRoot non-null by requiresRepo: true + dispatch guard
          // base is repo root (not invoker cwd) so subdir invocations write to the correct location
          process.exit(await executeNew(slug, requestType, ctx!.repoRoot!));
        },
      },
      /** Renamed from `create` */
      generate: {
        flags: {
          stdin: { type: "boolean" },
        },
        positional: { name: "text", required: false },
        handler: async (parsed) => {
          let config: SpecRunnerConfig;
          try {
            config = await loadConfigWithOverlay();
          } catch {
            config = {} as SpecRunnerConfig;
          }
          const client = new ClaudeCodeOneShotQueryClient(config);
          process.exit(
            await executeCreate(parsed.positional ?? null, {
              stdin: !!parsed.flags["stdin"],
              cwd: process.cwd(),
            }, client),
          );
        },
      },
      /** Renamed from `list` */
      ls: {
        flags: {},
        handler: async () => {
          process.exit(await executeList(process.cwd()));
        },
      },
      template: {
        flags: {
          type: { type: "string" },
        },
        handler: async (parsed) => {
          const requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature";
          process.exit(executeTemplate(requestType));
        },
      },
      validate: {
        flags: {},
        positional: { name: "file-or-slug", required: true },
        handler: async (parsed) => {
          const input = parsed.positional!;
          // Slug validation guard (if it looks like a slug, validate the slug format too)
          let filePath = path.resolve(process.cwd(), input);
          if (!fs.existsSync(filePath)) {
            // Try as slug
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
    guardedSubcommands: new Set(["start", "resume", "attach", "archive", "prune"]),
    subcommands: {
      start: {
        flags: {
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
          json: { type: "boolean" },
          "no-worktree": { type: "boolean" },
          issue: { type: "string" },
        },
        positional: { name: "slug|file", required: true },
        handler: async (parsed) => {
          const requestMdPath = parsed.positional!;
          const logLevel = resolveLogLevel({
            quiet: !!parsed.flags["quiet"],
            verbose: !!parsed.flags["verbose"],
            debug: !!parsed.flags["debug"],
          });
          let issue: number | undefined;
          const issueRaw = parsed.flags["issue"] as string | undefined;
          if (issueRaw !== undefined) {
            const n = Number(issueRaw);
            if (!Number.isInteger(n) || n <= 0) {
              logError(`--issue requires a positive integer (got: ${issueRaw})`);
              process.exit(EXIT_CODE.ARG_ERROR);
            }
            issue = n;
          }
          await runRun(requestMdPath, { logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"], issue });
        },
      },
      ls: {
        flags: {
          active: { type: "boolean" },
          all: { type: "boolean" },
          status: { type: "string", values: ["running", "awaiting-resume", "awaiting-archive", "failed", "terminated", "archived", "canceled"] as const },
          json: { type: "boolean" },
        },
        usage: "job ls [--active] [--all] [--status <status>] [--json]  全 job 一覧（区分付き運用ビュー）",
        handler: async (parsed) => {
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
            },
            githubClient,
          ));
        },
      },
      show: {
        flags: {},
        positional: { name: "jobId|slug", required: true },
        handler: async (parsed) => {
          process.exit(await runJobShow(parsed.positional!));
        },
      },
      cancel: {
        flags: {
          force: { type: "boolean" },
          purge: { type: "boolean" },
          "all-terminated": { type: "boolean" },
          yes: { type: "boolean" },
          "restore-draft": { type: "boolean" },
        },
        positional: { name: "jobId", required: false },
        handler: async (parsed) => {
          const jobId = parsed.positional;
          // Security: path-traversal guard; short prefixes are allowed (resolveId handles lookup)
          if (jobId !== undefined && !VALID_JOB_ID_CHARS.test(jobId)) {
            logError("invalid jobId format");
            process.exit(EXIT_CODE.ARG_ERROR);
          }
          try {
            process.exit(
              await runCancel({
                jobId,
                force: !!parsed.flags["force"],
                purge: !!parsed.flags["purge"],
                allTerminated: !!parsed.flags["all-terminated"],
                yes: !!parsed.flags["yes"],
                restoreDraft: !!parsed.flags["restore-draft"],
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
      resume: {
        flags: {
          from: { type: "string", values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES] as const },
          force: { type: "boolean" },
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
          prompt: { type: "string" },
          "prompt-file": { type: "string" },
          json: { type: "boolean" },
          "no-worktree": { type: "boolean" },
        },
        positional: { name: "slug", required: true },
        handler: async (parsed) => {
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

          try {
            await runResume(parsed.positional!, {
              from: parsed.flags["from"] as string | undefined,
              force: !!parsed.flags["force"],
              logLevel,
              cwd: process.cwd(),
              prompt: resolvedPrompt,
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
        flags: {
          branch: { type: "string" },
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
        },
        handler: async (parsed) => {
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
        flags: {
          "with-merge": { type: "boolean" },
          "merge-wait-ms": { type: "string" },
          "dry-run": { type: "boolean" },
        },
        positional: { name: "slug", required: true },
        usage: ARCHIVE_USAGE,
        handler: async (parsed) => {
          const slug = parsed.positional!;
          // Parse --merge-wait-ms: must be a positive integer if provided
          let mergeWaitMs: number | undefined;
          const mergeWaitMsRaw = parsed.flags["merge-wait-ms"];
          if (mergeWaitMsRaw !== undefined && mergeWaitMsRaw !== true && mergeWaitMsRaw !== false) {
            const parsed_ms = parseInt(String(mergeWaitMsRaw), 10);
            if (!Number.isNaN(parsed_ms) && parsed_ms >= 0) {
              mergeWaitMs = parsed_ms;
            }
            // Ignore invalid values (non-numeric)
          }
          try {
            process.exit(
              await runArchive({
                slug,
                withMerge: !!parsed.flags["with-merge"],
                dryRun: !!parsed.flags["dry-run"],
                cwd: process.cwd(),
                mergeWaitMs,
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
      prune: {
        flags: {
          force: { type: "boolean" },
        },
        usage: PRUNE_USAGE,
        handler: async (parsed) => {
          try {
            process.exit(
              await runPrune({
                force: !!parsed.flags["force"],
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
        flags: {
          json: { type: "boolean" },
        },
        requiresRepo: true,
        handler: async (parsed, ctx) => {
          // ctx is guaranteed defined and repoRoot non-null by requiresRepo: true + dispatch guard
          // cwd is the repo root so subdir invocations find the same archive runs as root invocations
          process.exit(await runJobStats({ cwd: ctx!.repoRoot!, json: !!parsed.flags["json"] }));
        },
      },
    },
  },

  config: {
    subcommands: {
      effective: {
        usage: CONFIG_EFFECTIVE_USAGE,
        flags: {
          type: { type: "string" },
          json: { type: "boolean" },
        },
        handler: async (parsed) => {
          process.exit(await runConfigEffective({
            requestType: parsed.flags["type"] as string | undefined,
            json: !!parsed.flags["json"],
          }));
        },
      },
    },
  },

  inbox: {
    guardedSubcommands: new Set(["run"]),
    subcommands: {
      run: {
        usage: INBOX_RUN_USAGE,
        flags: {
          "dry-run": { type: "boolean" },
          limit: { type: "string" },
          json: { type: "boolean" },
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
        },
        handler: async (parsed) => {
          const limitRaw = parsed.flags["limit"] as string | undefined;
          let limit: number | undefined;
          if (limitRaw !== undefined) {
            const n = Number(limitRaw);
            if (!Number.isInteger(n) || n < 0) {
              logError(`--limit requires a non-negative integer (got: ${limitRaw})`);
              process.exit(EXIT_CODE.ARG_ERROR);
            }
            limit = n;
          }
          process.exit(
            await runInboxRun({
              dryRun: !!parsed.flags["dry-run"],
              limit,
              json: !!parsed.flags["json"],
              verbose: !!parsed.flags["verbose"],
              quiet: !!parsed.flags["quiet"],
            }),
          );
        },
      },
    },
  },

  rules: {
    usage: RULES_USAGE,
    subcommands: {
      new: {
        flags: {},
        positional: { name: "step-name rule-slug", required: true, count: 2 },
        handler: async (parsed) => {
          const stepName = parsed.positionals[0]!;
          const ruleSlug = parsed.positionals[1]!;
          process.exit(await executeRulesNew(stepName, ruleSlug, process.cwd()));
        },
      },
    },
  },

  reviewers: {
    usage: REVIEWERS_USAGE,
    subcommands: {
      new: {
        flags: {},
        positional: { name: "name", required: true },
        handler: async (parsed) => {
          const name = parsed.positional!;
          process.exit(await executeReviewersNew(name, process.cwd()));
        },
      },
    },
  },

  runtime: {
    subcommands: {
      setup: {
        flags: {},
        handler: async () => {
          process.exit(await runManagedSetup());
        },
      },
      status: {
        flags: {},
        handler: async () => {
          process.exit(await runManagedStatus());
        },
      },
      reset: {
        flags: {
          force: { type: "boolean" },
        },
        usage: RUNTIME_RESET_USAGE,
        handler: async (parsed) => {
          process.exit(await runManagedReset({ force: !!parsed.flags["force"] }));
        },
      },
    },
  },

  doctor: {
    flags: {
      json: { type: "boolean" },
    },
    // requiresRepo: false (default) — doctor is always runnable, even outside a repo
    handler: async (parsed, ctx) => {
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
  },

  usage: {
    flags: {},
    positional: { name: "slug", required: false },
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
