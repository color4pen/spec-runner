import * as path from "node:path";
import type { Step, AgentStep, CliStep } from "./types.js";
import type { JobState, Verdict } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { GitHubClient } from "../port/github-client.js";
import type { EventBus } from "../event/event-bus.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { pushStepResult } from "../../state/helpers.js";
import { getAgentId } from "../../config/getAgentId.js";
import { stderrWrite } from "../../logger/stdout.js";
import {
  branchNotRegisteredError,
  branchNotSetError,
  sessionTerminatedError,
  changeFolderNotFoundError,
  specReviewResultNotFoundError,
  codeReviewResultNotFoundError,
} from "../../errors.js";
import {
  createSessionWithHistory,
  recordFailedStepResult,
  attachStateAndRethrow,
  throwWrappedError,
  failStepWithError,
} from "./executor-helpers.js";

/**
 * StepExecutor encapsulates the I/O lifecycle for any Step.
 * It receives injected dependencies (EventBus) and drives the session lifecycle.
 *
 * Design D3: StepExecutor is the executor; Step is the declaration.
 */
export class StepExecutor {
  constructor(
    private readonly events: EventBus,
  ) {}

  /**
   * Execute a single step, driving the full I/O lifecycle:
   * 1. emit step:start
   * 2. Create session and send initial message
   * 3. Poll or SSE until complete
   * 4. Fetch result file (if any)
   * 5. Parse result
   * 6. emit verdict:parsed
   * 7. appendStepRun (via pushStepResult for backward compat)
   * 8. emit step:complete or step:error
   *
   * Error semantics: on failure, attaches `err.state` and rethrows.
   */
  async execute(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    this.events.emit("step:start", { step: step.name, state: jobState });

    try {
      const result = await this.runStepInternal(step, jobState, deps);
      this.events.emit("step:complete", { step: step.name, state: result });
      return result;
    } catch (err) {
      const errState = (err as Record<string, unknown>)["state"] as JobState | undefined;
      this.events.emit("step:error", {
        step: step.name,
        error: err as Error,
        state: errState ?? jobState,
      });
      throw err;
    }
  }

  /**
   * Internal: run the step lifecycle, returning the updated state.
   * Dispatches on step.kind — never on step name.
   *
   * kind === "cli": calls step.run(), reads resultFilePath, emits events.
   * kind === "agent": creates session, polls, fetches result (propose-style or polling-style).
   */
  private async runStepInternal(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    if (step.kind === "cli") {
      return this.runCliStep(step, jobState, deps);
    }
    // kind === "agent"
    if (step.toolHandlers && step.toolHandlers.size > 0) {
      return this.runProposeStyleStep(step, jobState, deps);
    } else {
      return this.runPollingStyleStep(step, jobState, deps);
    }
  }

  /**
   * Get or create a JobStateStore for the given job ID.
   * Cached on the executor instance to avoid redundant constructions within a step.
   */
  private getStore(jobId: string): JobStateStore {
    if (!this.storeCache || this.storeCacheJobId !== jobId) {
      this.storeCache = new JobStateStore(jobId);
      this.storeCacheJobId = jobId;
    }
    return this.storeCache;
  }

  private storeCache: JobStateStore | undefined;
  private storeCacheJobId: string | undefined;

  /**
   * CLI step: runs step.run() directly (no session creation).
   * Reads the result file after run() completes and parses verdict.
   * Emits verdict:parsed with the parsed result (null → "escalation").
   */
  private async runCliStep(
    step: CliStep,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const store = this.getStore(jobState.jobId);
    let state = await store.update(jobState, { step: step.name });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "step-transition",
      status: "ok",
      message: `Transitioning to ${step.name} step`,
    });

    const completedAt = new Date().toISOString();

    try {
      await step.run(state, deps);
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo = {
        code: "CLI_STEP_FAILED",
        message: `${step.name} failed: ${errMsg}`,
        hint: `Check the ${step.name} output for details.`,
      };
      state = await store.fail(state, errorInfo, step.name);
      state = recordFailedStepResult(state, step.name, errorInfo, {
        completedAt,
      });
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    // Read the result file and parse verdict
    const resultFilePath = step.resultFilePath(state, deps);
    const findingsPath = resultFilePath;

    // Read the result file from disk (not GitHub — CLI steps write locally)
    let fileContent: string | null = null;
    try {
      const { readFile } = await import("node:fs/promises");
      const cwd = deps.cwd ?? process.cwd();
      fileContent = await readFile(
        path.resolve(cwd, resultFilePath),
        "utf-8",
      );
    } catch {
      // File may not exist yet — treat as null verdict
    }

    let verdict: Verdict | null = null;
    if (fileContent !== null) {
      const parsed = step.parseResult(fileContent, deps);
      verdict = parsed.verdict;
    }

    if (verdict === null) {
      stderrWrite(`Warning: Could not parse verdict from ${findingsPath}. Treating as escalation.`);
    }
    verdict = verdict ?? "escalation";

    this.events.emit("verdict:parsed", { step: step.name, outcome: { verdict } });

    state = pushStepResult(state, step.name, {
      session: null,
      verdict: verdict as Verdict | null,
      findingsPath,
      fileContent,
      completedAt,
      error: null,
    });

    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-verdict`,
      status: "ok",
      message: `${step.name} verdict: ${verdict}`,
    });

    state = await store.update(state, { status: "success" });
    await store.persist(state);

    return state;
  }

  /**
   * Propose-style step: uses SSE with custom tool handling via SessionClient port.
   * Used by ProposeStep.
   */
  private async runProposeStyleStep(
    step: AgentStep,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const { client, config, repo, request, slug } = deps;
    const store = this.getStore(jobState.jobId);

    // Resolve agent ID directly from step.agent.role (no STEP_AGENT_ROLE lookup)
    const agentId = getAgentId(config, step.agent.role);

    // 1. Create session
    const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
    const { state: sessionState, sessionId } = await createSessionWithHistory(
      store,
      jobState,
      client,
      {
        agentId,
        environmentId: config.environment!.id,
        repoUrl,
        githubToken: config.github!.accessToken,
      },
      {
        stepLabel: "session-create",
        errorCode: "SESSION_CREATE_FAILED",
        errorMessageFmt: (msg) => `Failed to create session: ${msg}`,
        errorHint: "Check your API key and try again.",
      },
    );
    let state = sessionState;

    // Track registered branch and slug from SSE
    let registeredBranch: string | null = null;
    let registeredSlug: string | null = null;

    // 2. Start SSE session via SessionClient port
    const abortController = new AbortController();

    const ssePromise = client.streamEvents(sessionId, {
      requestContent: request.content,
      slug,
      toolHandlers: step.toolHandlers,
      onBranchRegistered: (branch) => {
        registeredBranch = branch;
      },
      onSlugRegistered: (s) => {
        registeredSlug = s;
      },
      onSseDisconnected: () => {
        // handled via sseResult.terminationReason
      },
      abortController,
    });

    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "events-stream-connected",
      status: "ok",
      message: "SSE stream connected",
    });

    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "initial-message-sent",
      status: "ok",
      message: "Initial message sent to session",
    });

    // 3. Wait for SSE to complete
    const sseResult = await ssePromise;

    if (sseResult.terminated) {
      const termErr = sessionTerminatedError();
      const termErrorInfo = { code: termErr.code, message: termErr.message, hint: termErr.hint };
      state = await store.fail(state, termErrorInfo);
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "session-terminated",
        status: "error",
        message: "Session terminated by Anthropic",
      });
      state = recordFailedStepResult(state, step.name, termErrorInfo, {
        session: state.session,
        completedAt: new Date().toISOString(),
      });
      await store.persist(state);
      attachStateAndRethrow(termErr, state);
    }

    // 4. Polling fallback if needed
    const needsPollingFallback =
      sseResult.terminationReason !== "end_turn" &&
      sseResult.terminationReason !== "terminated";

    if (needsPollingFallback) {
      stderrWrite("SSE disconnected; falling back to polling.");
      const pollResult = await client.pollUntilComplete(sessionId, {
        sleepFn: deps.sleepFn,
        abortSignal: abortController.signal,
      });

      if (pollResult.status !== "idle") {
        const errorInfo = pollResult.error ?? sessionTerminatedError();

        state = await store.appendHistory(state, {
          ts: new Date().toISOString(),
          step: "session-terminated",
          status: "error",
          message: errorInfo.message,
        });
        state = await store.fail(state, errorInfo, "session-poll");
        state = recordFailedStepResult(state, step.name, errorInfo, {
          session: state.session,
          completedAt: new Date().toISOString(),
        });
        await store.persist(state);
        throwWrappedError(errorInfo, state);
      }
    } else {
      abortController.abort();
    }

    // 5. Handle branch registration (and optional slug)
    if (registeredBranch) {
      // Build updated request with slug if provided by handler
      const updatedRequest = registeredSlug
        ? { ...state.request, slug: registeredSlug }
        : state.request;
      state = await store.update(state, { branch: registeredBranch, request: updatedRequest });
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "register-branch-received",
        status: "ok",
        message: registeredBranch,
      });
    }

    const completionStatus = sseResult.terminationReason === "end_turn" ? "ok" : "warning";
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "idle-end-turn-detected",
      status: completionStatus,
      message: sseResult.terminationReason === "end_turn"
        ? "Session completed via SSE idle+end_turn"
        : "Session completed via polling fallback",
    });

    // 6. Verify branch registration
    if (!registeredBranch) {
      const branchErr = branchNotRegisteredError();
      stderrWrite("Branch was not registered by the agent.");
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "idle-end-turn-detected",
        status: "error",
        message: "register_branch was not called",
      });
      const branchErrorInfo = { code: branchErr.code, message: branchErr.message, hint: branchErr.hint };
      state = await store.fail(state, branchErrorInfo);
      state = recordFailedStepResult(state, step.name, branchErrorInfo, {
        session: state.session,
        completedAt: new Date().toISOString(),
      });
      await store.persist(state);
      attachStateAndRethrow(branchErr, state);
    }

    // 7. GitHub verification (branch + change folder) via GitHubClient port
    await this.verifyBranchViaPort(deps.githubClient, repo.owner, repo.name, registeredBranch, state, store)
      .then((updated) => { state = updated; })
      .catch(async (err) => {
        if ((err as { code?: string }).code === "GITHUB_TOKEN_EXPIRED") {
          stderrWrite("GitHub token expired. Run 'specrunner login' again.");
          state = await store.fail(state, {
            code: (err as { code: string }).code,
            message: (err as Error).message,
            hint: (err as { hint?: string }).hint ?? "",
          });
          attachStateAndRethrow(err, state);
        }
        stderrWrite(`Warning: Could not verify branch on GitHub: ${(err as Error).message}`);
        state = await store.appendHistory(state, {
          ts: new Date().toISOString(),
          step: "branch-verified",
          status: "warning",
          message: `Branch verification failed: ${(err as Error).message}`,
        });
      });

    try {
      const changeFolderPath = `openspec/changes/${slug}`;
      await this.verifyChangeFolderViaPort(
        deps.githubClient, repo.owner, repo.name, registeredBranch, changeFolderPath, slug, state, store,
      ).then((updated) => { state = updated; });
    } catch (err) {
      if (
        (err as { code?: string }).code === "CHANGE_FOLDER_NOT_FOUND" ||
        (err as { code?: string }).code === "GITHUB_TOKEN_EXPIRED"
      ) {
        throw err;
      }
      stderrWrite(`Warning: Could not verify change folder: ${(err as Error).message}`);
    }

    // 8. Mark success + record step result
    state = await store.update(state, { status: "success", step: "success" });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "success",
      status: "ok",
      message: "Propose pipeline completed successfully",
    });

    state = pushStepResult(state, step.name, {
      session: state.session,
      verdict: null,
      findingsPath: null,
      completedAt: new Date().toISOString(),
      error: null,
    });
    await store.persist(state);

    this.events.emit("verdict:parsed", { step: step.name, outcome: { verdict: null } });

    return state;
  }

  /**
   * Verify branch via GitHubClient port.
   */
  private async verifyBranchViaPort(
    githubClient: GitHubClient,
    owner: string,
    repo: string,
    branch: string,
    state: JobState,
    store: JobStateStore,
  ): Promise<JobState> {
    const branchExists = await githubClient.verifyBranch(owner, repo, branch);
    if (!branchExists) {
      stderrWrite(`Warning: Branch '${branch}' not found on GitHub yet.`);
      return store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "branch-verified",
        status: "warning",
        message: `Branch '${branch}' not found on GitHub`,
      });
    }
    return store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "branch-verified",
      status: "ok",
      message: `Branch '${branch}' verified on GitHub`,
    });
  }

  /**
   * Verify change folder via GitHubClient port.
   * Throws on CHANGE_FOLDER_NOT_FOUND or GITHUB_TOKEN_EXPIRED.
   */
  private async verifyChangeFolderViaPort(
    githubClient: GitHubClient,
    owner: string,
    repo: string,
    branch: string,
    changeFolderPath: string,
    slug: string,
    state: JobState,
    store: JobStateStore,
  ): Promise<JobState> {
    const folderExists = await githubClient.verifyPath(owner, repo, branch, changeFolderPath);

    if (!folderExists) {
      const folderErr = changeFolderNotFoundError(slug);
      const newState = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "change-folder-verified",
        status: "error",
        message: `Change folder not found: ${changeFolderPath}`,
      });
      const folderErrorInfo = { code: folderErr.code, message: folderErr.message, hint: folderErr.hint };
      const failedState = await store.fail(newState, folderErrorInfo);
      attachStateAndRethrow(folderErr, failedState);
    }

    return store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "change-folder-verified",
      status: "ok",
      message: `Change folder verified: ${changeFolderPath}`,
    });
  }

  /**
   * Polling-style step: uses SessionClient port for session management.
   * Used by spec-review, spec-fixer, implementer, and build-fixer.
   */
  private async runPollingStyleStep(
    step: AgentStep,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const { client, config, repo, slug } = deps;
    const store = this.getStore(jobState.jobId);

    // Resolve agent ID directly from step.agent.role (no STEP_AGENT_ROLE lookup)
    let agentId: string;
    try {
      agentId = getAgentId(config, step.agent.role);
    } catch (err) {
      const errCode = (err as { code?: string }).code ?? "CONFIG_INCOMPLETE";
      const errMsg = (err as Error).message;
      const errHint = (err as { hint?: string }).hint ?? "Run 'specrunner init' to configure agents.";
      const agentIdErrorInfo = { code: errCode, message: errMsg, hint: errHint };
      let state = await store.update(jobState, { step: step.name });
      state = await store.fail(state, agentIdErrorInfo, `${step.name}-agent-id`);
      state = recordFailedStepResult(state, step.name, agentIdErrorInfo);
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    // Record step transition
    let state = await store.update(jobState, { step: step.name });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "step-transition",
      status: "ok",
      message: `Transitioning to ${step.name} step`,
    });

    // Build initial message from step declaration.
    // buildMessage is a pure function — if it throws (e.g. BUILD_FIXER_NO_VERIFICATION_RESULT),
    // halt here before creating a session.
    let initialMessage: string;
    try {
      initialMessage = step.buildMessage(state, deps);
    } catch (err) {
      const errCode = (err as { code?: string }).code ?? "BUILD_MESSAGE_FAILED";
      const errMsg = (err as Error).message;
      const errHint = (err as { hint?: string }).hint ?? "Check step preconditions.";
      const buildMsgErrorInfo = { code: errCode, message: errMsg, hint: errHint };
      state = recordFailedStepResult(state, step.name, buildMsgErrorInfo);
      state = await store.fail(state, buildMsgErrorInfo, `${step.name}-build-message`);
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    // 1. Create session
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-session-create`,
      status: "started",
      message: `Creating ${step.name} session`,
    });

    // Polling-style steps run AFTER propose has registered a branch. The branch
    // is the workspace mount target — without it, the workspace is mounted at
    // main and the agent cannot see propose's change folder.
    if (!state.branch) {
      const branchErr = branchNotSetError(step.name);
      const errorInfo = { code: branchErr.code, message: branchErr.message, hint: branchErr.hint };
      state = recordFailedStepResult(state, step.name, errorInfo);
      state = await store.fail(state, errorInfo, `${step.name}-session-create`);
      await store.persist(state);
      throwWrappedError(errorInfo, state);
    }

    let sessionId: string;
    try {
      const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
      const sessionResult = await client.createSession({
        agentId,
        environmentId: config.environment!.id,
        repoUrl,
        githubToken: config.github!.accessToken,
        branch: state.branch,
      });
      sessionId = sessionResult.sessionId;
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo = {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to create ${step.name} session: ${errMsg}`,
        hint: "Check your API key and try again.",
      };
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-session-create`,
        status: "error",
        message: errorInfo.message,
      });
      state = recordFailedStepResult(state, step.name, errorInfo);
      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);
      throwWrappedError(errorInfo, state);
    }

    // 2. Send initial message
    try {
      await client.sendUserMessage(sessionId, initialMessage);
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-session-create`,
        status: "ok",
        message: sessionId,
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo = {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to send initial message to ${step.name} session: ${errMsg}`,
        hint: "Check your network connection.",
      };
      state = recordFailedStepResult(state, step.name, errorInfo);
      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);
      throwWrappedError(errorInfo, state);
    }

    // 3. Poll until complete
    const pollResult = await client.pollUntilComplete(sessionId, {
      sleepFn: deps.sleepFn,
    });

    const completedAt = new Date().toISOString();

    if (pollResult.status !== "idle") {
      const errorInfo = pollResult.error ?? sessionTerminatedError();

      stderrWrite(`${step.name} session was terminated by Anthropic.`);
      state = await store.appendHistory(state, {
        ts: completedAt,
        step: `${step.name}-terminated`,
        status: "error",
        message: errorInfo.message,
      });

      await failStepWithError(store, state, step.name, errorInfo, {
        session: { id: sessionId, agentId, environmentId: config.environment!.id },
        completedAt,
      });
    }

    state = await store.update(state, {
      session: {
        id: sessionId,
        agentId,
        environmentId: config.environment!.id,
      },
    });

    state = await store.appendHistory(state, {
      ts: completedAt,
      step: `${step.name}-completed`,
      status: "ok",
      message: `${step.name} session completed (${sessionId})`,
    });

    // 4. Fetch result file if the step has one
    const resultFilePath = step.resultFilePath(state, deps);
    let fileContent: string | null = null;
    let findingsPath: string | null = null;
    let verdict: Verdict | null = null;

    if (resultFilePath !== null) {
      findingsPath = resultFilePath;
      // state.branch is guaranteed by the pre-createSession guard above; the
      // non-null assertion encodes that invariant.
      const effectiveBranch = state.branch!;

      fileContent = await deps.githubClient.getRawFile(
        deps.repo.owner,
        deps.repo.name,
        effectiveBranch,
        findingsPath,
        { sleepFn: deps.sleepFn },
      );

      if (fileContent === null) {
        // Compute iteration for error hint: number of existing results + 1
        const existingResults = state.steps?.[step.name] ?? [];
        const iteration = existingResults.length + 1;
        const notFoundErr = step.name === "code-review"
          ? codeReviewResultNotFoundError(slug, effectiveBranch, iteration)
          : specReviewResultNotFoundError(slug, effectiveBranch, iteration);
        stderrWrite(notFoundErr.message);
        const notFoundErrorInfo = { code: notFoundErr.code, message: notFoundErr.message, hint: notFoundErr.hint };
        state = await store.fail(state, notFoundErrorInfo);
        state = recordFailedStepResult(state, step.name, notFoundErrorInfo, {
          session: state.session,
          completedAt,
        });
        await store.persist(state);
        attachStateAndRethrow(notFoundErr, state);
      }

      const parsed = step.parseResult(fileContent, deps);
      verdict = parsed.verdict;

      if (verdict === null) {
        stderrWrite(`Warning: Could not parse verdict from ${findingsPath}. Treating as escalation.`);
      }
      verdict = verdict ?? "escalation";
    }

    // emit verdict:parsed
    this.events.emit("verdict:parsed", { step: step.name, outcome: { verdict } });

    // Record step result
    state = pushStepResult(state, step.name, {
      session: state.session,
      verdict: verdict as Verdict | null,
      findingsPath,
      fileContent,
      completedAt,
      error: null,
    });

    if (verdict !== null) {
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-verdict`,
        status: "ok",
        message: `${step.name} verdict: ${verdict}`,
      });
    }

    state = await store.update(state, { status: "success" });
    await store.persist(state);

    return state;
  }

}
