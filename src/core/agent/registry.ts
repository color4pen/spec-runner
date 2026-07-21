/**
 * AgentRegistry: pure aggregate of AgentDefinitions extracted from Step instances.
 * No I/O — does not call Anthropic API.
 *
 * Design D2: fromSteps() is the only constructor.
 * Duplicate roles throw at construction time to catch configuration errors early.
 */
import type { AgentDefinition } from "./definition.js";
import type { Step, AgentStep } from "../step/types.js";
import { hashObject } from "./hash.js";

export class AgentRegistry {
  private constructor(
    private readonly defs: Map<string, AgentDefinition>,
  ) {}

  /**
   * Build a registry from an array of Steps.
   * Only AgentSteps (kind === "agent") are included — CliSteps are skipped.
   * Each included Step must have a unique agent.role.
   * Throws with "Duplicate agent role: <role>" if two Steps share a role.
   */
  static fromSteps(steps: Step[]): AgentRegistry {
    const map = new Map<string, AgentDefinition>();
    // Filter to agent-only steps — CLI steps (like verification) have no agent
    const agentSteps = steps.filter((s): s is AgentStep => s.kind === "agent");
    for (const step of agentSteps) {
      const def = step.agent;
      if (step.name !== def.role) {
        throw new Error(`Step name and agent role mismatch: name=${step.name}, role=${def.role}`);
      }
      const role = def.role;
      if (map.has(role)) {
        throw new Error(`Duplicate agent role: ${role}`);
      }
      map.set(role, def);
    }
    return new AgentRegistry(map);
  }

  /**
   * Get the AgentDefinition for a given role.
   * Returns undefined if the role is not registered.
   */
  get(role: string): AgentDefinition | undefined {
    return this.defs.get(role);
  }

  /**
   * Return all registered AgentDefinitions as an array.
   * Order matches insertion order (fromSteps argument order).
   */
  list(): AgentDefinition[] {
    return [...this.defs.values()];
  }

  /**
   * Compute the canonical SHA-256 hash of a role's AgentDefinition.
   * Deterministic: same definition → same hash every time.
   * Throws with "Unknown agent role: <role>" if not registered.
   */
  hashOf(role: string): string {
    const def = this.defs.get(role);
    if (def === undefined) {
      throw new Error(`Unknown agent role: ${role}`);
    }
    return hashObject(def);
  }
}
