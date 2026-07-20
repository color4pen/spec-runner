#!/usr/bin/env node
/**
 * specrunner CLI entrypoint.
 * Registry-based dispatch — no switch/case.
 */

import { COMMANDS, USAGE, RUNTIME_RESET_USAGE, NO_DETAILED_HELP_USAGE } from "../src/cli/command-registry.js";
import { parseFlags, FlagParseError } from "../src/cli/flag-parser.js";
import { detectWorktree } from "../src/core/worktree/detection.js";
import { SpecRunnerError, EXIT_CODE, worktreeGuardError, repoRequiredError } from "../src/errors.js";
import { getVersion } from "../src/cli/version.js";
import { buildCommandContext } from "../src/cli/command-context.js";

export { USAGE, RUNTIME_RESET_USAGE };

function emitHelp(usage: string | undefined): never {
  process.stdout.write(usage ?? NO_DETAILED_HELP_USAGE);
  process.exit(0);
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (command === "--version") {
    process.stdout.write(`${getVersion()}\n`);
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

  // Subcommand dispatch (e.g. request template / job start)
  if ("subcommands" in entry) {
    const sub = args[1];
    const subDef = sub ? entry.subcommands[sub] : undefined;
    if (!subDef) {
      if ((sub === "--help" || sub === "-h" || !sub) && entry.usage) {
        process.stdout.write(entry.usage);
        process.exit(0);
      }
      process.stderr.write(
        sub
          ? `Unknown ${command} subcommand: ${sub}\n\n`
          : `Error: specrunner ${command} requires a subcommand.\n\n`,
      );
      const subNames = Object.keys(entry.subcommands).join("|");
      process.stderr.write(`Usage: specrunner ${command} ${subNames}\n`);
      process.exit(2);
    }

    const subArgs = args.slice(2);

    // Pre-scan raw args for --help / -h before any other processing.
    // This ensures help takes priority even when a required positional is absent,
    // while preserving the original worktree guard priority for non-help invocations.
    const rawHasHelp = subArgs.some(
      (a) => a === "--help" || a === "-h" || a.startsWith("--help="),
    );
    if (rawHasHelp) {
      emitHelp(subDef.usage);
    }

    // Worktree guard for guarded subcommands (before parseFlags, original priority)
    if (entry.guardedSubcommands?.has(sub!)) {
      const detection = await detectWorktree(process.cwd());
      if (detection.isWorktree) {
        const err = worktreeGuardError(`${command} ${sub}`, detection.mainWorktreePath ?? process.cwd());
        process.stderr.write(`Error: ${err.message}\n`);
        process.stderr.write(`Hint: ${err.hint}\n`);
        process.exit(EXIT_CODE.ARG_ERROR);
      }
    }

    let parsed: ReturnType<typeof parseFlags>;
    try {
      parsed = parseFlags(subArgs, subDef.flags, subDef.positional);
    } catch (e) {
      if (e instanceof FlagParseError) {
        process.stderr.write(e.message + "\n");
        process.exit(2);
      }
      process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    }

    // Build dispatch-time context (single repo root resolution per invocation)
    const ctx = await buildCommandContext(process.cwd());
    if (subDef.requiresRepo && ctx.repoRoot === null) {
      const err = repoRequiredError(`${command} ${sub}`);
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
      process.exit(err.exitCode);
    }

    try {
      await subDef.handler(parsed, ctx);
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
  // Only `run` is worktree-guarded at the top level (job start/resume/finish are guarded via guardedSubcommands)
  const WORKTREE_GUARDED_COMMANDS = new Set(["run"]);

  const normalArgs = args.slice(1);

  // Pre-scan raw args for --help / -h before any other processing.
  const rawHasHelp = normalArgs.some(
    (a) => a === "--help" || a === "-h" || a.startsWith("--help="),
  );
  if (rawHasHelp) {
    emitHelp(entry.usage);
  }

  try {
    const parsed = parseFlags(normalArgs, entry.flags, entry.positional);

    if (WORKTREE_GUARDED_COMMANDS.has(command)) {
      const detection = await detectWorktree(process.cwd());
      if (detection.isWorktree) {
        throw worktreeGuardError(command, detection.mainWorktreePath ?? process.cwd());
      }
    }

    // Build dispatch-time context (single repo root resolution per invocation)
    const ctx = await buildCommandContext(process.cwd());
    if (entry.requiresRepo && ctx.repoRoot === null) {
      const err = repoRequiredError(command);
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
      process.exit(err.exitCode);
    }

    await entry.handler(parsed, ctx);
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
      process.exit(e.exitCode);
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
