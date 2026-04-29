import { pollUntilComplete } from "../completion.js";
import { appendHistory, updateJobState, failJobState, persistJobState } from "../../state/store.js";
import { pushStepResult } from "../../state/helpers.js";
import type { JobState, Verdict } from "../../state/schema.js";
import { createSession } from "../../sdk/sessions.js";
import { sendEvents } from "../../sdk/sessions.js";
import { stderrWrite } from "../../logger/stdout.js";
import {
  githubTokenExpiredError,
  specReviewResultNotFoundError,
} from "../../errors.js";
import type { PipelineDeps } from "../types.js";
import {
  buildSpecReviewInitialMessage,
} from "../../prompts/spec-review-system.js";
import { getAgentId } from "../../config/getAgentId.js";

/**
 * Parse the verdict from a spec-review-result.md file content.
 * Returns the first matched verdict (first-write-wins).
 * Regex: /^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m
 */
export function parseSpecReviewVerdict(content: string): Verdict | null {
  const regex = /^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m;
  const match = regex.exec(content);
  if (!match || !match[1]) {
    return null;
  }
  return match[1] as Verdict;
}

/**
 * Compute the iteration number for the next spec-review push.
 * Returns state.steps["spec-review"]?.length + 1 or 1 if not set.
 */
function computeSpecReviewIteration(state: JobState): number {
  return (state.steps?.["spec-review"]?.length ?? 0) + 1;
}

/**
 * Build the findings file path for a given iteration.
 * Format: openspec/changes/<slug>/spec-review-result-NNN.md (3-digit zero-padded)
 */
export function buildFindingsPath(slug: string, iteration: number): string {
  const nnn = String(iteration).padStart(3, "0");
  return `openspec/changes/${slug}/spec-review-result-${nnn}.md`;
}

/**
 * Fetch the spec-review-result file from GitHub.
 * Returns file content as string, or null if not found after retries.
 * Throws SpecRunnerError(GITHUB_TOKEN_EXPIRED) on 401.
 *
 * Uses PipelineDeps.githubFetch directly (no getFileContent helper).
 * 404: retries up to 3 times with 1s interval.
 */
export async function fetchSpecReviewResult(
  deps: PipelineDeps,
  slug: string,
  branch: string,
  iteration: number,
): Promise<string | null> {
  const githubFetch = deps.githubFetch ?? fetch;
  const config = deps.config;
  const repo = deps.repo;
  const githubToken = config.github!.accessToken;
  const sleepFn = deps.sleepFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const filePath = buildFindingsPath(slug, iteration);
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleepFn(1000);
    }

    const resp = await githubFetch(url, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });

    if (resp.status === 200) {
      return resp.text();
    }

    if (resp.status === 401) {
      throw githubTokenExpiredError();
    }

    if (resp.status === 404) {
      if (attempt < MAX_RETRIES) {
        // Will retry
        continue;
      }
      // Exhausted retries
      return null;
    }

    // Other errors: return null (best-effort)
    return null;
  }

  return null;
}

/**
 * Run the spec-review step:
 * 1. Compute iteration number from existing state
 * 2. Create a new session (no custom tools)
 * 3. Send initial message (including iteration-specific filename)
 * 4. Poll until complete (using pollUntilComplete)
 * 5. Fetch spec-review-result-NNN.md from GitHub
 * 6. Parse verdict
 * 7. Update state (using pushStepResult for array append)
 */
export async function runSpecReviewStep(
  jobState: JobState,
  deps: PipelineDeps,
): Promise<JobState> {
  const { client, config, repo, slug } = deps;
  const branch = jobState.branch;

  // Determine iteration number for this run
  const iteration = computeSpecReviewIteration(jobState);
  const findingsPath = buildFindingsPath(slug, iteration);

  // Resolve agent ID (use propose agent for spec-review per design).
  // If agent ID cannot be resolved, fail immediately — do not continue with an empty string.
  let agentId: string;
  try {
    agentId = getAgentId(config, "propose");
  } catch (err) {
    const errCode = (err as { code?: string }).code ?? "CONFIG_INCOMPLETE";
    const errMsg = (err as Error).message;
    const errHint = (err as { hint?: string }).hint ?? "Run 'specrunner init' to configure agents.";
    let state = await updateJobState(jobState, { step: "spec-review" });
    state = await failJobState(state, {
      code: errCode,
      message: errMsg,
      hint: errHint,
    }, "spec-review-agent-id");
    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: null,
      findingsPath: null,
      completedAt: new Date().toISOString(),
      error: { code: errCode, message: errMsg, hint: errHint },
    });
    await persistJobState(state);
    (err as Record<string, unknown>)["state"] = state;
    throw err;
  }

  // Record step transition
  let state = await updateJobState(jobState, { step: "spec-review" });
  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "step-transition",
    status: "ok",
    message: `Transitioning to spec-review step (iteration ${iteration})`,
  });

  // 1. Create spec-review session (no custom tools)
  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "spec-review-session-create",
    status: "started",
    message: `Creating spec-review session (iteration ${iteration})`,
  });

  let sessionId: string;
  try {
    const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
    const session = await createSession(client, {
      agent: { id: agentId, type: "agent" },
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
        agentId,
        environmentId: config.environment!.id,
      },
    });
    state = await appendHistory(state, {
      ts: new Date().toISOString(),
      step: "spec-review-session-create",
      status: "ok",
      message: sessionId,
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    state = await failJobState(state, {
      code: "SESSION_CREATE_FAILED",
      message: `Failed to create spec-review session: ${errMsg}`,
      hint: "Check your API key and try again.",
    }, "spec-review-session-create");

    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: null,
      findingsPath: null,
      completedAt: new Date().toISOString(),
      error: { code: "SESSION_CREATE_FAILED", message: `Failed to create spec-review session: ${errMsg}`, hint: "Check your API key and try again." },
    });
    await persistJobState(state);
    throw err;
  }

  // 2. Send initial message (with iteration-specific filename embedded)
  const specReviewResultFileName = `spec-review-result-${String(iteration).padStart(3, "0")}.md`;
  const initialMessage = buildSpecReviewInitialMessage({
    slug,
    repository: `${repo.owner}/${repo.name}`,
    requestType: state.request.type,
    enabled: deps.request.enabled,
    requestContent: deps.request.content,
    iteration,
    findingsPath,
  });

  try {
    await sendEvents(client, sessionId, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: initialMessage }],
        },
      ],
    });
    state = await appendHistory(state, {
      ts: new Date().toISOString(),
      step: "spec-review-initial-message-sent",
      status: "ok",
      message: `Initial message sent to spec-review session (file: ${specReviewResultFileName})`,
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    state = await failJobState(state, {
      code: "SESSION_CREATE_FAILED",
      message: `Failed to send initial message: ${errMsg}`,
      hint: "Check your network connection.",
    });
    state = pushStepResult(state, "spec-review", {
      session: state.session,
      verdict: null,
      findingsPath: null,
      completedAt: new Date().toISOString(),
      error: { code: "SESSION_CREATE_FAILED", message: `Failed to send initial message: ${errMsg}`, hint: "Check your network connection." },
    });
    await persistJobState(state);
    throw err;
  }

  // 3. Poll until complete
  const timeoutMs = config.specReview?.timeoutMs ?? 600000;
  try {
    await pollUntilComplete(client, sessionId, undefined, {
      timeoutMs,
      sleepFn: deps.sleepFn,
    });
    state = await appendHistory(state, {
      ts: new Date().toISOString(),
      step: "spec-review-completed",
      status: "ok",
      message: "Spec-review session completed",
    });
  } catch (err) {
    const code = (err as { code?: string }).code ?? "SESSION_TIMEOUT";
    const message = (err as Error).message;
    const hint = (err as { hint?: string }).hint ?? "";

    if (code === "SESSION_TERMINATED") {
      stderrWrite("Spec-review session was terminated by Anthropic.");
      state = await appendHistory(state, {
        ts: new Date().toISOString(),
        step: "spec-review-terminated",
        status: "error",
        message,
      });
    } else {
      const minutes = Math.round(timeoutMs / 60000);
      stderrWrite(`Spec-review session timed out after ${minutes} minutes.`);
      state = await appendHistory(state, {
        ts: new Date().toISOString(),
        step: "spec-review-timeout",
        status: "error",
        message,
      });
    }

    state = await failJobState(state, { code, message, hint });
    state = pushStepResult(state, "spec-review", {
      session: state.session,
      verdict: null,
      findingsPath: null,
      completedAt: new Date().toISOString(),
      error: { code, message, hint },
    });
    await persistJobState(state);
    // Attach failed state to the error for runPipeline to extract
    (err as Record<string, unknown>)["state"] = state;
    throw err;
  }

  // 4. Fetch spec-review-result-NNN.md from GitHub
  const effectiveBranch = branch ?? "main";
  const fileContent = await fetchSpecReviewResult(deps, slug, effectiveBranch, iteration);

  if (fileContent === null) {
    const notFoundErr = specReviewResultNotFoundError(slug, effectiveBranch);
    stderrWrite(notFoundErr.message);
    state = await failJobState(state, {
      code: notFoundErr.code,
      message: notFoundErr.message,
      hint: notFoundErr.hint,
    });
    state = pushStepResult(state, "spec-review", {
      session: state.session,
      verdict: null,
      findingsPath: null,
      completedAt: new Date().toISOString(),
      error: { code: notFoundErr.code, message: notFoundErr.message, hint: notFoundErr.hint },
    });
    await persistJobState(state);
    // Attach failed state to the error for runPipeline to extract
    (notFoundErr as unknown as Record<string, unknown>)["state"] = state;
    throw notFoundErr;
  }

  // 5. Parse verdict
  const verdict = parseSpecReviewVerdict(fileContent);

  if (verdict === null) {
    // Fail-safe: escalation + stderr warning
    stderrWrite(
      `Warning: Could not parse verdict from ${findingsPath}. Treating as escalation.`,
    );
  }

  const finalVerdict: Verdict = verdict ?? "escalation";

  // 6. Record step result (fileContent propagated so CLI can display findings summary)
  state = pushStepResult(state, "spec-review", {
    session: state.session,
    verdict: finalVerdict,
    findingsPath,
    fileContent,
    completedAt: new Date().toISOString(),
    error: null,
  });

  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "spec-review-verdict",
    status: "ok",
    message: `Spec-review verdict: ${finalVerdict} (iteration ${iteration})`,
  });

  // Keep state.status as "success" regardless of verdict value
  // (needs-fix / escalation are valid outcomes, not failures)
  state = await updateJobState(state, { status: "success" });
  await persistJobState(state);

  return state;
}
