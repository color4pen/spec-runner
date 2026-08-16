#!/usr/bin/env node
/**
 * specrunner CLI entrypoint.
 * Single dispatch flow via resolveCommand — no switch/case.
 */

import { COMMANDS, USAGE, NO_DETAILED_HELP_USAGE, resolveCommand, resolveEffectiveRequiresRepo } from "../src/cli/command-registry.js";
import { parseFlags, FlagParseError } from "../src/cli/flag-parser.js";
import { detectWorktree } from "../src/core/worktree/detection.js";
import { SpecRunnerError, EXIT_CODE, worktreeGuardError, repoRequiredError } from "../src/errors.js";
import { getVersion } from "../src/cli/version.js";
import { buildCommandContext } from "../src/cli/command-context.js";


function emitHelp(usage: string | undefined): never {
  process.stdout.write(usage ?? NO_DETAILED_HELP_USAGE);
  process.exit(0);
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const first = args[0];

  if (first === "--help" || first === "-h") {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (first === "--version") {
    process.stdout.write(`${getVersion()}\n`);
    process.exit(0);
  }
  if (!first) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const resolved = resolveCommand(args);

  if (resolved.status !== "ok") {
    // Honour --help for parent nodes (e.g. `rules --help`, `job --help`)
    const hasHelp = args.some((a) => a === "--help" || a === "-h" || a.startsWith("--help="));
    if (hasHelp && resolved.parent) {
      const detail = COMMANDS[resolved.parent]?.help?.detail;
      if (detail) {
        emitHelp(detail);
      } else {
        const subNames = resolved.availableChildren?.join("|") ?? "";
        emitHelp(`Usage: specrunner ${resolved.parent} <${subNames}>\n`);
      }
    }

    if (resolved.status === "unknown-command") {
      process.stderr.write(`Unknown command: ${resolved.token}\n\n`);
      process.stderr.write(USAGE);
      process.exit(2);
    }
    if (resolved.status === "unknown-subcommand") {
      process.stderr.write(`Unknown ${resolved.parent} subcommand: ${resolved.token}\n\n`);
      const subNames = resolved.availableChildren?.join("|") ?? "";
      process.stderr.write(`Usage: specrunner ${resolved.parent} ${subNames}\n`);
      process.exit(2);
    }
    // needs-subcommand
    process.stderr.write(`Error: specrunner ${resolved.parent} requires a subcommand.\n\n`);
    const subNames = resolved.availableChildren?.join("|") ?? "";
    process.stderr.write(`Usage: specrunner ${resolved.parent} ${subNames}\n`);
    process.exit(2);
  }

  const { spec, restArgs, canonicalPath } = resolved;
  const commandLabel = canonicalPath.join(" ");

  // Pre-scan restArgs for --help / -h before any other processing.
  const rawHasHelp = restArgs.some(
    (a) => a === "--help" || a === "-h" || a.startsWith("--help="),
  );
  if (rawHasHelp) {
    emitHelp(spec.help?.detail);
  }

  // Worktree guard (before parseFlags — original priority preserved)
  if (spec.worktreeGuard) {
    const detection = await detectWorktree(process.cwd());
    if (detection.isWorktree) {
      const err = worktreeGuardError(commandLabel, detection.mainWorktreePath ?? process.cwd());
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
      process.exit(EXIT_CODE.ARG_ERROR);
    }
  }

  // Parse flags
  const positionalDef = spec.args?.[0];
  let parsed: ReturnType<typeof parseFlags>;
  try {
    parsed = parseFlags(restArgs, spec.flags ?? {}, positionalDef);
  } catch (e) {
    if (e instanceof FlagParseError) {
      process.stderr.write(e.message + "\n");
      process.stderr.write(spec.help?.detail ?? USAGE);
      process.exit(2);
    }
    process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }

  // Build context
  const ctx = await buildCommandContext(process.cwd());
  if (resolveEffectiveRequiresRepo(COMMANDS, canonicalPath) && ctx.repoRoot === null) {
    const err = repoRequiredError(commandLabel);
    process.stderr.write(`Error: ${err.message}\n`);
    process.stderr.write(`Hint: ${err.hint}\n`);
    process.exit(err.exitCode);
  }

  // Dispatch
  try {
    await spec.handler!(parsed, ctx);
  } catch (e) {
    if (e instanceof FlagParseError) {
      process.stderr.write(e.message + "\n");
      process.stderr.write(spec.help?.detail ?? USAGE);
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
