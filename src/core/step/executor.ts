import type { Step } from "./types.js";
import type { JobState, Verdict, StepName } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { GitHubClient } from "../port/github-client.js";
import type { EventBus } from "../event/event-bus.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { pushStepResult } from "../../state/helpers.js";
import { getAgentId } from "../../config/getAgentId.js";
import { stderrWrite } from "../../logger/stdout.js";
import {
  branchNotRegisteredError,
  sessionTerminatedError,
  githubTokenExpiredError,
  changeFolderNotFoundError,
  specReviewResultNotFoundError,
} from "../../errors.js";
import { buildFindingsPath, fetchSpecReviewResult } from "./spec-review.js";

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
   * Separate from execute() to cleanly separate event emission from core logic.
   */
  private async runStepInternal(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
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
   * Propose-style step: uses SSE with custom tool handling via SessionClient port.
   * Used by ProposeStep.
   */
  private async runProposeStyleStep(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const { client, config, repo, request, slug } = deps;
    const store = this.getStore(jobState.jobId);

    // Resolve agent ID directly from step.agent.role (no STEP_AGENT_ROLE lookup)
    const agentId = getAgentId(config, step.agent.role as StepName);

    // 1. Create session
    let state = await store.appendHistory(jobState, {
      ts: new Date().toISOString(),
      step: "session-create",
      status: "started",
      message: "Creating Anthropic session",
    });

    let sessionId: string;
    try {
      const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
      const sessionResult = await client.createSession({
        agentId,
        environmentId: config.environment!.id,
        repoUrl,
        githubToken: config.github!.accessToken,
      });
      sessionId = sessionResult.sessionId;

      state = await store.update(state, {
        session: {
          id: sessionId,
          agentId,
          environmentId: config.environment!.id,
        },
        step: "events-stream-connected",
      });
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "session-create",
        status: "ok",
        message: sessionId,
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      state = await store.fail(state, {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to create session: ${errMsg}`,
        hint: "Check your API key and try again.",
      }, "session-create");
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "session-create",
        status: "error",
        message: errMsg,
      });
      (err as Record<string, unknown>)["state"] = state;
      throw err;
    }

    // Track registered branch from SSE
    let registeredBranch: string | null = null;

    // 2. Start SSE session via SessionClient port
    const abortController = new AbortController();

    const ssePromise = client.streamEvents(sessionId, {
      requestContent: request.content,
      toolHandlers: step.toolHandlers,
      onBranchRegistered: (branch) => {
        registeredBranch = branch;
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
      state = await store.fail(state, {
        code: termErr.code,
        message: termErr.message,
        hint: termErr.hint,
      });
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "session-terminated",
        status: "error",
        message: "Session terminated by Anthropic",
      });
      state = pushStepResult(state, step.name, {
        session: state.session,
        verdict: null,
        findingsPath: null,
        completedAt: new Date().toISOString(),
        error: { code: termErr.code, message: termErr.message, hint: termErr.hint },
      });
      await store.persist(state);
      (termErr as unknown as Record<string, unknown>)["state"] = state;
      throw termErr;
    }

    // 4. Polling fallback if needed
    const needsPollingFallback =
      sseResult.terminationReason !== "end_turn" &&
      sseResult.terminationReason !== "terminated";

    if (needsPollingFallback) {
      stderrWrite("SSE disconnected; falling back to polling.");
      const pollResult = await client.pollUntilComplete(sessionId, {
        timeoutMs: deps.timeoutMs,
        sleepFn: deps.sleepFn,
        abortSignal: abortController.signal,
      });

      if (pollResult.status !== "idle") {
        const errorInfo = pollResult.error ?? {
          code: pollResult.status === "timeout" ? "SESSION_TIMEOUT" : "SESSION_TERMINATED",
          message: `Session ${pollResult.status}`,
          hint: "",
        };

        if (errorInfo.code === "SESSION_TERMINATED") {
          state = await store.appendHistory(state, {
            ts: new Date().toISOString(),
            step: "session-terminated",
            status: "error",
            message: errorInfo.message,
          });
        } else {
          state = await store.appendHistory(state, {
            ts: new Date().toISOString(),
            step: "session-timeout",
            status: "error",
            message: errorInfo.message,
          });
        }
        state = await store.fail(state, errorInfo, "session-poll");
        state = pushStepResult(state, step.name, {
          session: state.session,
          verdict: null,
          findingsPath: null,
          completedAt: new Date().toISOString(),
          error: errorInfo,
        });
        await store.persist(state);
        const wrappedErr = new Error(errorInfo.message) as Error & { code: string; hint: string; state: JobState };
        wrappedErr.code = errorInfo.code;
        wrappedErr.hint = errorInfo.hint;
        wrappedErr.state = state;
        throw wrappedErr;
      }
    } else {
      abortController.abort();
    }

    // 5. Handle branch registration
    if (registeredBranch) {
      state = await store.update(state, { branch: registeredBranch });
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
      state = await store.fail(state, {
        code: branchErr.code,
        message: branchErr.message,
        hint: branchErr.hint,
      });
      state = pushStepResult(state, step.name, {
        session: state.session,
        verdict: null,
        findingsPath: null,
        completedAt: new Date().toISOString(),
        error: { code: branchErr.code, message: branchErr.message, hint: branchErr.hint },
      });
      await store.persist(state);
      (branchErr as unknown as Record<string, unknown>)["state"] = state;
      throw branchErr;
    }

    // 7. GitHub verification (branch + change folder)
    // Use githubClient port if available, otherwise fall back to githubFetch
    const githubFetch = deps.githubFetch ?? fetch;
    const githubToken = config.github!.accessToken;

    if (deps.githubClient) {
      // Port path: use GitHubClient interface
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
            (err as unknown as Record<string, unknown>)["state"] = state;
            throw err;
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
    } else {
      // Legacy path: use githubFetch directly (backward compat for existing tests)
      state = await this.verifyBranchLegacy(githubFetch, githubToken, repo, registeredBranch, state, store);
      state = await this.verifyChangeFolderLegacy(githubFetch, githubToken, repo, registeredBranch, slug, state, store);
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
    githubClient: GitHubClient & { verifyPath?: (o: string, r: string, b: string, p: string) => Promise<boolean> },
    owner: string,
    repo: string,
    branch: string,
    changeFolderPath: string,
    slug: string,
    state: JobState,
    store: JobStateStore,
  ): Promise<JobState> {
    // Use verifyPath if available (GitHubApiClient), else fallback to getRawFile probe
    const folderExists = githubClient.verifyPath
      ? await githubClient.verifyPath(owner, repo, branch, changeFolderPath)
      : await githubClient.getRawFile(owner, repo, branch, changeFolderPath + "/proposal.md") !== null;

    if (!folderExists) {
      const folderErr = changeFolderNotFoundError(slug);
      const newState = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "change-folder-verified",
        status: "error",
        message: `Change folder not found: ${changeFolderPath}`,
      });
      const failedState = await store.fail(newState, {
        code: folderErr.code,
        message: folderErr.message,
        hint: folderErr.hint,
      });
      (folderErr as unknown as Record<string, unknown>)["state"] = failedState;
      throw folderErr;
    }

    return store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "change-folder-verified",
      status: "ok",
      message: `Change folder verified: ${changeFolderPath}`,
    });
  }

  /**
   * Legacy branch verification using raw fetch (for tests that don't provide githubClient).
   */
  private async verifyBranchLegacy(
    githubFetch: typeof fetch,
    githubToken: string,
    repo: { owner: string; name: string },
    registeredBranch: string,
    state: JobState,
    store: JobStateStore,
  ): Promise<JobState> {
    try {
      const branchUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/branches/${encodeURIComponent(registeredBranch)}`;
      const branchResp = await githubFetch(branchUrl, {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (branchResp.status === 401) {
        const tokenErr = githubTokenExpiredError();
        stderrWrite("GitHub token expired. Run 'specrunner login' again.");
        const newState = await store.fail(state, {
          code: tokenErr.code,
          message: tokenErr.message,
          hint: tokenErr.hint,
        });
        (tokenErr as unknown as Record<string, unknown>)["state"] = newState;
        throw tokenErr;
      }

      if (branchResp.status === 404) {
        stderrWrite(`Warning: Branch '${registeredBranch}' not found on GitHub yet.`);
        return store.appendHistory(state, {
          ts: new Date().toISOString(),
          step: "branch-verified",
          status: "warning",
          message: `Branch '${registeredBranch}' not found on GitHub`,
        });
      }

      return store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "branch-verified",
        status: "ok",
        message: `Branch '${registeredBranch}' verified on GitHub`,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "GITHUB_TOKEN_EXPIRED") {
        throw err;
      }
      stderrWrite(`Warning: Could not verify branch on GitHub: ${(err as Error).message}`);
      return store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "branch-verified",
        status: "warning",
        message: `Branch verification failed: ${(err as Error).message}`,
      });
    }
  }

  /**
   * Legacy change folder verification using raw fetch.
   */
  private async verifyChangeFolderLegacy(
    githubFetch: typeof fetch,
    githubToken: string,
    repo: { owner: string; name: string },
    registeredBranch: string,
    slug: string,
    state: JobState,
    store: JobStateStore,
  ): Promise<JobState> {
    try {
      const changeFolderPath = `openspec/changes/${slug}`;
      const encodedPath = changeFolderPath.split("/").map(encodeURIComponent).join("/");
      const folderUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${encodedPath}?ref=${encodeURIComponent(registeredBranch)}`;

      const folderResp = await githubFetch(folderUrl, {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (folderResp.status === 401) {
        const tokenErr = githubTokenExpiredError();
        stderrWrite("GitHub token expired. Run 'specrunner login' again.");
        state = await store.appendHistory(state, {
          ts: new Date().toISOString(),
          step: "change-folder-verified",
          status: "error",
          message: "GitHub token expired",
        });
        const newState = await store.fail(state, {
          code: tokenErr.code,
          message: tokenErr.message,
          hint: tokenErr.hint,
        });
        (tokenErr as unknown as Record<string, unknown>)["state"] = newState;
        throw tokenErr;
      }

      if (folderResp.status === 404) {
        const folderErr = changeFolderNotFoundError(slug);
        state = await store.appendHistory(state, {
          ts: new Date().toISOString(),
          step: "change-folder-verified",
          status: "error",
          message: `Change folder not found: ${changeFolderPath}`,
        });
        const newState = await store.fail(state, {
          code: folderErr.code,
          message: folderErr.message,
          hint: folderErr.hint,
        });
        (folderErr as unknown as Record<string, unknown>)["state"] = newState;
        throw folderErr;
      }

      return store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "change-folder-verified",
        status: "ok",
        message: `Change folder verified: ${changeFolderPath}`,
      });
    } catch (err) {
      if (
        (err as { code?: string }).code === "CHANGE_FOLDER_NOT_FOUND" ||
        (err as { code?: string }).code === "GITHUB_TOKEN_EXPIRED"
      ) {
        throw err;
      }
      stderrWrite(`Warning: Could not verify change folder: ${(err as Error).message}`);
      return state;
    }
  }

  /**
   * Polling-style step: uses SessionClient port for session management.
   * Used by spec-review and spec-fixer.
   */
  private async runPollingStyleStep(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const { client, config, repo, slug } = deps;
    const store = this.getStore(jobState.jobId);

    // Resolve agent ID directly from step.agent.role (no STEP_AGENT_ROLE lookup)
    let agentId: string;
    try {
      agentId = getAgentId(config, step.agent.role as StepName);
    } catch (err) {
      const errCode = (err as { code?: string }).code ?? "CONFIG_INCOMPLETE";
      const errMsg = (err as Error).message;
      const errHint = (err as { hint?: string }).hint ?? "Run 'specrunner init' to configure agents.";
      let state = await store.update(jobState, { step: step.name });
      state = await store.fail(state, {
        code: errCode,
        message: errMsg,
        hint: errHint,
      }, `${step.name}-agent-id`);
      state = pushStepResult(state, step.name, {
        session: null,
        verdict: null,
        findingsPath: null,
        completedAt: new Date().toISOString(),
        error: { code: errCode, message: errMsg, hint: errHint },
      });
      await store.persist(state);
      (err as Record<string, unknown>)["state"] = state;
      throw err;
    }

    // Record step transition
    let state = await store.update(jobState, { step: step.name });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "step-transition",
      status: "ok",
      message: `Transitioning to ${step.name} step`,
    });

    // Build initial message from step declaration
    const initialMessage = step.buildMessage(state, deps);

    // 1. Create session
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-session-create`,
      status: "started",
      message: `Creating ${step.name} session`,
    });

    const timeoutMs = this.getTimeoutMs(step.name, config);

    let sessionId: string;
    try {
      const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
      const sessionResult = await client.createSession({
        agentId,
        environmentId: config.environment!.id,
        repoUrl,
        githubToken: config.github!.accessToken,
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
      state = pushStepResult(state, step.name, {
        session: null,
        verdict: null,
        findingsPath: null,
        completedAt: new Date().toISOString(),
        error: errorInfo,
      });
      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);
      const wrappedErr = new Error(errorInfo.message) as Error & { code: string; hint: string; state: JobState };
      wrappedErr.code = errorInfo.code;
      wrappedErr.hint = errorInfo.hint;
      wrappedErr.state = state;
      throw wrappedErr;
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
      state = pushStepResult(state, step.name, {
        session: null,
        verdict: null,
        findingsPath: null,
        completedAt: new Date().toISOString(),
        error: errorInfo,
      });
      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);
      const wrappedErr = new Error(errorInfo.message) as Error & { code: string; hint: string; state: JobState };
      wrappedErr.code = errorInfo.code;
      wrappedErr.hint = errorInfo.hint;
      wrappedErr.state = state;
      throw wrappedErr;
    }

    // 3. Poll until complete
    const pollResult = await client.pollUntilComplete(sessionId, {
      timeoutMs,
      sleepFn: deps.sleepFn,
    });

    const completedAt = new Date().toISOString();

    if (pollResult.status !== "idle") {
      const errorInfo = pollResult.error ?? {
        code: pollResult.status === "timeout" ? "SESSION_TIMEOUT" : "SESSION_TERMINATED",
        message: `${step.name} session ${pollResult.status}`,
        hint: "",
      };

      if (errorInfo.code === "SESSION_TERMINATED") {
        stderrWrite(`${step.name} session was terminated by Anthropic.`);
        state = await store.appendHistory(state, {
          ts: completedAt,
          step: `${step.name}-terminated`,
          status: "error",
          message: errorInfo.message,
        });
      } else {
        const minutes = Math.round(timeoutMs / 60000);
        stderrWrite(`${step.name} session timed out after ${minutes} minutes.`);
        state = await store.appendHistory(state, {
          ts: completedAt,
          step: `${step.name}-timeout`,
          status: "error",
          message: errorInfo.message,
        });
      }

      state = pushStepResult(state, step.name, {
        session: { id: sessionId, agentId, environmentId: config.environment!.id },
        verdict: null,
        findingsPath: null,
        completedAt,
        error: errorInfo,
      });

      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);

      const wrappedErr = new Error(errorInfo.message) as Error & { code: string; hint: string; state: JobState };
      wrappedErr.code = errorInfo.code;
      wrappedErr.hint = errorInfo.hint;
      wrappedErr.state = state;
      throw wrappedErr;
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
      const effectiveBranch = state.branch ?? "main";

      // Determine iteration for spec-review fetch
      const iteration = (state.steps?.["spec-review"]?.length ?? 0);

      if (deps.githubClient) {
        fileContent = await deps.githubClient.getRawFile(
          deps.repo.owner,
          deps.repo.name,
          effectiveBranch,
          buildFindingsPath(slug, iteration),
          { sleepFn: deps.sleepFn },
        );
      } else {
        // Legacy fallback
        fileContent = await fetchSpecReviewResult(deps, slug, effectiveBranch, iteration);
      }

      if (fileContent === null) {
        const notFoundErr = specReviewResultNotFoundError(slug, effectiveBranch);
        stderrWrite(notFoundErr.message);
        state = await store.fail(state, {
          code: notFoundErr.code,
          message: notFoundErr.message,
          hint: notFoundErr.hint,
        });
        state = pushStepResult(state, step.name, {
          session: state.session,
          verdict: null,
          findingsPath: null,
          completedAt,
          error: { code: notFoundErr.code, message: notFoundErr.message, hint: notFoundErr.hint },
        });
        await store.persist(state);
        (notFoundErr as unknown as Record<string, unknown>)["state"] = state;
        throw notFoundErr;
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

  /**
   * Get the timeout for a given step from config.
   */
  private getTimeoutMs(stepName: string, config: import("../../config/schema.js").SpecRunnerConfig): number {
    if (stepName === "spec-review") {
      return config.specReview?.timeoutMs ?? 600_000;
    }
    if (stepName === "spec-fixer") {
      return config.specFixer?.timeoutMs ?? 600_000;
    }
    return 600_000;
  }
}
