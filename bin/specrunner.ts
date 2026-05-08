#!/usr/bin/env node
/**
 * specrunner CLI entrypoint.
 * Dispatches to init / login / run / ps subcommands.
 */

import { runInit } from "../src/cli/init.js";
import { runLogin } from "../src/cli/login.js";
import { runRun } from "../src/cli/run.js";
import { runPs } from "../src/cli/ps.js";
import { runDoctor } from "../src/cli/doctor.js";
import { runFinish } from "../src/cli/finish.js";
import { runRm } from "../src/cli/rm.js";
import { runResume } from "../src/cli/resume.js";
import { runCreate } from "../src/cli/create.js";

const USAGE = `Usage: specrunner <command> [options]

Commands:
  init                   Create or update Anthropic Agent and Environment
  login                  Authenticate with GitHub via Device Flow
  run <req.md> [--verbose]  Run propose pipeline for a request
  create "<description>" Create a new request.md from a description
  ps                     List all jobs
  doctor                 Diagnose environment / config / auth prerequisites
  finish [<slug>]        Squash-merge feature PR and archive (1-PR model)
  rm <jobId>             Remove a job (state file + cloud session)
  resume <slug>          Resume a halted (awaiting-resume) job

Options:
  --help, -h    Show this help message

Create Options:
  "<description>"   Description of the change (required)
  --type <type>     Request type (default: new-feature)
  --slug <slug>     Slug override (default: derived from description)
  --no-llm          Use scaffold template instead of LLM
  --run             Run the pipeline after creating the request

Doctor Options:
  --json        Output results as machine-readable JSON

Ps Options:
  --active      Show only active (running) jobs
  --all         Include archived jobs

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

export { USAGE };

const FINISH_USAGE = `Usage: specrunner finish [<slug>] [options]

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

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (!command) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  switch (command) {
    case "init": {
      const apiKeyFlag = args.find((a) => a.startsWith("--api-key="));
      const apiKey = apiKeyFlag ? apiKeyFlag.slice("--api-key=".length) : undefined;
      // TC-038 / TC-041: --runtime local skips AgentSyncer and apiKey prompt
      const runtimeFlag = args.find((a) => a.startsWith("--runtime="));
      let runtime: "managed" | "local" | undefined;
      if (runtimeFlag) {
        const runtimeValue = runtimeFlag.slice("--runtime=".length);
        if (runtimeValue !== "managed" && runtimeValue !== "local") {
          process.stderr.write(
            `Unknown --runtime value: "${runtimeValue}". Valid values are "managed" or "local".\n`,
          );
          process.exit(2);
        }
        runtime = runtimeValue;
      }
      await runInit({ apiKey, runtime });
      break;
    }

    case "login": {
      await runLogin();
      break;
    }

    case "run": {
      const runArgs = args.slice(1);
      const verbose = runArgs.includes("--verbose");
      const requestMd = runArgs.find((a) => !a.startsWith("--"));
      if (!requestMd) {
        process.stderr.write("Error: specrunner run requires a <request.md> path.\n");
        process.stderr.write(USAGE);
        process.exit(2);
      }

      await runRun(requestMd, { verbose });
      break;
    }

    case "create": {
      const createArgs = args.slice(1);

      // First non-flag argument is the description (optional when --resume is set)
      const description = createArgs.find((a) => !a.startsWith("--"));

      // Parse --type <type>
      const typeFlag = createArgs.find((a) => a.startsWith("--type="));
      let createType: string | undefined;
      if (typeFlag) {
        createType = typeFlag.slice("--type=".length);
      } else {
        const typeIdx = createArgs.indexOf("--type");
        if (typeIdx !== -1 && createArgs[typeIdx + 1] && !createArgs[typeIdx + 1]!.startsWith("--")) {
          createType = createArgs[typeIdx + 1];
        }
      }

      // Parse --slug <slug>
      const slugFlag = createArgs.find((a) => a.startsWith("--slug="));
      let createSlug: string | undefined;
      if (slugFlag) {
        createSlug = slugFlag.slice("--slug=".length);
      } else {
        const slugIdx = createArgs.indexOf("--slug");
        if (slugIdx !== -1 && createArgs[slugIdx + 1] && !createArgs[slugIdx + 1]!.startsWith("--")) {
          createSlug = createArgs[slugIdx + 1];
        }
      }

      // Parse --resume <slug> / --resume=<slug>
      const resumeEqFlag = createArgs.find((a) => a.startsWith("--resume="));
      let createResume: string | undefined;
      if (resumeEqFlag) {
        createResume = resumeEqFlag.slice("--resume=".length);
      } else {
        const resumeIdx = createArgs.indexOf("--resume");
        if (resumeIdx !== -1 && createArgs[resumeIdx + 1] && !createArgs[resumeIdx + 1]!.startsWith("--")) {
          createResume = createArgs[resumeIdx + 1];
        }
      }

      const noLlm = createArgs.includes("--no-llm");
      const createRun = createArgs.includes("--run");

      // description is optional when --resume is provided (validated in runCreate)
      if (!description && !createResume) {
        process.stderr.write(
          'Error: specrunner create requires a <description> argument.\n' +
          'Usage: specrunner create "<description>" [--type <type>] [--slug <slug>] [--no-llm] [--run]\n' +
          '       specrunner create --resume <slug>\n',
        );
        process.exit(2);
      }

      await runCreate(description, {
        type: createType,
        slug: createSlug,
        noLlm,
        run: createRun,
        cwd: process.cwd(),
        resume: createResume,
      });
      break;
    }

    case "ps": {
      const activeFlag = args.includes("--active");
      const allFlag = args.includes("--all");
      await runPs({ active: activeFlag, all: allFlag });
      break;
    }

    case "doctor": {
      const jsonFlag = args.includes("--json");
      try {
        process.exit(await runDoctor({ json: jsonFlag }));
      } catch (err: unknown) {
        process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(2);
      }
      break;
    }

    case "finish": {
      const finishArgs = args.slice(1);

      if (finishArgs.includes("--help") || finishArgs.includes("-h")) {
        process.stdout.write(FINISH_USAGE);
        process.exit(0);
      }

      // Parse flags
      const prFlag = finishArgs.find((a) => a.startsWith("--pr="));
      const prNumber = prFlag ? parseInt(prFlag.slice("--pr=".length), 10) : undefined;
      const jobFlag = finishArgs.find((a) => a.startsWith("--job="));
      const jobId = jobFlag ? jobFlag.slice("--job=".length) : undefined;
      const dryRun = finishArgs.includes("--dry-run");
      const force = finishArgs.includes("--force");

      // Detect unknown flags
      const knownFlags = new Set(["--force", "--dry-run"]);
      const unknownFlags = finishArgs.filter(
        (a) =>
          a.startsWith("--") &&
          !knownFlags.has(a) &&
          !a.startsWith("--pr=") &&
          !a.startsWith("--job="),
      );
      if (unknownFlags.length > 0) {
        process.stderr.write(`Unknown flag(s): ${unknownFlags.join(", ")}\n\n`);
        process.stderr.write(FINISH_USAGE);
        process.exit(2);
      }

      // First non-flag argument is the slug (first form: specrunner finish <slug>)
      const slug = finishArgs.find((a) => !a.startsWith("--"));

      try {
        process.exit(
          await runFinish({ slug, prNumber, jobId, dryRun, force, cwd: process.cwd() }),
        );
      } catch (err: unknown) {
        process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
      break;
    }

    case "rm": {
      const rmArgs = args.slice(1);

      // Parse flags
      const force = rmArgs.includes("--force");
      const allTerminated = rmArgs.includes("--all-terminated");
      const yes = rmArgs.includes("--yes");

      // Detect unknown flags
      const knownRmFlags = new Set(["--force", "--all-terminated", "--yes"]);
      const unknownRmFlags = rmArgs.filter(
        (a) => a.startsWith("--") && !knownRmFlags.has(a),
      );
      if (unknownRmFlags.length > 0) {
        process.stderr.write(`Unknown flag(s): ${unknownRmFlags.join(", ")}\n\n`);
        process.stderr.write(USAGE);
        process.exit(2);
      }

      // First non-flag argument is the jobId
      const jobId = rmArgs.find((a) => !a.startsWith("--"));

      try {
        process.exit(await runRm({ jobId, force, allTerminated, yes }));
      } catch (err: unknown) {
        process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
      break;
    }

    case "resume": {
      const resumeArgs = args.slice(1);

      // First non-flag argument is the slug
      const resumeSlug = resumeArgs.find((a) => !a.startsWith("--"));
      if (!resumeSlug) {
        process.stderr.write("Error: specrunner resume requires a <slug> argument.\n");
        process.stderr.write(USAGE);
        process.exit(2);
      }

      // Parse --from=<value> flag
      const fromFlag = resumeArgs.find((a) => a.startsWith("--from="));
      let fromValue: string | undefined;
      if (fromFlag) {
        fromValue = fromFlag.slice("--from=".length);
        if (fromValue !== "critic" && fromValue !== "fixer" && fromValue !== "creator") {
          process.stderr.write(
            `Error: Invalid --from value: "${fromValue}". Valid values are: critic, fixer, creator.\n`,
          );
          process.exit(2);
        }
      }

      const resumeForce = resumeArgs.includes("--force");
      const resumeVerbose = resumeArgs.includes("--verbose");

      // Detect unknown flags
      const knownResumeFlags = new Set(["--force", "--verbose"]);
      const unknownResumeFlags = resumeArgs.filter(
        (a) =>
          a.startsWith("--") &&
          !knownResumeFlags.has(a) &&
          !a.startsWith("--from="),
      );
      if (unknownResumeFlags.length > 0) {
        process.stderr.write(`Unknown flag(s): ${unknownResumeFlags.join(", ")}\n\n`);
        process.stderr.write(USAGE);
        process.exit(2);
      }

      try {
        await runResume(resumeSlug, {
          from: fromValue,
          force: resumeForce,
          verbose: resumeVerbose,
          cwd: process.cwd(),
        });
      } catch (err: unknown) {
        process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
      break;
    }

    default: {
      process.stderr.write(`Unknown command: ${command}\n\n`);
      process.stderr.write(USAGE);
      process.exit(2);
    }
  }
}

// Only auto-invoke when running directly (not when imported in tests)
if (process.env["VITEST"] !== "true") {
  main().catch((err: unknown) => {
    process.stderr.write(`Fatal: ${(err as Error).message ?? String(err)}\n`);
    process.exit(1);
  });
}
