/**
 * ManagedAgentRunner: AgentRunner adapter for Anthropic Managed Agents.
 *
 * Implements the AgentRunner port for managed agent sessions.
 * Encapsulates the full lifecycle: session create → SSE/poll → verify → fetch result.
 *
 * Internally split into private stages per execution style:
 *   Design-style: createDesignSession → streamWithPollingFallback → verifyDesignArtifacts
 *   Polling-style: preparePollingMessage → createOrResumePollingSession → guardCommit → fetchResultFile
 *
 * Shared private helpers:
 *   resolveEffectiveTimeout — timeout resolution (design/polling/follow-up)
 *   executeFollowUpTurn    — follow-up turn block (design + polling)
 *   readSessionUsage       — usage read (design + polling)
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
import type { ModelUsage } from "../../core/port/model-usage.js";
import type { AgentStep } from "../../core/step/types.js";
import type { SessionClient } from "../../core/port/session-client.js";
import type { GitHubClient } from "../../core/port/github-client.js";
import type { JobState, ErrorInfo } from "../../state/schema.js";
import type { StepContext } from "../../core/types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import {
  throwWrappedError,
  attachStateAndRethrow,
} from "../../core/step/executor-helpers.js";
import { getAgentId } from "../../config/getAgentId.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { DEFAULT_POLL_TIMEOUT_MS } from "./completion.js";
import { stderrWrite, logVerbose } from "../../logger/stdout.js";
import { shouldRunFollowUp, mergeFollowUpResult } from "../shared/follow-up.js";
import {
  throwSessionCreateError,
  throwSendMessageError,
  throwCaughtAsWrapped,
  buildTimeoutResult,
  throwPollError,
} from "./error-helpers.js";
import {
  branchNotSetError,
  sessionTerminatedError,
  changeFolderNotFoundError,
  resultFileNotFoundError,
  noCommitDetectedError,
} from "../../errors.js";
import { changeFolderPath } from "../../util/paths.js";
import { STEP_NAMES } from "../../core/step/step-names.js";

/** Build git push instruction injected into managed agent initial messages (see Design D4). */
function buildManagedGitPushInstruction(branch: string): string {
  return `After completing your changes:
1. Commit your changes to branch '${branch}'
2. Push the branch to the remote repository: git push origin ${branch}
3. Do NOT return until push is complete`;
}

export interface ManagedAgentRunnerDeps {
  sessionClient: SessionClient;
  githubClient: GitHubClient;
  /** repo owner/name for GitHub API calls */
  repo: { owner: string; name: string };
  /** GitHub token for createSession calls (injected by CLI entry layer, not read from config) */
  githubToken: string;
}

export class ManagedAgentRunner implements AgentRunner {
  private readonly sessionClient: SessionClient;
  private readonly githubClient: GitHubClient;
  private readonly repo: { owner: string; name: string };
  private readonly githubToken: string;

  constructor(deps: ManagedAgentRunnerDeps) {
    this.sessionClient = deps.sessionClient;
    this.githubClient = deps.githubClient;
    this.repo = deps.repo;
    this.githubToken = deps.githubToken;
  }

  /**
   * Execute the full managed agent lifecycle for one step.
   * Dispatches to SSE (design) or polling style based on step.agent.role.
   */
  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    return this.useSseStrategy(ctx.step)
      ? this.runDesignStyle(ctx)
      : this.runPollingStyle(ctx);
  }

  /** True when the step should use SSE streaming rather than polling. */
  private useSseStrategy(step: AgentStep): boolean {
    return step.agent.role === STEP_NAMES.DESIGN;
  }

  /**
   * Resolve effective timeout from step config with DEFAULT_POLL_TIMEOUT_MS fallback.
   * Used in design fallback (3 places: design/polling/follow-up).
   */
  private resolveEffectiveTimeout(config: SpecRunnerConfig, stepName: string, model: string): number {
    const resolved = getStepExecutionConfig(config, stepName, { model });
    return resolved.timeoutMs && resolved.timeoutMs > 0 ? resolved.timeoutMs : DEFAULT_POLL_TIMEOUT_MS;
  }

  /**
   * Execute a follow-up turn (send + poll). Caller decides whether to invoke.
   * Failures are non-fatal: logged as warnings, work turn result is preserved.
   */
  private async executeFollowUpTurn(
    sessionId: string,
    step: AgentStep,
    followUpPrompt: string,
    timeoutMs: number,
  ): Promise<void> {
    try {
      await this.sessionClient.sendUserMessage(sessionId, followUpPrompt);
      const followPollResult = await this.sessionClient.pollUntilComplete(
        sessionId, { timeoutMs },
      );
      if (followPollResult.status !== "idle") {
        stderrWrite(
          `[specrunner] warn: follow-up turn for '${step.name}' did not complete (status: ${followPollResult.status}). Continuing with work turn result.\n`,
        );
      }
    } catch (followErr) {
      stderrWrite(
        `[specrunner] warn: follow-up turn failed for '${step.name}' (session: ${sessionId}): ${(followErr as Error).message}. Continuing with work turn result.\n`,
      );
    }
  }

  /**
   * Read session usage (best-effort, session cumulative).
   * Returns modelUsage keyed by model, or undefined if unavailable.
   */
  private async readSessionUsage(sessionId: string, model: string): Promise<Record<string, ModelUsage> | undefined> {
    const sessionUsage = await this.sessionClient.getSessionUsage(sessionId);
    return sessionUsage ? { [model]: sessionUsage } : undefined;
  }

  /**
   * Design-style execution:
   * 1. Create session
   * 2. Stream SSE + handle polling fallback
   * 3. Follow-up turn (SSE end_turn only)
   * 4. Verify change folder (design D5)
   * 5. Return AgentRunResult
   *
   */
  private async runDesignStyle(
    ctx: AgentRunContext,
  ): Promise<AgentRunResult> {
    const sessionId = await this.createDesignSession(ctx);
    const streamResult = await this.streamWithPollingFallback(sessionId, ctx);
    if ("completionReason" in streamResult) return streamResult; // timeout early return

    const { sseEndTurn } = streamResult;
    const effectiveTimeoutMs = this.resolveEffectiveTimeout(ctx.config, ctx.step.name, ctx.step.agent.model);

    if (sseEndTurn && shouldRunFollowUp(ctx, "success")) {
      for (const followPrompt of ctx.followUpPrompts!) {
        await this.executeFollowUpTurn(sessionId, ctx.step, followPrompt, effectiveTimeoutMs);
      }
    }

    const modelUsage = await this.readSessionUsage(sessionId, ctx.step.agent.model);
    await this.verifyDesignArtifacts(ctx);

    logVerbose("session", "session completed", { sessionId, stepName: ctx.step.name, runtime: "managed" });
    return mergeFollowUpResult(
      { completionReason: "success", resultContent: null, sessionId, modelUsage },
      null,
    );
  }

  /**
   * Stage 1 of design-style: resolve agentId and create session.
   * Returns sessionId on success, throws SESSION_CREATE_FAILED on failure.
   *
   * Note: design-side error message does NOT include stepName (preserves original behavior:
   * "Failed to create session: ${errMsg}" vs polling "Failed to create ${step.name} session: ${errMsg}").
   */
  private async createDesignSession(ctx: AgentRunContext): Promise<string> {
    const { config, state } = ctx;
    const step = ctx.step;

    const agentId = getAgentId(config, step.agent.role);
    const repoUrl = `https://github.com/${this.repo.owner}/${this.repo.name}`;

    try {
      const sessionResult = await this.sessionClient.createSession({
        agentId,
        environmentId: config.environment!.id,
        repoUrl,
        githubToken: this.githubToken,
        branch: ctx.branch || undefined,
      });
      const sessionId = sessionResult.sessionId;
      logVerbose("session", "session created", { sessionId, stepName: step.name, runtime: "managed" });
      return sessionId;
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo: ErrorInfo = {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to create session: ${errMsg}`,
        hint: "Check your API key and try again.",
      };
      throwWrappedError(errorInfo, state);
    }
  }

  /**
   * Stage 2 of design-style: stream SSE and handle polling fallback.
   * Returns { sseEndTurn: boolean } on normal completion, or AgentRunResult on timeout.
   */
  private async streamWithPollingFallback(
    sessionId: string,
    ctx: AgentRunContext,
  ): Promise<{ sseEndTurn: boolean } | AgentRunResult> {
    const { config, state } = ctx;
    const step = ctx.step;

    const abortController = new AbortController();

    const toolHandlers = new Map(
      step.toolHandlers ? [...step.toolHandlers.entries()] : [],
    );

    const effectiveRequestContent = ctx.projectContext
      ? `${ctx.requestContent}\n\n<project-context>\n${ctx.projectContext}\n</project-context>`
      : ctx.requestContent;

    const sseResult = await this.sessionClient.streamEvents(sessionId, {
      requestContent: effectiveRequestContent,
      slug: ctx.slug,
      branch: ctx.branch || undefined,
      toolHandlers,
      onSseDisconnected: () => {
        // handled via sseResult.terminationReason
      },
      abortController,
    });

    if (sseResult.terminated) {
      attachStateAndRethrow(sessionTerminatedError(), state);
    }

    const needsPollingFallback =
      sseResult.terminationReason !== "end_turn" &&
      sseResult.terminationReason !== "terminated";

    if (needsPollingFallback) {
      stderrWrite("SSE disconnected; falling back to polling.");
      const effectiveTimeoutMs = this.resolveEffectiveTimeout(config, step.name, step.agent.model);

      const pollResult = await this.sessionClient.pollUntilComplete(sessionId, {
        abortSignal: abortController.signal,
        timeoutMs: effectiveTimeoutMs,
      });

      if (pollResult.status !== "idle") {
        if (pollResult.error?.code === "POLL_TIMEOUT") {
          return buildTimeoutResult(pollResult.error, sessionId);
        }
        throwPollError(pollResult.error, state);
      }
    } else {
      abortController.abort();
    }

    const sseEndTurn = !needsPollingFallback;
    return { sseEndTurn };
  }

  /**
   * Stage 3 of design-style: verify branch + change folder on GitHub (design D5).
   * verifyBranch: warn non-fatal, GITHUB_TOKEN_EXPIRED rethrow.
   * verifyChangeFolder: CHANGE_FOLDER_NOT_FOUND / GITHUB_TOKEN_EXPIRED rethrow, others warn.
   */
  private async verifyDesignArtifacts(ctx: AgentRunContext): Promise<void> {
    const { state } = ctx;
    const effectiveBranch = ctx.branch || state.branch;

    if (!effectiveBranch) return;

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
      const changeFolderRelPath = changeFolderPath(ctx.slug);
      await this.verifyChangeFolderViaPort(
        effectiveBranch, changeFolderRelPath, ctx.slug,
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

  /**
   * Polling-style execution:
   * 1. Prepare message (agentId + stepCtx + initialMessage + guards)
   * 2. Create or resume session
   * 3. Poll until complete
   * 4. requiresCommit guard (design D5 + module-analysis 4-E)
   * 5. Fetch result file
   *
   * TC-015: equivalent to existing lifecycle
   */
  private async runPollingStyle(
    ctx: AgentRunContext,
  ): Promise<AgentRunResult> {
    const { agentId, initialMessage, preSessionHeadSha, stepCtx } =
      await this.preparePollingMessage(ctx);

    const sessionId = await this.createOrResumePollingSession(ctx, agentId, initialMessage);

    const effectiveTimeoutMs = this.resolveEffectiveTimeout(ctx.config, ctx.step.name, ctx.step.agent.model);
    const pollResult = await this.sessionClient.pollUntilComplete(sessionId, { timeoutMs: effectiveTimeoutMs });
    const completedAt = new Date().toISOString();

    if (pollResult.status !== "idle") {
      if (pollResult.error?.code === "POLL_TIMEOUT") {
        return buildTimeoutResult(pollResult.error, sessionId);
      }
      stderrWrite(`${ctx.step.name} session was terminated by Anthropic.`);
      throwPollError(pollResult.error, ctx.state);
    }

    if (shouldRunFollowUp(ctx, "success")) {
      for (const followPrompt of ctx.followUpPrompts!) {
        await this.executeFollowUpTurn(sessionId, ctx.step, followPrompt, effectiveTimeoutMs);
      }
    }

    const modelUsage = await this.readSessionUsage(sessionId, ctx.step.agent.model);
    await this.guardCommit(ctx.step, ctx.state, preSessionHeadSha);
    const fileContent = await this.fetchResultFile(ctx.step, ctx.state, stepCtx);

    void completedAt;
    logVerbose("session", "session completed", { sessionId, stepName: ctx.step.name, runtime: "managed" });
    return mergeFollowUpResult(
      { completionReason: "success", resultContent: null, sessionId, modelUsage },
      fileContent,
    );
  }

  /**
   * Stage 1 of polling-style: resolve agentId, build initial message, apply guards.
   * Returns agentId, initialMessage, preSessionHeadSha, and stepCtx.
   */
  private async preparePollingMessage(ctx: AgentRunContext): Promise<{ agentId: string; initialMessage: string; preSessionHeadSha: string | null; stepCtx: StepContext }> {
    const { config, state } = ctx;
    const step = ctx.step;

    let agentId: string;
    try {
      agentId = getAgentId(config, step.agent.role);
    } catch (err) {
      throwCaughtAsWrapped(err, {
        code: "CONFIG_INCOMPLETE",
        hint: "Run 'specrunner managed setup' to configure agents.",
      }, state);
    }

    // TC-007 (StepContext): deps only contains StepContext fields
    let stepCtx: StepContext = {
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
        adr: ctx.requestAdr ?? false,
      },
      dynamicContext: ctx.dynamicContext,
    };

    // D3: enrichContext before buildMessage (errors propagate to StepExecutor).
    if (step.enrichContext) {
      const enriched = await step.enrichContext(stepCtx.dynamicContext!, ctx.cwd, ctx.slug);
      stepCtx = { ...stepCtx, dynamicContext: enriched };
    }

    let initialMessage: string;
    try {
      initialMessage = step.buildMessage(state, stepCtx);
    } catch (err) {
      throwCaughtAsWrapped(err, {
        code: "BUILD_MESSAGE_FAILED",
        hint: "Check step preconditions.",
      }, state);
    }

    if (ctx.projectContext) {
      initialMessage = `${initialMessage}\n\n<project-context>\n${ctx.projectContext}\n</project-context>`;
    }

    // Managed agents commit+push themselves (StepExecutor.commitAndPush only runs for local runtime).
    if (state.branch) {
      initialMessage = `${initialMessage}\n\n${buildManagedGitPushInstruction(state.branch)}`;
    }

    if (!state.branch) {
      const branchErr = branchNotSetError(step.name);
      throwWrappedError({ code: branchErr.code, message: branchErr.message, hint: branchErr.hint }, state);
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

    return { agentId: agentId!, initialMessage: initialMessage!, preSessionHeadSha, stepCtx };
  }

  /**
   * Stage 2 of polling-style: create a new session or resume an existing one.
   * Resume fallback preserves 3-stage error handling:
   *   1. sendUserMessage(resumeId) fail → warn + fallback
   *   2. fallback createSession fail → throwSessionCreateError(..., "fallback after resume failure")
   *   3. fallback sendUserMessage fail → throwSendMessageError(..., "fallback")
   * Normal path:
   *   1. createSession fail → throwSessionCreateError(errMsg, step.name, state)
   *   2. sendUserMessage fail → throwSendMessageError(errMsg, step.name, state)
   */
  private async createOrResumePollingSession(
    ctx: AgentRunContext,
    agentId: string,
    initialMessage: string,
  ): Promise<string> {
    const { config, state } = ctx;
    const step = ctx.step;
    const repoUrl = `https://github.com/${this.repo.owner}/${this.repo.name}`;

    let sessionId: string;

    if (ctx.resumeSessionId) {
      // Session continuity: reuse existing session, fall back to new session on failure.
      sessionId = ctx.resumeSessionId;
      try {
        await this.sessionClient.sendUserMessage(sessionId, initialMessage);
      } catch (resumeErr) {
        stderrWrite(
          `[specrunner] warn: managed session resume failed for '${step.name}' (session: ${sessionId}): ${(resumeErr as Error).message}. Falling back to new session.`,
        );
        // Fallback: create a new session and send the same message.
        try {
          const sessionResult = await this.sessionClient.createSession({
            agentId,
            environmentId: config.environment!.id,
            repoUrl,
            githubToken: this.githubToken,
            branch: state.branch ?? undefined,
          });
          sessionId = sessionResult.sessionId;
          logVerbose("session", "session created", { sessionId, stepName: step.name, runtime: "managed", fallback: true });
        } catch (createErr) {
          const errMsg = (createErr as Error).message;
          throwSessionCreateError(errMsg, step.name, state, "fallback after resume failure");
        }
        try {
          await this.sessionClient.sendUserMessage(sessionId!, initialMessage);
        } catch (err) {
          const errMsg = (err as Error).message;
          throwSendMessageError(errMsg, step.name, state, "fallback");
        }
      }
    } else {
      try {
        const sessionResult = await this.sessionClient.createSession({
          agentId,
          environmentId: config.environment!.id,
          repoUrl,
          githubToken: this.githubToken,
          branch: state.branch ?? undefined,
        });
        sessionId = sessionResult.sessionId;
        logVerbose("session", "session created", { sessionId, stepName: step.name, runtime: "managed" });
      } catch (err) {
        const errMsg = (err as Error).message;
        throwSessionCreateError(errMsg, step.name, state);
      }

      try {
        await this.sessionClient.sendUserMessage(sessionId!, initialMessage);
      } catch (err) {
        const errMsg = (err as Error).message;
        throwSendMessageError(errMsg, step.name, state);
      }
    }

    return sessionId!;
  }

  /**
   * Stage 3 of polling-style: verify a commit was made (requiresCommit guard).
   * Throws NO_COMMIT_DETECTED if HEAD SHA is unchanged after session.
   */
  private async guardCommit(
    step: AgentStep,
    state: JobState,
    preSessionHeadSha: string | null,
  ): Promise<void> {
    if (!step.requiresCommit) return;

    const postSessionHeadSha = await this.githubClient.getRefSha(
      this.repo.owner,
      this.repo.name,
      state.branch!,
    );
    if (postSessionHeadSha !== null && postSessionHeadSha === preSessionHeadSha) {
      const noCommitErr = noCommitDetectedError(step.name, state.branch!);
      throwWrappedError({ code: noCommitErr.code, message: noCommitErr.message, hint: noCommitErr.hint }, state);
    }
  }

  /**
   * Stage 4 of polling-style: fetch result file from GitHub (design D2).
   * Returns null when step has no resultFilePath. Throws on file not found.
   */
  private async fetchResultFile(
    step: AgentStep,
    state: JobState,
    stepCtx: StepContext,
  ): Promise<string | null> {
    const resultFilePath = step.resultFilePath(state, stepCtx);
    if (resultFilePath === null) return null;

    const effectiveBranch = state.branch!;

    const fileContent = await this.githubClient.getRawFile(
      this.repo.owner,
      this.repo.name,
      effectiveBranch,
      resultFilePath,
    );

    if (fileContent === null) {
      const notFoundErr = resultFileNotFoundError(step.name, resultFilePath, effectiveBranch);
      stderrWrite(notFoundErr.message);
      attachStateAndRethrow(notFoundErr, state);
    }

    return fileContent;
  }

  /**
   * Verify branch exists on GitHub.
   * 404 → warning (non-fatal), 401 → token expired error
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
      throw changeFolderNotFoundError(slug);
    }
  }
}

export function createManagedAgentRunner(deps: ManagedAgentRunnerDeps): ManagedAgentRunner {
  return new ManagedAgentRunner(deps);
}
