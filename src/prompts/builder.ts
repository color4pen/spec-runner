/**
 * Prompt builder for system prompts.
 *
 * Provides a pure function to assemble a system prompt from a base string
 * and an ordered list of shared fragments. No registry, class, or interface.
 */
import { SPEC_RUNNER_COMMON_CONTEXT } from "./fragments.js";

/**
 * Build a system prompt by prepending SPEC_RUNNER_COMMON_CONTEXT, then joining
 * base string and fragments with double newlines.
 *
 * SPEC_RUNNER_COMMON_CONTEXT is automatically prepended to every system prompt
 * to ensure all agents have the same system-level context (pipeline structure,
 * principles, responsibility boundaries, system facts).
 *
 * @param base     - The prompt-specific base content.
 * @param fragments - Shared fragments to append (in order).
 * @returns The assembled system prompt string.
 */
export function buildSystemPrompt(base: string, fragments: readonly string[]): string {
  return [SPEC_RUNNER_COMMON_CONTEXT, base, ...fragments].join("\n\n");
}
