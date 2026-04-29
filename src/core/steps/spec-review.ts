import { pollUntilComplete } from "../completion.js";
import { appendHistory, updateJobState, failJobState, persistJobState } from "../../state/store.js";
import { appendStepResult } from "../../state/schema.js";
import type { JobState, Verdict } from "../../state/schema.js";
import { createSession } from "../../sdk/sessions.js";
import { sendEvents } from "../../sdk/sessions.js";
import { stderrWrite } from "../../logger/stdout.js";
import {
  githubTokenExpiredError,
  specReviewResultNotFoundError,
} from "../../errors.js";
import type { PipelineDeps } from "../pipeline.js";
import {
  buildSpecReviewInitialMessage,
} from "../../prompts/spec-review-system.js";

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
 * Fetch the spec-review-result.md file from GitHub.
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
): Promise<string | null> {
  const githubFetch = deps.githubFetch ?? fetch;
  const config = deps.config;
  const repo = deps.repo;
  const githubToken = config.github!.accessToken;
  const sleepFn = deps.sleepFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const filePath = `openspec/changes/${slug}/spec-review-result.md`;
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
 * 1. Create a new session (no custom tools)
 * 2. Send initial message
 * 3. Poll until complete (using pollUntilComplete)
 * 4. Fetch spec-review-result.md from GitHub
 * 5. Parse verdict
 * 6. Update state
 */
export async function runSpecReviewStep(
  jobState: JobState,
  deps: PipelineDeps,
): Promise<JobState> {
  const { client, config, repo, slug } = deps;
  const branch = jobState.branch;

  // Record step transition
  let state = await updateJobState(jobState, { step: "spec-review" });
  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "step-transition",
    status: "ok",
    message: "Transitioning to spec-review step",
  });

  // 1. Create spec-review session (no custom tools)
  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "spec-review-session-create",
    status: "started",
    message: "Creating spec-review session",
  });

  let sessionId: string;
  try {
    const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
    const session = await createSession(client, {
      agent: config.agent!.id,
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
        agentId: config.agent!.id,
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
    throw err;
  }

  // 2. Send initial message
  const initialMessage = buildSpecReviewInitialMessage({
    slug,
    repository: `${repo.owner}/${repo.name}`,
    requestType: state.request.type,
    enabled: deps.request.enabled,
    requestContent: deps.request.content,
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
      message: "Initial message sent to spec-review session",
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    state = await failJobState(state, {
      code: "SESSION_CREATE_FAILED",
      message: `Failed to send initial message: ${errMsg}`,
      hint: "Check your network connection.",
    });
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
    state = appendStepResult(state, "spec-review", {
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

  // 4. Fetch spec-review-result.md from GitHub
  const effectiveBranch = branch ?? "main";
  const fileContent = await fetchSpecReviewResult(deps, slug, effectiveBranch);

  if (fileContent === null) {
    const notFoundErr = specReviewResultNotFoundError(slug, effectiveBranch);
    stderrWrite(notFoundErr.message);
    state = await failJobState(state, {
      code: notFoundErr.code,
      message: notFoundErr.message,
      hint: notFoundErr.hint,
    });
    state = appendStepResult(state, "spec-review", {
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
  const findingsPath = `openspec/changes/${slug}/spec-review-result.md`;
  const verdict = parseSpecReviewVerdict(fileContent);

  if (verdict === null) {
    // Fail-safe: escalation + stderr warning
    stderrWrite(
      `Warning: Could not parse verdict from ${findingsPath}. Treating as escalation.`,
    );
  }

  const finalVerdict: Verdict = verdict ?? "escalation";

  // 6. Record step result (fileContent propagated so CLI can display findings summary)
  state = appendStepResult(state, "spec-review", {
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
    message: `Spec-review verdict: ${finalVerdict}`,
  });

  // Keep state.status as "success" regardless of verdict value
  // (needs-fix / escalation are valid outcomes, not failures)
  state = await updateJobState(state, { status: "success" });
  await persistJobState(state);

  return state;
}
