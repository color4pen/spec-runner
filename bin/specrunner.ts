#!/usr/bin/env node
/**
 * specrunner CLI entrypoint.
 * Single dispatch flow via resolveCommand — no switch/case.
 *
 * Process termination is exclusively owned here.
 * Handlers return exit codes (number); process.exit() is called once, after dispatch.
 */

import { COMMANDS, USAGE, NO_DETAILED_HELP_USAGE, resolveCommand, resolveEffectiveRequiresRepo, resolveEffectiveRequiresGitHub, findActiveGitHubOnlyFlags } from "../src/cli/command-registry.js";
import { parseFlags, FlagParseError } from "../src/cli/flag-parser.js";
import { detectWorktree } from "../src/core/worktree/detection.js";
import { SpecRunnerError, EXIT_CODE, worktreeGuardError, repoRequiredError } from "../src/errors.js";
import { getVersion } from "../src/cli/version.js";
import { buildCommandContext } from "../src/cli/command-context.js";
import { maskSensitive } from "../src/logger/stdout.js";


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
      process.stderr.write(maskSensitive(e.message + "\n"));
      process.stderr.write(maskSensitive(spec.help?.detail ?? USAGE));
      process.exit(2);
    }
    process.stderr.write(maskSensitive(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`));
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

  // T-11: GitHub integration check — reject commands/flags that require GitHub when disabled.
  // Only run when ctx.repoRoot is available (so we can load the config).
  //
  // Two-level check:
  //   Level 1 (dispatch): Uses project config (github.enabled). Appropriate for new-job / issue
  //     operations where no specific job state exists yet.
  //   Level 2 (handler): Uses job's saved contract. Appropriate for job-specific flag operations
  //     (--with-merge, --merge-wait-ms) where the target job may have been started with GitHub
  //     enabled even if the current config says disabled.
  //
  // For job-specific flags (--with-merge, --merge-wait-ms) with a positional slug: try to load
  // the job state and bypass the config-level check if the job was started with GitHub enabled.
  // The handler (archive.ts) performs the definitive job-contract check.
  if (ctx.repoRoot !== null) {
    const commandRequiresGitHub = resolveEffectiveRequiresGitHub(COMMANDS, canonicalPath);
    const activeGitHubOnlyFlags = findActiveGitHubOnlyFlags(spec, parsed.flags);
    const needsGitHub = commandRequiresGitHub || activeGitHubOnlyFlags.length > 0;
    if (needsGitHub) {
      try {
        const { loadConfig } = await import("../src/config/store.js");
        const { resolveGitHubIntegrationConfig } = await import("../src/config/github-integration.js");
        const config = await loadConfig(ctx.repoRoot);
        const { enabled } = resolveGitHubIntegrationConfig(config);
        if (!enabled) {
          // For job-specific flags (--with-merge, --merge-wait-ms) with a slug positional:
          // check the job's saved contract — it may have been started with GitHub enabled.
          // These flags are never applicable to new-job creation, so job state is authoritative.
          const jobSpecificFlags = ["with-merge", "merge-wait-ms"];
          const isJobSpecificFlagOnly =
            !commandRequiresGitHub &&
            activeGitHubOnlyFlags.length > 0 &&
            activeGitHubOnlyFlags.every((f) => jobSpecificFlags.includes(f)) &&
            parsed.positional !== undefined;

          let bypassForJobContract = false;
          if (isJobSpecificFlagOnly) {
            try {
              const { JobStateStore } = await import("../src/store/job-state-store.js");
              const { getGitHubIntegration: getJobIntegration } = await import("../src/state/github-integration.js");
              const { getJobSlug } = await import("../src/state/job-slug.js");
              const allStates = await JobStateStore.list(ctx.repoRoot);
              const matchingState = allStates.find((s) => getJobSlug(s) === parsed.positional);
              if (matchingState && getJobIntegration(matchingState).enabled) {
                // Job was started with GitHub enabled → let the handler decide
                bypassForJobContract = true;
              }
            } catch {
              // Can't read job state — fall through to config-level rejection (safe default)
            }
          }

          if (!bypassForJobContract) {
            if (commandRequiresGitHub) {
              process.stderr.write(`Error: '${commandLabel}' requires GitHub integration, which is disabled in this project (github.enabled: false).\n`);
            } else {
              process.stderr.write(`Error: --${activeGitHubOnlyFlags[0]} requires GitHub integration, which is disabled in this project (github.enabled: false).\n`);
            }
            process.stderr.write(`Hint: Enable GitHub integration in .specrunner/config.json (set github.enabled: true), or omit the flag.\n`);
            process.exit(EXIT_CODE.ARG_ERROR);
          }
        }
      } catch (e) {
        // If config load fails (e.g. not a specrunner project), skip the GitHub check and
        // let the handler surface the config error with a more contextual message.
        if (e instanceof SpecRunnerError && e.code === "GITHUB_INTEGRATION_REQUIRED") {
          process.stderr.write(`Error: ${e.message}\n`);
          process.stderr.write(`Hint: ${e.hint}\n`);
          process.exit(e.exitCode);
        }
        // Other errors (CONFIG_NOT_FOUND etc.): fall through to handler
      }
    }
  }

  // Dispatch — handler returns exit code; process.exit is called once, outside the try/catch.
  // Error boundary output is masked in place (maskSensitive on the exact byte sequence that
  // was written before) so the write units, wording, and newlines stay identical.
  let code: number;
  try {
    code = await spec.handler!(parsed, ctx);
  } catch (e) {
    if (e instanceof FlagParseError) {
      process.stderr.write(maskSensitive(e.message + "\n"));
      process.stderr.write(maskSensitive(spec.help?.detail ?? USAGE));
      process.exit(2);
    }
    if (e instanceof SpecRunnerError) {
      process.stderr.write(maskSensitive(`Error: ${e.message}\n`));
      process.stderr.write(maskSensitive(`Hint: ${e.hint}\n`));
      process.exit(e.exitCode);
    }
    process.stderr.write(maskSensitive(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`));
    process.exit(1);
  }
  process.exit(code);
}

// Only auto-invoke when running directly (not when imported in tests)
if (process.env["VITEST"] !== "true") {
  main().catch((err: unknown) => {
    process.stderr.write(`Fatal: ${(err as Error).message ?? String(err)}\n`);
    process.exit(1);
  });
}
