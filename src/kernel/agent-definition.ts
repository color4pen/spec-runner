/**
 * Core agent definition types.
 * These types do NOT import from @anthropic-ai/sdk — adapter layer handles SDK mapping.
 *
 * Kernel principle: zero imports. AgentStepName is inlined as a literal union.
 * Compile-time sync with AGENT_STEP_NAMES (kernel/step-names.ts) is enforced
 * via bidirectional guard in state/schema.ts.
 */

/**
 * Names of pipeline steps that run as agent sessions.
 * Compile-time sync with AGENT_STEP_NAMES (kernel/step-names.ts) is enforced
 * via bidirectional guard in state/schema.ts — update both when adding steps.
 */
export type AgentStepName =
  | "design"
  | "spec-review"
  | "spec-fixer"
  | "test-case-gen"
  | "implementer"
  | "build-fixer"
  | "code-review"
  | "code-fixer"
  | "conformance"
  | "adr-gen";

/**
 * Single source of truth for the Anthropic agent toolset type string.
 * Use this constant wherever AgentToolsetSpec.type is referenced.
 */
export const AGENT_TOOLSET_TYPE = "agent_toolset_20260401" as const;

/**
 * ToolSpec for the Anthropic agent toolset (built-in tools like computer use).
 */
export interface AgentToolsetSpec {
  readonly type: typeof AGENT_TOOLSET_TYPE;
}

/**
 * ToolSpec for a custom tool defined by specrunner.
 */
export interface CustomToolSpec {
  readonly type: "custom";
  readonly name: string;
  readonly description: string;
  readonly input_schema: {
    readonly type: "object";
    readonly properties?: Record<string, unknown>;
    readonly required?: string[];
    readonly [key: string]: unknown;
  };
}

/**
 * Union of all supported tool spec types.
 * Adapter layer maps ToolSpec → SDK Tool type.
 */
export type ToolSpec = AgentToolsetSpec | CustomToolSpec;

/**
 * Agent capability flags (reserved for Phase 2 implementation).
 * Setting these fields in this request has no runtime effect.
 */
export interface AgentCapabilities {
  readonly network?: boolean;
  readonly gitWrite?: boolean;
}

/**
 * Full definition of a Managed Agent associated with a Step.
 * Each Step class owns one AgentDefinition — self-contained.
 *
 * Design D1: Step.agent is a complete AgentDefinition, not a runtime placeholder.
 */
export interface AgentDefinition {
  /** Human-readable name on Anthropic (e.g. "specrunner-propose"). */
  readonly name: string;
  /** AgentStepName this agent is associated with (kebab-case). */
  readonly role: AgentStepName;
  /** Anthropic model ID. */
  readonly model: string;
  /** Full system prompt string. */
  readonly system: string;
  /** Tools available to the agent. */
  readonly tools: ToolSpec[];
  /** Capability flags (Phase 2 reserved). */
  readonly capabilities?: AgentCapabilities;
}
