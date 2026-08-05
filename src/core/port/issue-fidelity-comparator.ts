/**
 * Port interface for the issue-fidelity comparator.
 *
 * Compares a GitHub issue body with a request.md to identify requirements
 * that are mentioned in the issue but absent from both the request's requirement
 * section and its scope-out declarations (undeclared drops).
 *
 * Core layer only — never imports from adapter/.
 */

/**
 * Result of comparing an issue body with a request.md.
 *
 * undeclaredDrops: issue requirements that appear in neither the request's
 * requirement section nor its scope-out declarations.
 * Empty array = no undeclared drops (gate passes).
 */
export interface IssueFidelityComparison {
  /**
   * Issue requirements not present in the request's requirements section
   * and not declared as out-of-scope. Each element is a concise description
   * of the dropped requirement (not a verbatim copy of the issue body).
   * Empty array means all issue requirements are accounted for.
   */
  undeclaredDrops: string[];
}

/**
 * Port interface: compares an issue with a request.md and returns the set
 * of issue requirements not accounted for (undeclared drops).
 *
 * Implementations live in adapter/; core never imports them directly.
 */
export interface IssueFidelityComparator {
  /**
   * Compare the issue title + body with the request.md content.
   *
   * @param input.issueTitle  Title of the GitHub issue.
   * @param input.issueBody   Body of the GitHub issue.
   * @param input.requestMd   Full text content of the request.md file.
   * @returns Promise resolving to the comparison result (undeclaredDrops list).
   *
   * Throws on LLM error, timeout, or parse failure (fail-closed).
   */
  compare(input: { issueTitle: string; issueBody: string; requestMd: string }): Promise<IssueFidelityComparison>;
}
