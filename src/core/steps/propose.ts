import { startProposeSession } from "../session.js";
import { pollUntilComplete } from "../completion.js";
import { appendHistory, updateJobState, failJobState, persistJobState } from "../../state/store.js";
import type { JobState } from "../../state/schema.js";
import { pushStepResult } from "../../state/helpers.js";
import { createSession } from "../../sdk/sessions.js";
import { stderrWrite } from "../../logger/stdout.js";
import { getAgentId } from "../../config/getAgentId.js";
import {
  branchNotRegisteredError,
  sessionTerminatedError,
  githubTokenExpiredError,
  changeFolderNotFoundError,
} from "../../errors.js";
import type { PipelineDeps } from "../types.js";

/**
 * Run the propose step: creates a session, streams events, polls for completion,
 * verifies branch and change folder on GitHub, and records results in state.
 */
export async function runProposeStep(
  jobState: JobState,
  deps: PipelineDeps,
): Promise<JobState> {
  const { client, config, repo, request, slug } = deps;

  // Resolve propose Agent ID
  const proposeAgentId = getAgentId(config, "propose");

  // 1. Create session
  let state = await appendHistory(jobState, {
    ts: new Date().toISOString(),
    step: "session-create",
    status: "started",
    message: "Creating Anthropic session",
  });

  let sessionId: string;
  try {
    const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
    const session = await createSession(client, {
      agent: { id: proposeAgentId, type: "agent" },
      environment_id: config.environment!.id,
      resources: [
        {
          type: "github_repository",
          url: repoUrl,
          authorization_token: config.github!.accessToken,
        },
      ],
    });
    sessionId = session.id;

    state = await updateJobState(state, {
      session: {
        id: sessionId,
        agentId: proposeAgentId,
        environmentId: config.environment!.id,
      },
      step: "events-stream-connected",
    });
    state = await appendHistory(state, {
      ts: new Date().toISOString(),
      step: "session-create",
      status: "ok",
      message: sessionId,
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    state = await failJobState(state, {
      code: "SESSION_CREATE_FAILED",
      message: `Failed to create session: ${errMsg}`,
      hint: "Check your API key and try again.",
    }, "session-create");
    state = await appendHistory(state, {
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

  // 2. Start SSE session and poll in parallel
  const abortController = new AbortController();

  const ssePromise = startProposeSession({
    client,
    sessionId,
    agentId: proposeAgentId,
    environmentId: config.environment!.id,
    requestContent: request.content,
    onBranchRegistered: (branch) => {
      registeredBranch = branch;
    },
    onSseDisconnected: () => {
      // no-op; handled via sseResult.terminationReason
    },
    abortController,
  });

  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "events-stream-connected",
    status: "ok",
    message: "SSE stream connected",
  });

  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "initial-message-sent",
    status: "ok",
    message: "Initial message sent to session",
  });

  // 3. Wait for SSE to complete (or disconnect)
  const sseResult = await ssePromise;

  if (sseResult.terminated) {
    const termErr = sessionTerminatedError();
    state = await failJobState(state, {
      code: termErr.code,
      message: termErr.message,
      hint: termErr.hint,
    });
    state = await appendHistory(state, {
      ts: new Date().toISOString(),
      step: "session-terminated",
      status: "error",
      message: "Session terminated by Anthropic",
    });
    // Record step result
    state = pushStepResult(state, "propose", {
      session: state.session,
      verdict: null,
      findingsPath: null,
      completedAt: new Date().toISOString(),
      error: { code: termErr.code, message: termErr.message, hint: termErr.hint },
    });
    await persistJobState(state);
    (termErr as unknown as Record<string, unknown>)["state"] = state;
    throw termErr;
  }

  // 4. If SSE did not detect idle+end_turn, fall back to polling.
  const needsPollingFallback =
    sseResult.terminationReason !== "end_turn" && sseResult.terminationReason !== "terminated";

  if (needsPollingFallback) {
    stderrWrite("SSE disconnected; falling back to polling.");
    try {
      await pollUntilComplete(client, sessionId, abortController.signal, {
        timeoutMs: deps.timeoutMs,
        sleepFn: deps.sleepFn,
      });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "SESSION_TIMEOUT";
      const message = (err as Error).message;
      const hint = (err as { hint?: string }).hint ?? "";

      if (code === "SESSION_TERMINATED") {
        state = await appendHistory(state, {
          ts: new Date().toISOString(),
          step: "session-terminated",
          status: "error",
          message,
        });
      } else {
        state = await appendHistory(state, {
          ts: new Date().toISOString(),
          step: "session-timeout",
          status: "error",
          message,
        });
      }

      state = await failJobState(state, { code, message, hint });
      // Record step result
      state = pushStepResult(state, "propose", {
        session: state.session,
        verdict: null,
        findingsPath: null,
        completedAt: new Date().toISOString(),
        error: { code, message, hint },
      });
      await persistJobState(state);
      (err as Record<string, unknown>)["state"] = state;
      throw err;
    }
  } else {
    // SSE detected idle+end_turn — signal abort to any potential polling consumer
    abortController.abort();
  }

  // 5. Persist branch registration event
  if (registeredBranch) {
    state = await updateJobState(state, { branch: registeredBranch });
    state = await appendHistory(state, {
      ts: new Date().toISOString(),
      step: "register-branch-received",
      status: "ok",
      message: registeredBranch,
    });
  }

  // 5b. Record idle+end_turn detection
  const completionStatus = sseResult.terminationReason === "end_turn" ? "ok" : "warning";
  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "idle-end-turn-detected",
    status: completionStatus,
    message: sseResult.terminationReason === "end_turn"
      ? "Session completed via SSE idle+end_turn"
      : "Session completed via polling fallback",
  });

  // 6. Check branch was registered
  if (!registeredBranch) {
    const branchErr = branchNotRegisteredError();
    stderrWrite("Branch was not registered by the agent.");
    state = await appendHistory(state, {
      ts: new Date().toISOString(),
      step: "idle-end-turn-detected",
      status: "error",
      message: "register_branch was not called",
    });
    state = await failJobState(state, {
      code: branchErr.code,
      message: branchErr.message,
      hint: branchErr.hint,
    });
    // Record step result before throwing
    state = pushStepResult(state, "propose", {
      session: state.session,
      verdict: null,
      findingsPath: null,
      completedAt: new Date().toISOString(),
      error: { code: branchErr.code, message: branchErr.message, hint: branchErr.hint },
    });
    await persistJobState(state);
    (branchErr as unknown as Record<string, unknown>)["state"] = state;
    throw branchErr;
  }

  // 7. Verify branch on GitHub
  const githubFetch = deps.githubFetch ?? fetch;
  const githubToken = config.github!.accessToken;

  // 7a. Check branch existence (warning only)
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
      state = await failJobState(state, {
        code: tokenErr.code,
        message: tokenErr.message,
        hint: tokenErr.hint,
      });
      (tokenErr as unknown as Record<string, unknown>)["state"] = state;
      throw tokenErr;
    }

    if (branchResp.status === 404) {
      stderrWrite(`Warning: Branch '${registeredBranch}' not found on GitHub yet.`);
      state = await appendHistory(state, {
        ts: new Date().toISOString(),
        step: "branch-verified",
        status: "warning",
        message: `Branch '${registeredBranch}' not found on GitHub`,
      });
    } else {
      state = await appendHistory(state, {
        ts: new Date().toISOString(),
        step: "branch-verified",
        status: "ok",
        message: `Branch '${registeredBranch}' verified on GitHub`,
      });
    }
  } catch (err) {
    if ((err as { code?: string }).code === "GITHUB_TOKEN_EXPIRED") {
      // state already attached above
      throw err;
    }
    stderrWrite(`Warning: Could not verify branch on GitHub: ${(err as Error).message}`);
    state = await appendHistory(state, {
      ts: new Date().toISOString(),
      step: "branch-verified",
      status: "warning",
      message: `Branch verification failed: ${(err as Error).message}`,
    });
  }

  // 7b. Verify change folder exists
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
      state = await appendHistory(state, {
        ts: new Date().toISOString(),
        step: "change-folder-verified",
        status: "error",
        message: "GitHub token expired",
      });
      state = await failJobState(state, {
        code: tokenErr.code,
        message: tokenErr.message,
        hint: tokenErr.hint,
      });
      (tokenErr as unknown as Record<string, unknown>)["state"] = state;
      throw tokenErr;
    }

    if (folderResp.status === 404) {
      const folderErr = changeFolderNotFoundError(slug);
      state = await appendHistory(state, {
        ts: new Date().toISOString(),
        step: "change-folder-verified",
        status: "error",
        message: `Change folder not found: ${changeFolderPath}`,
      });
      state = await failJobState(state, {
        code: folderErr.code,
        message: folderErr.message,
        hint: folderErr.hint,
      });
      (folderErr as unknown as Record<string, unknown>)["state"] = state;
      throw folderErr;
    }

    state = await appendHistory(state, {
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
      // state already attached above
      throw err;
    }
    stderrWrite(`Warning: Could not verify change folder: ${(err as Error).message}`);
  }

  // 8. Mark success
  state = await updateJobState(state, { status: "success", step: "success" });
  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "success",
    status: "ok",
    message: "Propose pipeline completed successfully",
  });

  // Record propose step result
  state = pushStepResult(state, "propose", {
    session: state.session,
    verdict: null,
    findingsPath: null,
    completedAt: new Date().toISOString(),
    error: null,
  });
  await persistJobState(state);

  return state;
}
