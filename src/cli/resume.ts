import * as fs from "node:fs";
import * as path from "node:path";
import { SpecRunnerError, EXIT_CODE } from "../errors.js";
import { setLogLevel, logError, stderrWrite, resolveLogLevel, type LogLevel } from "../logger/stdout.js";
import { FlagParseError } from "./flag-parser.js";
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { isDetachedChild, detachSelf } from "../core/command/detach.js";
import { SLUG_REGEX } from "../util/validation-patterns.js";
// runResumeFromIssue is lazily imported inside handleJobResume to avoid a
// value-import cycle: resume-from-issue.ts → resume.ts → resume-from-issue.ts
import { resolveJobStateBySlug } from "../core/resume/resolve-job.js";
import { bootstrap } from "./bootstrap.js";
import { ResumeCommand } from "../core/command/resume.js";
import { EventBus } from "../core/event/event-bus.js";
import { wireProgressDisplay } from "./progress.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import { createIssueFidelityComparator } from "../adapter/claude-code/issue-fidelity-comparator.js";

/**
 * Resolve the heartbeat interval (seconds) from config → env → TTY-aware default.
 * Returns 0 to disable the heartbeat.
 */
function resolveHeartbeatInterval(config: SpecRunnerConfig): number {
  const cfgVal = config.progress?.heartbeatIntervalSec;
  if (cfgVal === null || cfgVal === 0) return 0;
  if (cfgVal !== undefined && cfgVal > 0) return cfgVal;

  const envVal = process.env["SPECRUNNER_HEARTBEAT_INTERVAL"];
  if (envVal === "0" || envVal === "off") return 0;
  if (envVal !== undefined) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }

  return process.stdout.isTTY ? 30 : 60;
}

export interface ResumeOptions {
  from?: string;
  force?: boolean;
  logLevel?: LogLevel;
  cwd?: string;
  /** Dispatch-resolved repo root (null = outside a repo). Forwarded to bootstrap for config load. */
  repoRoot?: string | null;
  prompt?: string;
  json?: boolean;
  noWorktree?: boolean;
  /** When true, commit dirty protected canon paths as an operator-apply commit before resuming. */
  applyCanon?: boolean;
  /** When true, adopt publish-range commits not in the ledger into synthesizedCommits before resuming. */
  adoptCommits?: boolean;
  /** Comma-separated 1-based indices of regression-gate findings to mark as wontfix. */
  wontfix?: string;
  /** Mandatory reason text when --wontfix is specified. */
  wontfixReason?: string;
}

export async function runResumeCore(slug: string, options: ResumeOptions): Promise<number> {
  setLogLevel(options.logLevel ?? "default");
  const cwd = options.cwd ?? process.cwd();

  let state: Awaited<ReturnType<typeof resolveJobStateBySlug>>;
  try {
    state = await resolveJobStateBySlug(slug, cwd);
  } catch (err) {
    logError((err as Error).message);
    return 1;
  }
  const repo = state
    ? { owner: state.repository.owner, name: state.repository.name }
    : { owner: "", name: "" };

  let runtime: Awaited<ReturnType<typeof bootstrap>>["runtime"];
  let config: Awaited<ReturnType<typeof bootstrap>>["config"];
  try {
    ({ runtime, config } = await bootstrap(cwd, repo, options.repoRoot ?? null));
  } catch (err) {
    const e = err as Error & { hint?: string };
    logError(e.message);
    if (err instanceof SpecRunnerError && e.hint) stderrWrite(`Hint: ${e.hint}`);
    return 1;
  }

  const events = new EventBus();
  const logLevel = options.logLevel ?? "default";
  const progress = wireProgressDisplay(events, {
    logLevel,
    slug,
    heartbeatIntervalSec: resolveHeartbeatInterval(config),
  });
  try {
    return await new ResumeCommand(
      runtime,
      events,
      slug,
      {
        ...options,
        noWorktree: options.noWorktree,
        applyCanon: options.applyCanon,
        adoptCommits: options.adoptCommits,
        wontfix: options.wontfix,
        wontfixReason: options.wontfixReason,
      },
      (config) => createIssueFidelityComparator(config),
    ).execute();
  } catch (err) {
    logError((err as Error).message);
    return 1;
  } finally {
    progress.dispose();
  }
}

export async function runResume(slug: string, options: ResumeOptions): Promise<void> {
  process.exit(await runResumeCore(slug, options));
}

/**
 * CLI handler for `specrunner job resume`.
 * Extracted from command-registry.ts inline handler (T-08).
 */
export async function handleJobResume(parsed: ParsedArgs, ctx?: CommandContext): Promise<void> {
  if (parsed.flags["detach"] && parsed.flags["json"]) {
    logError("--detach and --json are mutually exclusive");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  const fromIssue = typeof parsed.flags["from-issue"] === "number" ? parsed.flags["from-issue"] : undefined;

  // Exclusivity: --from-issue + positional slug
  if (fromIssue !== undefined && parsed.positional !== undefined) {
    logError("Usage error: --from-issue and positional <slug> are mutually exclusive");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  // Prompt resolution (shared by both --from-issue and slug paths)
  const promptText = parsed.flags["prompt"] as string | undefined;
  const promptFile = parsed.flags["prompt-file"] as string | undefined;

  if (promptText !== undefined && promptFile !== undefined) {
    throw new FlagParseError("--prompt and --prompt-file are mutually exclusive.");
  }

  let resolvedPrompt: string | undefined;
  if (promptFile !== undefined) {
    try {
      resolvedPrompt = fs.readFileSync(path.resolve(process.cwd(), promptFile), "utf-8");
    } catch (err) {
      logError(`Cannot read prompt file '${promptFile}': ${(err as Error).message}`);
      process.exit(1);
    }
  } else {
    resolvedPrompt = promptText;
  }

  if (resolvedPrompt !== undefined) {
    stderrWrite("Warning: --prompt の内容は agent prompt に直接注入されます。外部入力をそのまま渡さないでください。");
  }

  const logLevel = resolveLogLevel({
    quiet: !!parsed.flags["quiet"],
    verbose: !!parsed.flags["verbose"],
    debug: !!parsed.flags["debug"],
  });

  // --from-issue path (lazy import breaks value-import cycle with resume-from-issue.ts)
  if (fromIssue !== undefined) {
    const { runResumeFromIssue } = await import("./resume-from-issue.js");
    const code = await runResumeFromIssue(
      fromIssue,
      {
        detach: !!parsed.flags["detach"],
        prompt: resolvedPrompt,
        from: parsed.flags["from"] as string | undefined,
        force: !!parsed.flags["force"],
        applyCanon: !!parsed.flags["apply-canon"],
        adoptCommits: !!parsed.flags["adopt-commits"],
        wontfix: parsed.flags["wontfix"] as string | undefined,
        wontfixReason: parsed.flags["wontfix-reason"] as string | undefined,
        noWorktree: !!parsed.flags["no-worktree"],
        json: !!parsed.flags["json"],
        logLevel,
        cwd: process.cwd(),
        repoRoot: ctx?.repoRoot,
      },
      ctx,
    );
    process.exit(code);
  }

  // Normal slug path — slug is required when --from-issue is absent
  if (!parsed.positional) {
    throw new FlagParseError("Usage error: 'job resume' requires a <slug> argument or --from-issue <n>");
  }

  if (parsed.flags["detach"] && !isDetachedChild(process.env as Record<string, string | undefined>)) {
    const slug = parsed.positional;
    if (!SLUG_REGEX.test(slug)) {
      logError(`Invalid slug '${slug}' for --detach.`);
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    const code = await detachSelf({
      args: process.argv.slice(2),
      repoRoot,
      slug,
      env: process.env as Record<string, string | undefined>,
    });
    process.exit(code);
  }

  try {
    await runResume(parsed.positional, {
      from: parsed.flags["from"] as string | undefined,
      force: !!parsed.flags["force"],
      logLevel,
      cwd: process.cwd(),
      repoRoot: ctx?.repoRoot,
      prompt: resolvedPrompt,
      json: !!parsed.flags["json"],
      noWorktree: !!parsed.flags["no-worktree"],
      applyCanon: !!parsed.flags["apply-canon"],
      adoptCommits: !!parsed.flags["adopt-commits"],
      wontfix: parsed.flags["wontfix"] as string | undefined,
      wontfixReason: parsed.flags["wontfix-reason"] as string | undefined,
    });
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      stderrWrite(`Error: ${err.message}`);
      stderrWrite(`Hint: ${err.hint}`);
      process.exit(err.exitCode);
    }
    stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
