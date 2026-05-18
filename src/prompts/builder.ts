/**
 * Prompt builder for system prompts.
 *
 * Provides a pure function to assemble a system prompt from a base string
 * and an ordered list of shared fragments. No registry, class, or interface.
 */

/**
 * Build a system prompt by joining a base string and fragments with double newlines.
 *
 * @param base     - The prompt-specific base content.
 * @param fragments - Shared fragments to append (in order).
 * @returns The assembled system prompt string.
 */
export function buildSystemPrompt(base: string, fragments: readonly string[]): string {
  return [base, ...fragments].join("\n\n");
}
