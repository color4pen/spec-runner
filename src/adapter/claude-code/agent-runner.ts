/**
 * ClaudeCodeRunner: AgentRunner adapter for Claude Code CLI (local runtime).
 *
 * Implements AgentRunner port using subprocess invocation of the claude CLI binary.
 * No SessionClient or @anthropic-ai/sdk import — fully isolated from managed adapter.
 *
 * Design D8 (design.md): composition root injects ClaudeCodeRunner when runtime === "local".
 * Design D2: resultContent fetched from local fs via fs.readFile.
 * Design D5: verifyBranch / requiresCommit via git subprocess (not GitHub API).
 * Design D9: runtime-specific git instructions injected as additionalInstructions.
 *
 * TC-022: ClaudeCodeRunner implements AgentRunner interface
 * TC-023: query() receives ctx.cwd
 * TC-024: no SessionClient / @anthropic-ai/sdk import
 * TC-025: resultContent from fs.readFile (not GitHub API)
 * TC-026: additionalInstructions contains branch checkout instruction
 * TC-027: no register_branch import
 * TC-028: requiresCommit guard — branch not advanced → error
 * TC-029: branch does not exist → error (git only, no GitHub API)
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../core/port/agent-runner.js";

export type SpawnFn = (bin: string, args: string[], opts: SpawnOptions) => ChildProcess;

/**
 * Invoke a binary with the given args using spawn, collecting stdout.
 * Resolves when the process exits with code 0; rejects otherwise.
 * stdin is written from opts.input if provided.
 */
function runSubprocess(
  spawnFn: SpawnFn,
  bin: string,
  args: string[],
  opts: { cwd: string; input?: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(bin, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${bin} exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    if (opts.input !== undefined) {
      child.stdin?.write(opts.input, "utf-8");
    }
    child.stdin?.end();
  });
}

/**
 * Find the claude CLI binary.
 * Resolves in order:
 * 1. CLAUDE_BIN env override
 * 2. System PATH (claude)
 */
function resolveClaude(): string {
  return process.env["CLAUDE_BIN"] ?? "claude";
}

/**
 * Run a git command in the given cwd and return stdout.
 * Returns null if the command fails (non-zero exit, branch not found, etc).
 *
 * Uses the injected spawnFn so that tests don't need a separate execFile injectable.
 */
async function gitExec(
  spawnFn: SpawnFn,
  cwd: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await runSubprocess(spawnFn, "git", args, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Build runtime-specific additionalInstructions for local Claude Code execution.
 *
 * TC-026: includes `git checkout -b <branch>` instruction
 * TC-027: no register_branch reference
 */
function buildAdditionalInstructions(ctx: AgentRunContext): string {
  const { branch, slug, step } = ctx;
  const lines: string[] = [];

  // Branch setup instruction (D9: adapter injects runtime-specific git ops)
  if (branch) {
    lines.push(
      `RUNTIME INSTRUCTIONS (local Claude Code mode):`,
      `- You are running locally in the repository worktree at: ${ctx.cwd}`,
      `- Work on branch: ${branch}`,
      `- If the branch does not exist yet, create it: git checkout -b ${branch}`,
      `- After completing the task, commit all changes and push: git push origin ${branch}`,
      `- Slug for this request: ${slug}`,
    );
  }

  // Step-specific instructions
  if (step.agent.role === "propose") {
    lines.push(
      `- For the propose step: create the branch ${branch}, make the initial commit with the openspec change folder, and push.`,
      `- Do NOT call register_branch — the branch name is already known (${branch}).`,
    );
  }

  return lines.join("\n");
}

export interface ClaudeCodeRunnerDeps {
  /** Working directory for Claude Code sessions (typically the git worktree root) */
  cwd?: string;
  /**
   * Override spawn function for testing.
   * Production code uses node:child_process.spawn.
   * Tests inject a mock to avoid real subprocess invocation, or inject the real spawn
   * to run actual git commands in git-based tests (TC-028, TC-029).
   */
  _spawnFn?: SpawnFn;
}

/**
 * ClaudeCodeRunner: implements AgentRunner for Claude Code CLI (local runtime).
 *
 * TC-022: implements AgentRunner interface
 * TC-024: does not import SessionClient or @anthropic-ai/sdk
 */
export class ClaudeCodeRunner implements AgentRunner {
  private readonly defaultCwd: string;
  private readonly spawnFn: SpawnFn;

  constructor(deps: ClaudeCodeRunnerDeps = {}) {
    this.defaultCwd = deps.cwd ?? process.cwd();
    this.spawnFn = deps._spawnFn ?? nodeSpawn;
  }

  /**
   * Execute the full Claude Code local lifecycle for one step.
   *
   * 1. Build prompt from step.buildMessage
   * 2. Append runtime-specific additionalInstructions
   * 3. Invoke claude CLI subprocess
   * 4. Verify branch / requiresCommit (git-based)
   * 5. Read result file from fs (not GitHub API)
   * 6. Return AgentRunResult
   */
  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const cwd = ctx.cwd || this.defaultCwd;
    const step = ctx.step;
    const state = ctx.state;

    // Build prompt
    const baseMessage = step.buildMessage(state, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: undefined as any, // not needed for local runtime
      config: ctx.config,
      repo: { owner: "", name: "" }, // repo context from cwd for local
      request: {
        type: "feature",
        title: "",
        slug: ctx.slug,
        content: ctx.requestContent,
        enabled: [],
      },
      slug: ctx.slug,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      githubClient: undefined as any, // not needed for local runtime
      cwd,
    });

    // Append runtime-specific instructions (D9)
    const additionalInstructions = buildAdditionalInstructions(ctx);
    const fullPrompt = additionalInstructions
      ? `${baseMessage}\n\n${additionalInstructions}`
      : baseMessage;

    // Snapshot branch HEAD SHA before invocation for requiresCommit check (design D5)
    let preRunHeadSha: string | null = null;
    if (step.requiresCommit && ctx.branch) {
      preRunHeadSha = await gitExec(this.spawnFn, cwd, ["rev-parse", ctx.branch]);
    }

    // TC-023: invoke claude CLI subprocess with cwd, passing prompt via stdin
    const claudeBin = resolveClaude();
    try {
      await runSubprocess(this.spawnFn, claudeBin, ["--print", "--output-format", "text"], {
        cwd,
        input: fullPrompt,
      });
    } catch (err) {
      const cause = err as Error & { code?: string };
      const isEnoent = cause.code === "ENOENT";
      const message = isEnoent
        ? `Claude Code subprocess failed: ${cause.message}`
        : `Claude Code subprocess failed: ${cause.message}`;
      const hint = isEnoent
        ? `claude CLI not found. Set CLAUDE_BIN env var or install @anthropic-ai/claude-code.`
        : undefined;
      return {
        completionReason: "error",
        resultContent: null,
        error: Object.assign(
          new Error(message),
          { code: "CLAUDE_CODE_SUBPROCESS_FAILED", cause, hint },
        ),
      };
    }

    // TC-028: requiresCommit guard — verify branch advanced (D5)
    if (step.requiresCommit && ctx.branch) {
      // TC-029: verify branch exists after agent run
      const branchExists = await gitExec(this.spawnFn, cwd, ["branch", "--list", ctx.branch]);
      if (!branchExists) {
        return {
          completionReason: "error",
          resultContent: null,
          error: Object.assign(
            new Error(`Branch '${ctx.branch}' does not exist after agent run.`),
            { code: "BRANCH_NOT_FOUND" },
          ),
        };
      }

      const postRunHeadSha = await gitExec(this.spawnFn, cwd, ["rev-parse", ctx.branch]);
      if (postRunHeadSha !== null && preRunHeadSha !== null && postRunHeadSha === preRunHeadSha) {
        return {
          completionReason: "error",
          resultContent: null,
          error: Object.assign(
            new Error(
              `branch HEAD did not advance: '${ctx.branch}' HEAD was unchanged before and after the agent run.`,
            ),
            { code: "NO_COMMIT_DETECTED" },
          ),
        };
      }
    }

    // TC-025: read result file from local fs (not GitHub API)
    const resultFilePath = step.resultFilePath(state, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: undefined as any,
      config: ctx.config,
      repo: { owner: "", name: "" },
      request: {
        type: "feature",
        title: "",
        slug: ctx.slug,
        content: ctx.requestContent,
        enabled: [],
      },
      slug: ctx.slug,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      githubClient: undefined as any,
      cwd,
    });

    let resultContent: string | null = null;
    if (resultFilePath !== null) {
      const absolutePath = path.isAbsolute(resultFilePath)
        ? resultFilePath
        : path.join(cwd, resultFilePath);
      try {
        resultContent = await fs.readFile(absolutePath, "utf-8");
      } catch {
        // TC-055: result file not found → error
        return {
          completionReason: "error",
          resultContent: null,
          error: Object.assign(
            new Error(`result file not found: ${resultFilePath}`),
            { code: "RESULT_FILE_NOT_FOUND" },
          ),
        };
      }
    }

    return {
      completionReason: "success",
      resultContent,
    };
  }
}

/**
 * Factory function for creating ClaudeCodeRunner.
 */
export function createClaudeCodeRunner(deps: ClaudeCodeRunnerDeps = {}): ClaudeCodeRunner {
  return new ClaudeCodeRunner(deps);
}
