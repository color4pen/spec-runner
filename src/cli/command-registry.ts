/**
 * Command registry for the specrunner CLI.
 * Defines all commands with their flag definitions and handler functions.
 * No external dependencies.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { runInit } from "./init.js";
import { runLogin } from "./login.js";
import { runRun } from "./run.js";
import { runPs } from "./ps.js";
import { runDoctor } from "./doctor.js";
import { runFinish } from "./finish.js";
import { runRm } from "./rm.js";
import { runResume } from "./resume.js";
import { executeTemplate, executeValidate } from "../core/command/request.js";
import { executeReview } from "../core/command/request-review.js";
import { executeCreate } from "../core/command/request-create.js";
import { executeList } from "../core/command/request-list.js";
import { resolve as storeResolve } from "../core/request/store.js";
import type { FlagDef, ParsedArgs } from "./flag-parser.js";

export interface CommandDef {
  flags: Record<string, FlagDef>;
  positional?: { name: string; required: boolean };
  usage?: string; // shown in error output for this command
  handler: (parsed: ParsedArgs) => Promise<void>;
}

export interface ParentCommandDef {
  subcommands: Record<string, CommandDef>;
  usage?: string;
}

export type CommandEntry = CommandDef | ParentCommandDef;

export const USAGE = `Usage: specrunner <command> [options]

Commands:
  init                   Create or update Anthropic Agent and Environment
  login                  Authenticate with GitHub via Device Flow
  run <request.md|slug> [--verbose]  Run design pipeline for a request
  request template [--type <type>]   Print a scaffold request.md template to stdout
  request validate <file>            Validate a request.md file
  request review <file-or-slug> [--json]  Architect review of a request.md file
  request create "<text>" [--stdin]  Generate a request.md from text and save to active/
  request list                       List active requests
  ps                     List all jobs
  doctor                 Diagnose environment / config / auth prerequisites
  finish [<slug>]        Squash-merge feature PR and archive (1-PR model)
  rm <jobId>             Remove a job (state file + cloud session)
  resume <slug>          Resume a halted (awaiting-resume) job

Options:
  --help, -h    Show this help message

Request Options:
  template [--type <type>]  Request type (default: new-feature)
  validate <file>           Path to request.md file to validate

Doctor Options:
  --json        Output results as machine-readable JSON

Ps Options:
  --active           Show only active (running) jobs
  --all              Include archived jobs
  --status=<status>  Filter by status (running|awaiting-resume|awaiting-merge|failed|terminated|archived|canceled)

Finish Options:
  <slug>            Resolve job by slug (first form, recommended)
  --pr=<num>        Reverse-lookup slug via gh pr view <num>
  --job=<jobId>     Direct job ID lookup (forensics / debug only)
  --dry-run         Phase 0 pre-flight only, no destructive ops
  --force           Force merge even with failing checks (--admin)

Rm Options:
  --force           Remove job regardless of status (bypass status gate)
  --all-terminated  Remove all failed/terminated/archived jobs
  --yes             Skip confirmation prompt (for --all-terminated)

Resume Options:
  <slug>            Slug of the job to resume (required)
  --from=<role>     Override resume step: critic | fixer | creator
  --force           Resume even if consecutive escalations detected or status is not awaiting-resume
  --verbose         Enable verbose output
`;

export const FINISH_USAGE = `Usage: specrunner finish [<slug>] [options]

Squash-merge feature PR and archive the completed job (1-PR model).

Arguments:
  <slug>            Slug of the request to finish (recommended first form).
                    If omitted, auto-detects from awaiting-merge/ directory.

Options:
  --pr=<num>        Reverse-lookup slug via PR number (gh pr view)
  --job=<jobId>     Direct job ID lookup (forensics / debug only)
  --dry-run         Phase 0 pre-flight only — no commits, pushes, or merges
  --force           Force merge even with failing checks (uses --admin)
  --help, -h        Show this help message
`;

export const COMMANDS: Record<string, CommandEntry> = {
  init: {
    flags: {
      "api-key": { type: "string" },
      runtime: { type: "string", values: ["managed", "local"] as const },
    },
    handler: async (parsed) => {
      const apiKey = parsed.flags["api-key"] as string | undefined;
      const runtimeRaw = parsed.flags["runtime"] as string | undefined;
      // enum validation is done by parseFlags, so cast is safe
      const runtime = runtimeRaw as "managed" | "local" | undefined;
      await runInit({ apiKey, runtime });
    },
  },

  login: {
    flags: {},
    handler: async () => {
      await runLogin();
    },
  },

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
        positional: { name: "file", required: true },
        handler: async (parsed) => {
          process.exit(await executeValidate(parsed.positional!));
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
            const slugResolved = storeResolve(process.cwd(), input);
            if (!fs.existsSync(slugResolved)) {
              process.stderr.write(`Error: '${input}' is neither a file path nor an active request slug.\n`);
              process.stderr.write("Hint: Use 'specrunner request list' to see available slugs.\n");
              process.exit(1);
            }
            filePath = slugResolved;
          }
          process.exit(await executeReview(filePath, { json: !!parsed.flags["json"] }));
        },
      },
      create: {
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
      list: {
        flags: {},
        handler: async () => {
          process.exit(await executeList(process.cwd()));
        },
      },
    },
  },

  ps: {
    flags: {
      active: { type: "boolean" },
      all: { type: "boolean" },
      status: { type: "string", values: ["running", "awaiting-resume", "awaiting-merge", "failed", "terminated", "archived", "canceled"] as const },
    },
    handler: async (parsed) => {
      await runPs({
        active: !!parsed.flags["active"],
        all: !!parsed.flags["all"],
        status: parsed.flags["status"] as string | undefined,
      });
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
      const prRaw = parsed.flags["pr"] as string | undefined;
      const prNumber = prRaw ? parseInt(prRaw, 10) : undefined;
      try {
        process.exit(
          await runFinish({
            slug: parsed.positional,
            prNumber,
            jobId: parsed.flags["job"] as string | undefined,
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

  rm: {
    flags: {
      force: { type: "boolean" },
      "all-terminated": { type: "boolean" },
      yes: { type: "boolean" },
    },
    positional: { name: "jobId", required: false },
    handler: async (parsed) => {
      try {
        process.exit(
          await runRm({
            jobId: parsed.positional,
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
      from: { type: "string", values: ["critic", "fixer", "creator"] as const },
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
};
