/**
 * Provider harness registry.
 *
 * PROVIDER_HARNESSES maps each CONTRACT_PROVIDERS entry to its harness implementation.
 * The key set must exactly equal CONTRACT_PROVIDERS (enforced by contract-ratchet.test.ts).
 */
import type { ProviderHarness } from "./types.js";
import { claudeCodeHarness } from "./claude-code.js";
import { codexHarness } from "./codex.js";

export const PROVIDER_HARNESSES: Record<string, ProviderHarness> = Object.freeze({
  "claude-code": claudeCodeHarness,
  "codex": codexHarness,
});
