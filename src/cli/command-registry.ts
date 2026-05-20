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
import { runFinish } from "./finish.js";
import { runRm } from "./rm.js";
import { runResume } from "./resume.js";
import { runJobShow } from "./job-show.js";
import { executeTemplate, executeValidate } from "../core/command/request.js";
import { executeReview } from "../core/command/request-review.js";
import { executeCreate } from "../core/command/request-create.js";
import { executeList } from "../core/command/request-list.js";
import { executeNew } from "../core/command/request-new.js";
import { executeShow } from "../core/command/request-show.js";
import { executeRm as executeRequestRm } from "../core/command/request-rm.js";
import { resolve as storeResolve } from "../core/request/store.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../core/step/step-names.js";
import type { FlagDef, ParsedArgs } from "./flag-parser.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { createGitHubClient } from "../adapter/github/github-client.js";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID_REGEX = /^[a-f0-9-]{36}$/;

export interface CommandDef {
  flags: Record<string, FlagDef>;
  positional?: { name: string; required: boolean };
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
  request show <slug>             request.md の本文を表示
  request rm <slug>               active 配下から削除
  request validate <file|slug>    構文 / 規律 check
  request template                雛形 markdown を stdout
  request review <slug|file>      architect agent によるレビュー

Job commands:
  job start <request-slug|file>   pipeline 開始、jobId 発行
  job ls                          全 job 一覧
  job show <jobId|slug>           job state 詳細
  job rm <jobId>                  job state file 削除
  job resume <slug>               halted job を再開
  job finish <slug>               PR merge + archive

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

export const FINISH_USAGE = `Usage: specrunner job finish [<slug>] [options]

Squash-merge feature PR and archive the completed job (1-PR model).

Arguments:
  <slug>            Slug of the request to finish (recommended first form).
                    If omitted, auto-detects from awaiting-merge/ directory.

Options:
  --pr=<num>        Reverse-lookup slug via GitHub REST API (PR <num>)
  --job=<jobId>     Direct job ID lookup (forensics / debug only)
  --dry-run         Phase 0 pre-flight only — no commits, pushes, or merges
  --force           Force merge even with failing checks (relies on admin token)
  --help, -h        Show this help message
`;

export const COMMANDS: Record<string, CommandEntry> = {
  init: {
    flags: {
      runtime: { type: "string", values: ["managed", "local"] as const },
    },
    handler: async (parsed) => {
      const runtimeRaw = parsed.flags["runtime"] as string | undefined;
      const runtime = runtimeRaw as "managed" | "local" | undefined;
      await runInit({ runtime });
    },
  },

  login: {
    flags: {},
    handler: async () => {
      await runLogin();
    },
  },

  /** Alias: job start <slug|file> */
  run: {
    flags: {
      verbose: { type: "boolean" },
    },
    positional: { name: "request.md|slug", required: true },
    handler: async (parsed) => {
      const requestMdPath = parsed.positional!;
      const verbose = !!parsed.flags["verbose"];
      await runRun(requestMdPath, { verbose });
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
          process.exit(
            await executeCreate(parsed.positional ?? null, {
              stdin: !!parsed.flags["stdin"],
              cwd: process.cwd(),
            }),
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
      show: {
        flags: {},
        positional: { name: "slug", required: true },
        handler: async (parsed) => {
          process.exit(await executeShow(parsed.positional!, process.cwd()));
        },
      },
      rm: {
        flags: {},
        positional: { name: "slug", required: true },
        handler: async (parsed) => {
          process.exit(await executeRequestRm(parsed.positional!, process.cwd()));
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
              process.stderr.write(
                `Error: Invalid slug '${input}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/\n`,
              );
              process.exit(2);
            }
            const slugResolved = storeResolve(process.cwd(), input);
            if (!fs.existsSync(slugResolved)) {
              process.stderr.write(`Error: '${input}' is neither a file path nor an active request slug.\n`);
              process.stderr.write("Hint: Use 'specrunner request ls' to see available slugs.\n");
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
        },
        positional: { name: "file-or-slug", required: true },
        handler: async (parsed) => {
          const input = parsed.positional!;
          let filePath = path.resolve(process.cwd(), input);
          if (!fs.existsSync(filePath)) {
            // Try as slug
            if (!SLUG_REGEX.test(input)) {
              process.stderr.write(
                `Error: Invalid slug '${input}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/\n`,
              );
              process.exit(2);
            }
            const slugResolved = storeResolve(process.cwd(), input);
            if (!fs.existsSync(slugResolved)) {
              process.stderr.write(`Error: '${input}' is neither a file path nor an active request slug.\n`);
              process.stderr.write("Hint: Use 'specrunner request ls' to see available slugs.\n");
              process.exit(1);
            }
            filePath = slugResolved;
          }
          process.exit(await executeReview(filePath, { json: !!parsed.flags["json"] }));
        },
      },
    },
  },

  job: {
    guardedSubcommands: new Set(["start", "resume", "finish"]),
    subcommands: {
      start: {
        flags: {
          verbose: { type: "boolean" },
        },
        positional: { name: "slug|file", required: true },
        handler: async (parsed) => {
          const requestMdPath = parsed.positional!;
          const verbose = !!parsed.flags["verbose"];
          await runRun(requestMdPath, { verbose });
        },
      },
      ls: {
        flags: {
          active: { type: "boolean" },
          all: { type: "boolean" },
          status: { type: "string", values: ["running", "awaiting-resume", "awaiting-merge", "failed", "terminated", "archived", "canceled"] as const },
        },
        handler: async (parsed) => {
          let githubClient = null;
          try {
            const { token } = await resolveGitHubToken(process.env as Record<string, string | undefined>);
            githubClient = createGitHubClient(fetch, token);
          } catch {
            // No token available — PR merge check will be skipped
          }
          await runPs(
            {
              active: !!parsed.flags["active"],
              all: !!parsed.flags["all"],
              status: parsed.flags["status"] as string | undefined,
            },
            githubClient,
          );
        },
      },
      show: {
        flags: {},
        positional: { name: "jobId|slug", required: true },
        handler: async (parsed) => {
          await runJobShow(parsed.positional!);
        },
      },
      rm: {
        flags: {
          force: { type: "boolean" },
          "all-terminated": { type: "boolean" },
          yes: { type: "boolean" },
        },
        positional: { name: "jobId", required: false },
        handler: async (parsed) => {
          const jobId = parsed.positional;
          // UUID validation for explicit jobId
          if (jobId !== undefined && !UUID_REGEX.test(jobId)) {
            process.stderr.write(`Error: invalid jobId format\n`);
            process.exit(1);
          }
          try {
            process.exit(
              await runRm({
                jobId,
                force: !!parsed.flags["force"],
                allTerminated: !!parsed.flags["all-terminated"],
                yes: !!parsed.flags["yes"],
              }),
            );
          } catch (err: unknown) {
            process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
            process.exit(1);
          }
        },
      },
      resume: {
        flags: {
          from: { type: "string", values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES, "critic", "fixer", "creator"] as const },
          force: { type: "boolean" },
          verbose: { type: "boolean" },
        },
        positional: { name: "slug", required: true },
        handler: async (parsed) => {
          try {
            await runResume(parsed.positional!, {
              from: parsed.flags["from"] as string | undefined,
              force: !!parsed.flags["force"],
              verbose: !!parsed.flags["verbose"],
              cwd: process.cwd(),
            });
          } catch (err: unknown) {
            process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
            process.exit(1);
          }
        },
      },
      finish: {
        flags: {
          pr: { type: "string" },
          job: { type: "string" },
          "dry-run": { type: "boolean" },
          force: { type: "boolean" },
          help: { type: "boolean" },
        },
        positional: { name: "slug", required: false },
        usage: FINISH_USAGE,
        handler: async (parsed) => {
          if (parsed.flags["help"]) {
            process.stdout.write(FINISH_USAGE);
            process.exit(0);
          }
          // UUID validation for --job flag
          const jobFlagValue = parsed.flags["job"] as string | undefined;
          if (jobFlagValue !== undefined && !UUID_REGEX.test(jobFlagValue)) {
            process.stderr.write(`Error: invalid jobId format\n`);
            process.exit(1);
          }
          const prRaw = parsed.flags["pr"] as string | undefined;
          const prNumber = prRaw ? parseInt(prRaw, 10) : undefined;
          try {
            process.exit(
              await runFinish({
                slug: parsed.positional,
                prNumber,
                jobId: jobFlagValue,
                dryRun: !!parsed.flags["dry-run"],
                force: !!parsed.flags["force"],
                cwd: process.cwd(),
              }),
            );
          } catch (err: unknown) {
            process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
            process.exit(1);
          }
        },
      },
    },
  },

  runtime: {
    subcommands: {
      setup: {
        flags: {},
        handler: async () => {
          await runManagedSetup();
        },
      },
      status: {
        flags: {},
        handler: async () => {
          await runManagedStatus();
        },
      },
      reset: {
        flags: {
          force: { type: "boolean" },
          help: { type: "boolean" },
        },
        handler: async (parsed) => {
          if (parsed.flags["help"]) {
            process.stdout.write(RUNTIME_RESET_USAGE);
            process.exit(0);
          }
          await runManagedReset({ force: !!parsed.flags["force"] });
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
        process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(2);
      }
    },
  },
};
