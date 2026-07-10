/**
 * ClaudeCodeRunner: AgentRunner adapter for Claude Code SDK (local runtime).
 *
 * Implements AgentRunner port using the Claude Agent SDK query API.
 * No SessionClient or @anthropic-ai/sdk import — fully isolated from managed adapter.
 *
 * Design D8 (design.md): composition root injects ClaudeCodeRunner when runtime === "local".
 * Design D2: resultContent fetched from local fs via fs.readFile.
 * Design D5: commit+push is handled by StepExecutor.commitAndPush() (not in adapter).
 * Design D9: runtime-specific git instructions injected as additionalInstructions.
 *
 * tool-driven-step-completion:
 * - report_result MCP tool registered via createSdkMcpServer when ctx.policy.reportTool is set
 * - follow-up retry when agent doesn't call report_result (up to policy.maxAttempts)
 * - tool detection applies only to main work turn, not postWorkPrompts turns
 *
 * write-scope-guard (write-scope-guard-redo):
 * - permissionMode: "default" — canUseTool fires for tools not on allowedTools
 * - Edit / Write removed from allowedTools — routes them through canUseTool workspace guard
 * - createWorkspaceToolGuard(cwd): deny Edit/Write outside cwd; allow everything else
 * - report_result MCP tool pre-approved via mcp__specrunner_report__<name> on allowedTools
 * - buildWorkspaceSandbox: allowUnsandboxedCommands: false closes the escape hatch
 *
 * TC-022: ClaudeCodeRunner implements AgentRunner interface
 * TC-023: query() receives ctx.cwd
 * TC-024: no SessionClient / @anthropic-ai/sdk import
 * TC-025: resultContent from fs.readFile (not GitHub API)
 * TC-026: additionalInstructions contains branch checkout instruction
 * TC-027: no register_branch import
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { defaultSpawnFn, type SpawnFn } from "./git-exec.js";
import { isToolUse } from "./message-types.js";
import { loadClaudeAgentSdk, type ClaudeAgentSdkLoader, type ClaudeSdkCreateMcpServer } from "./sdk-loader.js";
import type { AgentRunner, AgentRunContext, AgentRunResult, ModelUsage } from "../../core/port/agent-runner.js";
import type { DomainEvent } from "../../kernel/event-types.js";
import type { StepContext } from "../../core/port/step-context.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { resolveTransientRetryConfig } from "../../config/schema.js";
import { buildAdditionalInstructions } from "../shared/prompt-builder.js";
import { shouldRunFollowUp, mergeFollowUpResult } from "../shared/follow-up.js";
import { logVerbose, stderrWrite } from "../../logger/stdout.js";
import { logPipelineDiag } from "../../logger/diagnostic.js";
import { SessionLogWriter } from "./session-log-writer.js";
import { stripSecrets } from "../../util/env-filter.js";
import type { BaseReportResult, ReportToolSpec } from "../../core/port/report-result.js";
import { DEFAULT_TOOL_RETRY } from "../../core/port/report-result.js";
import { retryWithBackoff } from "../../util/retry.js";
import { isTransientAgentError } from "./transient-error.js";
import { SpecRunnerError } from "../../errors.js";

export type { SpawnFn } from "./git-exec.js";

/**
 * Local type alias for the SDK's CanUseTool / PermissionResult, keeping this
 * file free of a static import from @anthropic-ai/claude-agent-sdk (TC-024).
 * Shape matches sdk.d.ts v0.2.128 — confirmed by probe (write-scope-guard-redo D5).
 */
export type WorkspacePermissionResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string; interrupt?: boolean };

export type WorkspaceToolGuard = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal; toolUseID: string; [key: string]: unknown },
) => Promise<WorkspacePermissionResult>;

/**
 * Injectable type for the Claude Code OAuth token resolver.
 * Injected by the composition root (core/runtime/local.ts) so this adapter
 * does not import from the domain (core/credentials/) directly.
 */
export type ClaudeCodeOAuthTokenResolver = (
  env: Record<string, string | undefined>,
  opts: { optional: true },
) => Promise<{ token: string; source: "env" | "credentials" } | undefined>;

/**
 * Build SDK sandbox settings that scope filesystem writes to the agent's workspace.
 *
 * D1: filesystem.allowWrite restricts writes to cwd and its subtree (OS-level enforcement).
 * D2: failIfUnavailable: false enables fail-open degradation (unsupported platforms continue).
 * D3: no denyRead / allowRead — reads remain unrestricted.
 * D4: autoAllowBashIfSandboxed: true preserves Bash tool execution under the sandbox.
 * write-scope-guard-redo D4: allowUnsandboxedCommands: false closes the dangerouslyDisableSandbox
 *   escape hatch — the model cannot re-run a sandboxed Bash command unsandboxed.
 *
 * @param cwd Agent working directory (job worktree or repo root in --no-worktree mode).
 */
export function buildWorkspaceSandbox(cwd: string): Record<string, unknown> {
  return {
    enabled: true,
    failIfUnavailable: false,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    filesystem: {
      allowWrite: [cwd, `${cwd}/**`],
    },
  };
}

/**
 * Factory for the workspace write-scope guard passed as `canUseTool` to the step-agent.
 *
 * write-scope-guard-redo D2: deny Edit / Write whose resolved file_path is outside cwd;
 * allow all other tools and any Edit/Write with malformed (missing / non-string) file_path.
 *
 * Measured SDK facts (confirmed by probe):
 * - Under permissionMode "default", canUseTool fires for tools NOT on allowedTools.
 * - Edit and Write are removed from allowedTools so this guard fires for them.
 * - Tools on allowedTools (Read, Bash, Grep, Glob, MCP report) bypass canUseTool entirely;
 *   the default-allow arm below is defense-in-depth only.
 *
 * @param cwd Agent working directory — the boundary for allowed writes.
 * @returns CanUseTool callback suitable for inclusion in queryOptions.
 */
export function createWorkspaceToolGuard(cwd: string): WorkspaceToolGuard {
  return async (toolName: string, input: Record<string, unknown>): Promise<WorkspacePermissionResult> => {
    if (toolName === "Edit" || toolName === "Write") {
      const filePath = input["file_path"];
      if (typeof filePath !== "string") {
        // Missing or non-string file_path — defer to the tool's own input validation.
        return { behavior: "allow" };
      }
      const resolved = path.resolve(cwd, filePath);
      const relative = path.relative(cwd, resolved);
      // Inside the workspace iff the relative path is "" (equals cwd) or does not
      // begin with ".." and is not itself absolute.
      const isInside =
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative));
      if (isInside) {
        return { behavior: "allow" };
      }
      return {
        behavior: "deny",
        message: `Write to '${filePath}' is outside the agent worktree '${cwd}'. Write files only inside the worktree.`,
      };
    }
    // All other tools (Read, Bash, Grep, Glob, MCP tools, etc.) are allowed.
    return { behavior: "allow" };
  };
}

/**
 * Returns true if the SDK stderr chunk signals that the sandbox is unavailable
 * or has fallen back to unsandboxed operation.
 *
 * Intentionally broad-but-specific: requires "sandbox" to be present alongside
 * a degradation indicator. False positives on unrelated lines are avoided by
 * requiring the "sandbox" keyword. False negatives on future SDK wording changes
 * are acceptable — by D5 / design.md the run continues regardless (fail-open
 * relies on failIfUnavailable: false, not on this predicate).
 *
 * D5: Detection is decoupled from the fail-open guarantee.
 */
export function isSandboxUnavailableWarning(chunk: string): boolean {
  const lower = chunk.toLowerCase();
  if (!lower.includes("sandbox")) return false;
  return (
    lower.includes("unavailable") ||
    lower.includes("not support") ||
    lower.includes("unsupport") ||
    lower.includes("missing") ||
    lower.includes("degrad") ||
    lower.includes("unsandboxed") ||
    lower.includes("falling") ||
    lower.includes("fallback") ||
    lower.includes("fall back") ||
    lower.includes("disabled") ||
    lower.includes("failed") ||
    lower.includes("cannot") ||
    lower.includes("not available") ||
    lower.includes("not installed")
  );
}

/**
 * Best-effort extraction of a human-readable target string from a tool's input.
 * Returns undefined when no meaningful target can be inferred.
 */
function extractTarget(toolName: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  switch (toolName) {
    case "Edit":
    case "Write":
    case "Read": {
      const fp = input["file_path"];
      return typeof fp === "string" ? fp : undefined;
    }
    case "Bash": {
      const cmd = input["command"];
      if (typeof cmd !== "string") return undefined;
      return cmd.length > 40 ? cmd.slice(0, 40) + "…" : cmd;
    }
    case "Grep": {
      const p = input["path"];
      if (typeof p === "string") return p;
      const pat = input["pattern"];
      return typeof pat === "string" ? pat : undefined;
    }
    case "Glob": {
      const pat = input["pattern"];
      return typeof pat === "string" ? pat : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Emit a step:progress event when a tool_use content block starts in the stream.
 * Called for every message in both main and follow-up stream loops.
 * No-op when the message is not a tool_use event.
 */
function emitToolProgress(
  msg: SDKMessage,
  emitFn: (event: DomainEvent, payload: Record<string, unknown>) => void,
  stepName: string,
): void {
  if (!isToolUse(msg)) return;
  const cb = (msg as { type: string; event: { content_block: { name: string; input?: Record<string, unknown> } } }).event.content_block;
  const tool = cb.name;
  const target = extractTarget(tool, cb.input);
  const payload: Record<string, unknown> = { step: stepName, tool };
  if (target !== undefined) payload["target"] = target;
  emitFn("step:progress", payload);
}

export type QueryFn = (params: {
  prompt: string | AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => AsyncGenerator<unknown, void>;

/** Default QueryFn backed by the Claude Agent SDK. Exported for injection into composition-root (local.ts). */
export const defaultQueryFn: QueryFn = async function* defaultQuery(params) {
  const sdk = await loadClaudeAgentSdk();
  yield* sdk.query(params);
};

type SDKMessage = { type: string; [key: string]: unknown };
type SDKResultMessage = { type: "result"; subtype: string; [key: string]: unknown };
type SDKResultSuccess = SDKResultMessage & {
  subtype: "success";
  result: string;
  session_id?: string;
  modelUsage?: Record<string, ModelUsage>;
};

export type CreateMcpServerFn = ClaudeSdkCreateMcpServer;

export interface ClaudeCodeRunnerDeps {
  cwd?: string;
  _spawnFn?: SpawnFn;
  _queryFn?: QueryFn;
  /** Injectable for testing: replaces createSdkMcpServer to capture tool handlers. */
  _createMcpServerFn?: CreateMcpServerFn;
  /** Injectable for testing: replaces the dynamic Claude Agent SDK loader. */
  _loadSdkFn?: ClaudeAgentSdkLoader;
  /** Injectable for testing: replaces setTimeout-based sleep in transient retry backoff. */
  _sleepFn?: (ms: number) => Promise<void>;
  /**
   * Injectable Claude Code OAuth token resolver.
   * Injected from composition root (core/runtime/local.ts) to avoid adapter→domain import.
   * When undefined, token injection is skipped (tests and environments without credential file).
   */
  _resolveClaudeCodeOAuthTokenFn?: ClaudeCodeOAuthTokenResolver;
}

/**
 * TC-022: implements AgentRunner interface
 * TC-024: does not import SessionClient or @anthropic-ai/sdk
 */
export class ClaudeCodeRunner implements AgentRunner {
  private readonly defaultCwd: string;
  private readonly spawnFn: SpawnFn;
  private readonly injectedQueryFn?: QueryFn;
  private readonly injectedCreateMcpServerFn?: CreateMcpServerFn;
  private readonly loadSdkFn: ClaudeAgentSdkLoader;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly resolveClaudeCodeOAuthTokenFn?: ClaudeCodeOAuthTokenResolver;

  constructor(deps: ClaudeCodeRunnerDeps = {}) {
    this.defaultCwd = deps.cwd ?? process.cwd();
    this.spawnFn = deps._spawnFn ?? defaultSpawnFn;
    this.injectedQueryFn = deps._queryFn;
    this.injectedCreateMcpServerFn = deps._createMcpServerFn;
    this.loadSdkFn = deps._loadSdkFn ?? loadClaudeAgentSdk;
    this.resolveClaudeCodeOAuthTokenFn = deps._resolveClaudeCodeOAuthTokenFn;
    this.sleepFn = deps._sleepFn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const queryFn = this.injectedQueryFn;
    const cwd = ctx.cwd || this.defaultCwd;
    const step = ctx.step;
    const state = ctx.state;

    // TC-007: deps is StepContext — no client/githubClient needed
    let stepCtx: StepContext = {
      config: ctx.config,
      slug: ctx.slug,
      cwd,
      request: {
        type: "feature",
        title: "",
        slug: ctx.slug,
        baseBranch: ctx.input.requestBaseBranch ?? "main",
        content: ctx.input.requestContent,
        adr: ctx.input.requestAdr ?? false,
      },
      dynamicContext: ctx.input.dynamicContext,
    };

    // D3 (add-spec-review-baseline-check): call enrichContext before buildMessage.
    // Errors propagate — no catch here (StepExecutor handles error lifecycle).
    if (step.enrichContext) {
      const enriched = await step.enrichContext(stepCtx.dynamicContext!, cwd, ctx.slug);
      stepCtx = { ...stepCtx, dynamicContext: enriched };
    }

    const baseMessage = step.buildMessage(state, stepCtx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    const resumeSection = ctx.session.resumePrompt
      ? `\n\n<resume-context>\n${ctx.session.resumePrompt}\n</resume-context>`
      : "";
    const fullPrompt = additionalInstructions
      ? `${baseMessage}${resumeSection}\n\n${additionalInstructions}`
      : `${baseMessage}${resumeSection}`;

    // Resolve execution config: step-level > config defaults > step hardcoded > SDK default
    // D2/D3 (design.md): getStepExecutionConfig() resolves model, maxTurns, timeoutMs
    const dynamicMaxTurns = step.getMaxTurns?.(state);
    const resolvedConfig = getStepExecutionConfig(ctx.config, step.name, {
      model: step.agent.model,
      maxTurns: dynamicMaxTurns ?? step.maxTurns,
    }, ctx.requestType);

    // TC-006/TC-007: maxTurns: null → omit maxTurns from options (unlimited)
    // TC-012: step.maxTurns ?? 30 fallback is replaced by getStepExecutionConfig resolution chain
    const maxTurnsOption: Record<string, unknown> =
      resolvedConfig.maxTurns !== null ? { maxTurns: resolvedConfig.maxTurns } : {};

    // TC-023: invoke SDK query() with cwd, allowedTools, permissionMode, maxTurns
    let extractedModelUsage: Record<string, ModelUsage> | undefined;
    let extractedSessionId: string | undefined;

    // Set up wall-clock timeout via AbortController
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
      timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
    }

    // Build query options, adding resume if a previous session ID is available.
    const resumeOption: Record<string, unknown> =
      ctx.session.resumeSessionId ? { resume: ctx.session.resumeSessionId } : {};

    // Set up report_result MCP tool if reportTool is configured.
    // The tool result is captured via closure and accessed after the query loop.
    let capturedToolResult: BaseReportResult | null = null;
    let reportMcpServer: ReturnType<CreateMcpServerFn> | null = null;

    // write-scope-guard-redo D3: single-sourced MCP server name used in both createSdkMcpServer
    // (mcpServers key / name field) and the allowedTools MCP pre-approval entry.
    const REPORT_MCP_SERVER_NAME = "specrunner_report";

    const reportTool: ReportToolSpec | undefined = ctx.policy?.reportTool;
    if (reportTool) {
      const createMcpServerFn = this.injectedCreateMcpServerFn ?? (await this.loadSdkFn()).createSdkMcpServer;
      const toolSpec = reportTool;
      reportMcpServer = createMcpServerFn({
        name: REPORT_MCP_SERVER_NAME,
        tools: [
          {
            name: toolSpec.name,
            description: toolSpec.description,
            inputSchema: toolSpec.zodSchema,
            handler: async (args: unknown) => {
              const parseResult = toolSpec.parseInput(args);
              if (parseResult.ok) {
                capturedToolResult = parseResult.value;
              }
              return { content: [{ type: "text" as const, text: "ok" }] };
            },
          },
        ],
      });
    }

    const sdkEnv = stripSecrets(process.env as Record<string, string | undefined>);
    if (this.resolveClaudeCodeOAuthTokenFn) {
      const resolvedClaudeCodeToken = await this.resolveClaudeCodeOAuthTokenFn(process.env as Record<string, string | undefined>, { optional: true });
      if (resolvedClaudeCodeToken) {
        sdkEnv["CLAUDE_CODE_OAUTH_TOKEN"] = resolvedClaudeCodeToken.token;
      }
    }

    // D5: once-latch for sandbox degradation warning (shared across all turns of this run).
    // The fail-open guarantee relies on failIfUnavailable: false (T-01), not on this latch.
    let sandboxDegradationWarned = false;

    // SDK default stderr handling: when no stderr callback is registered, the Claude Code
    // subprocess stdio is set to "ignore" for stderr — output is silently dropped.
    // Registering this callback switches it to "pipe", enabling capture of the degradation
    // warning. No write-through is needed (there was no prior forwarding to preserve).
    const sandboxStderrCallback = (data: string): void => {
      if (!sandboxDegradationWarned && isSandboxUnavailableWarning(data)) {
        sandboxDegradationWarned = true;
        stderrWrite(
          `[specrunner] warn: sandbox unavailable for step '${step.name}' — run continues without workspace write scope. The main-checkout detection backstop remains active.`,
        );
      }
    };

    // write-scope-guard-redo D1: allowedTools base — Edit / Write removed so canUseTool fires for them.
    // write-scope-guard-redo D3: when reportTool is configured, pre-approve its MCP tool name so
    //   report_result runs immediately without consulting canUseTool (pipeline lifeline isolation).
    //   MCP tool name format: mcp__<serverName>__<toolName> (measured fact 5).
    const baseAllowedTools = ["Read", "Bash", "Grep", "Glob"];
    const allowedTools = reportTool
      ? [...baseAllowedTools, `mcp__${REPORT_MCP_SERVER_NAME}__${reportTool.name}`]
      : baseAllowedTools;

    const queryOptions: Record<string, unknown> = {
      cwd,
      allowedTools,
      disallowedTools: ["Agent", "Task"],
      // write-scope-guard-redo D1: "default" mode — canUseTool fires for tools not on allowedTools.
      // "bypassPermissions" never calls canUseTool; "dontAsk" denies without consulting canUseTool.
      permissionMode: "default",
      // write-scope-guard-redo D2: workspace guard — deny Edit/Write outside cwd, allow all else.
      // Wired once; follow-up / retry / postWork turns spread ...queryOptions, propagating the guard.
      canUseTool: createWorkspaceToolGuard(cwd),
      // D1: scope filesystem writes to the workspace (OS-level enforcement via SDK native sandbox).
      // D2: failIfUnavailable: false → fail-open when sandbox is unavailable.
      // D4: autoAllowBashIfSandboxed: true → Bash runs normally under the sandbox.
      // write-scope-guard-redo D4: allowUnsandboxedCommands: false → escape hatch disabled.
      sandbox: buildWorkspaceSandbox(cwd),
      // D5: stderr callback observes sandbox degradation; once-latch emits a single warning.
      //     Follow-up / retry / postWork turns spread ...queryOptions, reusing this callback
      //     and its shared latch so the warning fires at most once per run().
      stderr: sandboxStderrCallback,
      ...maxTurnsOption,
      model: resolvedConfig.model,
      abortController,
      env: sdkEnv,
      ...resumeOption,
      ...(reportMcpServer ? { mcpServers: { [REPORT_MCP_SERVER_NAME]: reportMcpServer } } : {}),
    };

    const agentRedirectCounter = { count: 0 };

    // Open session log writer if sessionLogPath is configured (debug level)
    const sessionLogWriter = ctx.session.logPath ? new SessionLogWriter(ctx.session.logPath) : null;

    const runQuery = async (): Promise<{ lastResult: SDKResultMessage | null }> => {
      let lastResult: SDKResultMessage | null = null;
      logPipelineDiag("query:start", `step=${step.name}`);
      const effectiveQueryFn = queryFn ?? (await this.loadSdkFn()).query;
      const messages = effectiveQueryFn({ prompt: fullPrompt, options: queryOptions });
      for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
        emitToolProgress(message, ctx.emit, step.name);
        // Write message to session log if enabled
        if (sessionLogWriter) {
          const msgAny = message as Record<string, unknown>;
          sessionLogWriter.write({
            type: msgAny["type"],
            subtype: msgAny["subtype"],
            event: msgAny["event"],
            content: msgAny["content"],
          });
        }
        if (isToolUse(message)) {
          const toolName = message.event.content_block.name;
          if (toolName === "Agent" || toolName === "Task") {
            agentRedirectCounter.count++;
            if (agentRedirectCounter.count > 3) {
              abortController.abort();
              break;
            }
          }
        }
        if (message.type === "result") {
          lastResult = message as SDKResultMessage;
        }
      }
      logPipelineDiag("query:complete", `step=${step.name}`);
      return { lastResult };
    };

    logVerbose("session", "query started", { stepName: step.name, runtime: "local", model: resolvedConfig.model });

    // Resolve transient retry config (T-04).
    const { maxRetries, baseDelayMs } = resolveTransientRetryConfig(ctx.config);
    // Tracks the number of transient retries actually taken in this run().
    let transientRetryAttempts = 0;
    // Tracks whether the resume→new-session fallback has already been attempted.
    let resumeFallbackDone = false;

    /**
     * If the query returned an error result whose text is a known transient
     * pattern, convert it to a throw so that retryWithBackoff can catch and
     * retry it.  Non-transient error results are returned unchanged.
     */
    const maybeThrowTransientResult = (
      r: { lastResult: SDKResultMessage | null },
    ): { lastResult: SDKResultMessage | null } => {
      const lr = r.lastResult;
      if (lr && lr.subtype !== "success") {
        const errors = (lr as SDKResultMessage & { errors?: string[] }).errors ?? [];
        const joinedText = errors.join(" ").trim();
        if (joinedText && isTransientAgentError(new Error(joinedText))) {
          throw Object.assign(
            new Error(`Claude Code SDK query failed: ${joinedText}`),
            { code: "CLAUDE_CODE_QUERY_FAILED_TRANSIENT" },
          );
        }
      }
      return r;
    };

    /**
     * Inner function wrapping the main work query turn plus the existing
     * resume→new-session fallback.  This is the unit retried on transient errors.
     */
    const runMainWorkTurn = async (): Promise<{ lastResult: SDKResultMessage | null }> => {
      try {
        return maybeThrowTransientResult(await runQuery());
      } catch (innerErr) {
        // Do not apply resume fallback when the abort controller has fired —
        // that path is handled by the outer catch as a timeout.
        if (abortController.signal.aborted) {
          throw innerErr;
        }
        // Transient error result throws should propagate directly to
        // retryWithBackoff — the resume fallback is for SDK-level throws only.
        const isTransientResult =
          (innerErr as { code?: string })?.code === "CLAUDE_CODE_QUERY_FAILED_TRANSIENT";
        // On the first failure, if we were attempting a session resume, fall
        // back to a fresh session.  Subsequent retries skip this branch since
        // the resume option has already been removed and `resumeFallbackDone`
        // is set to prevent the warning from repeating.
        if (!isTransientResult && ctx.session.resumeSessionId && !resumeFallbackDone) {
          resumeFallbackDone = true;
          stderrWrite(
            `[specrunner] warn: session resume failed for '${step.name}' (session: ${ctx.session.resumeSessionId}): ${(innerErr as Error).message}. Falling back to new session.`,
          );
          delete queryOptions["resume"];
          return maybeThrowTransientResult(await runQuery());
        }
        throw innerErr;
      }
    };

    /**
     * Follow-up query turn with transient-error auto-retry.
     *
     * RCA evidence: job e9602244-4d28-46da-8cc8-d8a109881172 (2026-06-12),
     * code-review step: step:start → step:error with NO step:retry events.
     * Error: "Claude Code SDK query failed: Claude Code returned an error result:
     *         API Error: Stream idle timeout - partial response received"
     * The error originated in a postWorkPrompts or report_result follow-up turn,
     * which executed outside the retryWithBackoff wrapper for runMainWorkTurn.
     *
     * - SDK-level throws are retried when isTransientAgentError returns true.
     * - Error results with a transient token are converted to throws and retried.
     * - Non-transient error results are returned as-is (caller decides handling).
     */
    const runFollowUpQueryWithRetry = async (
      prompt: string,
      options: Record<string, unknown>,
      onMessage: (msg: SDKMessage) => void = () => {},
    ): Promise<SDKResultMessage | null> => {
      const inner = async (): Promise<SDKResultMessage | null> => {
        const effectiveQueryFn = queryFn ?? (await this.loadSdkFn()).query;
        const messages = effectiveQueryFn({ prompt, options });
        let lastResult: SDKResultMessage | null = null;
        for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
          onMessage(message);
          if (message.type === "result") {
            lastResult = message as SDKResultMessage;
          }
        }
        if (lastResult && lastResult.subtype !== "success") {
          const errors = (lastResult as SDKResultMessage & { errors?: string[] }).errors ?? [];
          const joinedText = errors.join(" ").trim();
          if (joinedText && isTransientAgentError(new Error(joinedText))) {
            throw Object.assign(
              new Error(`Claude Code SDK query failed: ${joinedText}`),
              { code: "CLAUDE_CODE_QUERY_FAILED_TRANSIENT" },
            );
          }
        }
        return lastResult;
      };

      return retryWithBackoff(inner, {
        maxAttempts: maxRetries + 1,
        baseDelayMs,
        isTransientError: (err) => !abortController.signal.aborted && isTransientAgentError(err),
        sleepFn: this.sleepFn,
        onRetry: (attempt) => {
          transientRetryAttempts++;
          ctx.emit("step:retry", {
            step: step.name,
            attempt,
            maxRetries,
            delayMs: baseDelayMs * Math.pow(2, attempt - 1),
          });
        },
      });
    };

    try {
      let queryResult: { lastResult: SDKResultMessage | null };

      if (maxRetries === 0) {
        // Feature disabled — call runMainWorkTurn directly (no wrapper, no events).
        queryResult = await runMainWorkTurn();
      } else {
        // Feature enabled — wrap with retryWithBackoff.
        queryResult = await retryWithBackoff(runMainWorkTurn, {
          maxAttempts: maxRetries + 1,
          baseDelayMs,
          isTransientError: (err) =>
            !abortController.signal.aborted && isTransientAgentError(err),
          sleepFn: this.sleepFn,
          onRetry: (attempt) => {
            const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
            transientRetryAttempts++;
            ctx.emit("step:retry", {
              step: step.name,
              attempt,
              maxRetries,
              delayMs,
            });
          },
        });
      }

      // If agent redirect limit exceeded, return error without proceeding.
      if (agentRedirectCounter.count > 3) {
        sessionLogWriter?.close();
        return {
          completionReason: "error",
          resultContent: null,
          toolResult: null,
          followUpAttempts: 0,
          ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
          error: Object.assign(
            new Error(`Step '${step.name}': Agent/Task tool redirect limit exceeded (max 3)`),
            { code: "AGENT_REDIRECT_LIMIT_EXCEEDED" },
          ),
        };
      }

      const { lastResult } = queryResult;

      if (lastResult && lastResult.subtype !== "success") {
        const errorResult = lastResult as SDKResultMessage & { errors?: string[] };
        sessionLogWriter?.close();
        return {
          completionReason: "error",
          resultContent: null,
          toolResult: null,
          followUpAttempts: 0,
          ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
          error: Object.assign(
            new Error(`Claude Code SDK query failed: ${errorResult.subtype}`),
            { code: "CLAUDE_CODE_QUERY_FAILED" },
          ),
        };
      }

      // Extract modelUsage from the success result for recording in step state
      if (lastResult && lastResult.subtype === "success") {
        const successResult = lastResult as SDKResultSuccess;
        const rawUsage = successResult.modelUsage;
        if (rawUsage && typeof rawUsage === "object" && Object.keys(rawUsage).length > 0) {
          const mappedUsage: Record<string, ModelUsage> = {};
          for (const [model, usage] of Object.entries(rawUsage)) {
            mappedUsage[model] = {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadInputTokens: usage.cacheReadInputTokens,
              cacheCreationInputTokens: usage.cacheCreationInputTokens,
            };
          }
          extractedModelUsage = mappedUsage;
        }
        extractedSessionId = successResult.session_id;
      }

      // --- report_result follow-up retry (main work turn only) ---
      // If reportTool is configured and the agent didn't call it, retry up to maxAttempts.
      let followUpAttempts = 0;
      if (reportTool && capturedToolResult === null && extractedSessionId) {
        const retryPolicy = ctx.policy?.toolReportRetry ?? DEFAULT_TOOL_RETRY;
        for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
          const retryPrompt = retryPolicy.buildPrompt({ attempt, reason: "no-tool-call" });
          const retryOptions: Record<string, unknown> = {
            ...queryOptions,
            resume: extractedSessionId,
          };
          // Remove MCP server from retry options to avoid re-registering
          // (the closure is still active so tool calls will be captured)
          await runFollowUpQueryWithRetry(retryPrompt, retryOptions);
          followUpAttempts++;

          if (capturedToolResult !== null) break;

          // If this was the last attempt and tool still not called, we're done
          if (attempt === retryPolicy.maxAttempts) break;
        }
      }

      // postWorkPrompts turns (after main work and report_result detection)
      // tool calls in postWorkPrompts turns are intentionally NOT detected
      if (shouldRunFollowUp(ctx, "success") && extractedSessionId) {
        for (const followPrompt of ctx.policy.postWorkPrompts!) {
          const followUpOptions: Record<string, unknown> = {
            ...queryOptions,
            resume: extractedSessionId,
          };
          // Remove MCP server from postWork prompts — tool detection is main-work-turn only
          delete followUpOptions["mcpServers"];
          const followLastResult = await runFollowUpQueryWithRetry(
            followPrompt,
            followUpOptions,
            (msg) => emitToolProgress(msg, ctx.emit, step.name),
          );

          if (followLastResult && followLastResult.subtype !== "success") {
            const followErrorResult = followLastResult as SDKResultMessage & { errors?: string[] };
            return {
              completionReason: "error",
              resultContent: null,
              toolResult: capturedToolResult,
              followUpAttempts,
              ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
              error: Object.assign(
                new Error(`Claude Code SDK follow-up query failed: ${followErrorResult.subtype}`),
                { code: "CLAUDE_CODE_QUERY_FAILED" },
              ),
            };
          }

          if (followLastResult && followLastResult.subtype === "success") {
            const followSuccessResult = followLastResult as SDKResultSuccess;
            const rawUsage = followSuccessResult.modelUsage;
            if (rawUsage && typeof rawUsage === "object" && Object.keys(rawUsage).length > 0) {
              // resume は別 query invocation のため follow query の modelUsage は
              // その invocation 単体の usage (履歴 re-read を input に含む)。session 累積ではない。
              // 真の総コスト = 作業 query + 全 follow query の加算 (= per-model sum)。
              const summed: Record<string, ModelUsage> = { ...(extractedModelUsage ?? {}) };
              for (const [model, usage] of Object.entries(rawUsage)) {
                const prev = summed[model];
                summed[model] = {
                  inputTokens: (prev?.inputTokens ?? 0) + usage.inputTokens,
                  outputTokens: (prev?.outputTokens ?? 0) + usage.outputTokens,
                  cacheReadInputTokens: (prev?.cacheReadInputTokens ?? 0) + usage.cacheReadInputTokens,
                  cacheCreationInputTokens: (prev?.cacheCreationInputTokens ?? 0) + usage.cacheCreationInputTokens,
                };
              }
              extractedModelUsage = summed;
            }
            // Keep extractedSessionId from turn 1 (same session, sessionId should not change)
          }
        }
      }

      // Output verification follow-up loop (D3: step-completion-verification).
      // Runs after postWorkPrompts, only when outputVerification is configured.
      // session未確立時 (extractedSessionId === undefined) は skip。
      const outputVerif = ctx.policy?.outputVerification;
      if (outputVerif && extractedSessionId) {
        for (let attempt = 1; attempt <= outputVerif.maxAttempts; attempt++) {
          let checkResult: import("../../core/port/output-contract.js").OutputCheckResult;
          try {
            checkResult = await outputVerif.detect();
          } catch {
            // best-effort: detection failure → skip remaining attempts
            break;
          }
          const followUpViolations = checkResult.violations.filter((v) => v.policy === "follow-up");
          if (followUpViolations.length === 0) break;

          const repairPrompt = outputVerif.buildPrompt(followUpViolations, attempt);
          const repairOptions: Record<string, unknown> = {
            ...queryOptions,
            resume: extractedSessionId,
          };
          delete repairOptions["mcpServers"];
          try {
            const effectiveQueryFn = queryFn ?? (await this.loadSdkFn()).query;
            const repairMessages = effectiveQueryFn({ prompt: repairPrompt, options: repairOptions });
            for await (const message of repairMessages as AsyncGenerator<SDKMessage, void>) {
              emitToolProgress(message, ctx.emit, step.name);
              if (message.type === "result" && (message as SDKResultMessage).subtype === "success") {
                const su = (message as SDKResultSuccess);
                const rawUsage = su.modelUsage;
                if (rawUsage && typeof rawUsage === "object" && Object.keys(rawUsage).length > 0) {
                  const summed: Record<string, ModelUsage> = { ...(extractedModelUsage ?? {}) };
                  for (const [model, usage] of Object.entries(rawUsage)) {
                    const prev = summed[model];
                    summed[model] = {
                      inputTokens: (prev?.inputTokens ?? 0) + usage.inputTokens,
                      outputTokens: (prev?.outputTokens ?? 0) + usage.outputTokens,
                      cacheReadInputTokens: (prev?.cacheReadInputTokens ?? 0) + usage.cacheReadInputTokens,
                      cacheCreationInputTokens: (prev?.cacheCreationInputTokens ?? 0) + usage.cacheCreationInputTokens,
                    };
                  }
                  extractedModelUsage = summed;
                }
              }
            }
          } catch {
            // best-effort: repair turn failure → preserve work turn result
            stderrWrite(
              `[specrunner] warn: output verification repair turn ${attempt} failed for '${step.name}'. Continuing.\n`,
            );
          }
          followUpAttempts++;
        }
      }

      logVerbose("session", "query completed", { stepName: step.name, runtime: "local", sessionId: extractedSessionId });

      // Write session summary to session log (session ID, model, token usage)
      if (sessionLogWriter) {
        sessionLogWriter.writeSummary({
          sessionId: extractedSessionId,
          model: resolvedConfig.model,
          modelUsage: extractedModelUsage,
        });
        sessionLogWriter.close();
      }

      // TC-025: read result file from local fs (not GitHub API)
      const resultFilePath = step.resultFilePath(state, stepCtx);

      let resultContent: string | null = null;
      if (resultFilePath !== null) {
        const absolutePath = path.isAbsolute(resultFilePath)
          ? resultFilePath
          : path.join(cwd, resultFilePath);
        try {
          resultContent = await fs.readFile(absolutePath, "utf-8");
        } catch {
          return {
            completionReason: "error",
            resultContent: null,
            toolResult: capturedToolResult,
            followUpAttempts,
            ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
            error: Object.assign(
              new Error(`result file not found: ${resultFilePath}`),
              { code: "RESULT_FILE_NOT_FOUND" },
            ),
          };
        }
      }

      const baseResult: AgentRunResult = {
        completionReason: "success",
        resultContent: null,
        toolResult: capturedToolResult,
        followUpAttempts,
        ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
        modelUsage: extractedModelUsage,
        sessionId: extractedSessionId,
      };
      return mergeFollowUpResult(baseResult, resultContent);
    } catch (err) {
      if (abortController.signal.aborted && timeoutId !== undefined) {
        clearTimeout(timeoutId);
        logVerbose("session", "query timeout", { stepName: step.name, runtime: "local", timeoutMs: resolvedConfig.timeoutMs });
        sessionLogWriter?.close();
        return {
          completionReason: "timeout",
          resultContent: null,
          toolResult: null,
          followUpAttempts: 0,
          ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
          error: Object.assign(
            new Error(`Step '${step.name}' timed out after ${resolvedConfig.timeoutMs}ms`),
            { code: "STEP_TIMEOUT" },
          ),
        };
      }
      if (err instanceof SpecRunnerError) throw err;

      const cause = err as Error;
      logVerbose("session", "query error", { stepName: step.name, runtime: "local", error: cause.message });
      sessionLogWriter?.close();
      return {
        completionReason: "error",
        resultContent: null,
        toolResult: null,
        followUpAttempts: 0,
        ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
        error: Object.assign(
          new Error(`Claude Code SDK query failed: ${cause.message}`),
          { code: "CLAUDE_CODE_QUERY_FAILED", cause },
        ),
      };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}

export function createClaudeCodeRunner(deps: ClaudeCodeRunnerDeps = {}): ClaudeCodeRunner {
  return new ClaudeCodeRunner(deps);
}
