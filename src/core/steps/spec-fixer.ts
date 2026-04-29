import { appendHistory, updateJobState, failJobState, persistJobState } from "../../state/store.js";
import { getLatestStepResult, pushStepResult } from "../../state/helpers.js";
import type { JobState } from "../../state/schema.js";
import { getAgentId } from "../../config/getAgentId.js";
import { runManagedAgentSession } from "../session-runner.js";
import type { PipelineDeps } from "../types.js";

/**
 * Build the initial user message for the spec-fixer session.
 * Wraps user-controlled content in XML delimiters for prompt injection protection.
 */
function buildSpecFixerInitialMessage(opts: {
  slug: string;
  branch: string;
  findingsPath: string;
}): string {
  const { slug, branch, findingsPath } = opts;
  return `<user-request>
You are the spec-fixer for the following change:

Change folder: openspec/changes/${slug}
Branch: ${branch}
Findings file: ${findingsPath}

Please:
1. Read the findings file at ${findingsPath}
2. For each finding, implement the fix described in the "How to Fix" column
3. After fixing all findings you can address, commit your changes to branch '${branch}'
4. Push the branch to the remote repository
5. Do NOT modify the spec-review-result.md file itself

If any finding cannot be fixed, add a comment at the end of proposal.md or design.md:
<!-- spec-fixer-deferred: [finding number] [reason] -->
</user-request>`;
}

/**
 * Run the spec-fixer step:
 * 1. Get findings path from the latest spec-review step result
 * 2. Resolve spec-fixer Agent ID (no legacy fallback)
 * 3. Create session (no custom tools)
 * 4. Send initial message with findings path and instructions
 * 5. Poll until complete
 * 6. Record result in state
 */
export async function runSpecFixerStep(
  jobState: JobState,
  deps: PipelineDeps,
): Promise<JobState> {
  const { config, repo, slug } = deps;
  const branch = jobState.branch;

  // Record step transition
  let state = await updateJobState(jobState, { step: "spec-fixer" });
  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "step-transition",
    status: "ok",
    message: "Transitioning to spec-fixer step",
  });

  // 1. Get findings path from latest spec-review result
  const specReviewResult = getLatestStepResult(state, "spec-review");
  const findingsPath = specReviewResult?.findingsPath ?? null;

  if (findingsPath === null) {
    state = await failJobState(state, {
      code: "SPEC_FIXER_NO_FINDINGS",
      message: "No findings path available from spec-review step.",
      hint: "Ensure spec-review has run and produced a findings file.",
    }, "spec-fixer");
    await persistJobState(state);
    return state;
  }

  // 2. Resolve spec-fixer Agent ID (no legacy fallback)
  let agentId: string;
  try {
    agentId = getAgentId(config, "specFixer");
  } catch (err) {
    const errMsg = (err as Error).message;
    state = await failJobState(state, {
      code: "CONFIG_INCOMPLETE",
      message: errMsg,
      hint: "Run 'specrunner init' to create the spec-fixer agent.",
    }, "spec-fixer");
    await persistJobState(state);
    return state;
  }

  // 3. Build initial message
  const effectiveBranch = branch ?? "main";
  const initialMessage = buildSpecFixerInitialMessage({
    slug,
    branch: effectiveBranch,
    findingsPath,
  });

  // 4-5. Run the managed session lifecycle (create → send → poll)
  const timeoutMs = config.specFixer?.timeoutMs ?? 600_000;

  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "spec-fixer-session-create",
    status: "started",
    message: "Creating spec-fixer session",
  });

  const sessionResult = await runManagedAgentSession(deps, {
    agentId,
    environmentId: config.environment!.id,
    repo: { owner: repo.owner, name: repo.name },
    githubToken: config.github!.accessToken,
    initialMessage,
    timeoutMs,
    stepName: "spec-fixer",
  });

  const completedAt = new Date().toISOString();

  // 6. Record result based on session outcome
  if (sessionResult.status === "idle") {
    // Normal completion
    state = await appendHistory(state, {
      ts: completedAt,
      step: "spec-fixer-completed",
      status: "ok",
      message: `Spec-fixer session completed (${sessionResult.sessionId})`,
    });

    state = pushStepResult(state, "spec-fixer", {
      session: {
        id: sessionResult.sessionId,
        agentId,
        environmentId: config.environment!.id,
      },
      verdict: null,
      findingsPath: null,
      completedAt,
      error: null,
    });

    state = await updateJobState(state, {});
    await persistJobState(state);
    return state;
  }

  // Error case: terminated or timeout
  const errorInfo = sessionResult.error ?? {
    code: sessionResult.status === "timeout" ? "SESSION_TIMEOUT" : "SESSION_TERMINATED",
    message: `Spec-fixer session ${sessionResult.status}`,
    hint: "",
  };

  state = await appendHistory(state, {
    ts: completedAt,
    step: `spec-fixer-${sessionResult.status}`,
    status: "error",
    message: errorInfo.message,
  });

  state = pushStepResult(state, "spec-fixer", {
    session: sessionResult.sessionId
      ? {
          id: sessionResult.sessionId,
          agentId,
          environmentId: config.environment!.id,
        }
      : null,
    verdict: null,
    findingsPath: null,
    completedAt,
    error: errorInfo,
  });

  state = await failJobState(state, errorInfo, "spec-fixer");
  await persistJobState(state);

  // Attach state to error for runPipeline to extract
  const wrappedErr = new Error(errorInfo.message) as Error & { code: string; hint: string; state: JobState };
  wrappedErr.code = errorInfo.code;
  wrappedErr.hint = errorInfo.hint;
  wrappedErr.state = state;
  throw wrappedErr;
}
