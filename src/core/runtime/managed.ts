/**
 * ManagedRuntime: RuntimeStrategy implementation for Anthropic Managed Agents.
 *
 * Design D3: SessionClient, ManagedAgentRunner, no-op workspace/cleanup.
 * All config.runtime !== "local" logic lives here — not in CLI or pipeline.
 */
import type { SessionClient } from "../port/session-client.js";
import type { GitHubClient } from "../port/github-client.js";
import type { AgentRunner } from "../port/agent-runner.js";
import type { PipelineDeps } from "../types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { OriginInfo } from "../../git/remote.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import { createManagedAgentRunner } from "../../adapter/managed-agent/agent-runner.js";
import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./strategy.js";

// Empty opaque handle for managed runtime (no-op)
const MANAGED_NOOP_HANDLE = {} as unknown as CleanupHandle;

export class ManagedRuntime implements RuntimeStrategy {
  constructor(
    private readonly cwd: string,
    private readonly sessionClient: SessionClient,
    private readonly githubClient: GitHubClient,
    private readonly repo: OriginInfo,
  ) {}

  /**
   * SSE-based agent query via SessionClient.
   * Minimal implementation for interface compliance — future dialog use.
   */
  async *query(_prompt: string, _opts?: QueryOptions): AsyncGenerator<unknown> {
    // Managed dialog not yet implemented; placeholder for RuntimeStrategy contract
  }

  createAgentRunner(): AgentRunner {
    return createManagedAgentRunner({
      sessionClient: this.sessionClient,
      githubClient: this.githubClient,
      repo: this.repo,
    });
  }

  async setupWorkspace(
    _slug: string,
    _jobId: string,
    _opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
    // Managed runtime: no worktree needed — pipeline runs in current cwd
    return { cwd: this.cwd };
  }

  buildDeps(
    config: SpecRunnerConfig,
    repo: OriginInfo,
    request: ParsedRequest,
    slug: string,
    workspace: WorkspaceContext,
  ): PipelineDeps {
    return {
      client: this.sessionClient,
      config,
      repo,
      request,
      slug,
      githubClient: this.githubClient,
      cwd: workspace.cwd,
      runner: this.createAgentRunner(),
    };
  }

  registerCleanup(_jobId: string, _startStep: string): CleanupHandle {
    // Managed runtime: no signal handlers or worktree cleanup needed
    return MANAGED_NOOP_HANDLE;
  }

  async teardown(_handle: CleanupHandle, _finalStatus: string): Promise<void> {
    // Managed runtime: no-op
  }
}
