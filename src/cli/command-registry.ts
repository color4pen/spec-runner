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
import { runCancel } from "./cancel.js";
import { runResume } from "./resume.js";
import { runJobShow } from "./job-show.js";
import { executeTemplate, executeValidate } from "../core/command/request.js";
import { executeReview } from "../core/command/request-review.js";
import { executeCreate } from "../core/command/request-create.js";
import { executeList } from "../core/command/request-list.js";
import { executeNew } from "../core/command/request-new.js";
import { executeRulesNew } from "../core/command/rules-new.js";
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
  handler: (parsed: ParsedArgs) => Promise<void>;
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
  request review <slug|file>      architect agent によるレビュー（--model でモデル上書き可）

Job commands:
  job start <request-slug|file>   pipeline 開始、jobId 発行
  job ls                          全 job 一覧
  job show <jobId|slug>           job state 詳細
  job cancel <jobId>              job を cancel して cleanup
  job resume <slug>               halted job を再開
  job archive <slug>              change folder 移動・worktree 撤去・status 更新

Rules commands:
  rules new <step> <slug>         step 用の rules ファイルを scaffold

Environment commands:
  init                            config scaffold
  login                           GitHub Device Flow OAuth
  doctor                          Diagnose environment / config / auth prerequisites
  runtime setup|status|reset      Manage Anthropic runtime resources

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
    },
    handler: async (parsed) => {
      const runtimeRaw = parsed.flags["runtime"] as string | undefined;
      const runtime = runtimeRaw as "managed" | "local" | undefined;
      process.exit(await runInit({ runtime }));
    },
  },

  login: {
    flags: {},
    handler: async () => {
      process.exit(await runLogin());
    },
  },

  /** Alias: job start <slug|file> */
  run: {
    flags: {
      verbose: { type: "boolean" },
      quiet: { type: "boolean" },
      json: { type: "boolean" },
      "no-worktree": { type: "boolean" },
    },
    positional: { name: "request.md|slug", required: true },
    handler: async (parsed) => {
      const requestMdPath = parsed.positional!;
      const logLevel = resolveLogLevel({
        quiet: !!parsed.flags["quiet"],
        verbose: !!parsed.flags["verbose"],
        debug: !!parsed.flags["debug"],
      });
      await runRun(requestMdPath, { logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] });
    },
  },

  request: {
    subcommands: {
      new: {
        flags: {
          type: { type: "string" },
        },
        positional: { name: "slug", required: true },
        handler: async (parsed) => {
          const slug = parsed.positional!;
          const requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature";
          process.exit(await executeNew(slug, requestType, process.cwd()));
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
      review: {
        flags: {
          json: { type: "boolean" },
          model: { type: "string" },
        },
        positional: { name: "file-or-slug", required: true },
        handler: async (parsed) => {
          const input = parsed.positional!;
          let filePath = path.resolve(process.cwd(), input);
          let resolvedSlug: string | undefined;
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
            resolvedSlug = input;
          } else {
            // File path given — try to extract slug from drafts/<slug>/request.md pattern
            const draftMatch = filePath.match(/[/\\]drafts[/\\]([^/\\]+)[/\\]request\.md$/);
            if (draftMatch?.[1] && SLUG_REGEX.test(draftMatch[1])) {
              resolvedSlug = draftMatch[1];
            }
          }
          let config: SpecRunnerConfig;
          try {
            config = await loadConfigWithOverlay();
          } catch {
            config = {} as SpecRunnerConfig;
          }
          const client = new ClaudeCodeOneShotQueryClient(config);
          const modelFlag = parsed.flags["model"];
          const model = typeof modelFlag === "string" && modelFlag.trim() !== "" ? modelFlag : undefined;
          process.exit(await executeReview(filePath, { json: !!parsed.flags["json"], model }, client, resolvedSlug));
        },
      },
    },
  },

  job: {
    guardedSubcommands: new Set(["start", "resume", "archive"]),
    subcommands: {
      start: {
        flags: {
          verbose: { type: "boolean" },
          quiet: { type: "boolean" },
          json: { type: "boolean" },
          "no-worktree": { type: "boolean" },
        },
        positional: { name: "slug|file", required: true },
        handler: async (parsed) => {
          const requestMdPath = parsed.positional!;
          const logLevel = resolveLogLevel({
            quiet: !!parsed.flags["quiet"],
            verbose: !!parsed.flags["verbose"],
            debug: !!parsed.flags["debug"],
          });
          await runRun(requestMdPath, { logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] });
        },
      },
      ls: {
        flags: {
          active: { type: "boolean" },
          all: { type: "boolean" },
          status: { type: "string", values: ["running", "awaiting-resume", "awaiting-archive", "failed", "terminated", "archived", "canceled"] as const },
        },
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
    handler: async (parsed) => {
      try {
        process.exit(await runDoctor({ json: !!parsed.flags["json"] }));
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
