/**
 * Port interface for config persistence.
 * Implementations provide load/save/get/upsert over SpecRunnerConfig.
 *
 * Design D7: ConfigStore.getAgentId is synchronous — callers must await load() first.
 */
import type { SpecRunnerConfig, AgentRecord } from "../../config/schema.js";
import type { StepName } from "../../state/schema.js";

export interface ConfigStore {
  /**
   * Load config from disk. Applies migration if needed.
   * Must be called (and awaited) before getAgentId.
   */
  load(): Promise<SpecRunnerConfig>;

  /**
   * Save config to disk atomically.
   */
  save(config: SpecRunnerConfig): Promise<void>;

  /**
   * Synchronously return agent ID for the given role.
   * Throws CONFIG_INCOMPLETE if load() has not been called or if the role is missing.
   */
  getAgentId(role: StepName): string;

  /**
   * Upsert (insert or update) an AgentRecord for the given role.
   * Updates in-memory state. Call save() to persist.
   */
  upsertAgent(role: StepName, record: AgentRecord): Promise<void>;
}
