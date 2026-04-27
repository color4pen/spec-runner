#!/usr/bin/env node
/**
 * specrunner CLI entrypoint.
 * Dispatches to init / login / run / ps subcommands.
 */

import { runInit } from "../src/cli/init.js";
import { runLogin } from "../src/cli/login.js";
import { runRun } from "../src/cli/run.js";
import { runPs } from "../src/cli/ps.js";

const USAGE = `Usage: specrunner <command> [options]

Commands:
  init          Create or update Anthropic Agent and Environment
  login         Authenticate with GitHub via Device Flow
  run <req.md>  Run propose pipeline for a request
  ps            List all jobs

Options:
  --help, -h    Show this help message

Run Options:
  --timeout=Nm  Set timeout (e.g., 30m, 300s)
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    process.exit(command ? 0 : 2);
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
      await runPs();
      break;
    }

    default: {
      process.stderr.write(`Unknown command: ${command}\n\n`);
      process.stderr.write(USAGE);
      process.exit(2);
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${(err as Error).message ?? String(err)}\n`);
  process.exit(1);
});
