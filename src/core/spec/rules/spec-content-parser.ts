import type { DeltaSpecRuleInput } from "./types.js";

export interface RequirementBlock {
  /** Full header line, e.g. "### Requirement: X" */
  header: string;
  /** Requirement name, i.e. everything after "### Requirement: " */
  name: string;
  /** Text between header line and first "#### Scenario:" (or end of block) */
  body: string;
  /** Whether at least one "#### Scenario:" exists in this block */
  hasScenario: boolean;
  /** 0-indexed line number of the header within the section content */
  line: number;
}

/**
 * Load all spec.md files under <changePath>/specs/<cap>/spec.md.
 *
 * - Flat .md files directly in specs/ are skipped (they are canonical-spec-structure violations)
 * - If specs/ does not exist or is unreadable, returns []
 */
export async function loadSpecFiles(
  input: DeltaSpecRuleInput,
): Promise<Array<{ specPath: string; content: string; capability: string }>> {
  const { changePath, deps } = input;

  let entries: string[];
  try {
    entries = await deps.readdir(`${changePath}/specs`);
  } catch {
    return [];
  }

  const results: Array<{ specPath: string; content: string; capability: string }> = [];

  for (const entry of entries) {
    // Skip flat .md files — they are canonical-spec-structure violations, not our concern
    if (entry.endsWith(".md")) {
      continue;
    }

    const specPath = `${changePath}/specs/${entry}/spec.md`;
    let content: string;
    try {
      content = await deps.readFile(specPath);
    } catch {
      // No spec.md in this subdir — skip
      continue;
    }

    results.push({ specPath, content, capability: entry });
  }

  return results;
}

/**
 * Extract the content of a named `## ` section from Markdown content.
 *
 * Returns the text between the matching header line (exclusive) and the next
 * `## ` heading (exclusive) or EOF. Returns null if the section is not found.
 *
 * The returned string preserves original newlines and includes a trailing
 * newline if the source content has one.
 */
export function extractSection(content: string, sectionHeader: string): string | null {
  // Find the section header as a whole line
  const headerPattern = new RegExp(
    `(?:^|\\n)${escapeRegex(sectionHeader)}[ \\t]*(?=\\n|$)`,
  );
  const headerMatch = headerPattern.exec(content);
  if (headerMatch === null) {
    return null;
  }

  // Content starts after the header line's newline
  const afterHeader = headerMatch.index + headerMatch[0].length;
  // Skip the single newline that follows the header
  const sectionStart = content[afterHeader] === "\n" ? afterHeader + 1 : afterHeader;

  // Find the next ## heading using multiline anchoring so that an immediately
  // adjacent section (no blank line between them) is correctly detected.
  const nextSectionMatch = /^## /gm;
  nextSectionMatch.lastIndex = sectionStart;
  const nextMatch = nextSectionMatch.exec(content);

  if (nextMatch === null) {
    return content.slice(sectionStart);
  }

  // nextMatch.index is the position of '#' — the preceding '\n' is already
  // excluded from the slice, giving the exact section body.
  return content.slice(sectionStart, nextMatch.index);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a `## Requirements` section content into RequirementBlock entries.
 *
 * Each block spans from a `### Requirement: X` header to the next `### ` heading,
 * `## ` heading, or EOF.
 */
export function parseRequirementBlocks(sectionContent: string): RequirementBlock[] {
  const lines = sectionContent.split("\n");
  const blocks: RequirementBlock[] = [];

  const headerRegex = /^### Requirement:\s*(.+)$/;

  // Find all header positions
  const headerPositions: Array<{ lineIndex: number; header: string; name: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const match = headerRegex.exec(lines[i]!);
    if (match) {
      headerPositions.push({
        lineIndex: i,
        header: lines[i]!,
        name: match[1]!.trim(),
      });
    }
  }

  for (let h = 0; h < headerPositions.length; h++) {
    const { lineIndex, header, name } = headerPositions[h]!;
    const nextHeaderLine =
      h + 1 < headerPositions.length ? headerPositions[h + 1]!.lineIndex : lines.length;

    // Block content: lines after the header up to (but not including) the next ### header
    const blockLines = lines.slice(lineIndex + 1, nextHeaderLine);

    // Find first "#### Scenario:" line within the block
    let firstScenarioIndex = -1;
    let hasScenario = false;
    for (let i = 0; i < blockLines.length; i++) {
      if (blockLines[i]!.startsWith("#### Scenario:")) {
        firstScenarioIndex = i;
        hasScenario = true;
        break;
      }
    }

    // Body: header line's next lines up to first Scenario (or end of block)
    const bodyLines =
      firstScenarioIndex === -1 ? blockLines : blockLines.slice(0, firstScenarioIndex);
    const body = bodyLines.join("\n") + (bodyLines.length > 0 ? "\n" : "");

    blocks.push({
      header,
      name,
      body,
      hasScenario,
      line: lineIndex,
    });
  }

  return blocks;
}
