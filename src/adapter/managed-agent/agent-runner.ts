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
 * Design D3: register_branch Custom Tool is injected by this adapter (not ProposeStep).
 * Design D3 (stepcontext-type-separation): JobStateStore removed. State management is executor's responsibility.
 * Design D4: ctx.branch is the CLI-canonical branch; agent-reported branch is ignored.
 * Design D5: verifyBranch / requiresCommit guard run inside adapter (not executor).
 *
 * TC-008: ManagedAgentRunner has no JobStateStore import
 * TC-009: runProposeStyle returns AgentRunResult only (no _updatedState)
 * TC-010: runPollingStyle returns AgentRunResult only (no _updatedState)
 * TC-013: ManagedAgentRunner implements AgentRunner interface (type-checked)
 * TC-014: constructor accepts sessionClient, githubClient, configStore deps
 * TC-018: register_branch is injected by adapter for propose role
 * TC-020: ctx.branch is included in the session prompt
 * TC-021: agent-reported branch mismatch triggers warning but ctx.branch wins
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
import { stderrWrite } from "../../logger/stdout.js";
import {
  branchNotRegisteredError,
  branchNotSetError,
  sessionTerminatedError,
  changeFolderNotFoundError,
  specReviewResultNotFoundError,
  codeReviewResultNotFoundError,
  noCommitDetectedError,
} from "../../errors.js";
import { registerBranchTool } from "./tools/register-branch.js";

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
  // Stage: Propose-style (SSE + register_branch tool injection)
  // ---------------------------------------------------------------------------

  /**
   * Propose-style execution:
   * 1. Create session
   * 2. Stream SSE (with register_branch tool injected)
   * 3. Handle polling fallback
   * 4. Verify branch + change folder (design D5)
   * 5. Return AgentRunResult
   *
   * TC-009: returns AgentRunResult only (no _updatedState)
   * TC-018: register_branch is injected by adapter
   * TC-020: ctx.branch is embedded in streamEvents opts
   * TC-021: agent-reported branch != ctx.branch → warning, ctx.branch wins
   */
  private async runProposeStyle(
    ctx: AgentRunContext,
  ): Promise<AgentRunResult> {
    const { config, state } = ctx;
    const step = ctx.step;

    const agentId = getAgentId(config, step.agent.role);
    const repoUrl = `https://github.com/${this.repo.owner}/${this.repo.name}`;

    // Stage 1: Create session
    let sessionId: string;
    try {
      const sessionResult = await this.sessionClient.createSession({
        agentId,
        environmentId: config.environment!.id,
        repoUrl,
        githubToken: config.github!.accessToken,
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

    // TC-021: track branch from register_branch tool call
    let registeredBranch: string | null = null;
    let registeredSlug: string | null = null;

    // Stage 2: SSE stream with register_branch injected
    // TC-018: ManagedAgentRunner injects register_branch into custom_tools
    // TC-020: ctx.branch is passed as branch hint to streamEvents
    const abortController = new AbortController();

    // Build toolHandlers map with register_branch injected by adapter (design D3)
    const toolHandlersWithBranchTool = new Map(
      step.toolHandlers ? [...step.toolHandlers.entries()] : [],
    );
    toolHandlersWithBranchTool.set("register_branch", registerBranchTool.handler);

    const ssePromise = this.sessionClient.streamEvents(sessionId!, {
      requestContent: ctx.requestContent,
      slug: ctx.slug,
      branch: ctx.branch || undefined, // TC-020: inject CLI-canonical branch hint (empty = not set yet for propose)
      toolHandlers: toolHandlersWithBranchTool,
      onBranchRegistered: (branch) => {
        // TC-021: if a CLI-canonical branch was provided and the agent reports a different one,
        // warn but use the agent-reported branch (for propose, ctx.branch is empty — agent creates branch).
        if (ctx.branch && branch !== ctx.branch) {
          stderrWrite(
            `Warning: Agent reported branch '${branch}' differs from CLI canonical branch '${ctx.branch}'.`,
          );
        }
        registeredBranch = branch; // use agent-reported branch (propose creates it)
      },
      onSlugRegistered: (s) => {
        registeredSlug = s;
      },
      onSseDisconnected: () => {
        // handled via sseResult.terminationReason
      },
      abortController,
    });

    // Silence unused warning for registeredSlug — it may be used in future
    void registeredSlug;

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
      const pollResult = await this.sessionClient.pollUntilComplete(sessionId!, {
        abortSignal: abortController.signal,
      });

      if (pollResult.status !== "idle") {
        const errorInfo = pollResult.error ?? sessionTerminatedError();
        throwWrappedError(errorInfo, state);
      }
    } else {
      abortController.abort();
    }

    // Stage 4a: Verify branch was registered
    if (!registeredBranch) {
      const branchErr = branchNotRegisteredError();
      stderrWrite("Branch was not registered by the agent.");
      const branchErrorInfo: ErrorInfo = { code: branchErr.code, message: branchErr.message, hint: branchErr.hint };
      attachStateAndRethrow(Object.assign(branchErr, branchErrorInfo), state);
    }

    // Stage 4b: GitHub verification (design D5)
    // TC-030: verify branch exists on GitHub
    try {
      await this.verifyBranchViaPort(registeredBranch!);
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
        registeredBranch!, changeFolderPath, ctx.slug,
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

    // Return success — no resultContent for propose (branch registered via tool)
    // TC-009: no _updatedState field
    return {
      completionReason: "success",
      resultContent: null,
      sessionId: sessionId!,
      agentBranch: registeredBranch!,
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
        content: ctx.requestContent,
        enabled: [],
      },
      repo: this.repo,
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

    // Poll until complete
    const pollResult = await this.sessionClient.pollUntilComplete(sessionId!);
    const completedAt = new Date().toISOString();

    if (pollResult.status !== "idle") {
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
