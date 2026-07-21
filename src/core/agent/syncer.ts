/**
 * AgentSyncer: orchestrates per-role Agent sync against Anthropic API.
 *
 * Design D3:
 * - Retrieve → compare hash → create / update / no-op
 * - 404 fallback: missing agent → create
 * - Partial failure: rollback only newly created agents (update is not reversible)
 * - Idempotent: 2nd run with same definitions → all no-op
 */
import type { AnthropicClient } from "../port/anthropic-client.js";
import type { AgentRegistry } from "./registry.js";
import { stderrWrite } from "../../logger/stdout.js";

/**
 * Per-role result of a syncAll() call.
 */
export interface SyncRoleResult {
  readonly agentId: string;
  readonly definitionHash: string;
  readonly lastSyncedAt: string;
  readonly action: "no-op" | "create" | "update";
}

/**
 * Aggregate result of syncAll().
 * Contains per-role results indexed by role name (string).
 */
export interface SyncResult {
  readonly results: Map<string, SyncRoleResult>;
}

/**
 * Minimal ConfigStore view needed by AgentSyncer:
 * read the stored agentId and hash for a role (if any).
 */
export interface AgentSyncerConfig {
  getStoredAgent(role: string): { agentId: string; definitionHash: string } | undefined;
}

/**
 * AgentSyncer synchronizes all registered Agents against Anthropic.
 * Requires AnthropicClient (port), AgentRegistry (pure), and stored config lookup.
 */
export class AgentSyncer {
  constructor(
    private readonly client: AnthropicClient,
    private readonly registry: AgentRegistry,
    private readonly storedConfig: AgentSyncerConfig,
  ) {}

  /**
   * Sync all roles in the registry.
   * Processes roles sequentially (insertion order of registry.list()).
   * On partial failure, rolls back only newly created agents.
   * Throws the original error after rollback.
   */
  async syncAll(): Promise<SyncResult> {
    const roles = this.registry.list().map((def) => def.role);
    const results = new Map<string, SyncRoleResult>();

    // Track newly created agents for rollback
    const createdAgents: Array<{ role: string; agentId: string }> = [];

    for (const role of roles) {
      const def = this.registry.get(role)!;
      const currentHash = this.registry.hashOf(role);
      const stored = this.storedConfig.getStoredAgent(role);
      const now = new Date().toISOString();

      try {
        if (stored?.agentId) {
          // Try to retrieve existing agent
          let retrieved: { id: string } | null = null;
          try {
            retrieved = await this.client.retrieveAgent(stored.agentId);
          } catch (err) {
            const status = (err as { status?: number }).status;
            if (status === 404) {
              retrieved = null; // fallback to create
            } else {
              throw err;
            }
          }

          if (retrieved === null) {
            // 404 fallback: create new agent
            const created = await this.client.createAgent(def);
            createdAgents.push({ role, agentId: created.id });
            results.set(role, {
              agentId: created.id,
              definitionHash: currentHash,
              lastSyncedAt: now,
              action: "create",
            });
          } else if (stored.definitionHash === currentHash) {
            // Hash matches — no-op
            results.set(role, {
              agentId: stored.agentId,
              definitionHash: currentHash,
              lastSyncedAt: now,
              action: "no-op",
            });
          } else {
            // Hash differs — update
            await this.client.updateAgent(stored.agentId, def);
            results.set(role, {
              agentId: stored.agentId,
              definitionHash: currentHash,
              lastSyncedAt: now,
              action: "update",
            });
            // update is NOT added to createdAgents — rollback only covers create
          }
        } else {
          // No stored entry — create new agent
          const created = await this.client.createAgent(def);
          createdAgents.push({ role, agentId: created.id });
          results.set(role, {
            agentId: created.id,
            definitionHash: currentHash,
            lastSyncedAt: now,
            action: "create",
          });
        }
      } catch (err) {
        // Rollback all newly created agents
        await this.rollback(createdAgents);
        throw Object.assign(
          new Error(`Agent sync failed for role '${role}': ${(err as Error).message}`),
          { cause: err, role },
        );
      }
    }

    return { results };
  }

  /**
   * Archive all agents in the rollback list.
   * On individual archive failure, logs warning to stderr and continues.
   * The original error is re-thrown by the caller — this method does not throw.
   */
  private async rollback(
    agents: Array<{ role: string; agentId: string }>,
  ): Promise<void> {
    for (const { agentId } of agents) {
      try {
        await this.client.archiveAgent(agentId);
      } catch {
        stderrWrite(
          `Failed to cleanup orphaned agent ${agentId}; please archive manually.`,
        );
      }
    }
  }
}
