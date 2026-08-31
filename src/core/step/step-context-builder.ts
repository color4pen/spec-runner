/**
 * buildStepContext — pure context assembler for agent step execution.
 *
 * Extracts the context-building block from StepExecutor.runAgentStep (:256-347).
 * Contains NO control-flow early returns, no state mutations.
 * All paths lead to a fully constructed AgentRunContext, EXCEPT when a rule
 * file declares an unknown `delivery` value — in that case splitRulesByDelivery
 * throws and the caller (executor.ts) catches it as a step-level error.
 * Callers rely on executor's outer try/catch to handle this exception.
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
import type { StepExecutionDeps } from "../types.js";
import type { AgentRunContext } from "../port/agent-runner.js";
import type { DomainEvent } from "../../kernel/event-types.js";
import type { OutputContract, OutputVerificationPolicy } from "../port/output-contract.js";
import { resolveStepRules } from "./rules-resolve.js";
import { buildRulesFollowUpPrompts } from "./rules-followup-prompts.js";
import { splitRulesByDelivery, buildRulesPromptSection } from "./rules-delivery.js";
import { FIXER_STEP_NAMES, getPreviousSessionId } from "./fixer-helpers.js";
import { STEP_NAMES } from "./step-names.js";
import { verificationFailedLast } from "../pipeline/reverification.js";
import { isLevelEnabled } from "../../logger/stdout.js";
import { getAgentLogDir } from "../../util/xdg.js";
import { buildResumePrompt } from "../resume/resume-context.js";
import { projectMdPath } from "../../util/paths.js";
import { buildOutputFollowUpPrompt, OUTPUT_FOLLOWUP_MAX_ATTEMPTS } from "./output-verify.js";
import { DEFAULT_TOOL_RETRY } from "../port/report-result.js";
import { stagingModeFor, forbiddenWritePaths } from "./write-scope.js";
import { pipelineManagedPaths } from "../pipeline/round-git-scope.js";
import { resolveStagingExcludePatterns } from "./staging-containment.js";
import type { AgentWriteScope } from "../port/agent-runner.js";

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
 * @param deps      Pipeline dependencies (config, request, stepIo, commitInspection, etc.).
 * @param cwd       Working directory (worktree path or process.cwd()).
 * @param emitFn    Domain event emitter forwarded into ctx.emit.
 * @param fsAdapter Injectable filesystem seam (readFile + readdir).
 */
export async function buildStepContext(
  step: AgentStep,
  state: JobState,
  deps: StepExecutionDeps,
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

  // 2. Resolve project rules + classify by delivery + build follow-up and prompt sections.
  //    - delivery: followup (or unspecified) → wrapped in 3-element follow-up prompt (existing path)
  //    - delivery: prompt → injected into main work prompt via policy.promptRules (new path)
  //    - Unknown delivery value → throws here (before agent start, D6 rules-delivery)
  const ruleContents = await resolveStepRules(step.name, cwd, {
    readdir: (dir: string) => fsAdapter.readdir(dir),
    readFile: async (filePath: string, _enc: string): Promise<string> =>
      fsAdapter.readFile(filePath, "utf-8"),
  });
  const { followup: followupBodies, prompt: promptBodies } = splitRulesByDelivery(ruleContents);
  const rulesPrompts = buildRulesFollowUpPrompts(followupBodies);
  const existingFollowUp = step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt;
  const allFollowUpPrompts = [
    ...(existingFollowUp ? [existingFollowUp] : []),
    ...rulesPrompts,
  ];
  const promptRules = buildRulesPromptSection(promptBodies);

  // 3. Session continuity: pass previous session ID for fixer steps and for implementer
  //    recovery re-entry (verification failed → implementer resumes its own session).
  //    build-fixer 廃止後、verification 失敗による implementer 再入も session を継続する。
  //    継続元 session が無い（sessionId=null/不在）場合は undefined に倒れ fresh session で起動。
  const resumeSessionId =
    FIXER_STEP_NAMES.has(step.name)
      ? getPreviousSessionId(state, step.name) ?? undefined
      : step.name === STEP_NAMES.IMPLEMENTER && verificationFailedLast(state)
        ? getPreviousSessionId(state, STEP_NAMES.IMPLEMENTER) ?? undefined
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
  if (deps.stepIo) {
    const followUpContracts: OutputContract[] = (step.outputContracts?.(state, deps) ?? [])
      .filter((c) => c.policy === "follow-up");
    if (followUpContracts.length > 0) {
      const strategy = deps.stepIo;
      const branch = state.branch ?? null;
      // Resolve exclusion patterns once (outside closure) so they are not re-computed
      // on every detect() call. Paths matching stagingExcludePatterns will never be
      // staged/committed/pushed and must not be flagged as unpushable violations.
      const excludeWorktreePatterns = resolveStagingExcludePatterns(deps.config);
      // maxAttempts stays at the default OUTPUT_FOLLOWUP_MAX_ATTEMPTS (2) for ALL contracts,
      // including unpushable-path. This preserves the maximum 2-attempt repair window for
      // tasks-complete violations even when an unpushable-path contract is also present.
      //
      // The one-follow-up limit for unpushable-path is enforced in buildPrompt: on attempt >= 1,
      // unpushable-path violations are filtered out of the prompt. Tasks-complete violations
      // continue to appear on both attempt 0 and attempt 1 (up to 2 repair opportunities).
      outputVerification = {
        detect: () => strategy.validateStepOutputs(followUpContracts, cwd, branch, excludeWorktreePatterns),
        maxAttempts: OUTPUT_FOLLOWUP_MAX_ATTEMPTS,
        buildPrompt: (violations, attempt) => {
          // All adapters use 1-based attempt numbering (loop starts at attempt=1).
          // Attempt 1: show all violations (including unpushable-path) — first and only
          // follow-up for unpushable-path.
          // Attempt >= 2: filter unpushable-path violations out of the prompt so the agent
          // only sees remaining tasks-complete / other contract violations. This limits
          // unpushable-path to exactly 1 follow-up while tasks-complete retains up to 2.
          const effectiveViolations = attempt > 1
            ? violations.filter((v) => v.kind !== "unpushable-path")
            : violations;
          // When filtering leaves no violations (e.g., only unpushable-path remains at
          // attempt >= 2), return null to signal the adapter that no repair turn should
          // be sent. This prevents a generic/empty prompt from being sent as a second
          // follow-up, preserving the exactly-one-follow-up invariant for unpushable-path.
          if (effectiveViolations.length === 0) return null;
          return buildOutputFollowUpPrompt(effectiveViolations);
        },
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

  // 7. Compute write scope for permission guard (permission-layer-git-write-denial D3).
  // Mirrors the same expression used in commit-push.ts to filter gitState artifacts.
  // Pre-computes managedPaths and forbiddenPaths here (core layer) so that the adapter
  // guard does not need cross-layer domain imports (DSM closure enforcement).
  const declaredWritePaths = (step.writes?.(state, deps) ?? [])
    .filter((r) => r.artifact !== "gitState")
    .map((r) => r.path);
  const stagingMode = stagingModeFor(step.name);
  const managedPaths = pipelineManagedPaths(deps.slug);
  const forbiddenPaths = forbiddenWritePaths(step.name, deps.slug, declaredWritePaths);
  const writeScope: AgentWriteScope = {
    stepName: step.name,
    slug: deps.slug,
    declaredWritePaths,
    stagingMode,
    managedPaths,
    forbiddenPaths,
  };

  // 8. Enrich dynamicContext via step.prepareRoundContext (best-effort, never throws).
  let dynamicContext = deps.dynamicContext;
  if (step.prepareRoundContext && dynamicContext) {
    try {
      const extra = await step.prepareRoundContext(state, cwd, deps.commitInspection);
      if (extra) dynamicContext = { ...dynamicContext, ...extra };
    } catch {
      // best-effort: enrich に失敗しても step を止めない（黙って degrade）
    }
  }

  // 9. Assemble AgentRunContext.
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
      dynamicContext,
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
      promptRules,
    },
    emit: emitFn,
    writeScope,
  };

  return ctx;
}
