/**
 * Config schema migration utilities.
 *
 * Applies 3 independent normalization operations to a raw config object:
 * (a) Legacy `agent` singular → `agents.design`
 * (b) camelCase intermediate keys → kebab-case (specFixer → spec-fixer, specReview → spec-review)
 * (c) Missing roles remain absent (syncAll fills them later)
 *
 * The 3 operations are applied independently and do not depend on each other.
 * The result is a canonical `agents: Record<string, AgentRecord>` shape.
 */
import type { RawConfig, AgentRecord, SpecRunnerConfig } from "./schema.js";
import { STEP_NAMES } from "../core/step/step-names.js";

/**
 * camelCase intermediate key → kebab-case canonical key map.
 */
const CAMEL_TO_KEBAB: Record<string, string> = {
  specFixer: STEP_NAMES.SPEC_FIXER,
  specReview: STEP_NAMES.SPEC_REVIEW,
  propose: STEP_NAMES.DESIGN,  // backward compat alias: old "propose" key → new "design" key
  design: STEP_NAMES.DESIGN,   // canonical key (no-op)
};

/**
 * Normalize an agent entry from the raw config into an AgentRecord.
 * Accepts both old (`id`) and new (`agentId`) field names.
 * Returns undefined if the entry is invalid/missing.
 */
function normalizeAgentRecord(entry: unknown): AgentRecord | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const obj = entry as Record<string, unknown>;

  // Support both legacy `id` and new `agentId`
  const agentId = (typeof obj["agentId"] === "string" && obj["agentId"])
    || (typeof obj["id"] === "string" && obj["id"])
    || undefined;

  if (!agentId) return undefined;

  const definitionHash = typeof obj["definitionHash"] === "string" ? obj["definitionHash"] : "";
  // Use "" sentinel instead of a generated timestamp — migration must be deterministic.
  // The next AgentSyncer.syncAll() will write a real ISO timestamp after sync.
  const lastSyncedAt = typeof obj["lastSyncedAt"] === "string" ? obj["lastSyncedAt"] : "";

  return { agentId, definitionHash, lastSyncedAt };
}

/**
 * Migrate a raw config object to the canonical SpecRunnerConfig agents shape.
 *
 * Migration rules (applied independently):
 * 1. If `agents` exists (new or intermediate shape): normalize each entry
 *    - Rename camelCase keys to kebab-case
 * 2. If `agent` (legacy singular) exists AND `agents.propose` is NOT already set:
 *    - Copy `agent.id` → `agents.propose.agentId`
 * 3. Both concurrent: intermediate `agents` wins for any overlapping keys;
 *    legacy `agent.id` only fills in `propose` if not already present
 *
 * Returns a new object with a canonical `agents` field.
 * The `agent` (legacy) field is stripped from the result.
 */
export function migrateConfig(raw: RawConfig): Record<string, AgentRecord> {
  const result: Record<string, AgentRecord> = {};

  // Step 1: Process agents map (new or intermediate shape)
  if (raw.agents && typeof raw.agents === "object") {
    for (const [key, value] of Object.entries(raw.agents)) {
      const normalized = normalizeAgentRecord(value);
      if (!normalized) continue;

      // Normalize key: camelCase → kebab-case
      const canonicalKey = CAMEL_TO_KEBAB[key] ?? key;
      result[canonicalKey] = normalized;
    }
  }

  // Step 2: Apply legacy `agent` singular → `agents.design` (only if design not yet set)
  if (raw.agent && !result[STEP_NAMES.DESIGN]) {
    const legacy = raw.agent;
    const agentId = legacy.id ?? undefined;
    if (agentId) {
      result[STEP_NAMES.DESIGN] = {
        agentId,
        definitionHash: legacy.definitionHash ?? "",
        // Use "" sentinel — migration is deterministic; syncAll writes real timestamp.
        lastSyncedAt: legacy.lastSyncedAt ?? "",
      };
    }
  }

  return result;
}

/**
 * Apply migration to a parsed raw config and return the canonical SpecRunnerConfig.
 * The `agent` legacy field is stripped.
 * Throws if the raw config is not a valid object (CONFIG_INVALID guard).
 *
 * TC-032: If runtime field is absent, default to "managed" (backward compat).
 */
export function applyMigration(raw: unknown): SpecRunnerConfig {
  if (typeof raw !== "object" || raw === null) {
    throw Object.assign(new Error("Config must be a JSON object."), { code: "CONFIG_INVALID" });
  }

  const rawConfig = raw as RawConfig;
  const migratedAgents = migrateConfig(rawConfig);

  // D7 (design.md): normalize missing runtime field to "managed" for backward compat.
  // TC-032: existing config without runtime → in-memory config.runtime === "managed"
  const runtime: "managed" | "local" =
    rawConfig.runtime === "local" ? "local" : "managed";

  // Build canonical config — strip `agent` legacy field
  // For local runtime, anthropic may be absent — default to empty apiKey.
  const anthropic: { apiKey: string } =
    (rawConfig.anthropic as { apiKey: string } | undefined) ?? { apiKey: "" };

  const canonical: SpecRunnerConfig = {
    ...rawConfig as Record<string, unknown>,
    runtime,
    agents: migratedAgents,
    version: (rawConfig.version as 1) ?? 1,
    anthropic,
  } as SpecRunnerConfig;

  // Remove legacy fields from the canonical object
  delete (canonical as unknown as Record<string, unknown>)["agent"];

  return canonical;
}
