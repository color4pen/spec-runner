/**
 * buildStepContext — pure context assembler for agent step execution.
 *
 * Extracts the context-building block from StepExecutor.runAgentStep (:256-347).
 * Contains NO control-flow early returns, no exceptions, no state mutations.
 * All paths lead to a fully constructed AgentRunContext.
 *
 * Design:
 *   - I/O is allowed (fs reads for project.md and rules files).
 *   - emitFn is injected so AgentRunContext.emit stays decoupled from EventBus.
 *   - fsAdapter is injected so node:fs is not imported directly here (core invariant).
 *   - No references to StepExecutor instance state.
 */
import * as path from "node:path";
import type { AgentStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { AgentRunContext } from "../port/agent-runner.js";
import type { DomainEvent } from "../../kernel/event-types.js";
import type { OutputContract, OutputVerificationPolicy } from "../port/output-contract.js";
import { resolveStepRules } from "./rules-resolve.js";
import { buildRulesFollowUpPrompts } from "./rules-followup-prompts.js";
import { FIXER_STEP_NAMES, getPreviousSessionId } from "./fixer-helpers.js";
import { isLevelEnabled } from "../../logger/stdout.js";
import { getAgentLogDir } from "../../util/xdg.js";
import { buildResumePrompt } from "../resume/resume-context.js";
import { projectMdPath } from "../../util/paths.js";
import { buildOutputFollowUpPrompt, OUTPUT_FOLLOWUP_MAX_ATTEMPTS } from "./output-verify.js";
import { DEFAULT_TOOL_RETRY } from "../port/report-result.js";

/**
 * Filesystem seam for buildStepContext.
 * Caller (executor.ts) provides the real node:fs implementations;
 * tests may substitute fakes without touching the real filesystem.
 */
export interface BuildStepContextFs {
  readFile(path: string, encoding: string): Promise<string>;
  readdir(dir: string): Promise<string[]>;
}

/**
 * Assemble an AgentRunContext for the given agent step.
 *
 * Mirrors StepExecutor.runAgentStep (:256-347) exactly:
 *   1. projectContext read (when step.needsProjectContext === true)
 *   2. resolveStepRules + buildRulesFollowUpPrompts → allFollowUpPrompts
 *   3. resumeSessionId resolution (fixer steps only)
 *   4. sessionLogPath (debug level only)
 *   5. outputVerification policy (follow-up contracts only)
 *   6. effectiveResumePrompt via buildResumePrompt
 *   7. AgentRunContext assembly
 *
 * @param step      The agent step declaration.
 * @param state     Current job state (branch, steps, session, etc.).
 * @param deps      Pipeline dependencies (config, request, runtimeStrategy, etc.).
 * @param cwd       Working directory (worktree path or process.cwd()).
 * @param emitFn    Domain event emitter forwarded into ctx.emit.
 * @param fsAdapter Injectable filesystem seam (readFile + readdir).
 */
export async function buildStepContext(
  step: AgentStep,
  state: JobState,
  deps: PipelineDeps,
  cwd: string,
  emitFn: (event: DomainEvent, payload: Record<string, unknown>) => void,
  fsAdapter: BuildStepContextFs,
): Promise<AgentRunContext> {
  // 1. Read project.md when the step declares needsProjectContext.
  let projectContext: string | undefined;
  if (step.needsProjectContext === true) {
    const pmPath = path.join(cwd, projectMdPath());
    try {
      projectContext = await fsAdapter.readFile(pmPath, "utf-8");
    } catch {
      // File not found — projectContext remains undefined
    }
  }

  // 2. Resolve project rules + build follow-up prompts.
  const ruleContents = await resolveStepRules(step.name, cwd, {
    readdir: (dir: string) => fsAdapter.readdir(dir),
    readFile: async (filePath: string, _enc: string): Promise<string> =>
      fsAdapter.readFile(filePath, "utf-8"),
  });
  const rulesPrompts = buildRulesFollowUpPrompts(ruleContents);
  const existingFollowUp = step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt;
  const allFollowUpPrompts = [
    ...(existingFollowUp ? [existingFollowUp] : []),
    ...rulesPrompts,
  ];

  // 3. Fixer session continuity: pass previous session ID if available.
  const resumeSessionId = FIXER_STEP_NAMES.has(step.name)
    ? getPreviousSessionId(state, step.name) ?? undefined
    : undefined;

  // 4. Debug session log path.
  let sessionLogPath: string | undefined;
  if (isLevelEnabled("debug") && deps.repoRoot) {
    const attempt = (state.steps?.[step.name]?.length ?? 0) + 1;
    const agentLogDir = getAgentLogDir(deps.repoRoot, state.jobId);
    sessionLogPath = path.join(agentLogDir, `${step.name}-${attempt}.jsonl`);
  }

  // 5. Output verification policy (follow-up contracts only).
  let outputVerification: OutputVerificationPolicy | undefined;
  if (deps.runtimeStrategy) {
    const followUpContracts: OutputContract[] = (step.outputContracts?.(state, deps) ?? [])
      .filter((c) => c.policy === "follow-up");
    if (followUpContracts.length > 0) {
      const strategy = deps.runtimeStrategy;
      const branch = state.branch ?? null;
      outputVerification = {
        detect: () => strategy.validateStepOutputs(followUpContracts, cwd, branch),
        maxAttempts: OUTPUT_FOLLOWUP_MAX_ATTEMPTS,
        buildPrompt: (violations, _attempt) => buildOutputFollowUpPrompt(violations),
      };
    }
  }

  // 6. Effective resume prompt (automatic context + optional human note).
  const effectiveResumePrompt = buildResumePrompt({
    state,
    stepName: step.name,
    resumeContext: deps.resumeContext,
    humanResumePrompt: deps.resumePrompt,
  });

  // 7. Assemble AgentRunContext.
  const ctx: AgentRunContext = {
    step,
    state,
    branch: state.branch ?? "",
    slug: deps.slug,
    cwd,
    requestType: deps.request.type,
    config: deps.config,
    input: {
      requestContent: deps.request.content,
      requestAdr: deps.request.adr,
      requestBaseBranch: deps.request.baseBranch,
      dynamicContext: deps.dynamicContext,
      projectContext,
    },
    session: {
      resumeSessionId,
      resumePrompt: effectiveResumePrompt,
      logPath: sessionLogPath,
    },
    policy: {
      postWorkPrompts: allFollowUpPrompts.length > 0 ? allFollowUpPrompts : undefined,
      reportTool: step.reportTool,
      toolReportRetry: step.reportTool ? DEFAULT_TOOL_RETRY : undefined,
      outputVerification,
    },
    emit: emitFn,
  };

  return ctx;
}
