#!/usr/bin/env node
/**
 * specrunner CLI entrypoint.
 * Registry-based dispatch — no switch/case.
 */

import { COMMANDS, USAGE, FINISH_USAGE } from "../src/cli/command-registry.js";
import { parseFlags, FlagParseError } from "../src/cli/flag-parser.js";
import { detectWorktree } from "../src/core/worktree/detection.js";
import { SpecRunnerError, worktreeGuardError } from "../src/errors.js";

export { USAGE, FINISH_USAGE };

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

  const entry = COMMANDS[command];
  if (!entry) {
    process.stderr.write(`Unknown command: ${command}\n\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }

  // Subcommand dispatch (e.g. request template / request validate)
  if ("subcommands" in entry) {
    const sub = args[1];
    const subDef = sub ? entry.subcommands[sub] : undefined;
    if (!subDef) {
      process.stderr.write(
        sub
          ? `Unknown ${command} subcommand: ${sub}\n\n`
          : `Error: specrunner ${command} requires a subcommand.\n\n`,
      );
      const subNames = Object.keys(entry.subcommands).join("|");
      process.stderr.write(`Usage: specrunner ${command} ${subNames}\n`);
      process.exit(2);
    }
    try {
      const parsed = parseFlags(args.slice(2), subDef.flags, subDef.positional);
      await subDef.handler(parsed);
    } catch (e) {
      if (e instanceof FlagParseError) {
        process.stderr.write(e.message + "\n");
        process.exit(2);
      }
      process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    }
    return;
  }

  // Normal command dispatch
  const WORKTREE_GUARDED_COMMANDS = new Set(["run", "finish", "resume"]);

  try {
    const parsed = parseFlags(args.slice(1), entry.flags, entry.positional);

    if (WORKTREE_GUARDED_COMMANDS.has(command)) {
      const detection = await detectWorktree(process.cwd());
      if (detection.isWorktree) {
        throw worktreeGuardError(command, detection.mainWorktreePath ?? process.cwd());
      }
    }

    await entry.handler(parsed);
  } catch (e) {
    if (e instanceof FlagParseError) {
      process.stderr.write(e.message + "\n");
      if (entry.usage) process.stderr.write(entry.usage);
      else process.stderr.write(USAGE);
      process.exit(2);
    }
    if (e instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${e.message}\n`);
      process.stderr.write(`Hint: ${e.hint}\n`);
      process.exit(1);
    }
    process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

// Only auto-invoke when running directly (not when imported in tests)
if (process.env["VITEST"] !== "true") {
  main().catch((err: unknown) => {
    process.stderr.write(`Fatal: ${(err as Error).message ?? String(err)}\n`);
    process.exit(1);
  });
}
