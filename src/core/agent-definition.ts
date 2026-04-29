import { createHash } from "node:crypto";
import { getDefinitions } from "./tools/registry.js";
import { PROPOSE_SYSTEM_PROMPT } from "../prompts/propose-system.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../prompts/spec-fixer-system.js";

export const AGENT_NAME = "specrunner-propose";
export const SPEC_FIXER_AGENT_NAME = "specrunner-spec-fixer";
export const AGENT_MODEL = "claude-sonnet-4-5";

/**
 * Build the agent definition object for use in create/update.
 */
export function buildAgentDefinition() {
  return {
    name: AGENT_NAME,
    model: AGENT_MODEL,
    system: PROPOSE_SYSTEM_PROMPT,
    tools: [
      {
        type: "agent_toolset_20260401" as const,
      },
      ...getDefinitions(),
    ],
  };
}

/**
 * Build the spec-fixer agent definition.
 * The spec-fixer has no custom tools (no register_branch).
 */
export function buildSpecFixerAgentDefinition() {
  return {
    name: SPEC_FIXER_AGENT_NAME,
    model: AGENT_MODEL,
    system: SPEC_FIXER_SYSTEM_PROMPT,
    tools: [
      {
        type: "agent_toolset_20260401" as const,
      },
      // No custom tools — spec-fixer does not use register_branch
    ],
  };
}

/**
 * Canonical JSON serialization for deterministic hashing.
 * Sorts keys recursively to ensure stable output regardless of property order.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((key) => {
      const val = (obj as Record<string, unknown>)[key];
      return JSON.stringify(key) + ":" + canonicalJson(val);
    })
    .join(",");
  return "{" + sorted + "}";
}

/**
 * Compute SHA-256 hash of the agent definition for change detection.
 */
export function computeDefinitionHash(definition: ReturnType<typeof buildAgentDefinition>): string {
  const canonical = canonicalJson(definition);
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}
