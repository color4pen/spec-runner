/**
 * Parser for verification-result.md content.
 * Extracts failed phases and their error output for use in build-fixer context.
 */

/** Failure information for a single verification phase. */
export interface VerificationFailure {
  phase: string;
  exitCode: number;
  /** stdout + stderr combined (as written to the code block in verification-result.md). */
  output: string;
}

/**
 * Parse verification-result.md content and return all failed phases.
 *
 * Extracts from two sections:
 * 1. Phase Results table — identifies phases with "failed" status and their exit codes.
 * 2. `## Phase: <name>` sections — extracts the code block content as `output`.
 *
 * Returns an empty array when no phases failed (all passed or all skipped).
 */
export function extractVerificationFailures(content: string): VerificationFailure[] {
  const failures: VerificationFailure[] = [];

  // Match table rows with "failed" status.
  // Format: | {num} | {phase} | failed | {duration} | {exitCode} |
  const tableRowRegex = /^\|\s*\d+\s*\|\s*(\S+)\s*\|\s*failed\s*\|[^|]+\|\s*(\d+)\s*\|/gm;

  let match: RegExpExecArray | null;
  while ((match = tableRowRegex.exec(content)) !== null) {
    const phase = match[1] ?? "";
    const exitCode = parseInt(match[2] ?? "0", 10);

    if (!phase) continue;

    // Find the corresponding ## Phase: <name> section and extract the code block.
    const output = extractPhaseOutput(content, phase);

    failures.push({ phase, exitCode, output });
  }

  return failures;
}

/**
 * Extract the code block content from a `## Phase: <name>` section.
 *
 * The format written by runner.ts is:
 *   ## Phase: <name>
 *   (blank line)
 *   ```
 *   <stdout + stderr combined>
 *   ```
 *
 * Returns empty string if the section has no code block (e.g. skipped phase).
 */
function extractPhaseOutput(content: string, phase: string): string {
  // Escape regex special chars in phase name (phase names are alphanumeric but be safe).
  const escapedPhase = phase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Match the exact format produced by runner.ts:
  //   ## Phase: <phase>\n\n```\n<content>\n```
  const sectionRegex = new RegExp(
    `^## Phase: ${escapedPhase}\\n\\n\`\`\`\\n([\\s\\S]*?)\\n\`\`\``,
    "m",
  );

  const m = sectionRegex.exec(content);
  return m ? (m[1] ?? "") : "";
}
