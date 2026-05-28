/**
 * ManagedAgentRunner: AgentRunner adapter for Anthropic Managed Agents.
 *
 * Implements the AgentRunner port for managed agent sessions.
 * Encapsulates the full lifecycle: session create → SSE/poll → verify → fetch result.
 *
 * Internally split into private stages per execution style:
 *   Design-style: createDesignSession → streamWithPollingFallback → verifyDesignArtifacts
 *   Polling-style: preparePollingMessage → createOrResumePollingSession → fetchResultFile
 *
 * Shared private helpers:
 *   resolveEffectiveTimeout — timeout resolution (design/polling/follow-up)
 *   executeFollowUpTurn    — follow-up turn block (design + polling)
 *   readSessionUsage       — usage read (design + polling)
 *
 * tool-driven-step-completion:
 * - guardCommit / preSessionHeadSha removed
 * - requires_action → report_result tool detection added
 * - fetchResultFile: file-not-found returns null (no longer throws)
 *
 * Design D3 (stepcontext-type-separation): JobStateStore removed. State management is executor's responsibility.
 * Design D4: register_branch custom tool removed. Branch is created by CLI setupWorkspace() before agent runs.
 *
 * TC-008: ManagedAgentRunner has no JobStateStore import
 * TC-009: runProposeStyle returns AgentRunResult only (no _updatedState)
 * TC-010: runPollingStyle returns AgentRunResult only (no _updatedState)
 * TC-013: ManagedAgentRunner implements AgentRunner interface (type-checked)
 * TC-014: constructor accepts sessionClient, githubClient, configStore deps
 * TC-020: ctx.branch is included in the session prompt
 * TC-030: ManagedAgentRunner.verifyBranch → error when branch not found (404)
 */
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../core/port/agent-runner.js";
import type { ModelUsage } from "../../core/port/model-usage.js";
import type { AgentStep } from "../../core/step/types.js";
import type { SessionClient } from "../../core/port/session-client.js";
import type { GitHubClient } from "../../core/port/github-client.js";
import type { JobState, ErrorInfo } from "../../state/schema.js";
import type { StepContext } from "../../core/types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { BaseReportResult } from "../../core/port/report-result.js";
import { DEFAULT_TOOL_RETRY } from "../../core/port/report-result.js";
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
  sessionRequiresActionError,
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
   * requestType is passed through to enable byRequestType resolution at levels 1 & 3.
   */
  private resolveEffectiveTimeout(config: SpecRunnerConfig, stepName: string, model: string, requestType?: string): number {
    const resolved = getStepExecutionConfig(config, stepName, { model }, requestType);
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
   * Handle a requires_action stop reason for report_result tool.
   * Returns { toolResult } if the custom tool call was found and handled,
   * or null if it's a different requires_action (caller should throw).
   */
  private async handleRequiresAction(
    sessionId: string,
    ctx: AgentRunContext,
  ): Promise<{ toolResult: BaseReportResult } | null> {
    const reportTool = ctx.policy?.reportTool;
    if (!reportTool) return null;

    // Look for the custom tool use event in session events
    const events = await this.sessionClient.listEvents(sessionId);
    const customToolUse = (events as Record<string, unknown>[])?.find(
      (e) =>
        e["type"] === "agent.custom_tool_use" &&
        (e["name"] === reportTool.name || e["tool_name"] === reportTool.name),
    ) as (Record<string, unknown> | undefined);

    if (!customToolUse) return null;

    const customToolUseId = customToolUse["id"] as string | undefined;
    const rawInput = customToolUse["input"] as unknown;
    const parseResult = reportTool.parseInput(rawInput);

    if (parseResult.ok) {
      // Send tool result to complete the action
      if (customToolUseId) {
        await this.sessionClient.sendEvents(sessionId, [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: customToolUseId,
            content: "ok",
          } as Record<string, unknown>,
        ]);
      }
      return { toolResult: parseResult.value };
    }

    return null;
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
    const effectiveTimeoutMs = this.resolveEffectiveTimeout(ctx.config, ctx.step.name, ctx.step.agent.model, ctx.requestType);

    // Handle requires_action for report_result in design-style (SSE path)
    let capturedToolResult: BaseReportResult | null = null;
    let followUpAttempts = 0;

    if (ctx.policy?.reportTool) {
      // Try to detect report_result tool call from the session events
      const handled = await this.handleRequiresAction(sessionId, ctx).catch(() => null);
      if (handled) {
        capturedToolResult = handled.toolResult;
        // Poll to get session to end_turn after tool result
        await this.sessionClient.pollUntilComplete(sessionId, { timeoutMs: effectiveTimeoutMs }).catch(() => {
          // Best effort
        });
      } else if (capturedToolResult === null) {
        // Tool not called — try follow-up retry
        const retryPolicy = ctx.policy?.toolReportRetry ?? DEFAULT_TOOL_RETRY;
        for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
          const retryPrompt = retryPolicy.buildPrompt({ attempt, reason: "no-tool-call" });
          await this.executeFollowUpTurn(sessionId, ctx.step, retryPrompt, effectiveTimeoutMs);
          followUpAttempts++;

          // Check if tool was called after retry
          const retryHandled = await this.handleRequiresAction(sessionId, ctx).catch(() => null);
          if (retryHandled) {
            capturedToolResult = retryHandled.toolResult;
            await this.sessionClient.pollUntilComplete(sessionId, { timeoutMs: effectiveTimeoutMs }).catch(() => {
              // Best effort
            });
            break;
          }
          if (attempt === retryPolicy.maxAttempts) break;
        }
      }
    }

    if (sseEndTurn && shouldRunFollowUp(ctx, "success")) {
      for (const followPrompt of ctx.policy.postWorkPrompts!) {
        await this.executeFollowUpTurn(sessionId, ctx.step, followPrompt, effectiveTimeoutMs);
      }
    }

    const modelUsage = await this.readSessionUsage(sessionId, ctx.step.agent.model);
    await this.verifyDesignArtifacts(ctx);

    logVerbose("session", "session completed", { sessionId, stepName: ctx.step.name, runtime: "managed" });
    return mergeFollowUpResult(
      { completionReason: "success", resultContent: null, sessionId, modelUsage, toolResult: capturedToolResult, followUpAttempts },
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

    const effectiveRequestContent = ctx.input.projectContext
      ? `${ctx.input.requestContent}\n\n<project-context>\n${ctx.input.projectContext}\n</project-context>`
      : ctx.input.requestContent;
    const effectiveRequestContentWithResume = ctx.session.resumePrompt
      ? `${effectiveRequestContent}\n\n<resume-context>\n${ctx.session.resumePrompt}\n</resume-context>`
      : effectiveRequestContent;

    const sseResult = await this.sessionClient.streamEvents(sessionId, {
      requestContent: effectiveRequestContentWithResume,
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
      const effectiveTimeoutMs = this.resolveEffectiveTimeout(config, step.name, step.agent.model, ctx.requestType);

      const pollResult = await this.sessionClient.pollUntilComplete(sessionId, {
        abortSignal: abortController.signal,
        timeoutMs: effectiveTimeoutMs,
      });

      if (pollResult.status !== "idle") {
        if (pollResult.error?.code === "POLL_TIMEOUT") {
          return buildTimeoutResult(pollResult.error, sessionId);
        }
        // Check if it's requires_action for report_result
        if (pollResult.status === "requires_action") {
          const handled = await this.handleRequiresAction(sessionId, ctx).catch(() => null);
          if (!handled) {
            throwPollError(pollResult.error, state);
          }
          // If handled, we return { sseEndTurn: false } and the caller handles it
          return { sseEndTurn: false };
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
   * 1. Prepare message (agentId + stepCtx + initialMessage)
   * 2. Create or resume session
   * 3. Poll until complete
   * 4. Handle requires_action for report_result (if applicable)
   * 5. Fetch result file (best-effort, null on not-found)
   *
   * TC-015: equivalent to existing lifecycle (without guardCommit)
   */
  private async runPollingStyle(
    ctx: AgentRunContext,
  ): Promise<AgentRunResult> {
    const { agentId, initialMessage, stepCtx } =
      await this.preparePollingMessage(ctx);

    const sessionId = await this.createOrResumePollingSession(ctx, agentId, initialMessage);

    const effectiveTimeoutMs = this.resolveEffectiveTimeout(ctx.config, ctx.step.name, ctx.step.agent.model, ctx.requestType);
    const pollResult = await this.sessionClient.pollUntilComplete(sessionId, { timeoutMs: effectiveTimeoutMs });
    const completedAt = new Date().toISOString();

    // Handle requires_action (report_result tool call detection)
    let capturedToolResult: BaseReportResult | null = null;
    let followUpAttempts = 0;

    if (pollResult.status === "requires_action") {
      const handled = await this.handleRequiresAction(sessionId, ctx).catch(() => null);
      if (handled) {
        capturedToolResult = handled.toolResult;
        // Send tool result and poll for session to complete
        await this.sessionClient.pollUntilComplete(sessionId, { timeoutMs: effectiveTimeoutMs }).catch(() => {
          // Best effort — session may already be done
        });
      } else {
        // Not a report_result call — throw the original requires_action error
        throw sessionRequiresActionError(sessionId);
      }
    } else if (pollResult.status !== "idle") {
      if (pollResult.error?.code === "POLL_TIMEOUT") {
        return buildTimeoutResult(pollResult.error, sessionId);
      }
      stderrWrite(`${ctx.step.name} session was terminated by Anthropic.`);
      throwPollError(pollResult.error, ctx.state);
    }

    // Follow-up retry for report_result if not yet called
    if (ctx.policy?.reportTool && capturedToolResult === null) {
      const retryPolicy = ctx.policy?.toolReportRetry ?? DEFAULT_TOOL_RETRY;
      for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
        const retryPrompt = retryPolicy.buildPrompt({ attempt, reason: "no-tool-call" });
        await this.executeFollowUpTurn(sessionId, ctx.step, retryPrompt, effectiveTimeoutMs);
        followUpAttempts++;

        // Check if tool was called
        const retryHandled = await this.handleRequiresAction(sessionId, ctx).catch(() => null);
        if (retryHandled) {
          capturedToolResult = retryHandled.toolResult;
          await this.sessionClient.pollUntilComplete(sessionId, { timeoutMs: effectiveTimeoutMs }).catch(() => {
            // Best effort
          });
          break;
        }
        if (attempt === retryPolicy.maxAttempts) break;
      }
    }

    // postWorkPrompts turns (tool detection is main-work-turn only)
    if (shouldRunFollowUp(ctx, "success")) {
      for (const followPrompt of ctx.policy.postWorkPrompts!) {
        await this.executeFollowUpTurn(sessionId, ctx.step, followPrompt, effectiveTimeoutMs);
      }
    }

    const modelUsage = await this.readSessionUsage(sessionId, ctx.step.agent.model);
    const fileContent = await this.fetchResultFile(ctx.step, ctx.state, stepCtx);

    void completedAt;
    logVerbose("session", "session completed", { sessionId, stepName: ctx.step.name, runtime: "managed" });
    return mergeFollowUpResult(
      { completionReason: "success", resultContent: null, sessionId, modelUsage, toolResult: capturedToolResult, followUpAttempts },
      fileContent,
    );
  }

  /**
   * Stage 1 of polling-style: resolve agentId, build initial message, apply guards.
   * Returns agentId, initialMessage, and stepCtx.
   */
  private async preparePollingMessage(ctx: AgentRunContext): Promise<{ agentId: string; initialMessage: string; stepCtx: StepContext }> {
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
        content: ctx.input.requestContent,
        adr: ctx.input.requestAdr ?? false,
      },
      dynamicContext: ctx.input.dynamicContext,
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

    if (ctx.input.projectContext) {
      initialMessage = `${initialMessage}\n\n<project-context>\n${ctx.input.projectContext}\n</project-context>`;
    }

    if (ctx.session.resumePrompt) {
      initialMessage = `${initialMessage}\n\n<resume-context>\n${ctx.session.resumePrompt}\n</resume-context>`;
    }

    // Managed agents commit+push themselves (StepExecutor.commitAndPush only runs for local runtime).
    if (state.branch) {
      initialMessage = `${initialMessage}\n\n${buildManagedGitPushInstruction(state.branch)}`;
    }

    if (!state.branch) {
      const branchErr = branchNotSetError(step.name);
      throwWrappedError({ code: branchErr.code, message: branchErr.message, hint: branchErr.hint }, state);
    }

    return { agentId: agentId!, initialMessage: initialMessage!, stepCtx };
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

    if (ctx.session.resumeSessionId) {
      // Session continuity: reuse existing session, fall back to new session on failure.
      sessionId = ctx.session.resumeSessionId;
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
   * Fetch result file from GitHub (design D2).
   * Returns null when step has no resultFilePath or file not found (best-effort).
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

    // File not found → return null (best-effort, not a hard error)
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
