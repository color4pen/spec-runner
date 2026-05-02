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

const USAGE = `Usage: specrunner <command> [options]

Commands:
  init                   Create or update Anthropic Agent and Environment
  login                  Authenticate with GitHub via Device Flow
  run <req.md>           Run propose pipeline for a request
  ps                     List all jobs
  doctor                 Diagnose environment / config / auth prerequisites
  finish [jobId]         Merge PR and archive a completed job

Options:
  --help, -h    Show this help message

Run Options:
  --timeout=Nm  Set timeout (e.g., 30m, 300s)

Doctor Options:
  --json        Output results as machine-readable JSON

Ps Options:
  --active      Show only active (running) jobs

Finish Options:
  --slug=<slug>     Resolve job by slug instead of jobId
  --force           Force merge even with failing checks (--admin)
  --cleanup-only    Skip feature PR merge; run archive steps only
`;

export { USAGE };

const FINISH_USAGE = `Usage: specrunner finish [jobId] [options]

Merge a feature PR and archive the completed job.

Arguments:
  jobId             Job ID to finish (optional if --slug is provided or
                    exactly one awaiting-merge slug exists)

Options:
  --slug=<slug>     Resolve job by slug instead of jobId
  --force           Force merge even with failing checks (uses --admin)
  --cleanup-only    Skip feature PR merge; run archive steps only
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
      await runInit({ apiKey });
      break;
    }

    case "login": {
      await runLogin();
      break;
    }

    case "run": {
      const requestMd = args[1];
      if (!requestMd) {
        process.stderr.write("Error: specrunner run requires a <request.md> path.\n");
        process.stderr.write(USAGE);
        process.exit(2);
      }

      // Parse flags
      const timeoutFlag = args.find((a) => a.startsWith("--timeout="));
      const timeout = timeoutFlag ? timeoutFlag.slice("--timeout=".length) : undefined;

      await runRun(requestMd, { timeout });
      break;
    }

    case "ps": {
      const activeFlag = args.includes("--active");
      await runPs({ active: activeFlag });
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
      const slugFlag = finishArgs.find((a) => a.startsWith("--slug="));
      const slug = slugFlag ? slugFlag.slice("--slug=".length) : undefined;
      const force = finishArgs.includes("--force");
      const cleanupOnly = finishArgs.includes("--cleanup-only");

      // Detect unknown flags
      const knownFlags = new Set(["--force", "--cleanup-only"]);
      const unknownFlags = finishArgs.filter(
        (a) => a.startsWith("--") && !knownFlags.has(a) && !a.startsWith("--slug="),
      );
      if (unknownFlags.length > 0) {
        process.stderr.write(`Unknown flag(s): ${unknownFlags.join(", ")}\n\n`);
        process.stderr.write(FINISH_USAGE);
        process.exit(2);
      }

      // jobId is first non-flag argument
      const jobId = finishArgs.find((a) => !a.startsWith("--"));

      try {
        process.exit(await runFinish({ jobId, slug, force, cleanupOnly, cwd: process.cwd() }));
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
