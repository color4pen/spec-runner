/**
 * ManagedAgentRunner: AgentRunner adapter for Anthropic Managed Agents.
 *
 * Implements the AgentRunner port for managed agent sessions.
 * Encapsulates the full lifecycle: session create → SSE/poll → verify → fetch result.
 *
 * Internally split into 4 private stages for cohesion (module-analysis 4-A):
 *   prepareSession   — create session + send message
 *   exchange         — SSE stream or polling until complete
 *   verifyArtifacts  — branch/path existence check (design D5)
 *   fetchResult      — read result file from GitHub (design D2)
 *
 * Design D3 (stepcontext-type-separation): JobStateStore removed. State management is executor's responsibility.
 * Design D4: register_branch custom tool removed. Branch is created by CLI setupWorkspace() before agent runs.
 * Design D5: verifyBranch / requiresCommit guard run inside adapter (not executor).
 *
 * TC-008: ManagedAgentRunner has no JobStateStore import
 * TC-009: runProposeStyle returns AgentRunResult only (no _updatedState)
 * TC-010: runPollingStyle returns AgentRunResult only (no _updatedState)
 * TC-013: ManagedAgentRunner implements AgentRunner interface (type-checked)
 * TC-014: constructor accepts sessionClient, githubClient, configStore deps
 * TC-020: ctx.branch is included in the session prompt
 * TC-030: ManagedAgentRunner.verifyBranch → error when branch not found (404)
 * TC-031: result file not found → error
 */
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../core/port/agent-runner.js";
import type { SessionClient } from "../../core/port/session-client.js";
import type { GitHubClient } from "../../core/port/github-client.js";
import type { JobState, ErrorInfo } from "../../state/schema.js";
import type { StepContext } from "../../core/types.js";
import {
  throwWrappedError,
  attachStateAndRethrow,
} from "../../core/step/executor-helpers.js";
import { getAgentId } from "../../config/getAgentId.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { DEFAULT_POLL_TIMEOUT_MS } from "./completion.js";
import { stderrWrite } from "../../logger/stdout.js";
import {
  branchNotSetError,
  sessionTerminatedError,
  changeFolderNotFoundError,
  specReviewResultNotFoundError,
  codeReviewResultNotFoundError,
  noCommitDetectedError,
} from "../../errors.js";

export interface ManagedAgentRunnerDeps {
  sessionClient: SessionClient;
  githubClient: GitHubClient;
  /** repo owner/name for GitHub API calls */
  repo: { owner: string; name: string };
}

/**
 * ManagedAgentRunner: implements AgentRunner for Anthropic Managed Agent sessions.
 *
 * TC-013: implements AgentRunner interface
 * TC-014: constructor receives sessionClient, githubClient, repo
 */
export class ManagedAgentRunner implements AgentRunner {
  private readonly sessionClient: SessionClient;
  private readonly githubClient: GitHubClient;
  private readonly repo: { owner: string; name: string };

  constructor(deps: ManagedAgentRunnerDeps) {
    this.sessionClient = deps.sessionClient;
    this.githubClient = deps.githubClient;
    this.repo = deps.repo;
  }

  /**
   * Execute the full managed agent lifecycle for one step.
   *
   * Dispatches to propose-style (SSE + custom tools) or polling-style
   * based on step.agent.role. Both share the verify + fetch stages.
   *
   * Design D3 (stepcontext-type-separation): No JobStateStore — returns AgentRunResult only.
   */
  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const step = ctx.step;

    // Propose-style: uses SSE with custom tool handling
    if (step.agent.role === "propose") {
      return this.runProposeStyle(ctx);
    }

    // Polling-style: creates session, sends message, polls until complete
    return this.runPollingStyle(ctx);
  }

  // ---------------------------------------------------------------------------
  // Stage: Propose-style (SSE)
  // ---------------------------------------------------------------------------

  /**
   * Propose-style execution:
   * 1. Create session
   * 2. Stream SSE
   * 3. Handle polling fallback
   * 4. Verify change folder (design D5)
   * 5. Return AgentRunResult
   *
   * TC-009: returns AgentRunResult only (no _updatedState)
   * TC-020: ctx.branch is embedded in streamEvents opts
   *
   * Note: register_branch tool removed (D4). Branch is set by CLI setupWorkspace()
   * before propose runs, so agent does not need to register it.
   */
  private async runProposeStyle(
    ctx: AgentRunContext,
  ): Promise<AgentRunResult> {
    const { config, state } = ctx;
    const step = ctx.step;

    const agentId = getAgentId(config, step.agent.role);
    const repoUrl = `https://github.com/${this.repo.owner}/${this.repo.name}`;

    // Stage 1: Create session (branch is already set in state by CLI)
    let sessionId: string;
    try {
      const sessionResult = await this.sessionClient.createSession({
        agentId,
        environmentId: config.environment!.id,
        repoUrl,
        githubToken: config.github!.accessToken,
        branch: ctx.branch || undefined,
      });
      sessionId = sessionResult.sessionId;
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo: ErrorInfo = {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to create session: ${errMsg}`,
        hint: "Check your API key and try again.",
      };
      throwWrappedError(errorInfo, state);
    }

    // Stage 2: SSE stream
    // TC-020: ctx.branch is passed as branch hint to streamEvents
    const abortController = new AbortController();

    const toolHandlers = new Map(
      step.toolHandlers ? [...step.toolHandlers.entries()] : [],
    );

    const ssePromise = this.sessionClient.streamEvents(sessionId!, {
      requestContent: ctx.requestContent,
      slug: ctx.slug,
      branch: ctx.branch || undefined,
      toolHandlers,
      onSseDisconnected: () => {
        // handled via sseResult.terminationReason
      },
      abortController,
    });

    const sseResult = await ssePromise;

    if (sseResult.terminated) {
      const termErr = sessionTerminatedError();
      const termErrorInfo: ErrorInfo = { code: termErr.code, message: termErr.message, hint: termErr.hint };
      attachStateAndRethrow(Object.assign(termErr, termErrorInfo), state);
    }

    // Stage 3: Polling fallback
    const needsPollingFallback =
      sseResult.terminationReason !== "end_turn" &&
      sseResult.terminationReason !== "terminated";

    if (needsPollingFallback) {
      stderrWrite("SSE disconnected; falling back to polling.");
      // Resolve wall-clock timeout from step config for polling fallback
      const resolvedConfig = getStepExecutionConfig(config, step.name, { model: step.agent.model });
      const timeoutMs = resolvedConfig.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

      const pollResult = await this.sessionClient.pollUntilComplete(sessionId!, {
        abortSignal: abortController.signal,
        timeoutMs,
      });

      if (pollResult.status !== "idle") {
        if (pollResult.error?.code === "POLL_TIMEOUT") {
          const timeoutErr = new Error(pollResult.error.message) as Error & { code: string; hint: string };
          timeoutErr.code = pollResult.error.code;
          timeoutErr.hint = pollResult.error.hint;
          return { completionReason: "timeout", resultContent: null, sessionId: sessionId!, error: timeoutErr };
        }
        const errorInfo = pollResult.error ?? sessionTerminatedError();
        throwWrappedError(errorInfo, state);
      }
    } else {
      abortController.abort();
    }

    // Stage 4: GitHub verification (design D5) — verify branch + change folder
    const effectiveBranch = ctx.branch || state.branch;

    if (effectiveBranch) {
      try {
        await this.verifyBranchViaPort(effectiveBranch);
      } catch (err) {
        if ((err as { code?: string }).code === "GITHUB_TOKEN_EXPIRED") {
          stderrWrite("GitHub token expired. Run 'specrunner login' again.");
          throw err;
        }
        stderrWrite(`Warning: Could not verify branch on GitHub: ${(err as Error).message}`);
      }

      try {
        const changeFolderPath = `openspec/changes/${ctx.slug}`;
        await this.verifyChangeFolderViaPort(
          effectiveBranch, changeFolderPath, ctx.slug,
        );
      } catch (err) {
        if (
          (err as { code?: string }).code === "CHANGE_FOLDER_NOT_FOUND" ||
          (err as { code?: string }).code === "GITHUB_TOKEN_EXPIRED"
        ) {
          throw err;
        }
        stderrWrite(`Warning: Could not verify change folder: ${(err as Error).message}`);
      }
    }

    // Return success — no resultContent for propose
    // TC-009: no _updatedState field
    return {
      completionReason: "success",
      resultContent: null,
      sessionId: sessionId!,
    };
  }

  // ---------------------------------------------------------------------------
  // Stage: Polling-style
  // ---------------------------------------------------------------------------

  /**
   * Polling-style execution:
   * 1. Resolve agentId
   * 2. Build message
   * 3. Create session
   * 4. Send message
   * 5. Poll until complete
   * 6. requiresCommit guard (design D5 + module-analysis 4-E)
   * 7. Fetch result file
   *
   * TC-010: returns AgentRunResult only (no _updatedState)
   * TC-015: equivalent to existing lifecycle
   * TC-031: result file not found → error
   */
  private async runPollingStyle(
    ctx: AgentRunContext,
  ): Promise<AgentRunResult> {
    const { config, state } = ctx;
    const step = ctx.step;

    // Resolve agentId
    let agentId: string;
    try {
      agentId = getAgentId(config, step.agent.role);
    } catch (err) {
      const errCode = (err as { code?: string }).code ?? "CONFIG_INCOMPLETE";
      const errMsg = (err as Error).message;
      const errHint = (err as { hint?: string }).hint ?? "Run 'specrunner init' to configure agents.";
      const agentIdErrorInfo: ErrorInfo = { code: errCode, message: errMsg, hint: errHint };
      throwWrappedError(agentIdErrorInfo, state);
    }

    // Build initial message
    // TC-007 (StepContext): deps only contains StepContext fields
    const stepCtx: StepContext = {
      config,
      slug: ctx.slug,
      cwd: ctx.cwd,
      request: {
        type: "feature",
        title: "",
        slug: ctx.slug,
        baseBranch: "main",
        content: ctx.requestContent,
        enabled: [],
      },
      repo: this.repo,
      dynamicContext: ctx.dynamicContext,
    };

    let initialMessage: string;
    try {
      initialMessage = step.buildMessage(state, stepCtx);
    } catch (err) {
      const errCode = (err as { code?: string }).code ?? "BUILD_MESSAGE_FAILED";
      const errMsg = (err as Error).message;
      const errHint = (err as { hint?: string }).hint ?? "Check step preconditions.";
      const buildMsgErrorInfo: ErrorInfo = { code: errCode, message: errMsg, hint: errHint };
      throwWrappedError(buildMsgErrorInfo, state);
    }

    // Branch guard
    if (!state.branch) {
      const branchErr = branchNotSetError(step.name);
      const errorInfo: ErrorInfo = { code: branchErr.code, message: branchErr.message, hint: branchErr.hint };
      throwWrappedError(errorInfo, state);
    }

    // Snapshot branch HEAD SHA before session for requiresCommit check (design D5)
    let preSessionHeadSha: string | null = null;
    if (step.requiresCommit) {
      preSessionHeadSha = await this.githubClient.getRefSha(
        this.repo.owner,
        this.repo.name,
        state.branch!,
      );
    }

    // Create session
    const repoUrl = `https://github.com/${this.repo.owner}/${this.repo.name}`;
    let sessionId: string;
    try {
      const sessionResult = await this.sessionClient.createSession({
        agentId: agentId!,
        environmentId: config.environment!.id,
        repoUrl,
        githubToken: config.github!.accessToken,
        branch: state.branch,
      });
      sessionId = sessionResult.sessionId;
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo: ErrorInfo = {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to create ${step.name} session: ${errMsg}`,
        hint: "Check your API key and try again.",
      };
      throwWrappedError(errorInfo, state);
    }

    // Send initial message
    try {
      await this.sessionClient.sendUserMessage(sessionId!, initialMessage!);
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo: ErrorInfo = {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to send initial message to ${step.name} session: ${errMsg}`,
        hint: "Check your network connection.",
      };
      throwWrappedError(errorInfo, state);
    }

    // Resolve wall-clock timeout from step config
    const resolvedConfig = getStepExecutionConfig(config, step.name, { model: step.agent.model });
    const timeoutMs = resolvedConfig.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

    // Poll until complete
    const pollResult = await this.sessionClient.pollUntilComplete(sessionId!, { timeoutMs });
    const completedAt = new Date().toISOString();

    if (pollResult.status !== "idle") {
      if (pollResult.error?.code === "POLL_TIMEOUT") {
        const timeoutErr = new Error(pollResult.error.message) as Error & { code: string; hint: string };
        timeoutErr.code = pollResult.error.code;
        timeoutErr.hint = pollResult.error.hint;
        return { completionReason: "timeout", resultContent: null, sessionId: sessionId!, error: timeoutErr };
      }
      const errorInfo = pollResult.error ?? sessionTerminatedError();
      stderrWrite(`${step.name} session was terminated by Anthropic.`);
      throwWrappedError(errorInfo, state);
    }

    // requiresCommit guard (design D5 + module-analysis 4-E)
    if (step.requiresCommit) {
      const postSessionHeadSha = await this.githubClient.getRefSha(
        this.repo.owner,
        this.repo.name,
        state.branch!,
      );
      if (postSessionHeadSha !== null && postSessionHeadSha === preSessionHeadSha) {
        const noCommitErr = noCommitDetectedError(step.name, state.branch!);
        const errorInfo: ErrorInfo = {
          code: noCommitErr.code,
          message: noCommitErr.message,
          hint: noCommitErr.hint,
        };
        throwWrappedError(Object.assign(noCommitErr, errorInfo), state);
      }
    }

    // Fetch result file (design D2)
    const resultFilePath = step.resultFilePath(state, stepCtx);

    let fileContent: string | null = null;

    if (resultFilePath !== null) {
      const effectiveBranch = state.branch!;

      // TC-031: managed adapter fetches result from GitHub
      fileContent = await this.githubClient.getRawFile(
        this.repo.owner,
        this.repo.name,
        effectiveBranch,
        resultFilePath,
      );

      if (fileContent === null) {
        const existingResults = state.steps?.[step.name] ?? [];
        const iteration = existingResults.length + 1;
        const notFoundErr = step.name === "code-review"
          ? codeReviewResultNotFoundError(ctx.slug, effectiveBranch, iteration)
          : specReviewResultNotFoundError(ctx.slug, effectiveBranch, iteration);
        stderrWrite(notFoundErr.message);
        const notFoundErrorInfo: ErrorInfo = { code: notFoundErr.code, message: notFoundErr.message, hint: notFoundErr.hint };
        attachStateAndRethrow(Object.assign(notFoundErr, notFoundErrorInfo), state);
      }
    }

    void completedAt; // used in error path above

    // TC-010: return AgentRunResult only — no _updatedState
    return {
      completionReason: "success",
      resultContent: fileContent,
      sessionId: sessionId!,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers (design D5: branch/path verification)
  // ---------------------------------------------------------------------------

  /**
   * Verify branch exists on GitHub.
   * TC-030: 404 → warning (non-fatal), 401 → token expired error
   */
  private async verifyBranchViaPort(
    branch: string,
  ): Promise<void> {
    const branchExists = await this.githubClient.verifyBranch(
      this.repo.owner,
      this.repo.name,
      branch,
    );
    if (!branchExists) {
      stderrWrite(`Warning: Branch '${branch}' not found on GitHub yet.`);
    }
  }

  /**
   * Verify change folder exists on GitHub branch.
   * Throws on CHANGE_FOLDER_NOT_FOUND or GITHUB_TOKEN_EXPIRED.
   */
  private async verifyChangeFolderViaPort(
    branch: string,
    changeFolderPath: string,
    slug: string,
  ): Promise<void> {
    const folderExists = await this.githubClient.verifyPath(
      this.repo.owner,
      this.repo.name,
      branch,
      changeFolderPath,
    );

    if (!folderExists) {
      const folderErr = changeFolderNotFoundError(slug);
      throw Object.assign(folderErr, {
        code: folderErr.code,
        message: folderErr.message,
        hint: folderErr.hint,
      });
    }
  }
}

/**
 * Factory function for creating ManagedAgentRunner.
 */
export function createManagedAgentRunner(deps: ManagedAgentRunnerDeps): ManagedAgentRunner {
  return new ManagedAgentRunner(deps);
}
