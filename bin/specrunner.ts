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
  finish [<slug>]        Squash-merge feature PR and archive (1-PR model)

Options:
  --help, -h    Show this help message

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
      const requestMd = args[1];
      if (!requestMd) {
        process.stderr.write("Error: specrunner run requires a <request.md> path.\n");
        process.stderr.write(USAGE);
        process.exit(2);
      }

      await runRun(requestMd, {});
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
