/**
 * Prompt builder for system prompts.
 *
 * Provides a pure function to assemble a system prompt from a base string
 * and an ordered list of shared fragments. No registry, class, or interface.
 */

/**
 * Build a system prompt by joining the base string and fragments with double newlines.
 *
 * Each agent system prompt includes an identity priming + rules.md Read instruction
 * at the top of its base string. Cross-step context is delivered via rules.md
 * (copied to the change folder at run start) rather than statically prepended here.
 *
 * @param base     - The prompt-specific base content (includes identity priming).
 * @param fragments - Shared fragments to append (in order).
 * @returns The assembled system prompt string.
 */
export function buildSystemPrompt(base: string, fragments: readonly string[]): string {
  return [base, ...fragments].join("\n\n");
}
