/**
 * Shared git commit + push instruction for agent steps.
 * Used by spec-fixer, implementer, and build-fixer buildMessage.
 */

/**
 * Build the git push instruction snippet to embed in agent user messages.
 * @param branch - The branch name to commit and push to.
 */
export function buildGitPushInstruction(branch: string): string {
  return `After completing your changes:
1. Commit your changes to branch '${branch}'
2. Push the branch to the remote repository
3. Do NOT return until push is complete`;
}
