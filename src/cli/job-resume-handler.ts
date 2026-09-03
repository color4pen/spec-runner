/**
 * CLI handler for `specrunner job resume`.
 * Extracted from resume.ts (T-19): uses static imports for resume-from-issue.ts to
 * eliminate the value-import cycle that was previously hidden by await import().
 *
 * Dependency direction:
 *   job-resume-handler → resume.ts (runResume)
 *   job-resume-handler → resume-from-issue.ts (runResumeFromIssue)
 *   resume-from-issue.ts → resume.ts (runResumeCore)  ← existing, unchanged
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { SpecRunnerError, EXIT_CODE } from "../errors.js";
import { logError, stderrWrite, resolveLogLevel } from "../logger/stdout.js";
import { FlagParseError } from "./flag-parser.js";
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { isDetachedChild, detachSelf } from "../core/command/detach.js";
import { SLUG_REGEX } from "../util/validation-patterns.js";
import { runResume } from "./resume.js";
import { runResumeFromIssue } from "./resume-from-issue.js";

/**
 * CLI handler for `specrunner job resume`.
 * Moved from resume.ts (T-08 → T-19). Uses static imports for all ./src/cli modules.
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

  // --from-issue path (static import — no value-import cycle with resume-from-issue.ts)
  if (fromIssue !== undefined) {
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
