import * as fs from "node:fs/promises";
import { requestMdInvalidError } from "../errors.js";
import { stderrWrite } from "../logger/stdout.js";
import { TYPE_CONFIG } from "../config/type-config.js";

export type { ParsedRequest, ParsedRequestSections } from "../core/request/types.js";
import type { ParsedRequest, ParsedRequestSections } from "../core/request/types.js";

function isAllowedType(t: string): t is keyof typeof TYPE_CONFIG {
  return t in TYPE_CONFIG;
}

/**
 * Parse a request.md file into structured fields.
 * Format: level-1 heading as title, Meta section with type,
 * Workflow Options section with enabled list.
 *
 * Throws REQUEST_MD_INVALID if required fields are missing.
 * Warns to stderr for unknown types but continues.
 */
export async function parseRequestMd(filePath: string): Promise<ParsedRequest> {
  const raw = await fs.readFile(filePath, "utf-8");
  return parseRequestMdContent(raw, filePath);
}

/**
 * Parse request.md content (string) — exported for testing.
 */
export function parseRequestMdContent(
  content: string,
  filePath: string = "<string>",
): ParsedRequest {
  const lines = content.split("\n");

  // Extract title from first level-1 heading
  let title: string | null = null;
  for (const line of lines) {
    const m = /^#\s+(.+)$/.exec(line.trimEnd());
    if (m?.[1]) {
      title = m[1].trim();
      break;
    }
  }
  if (title === null) {
    throw requestMdInvalidError(
      `missing title (top-level # heading required) in ${filePath}`,
    );
  }

  // Extract type from Meta section: "- **type**: value"
  let type: string | null = null;
  const typePattern = /^\s*-\s+\*\*type\*\*:\s+(.+)$/;
  for (const line of lines) {
    const m = typePattern.exec(line);
    if (m?.[1]) {
      type = m[1].trim();
      break;
    }
  }
  if (type === null) {
    throw requestMdInvalidError(
      `missing 'type' in Meta section in ${filePath}`,
    );
  }

  if (!isAllowedType(type)) {
    stderrWrite(`Warning: unknown request type '${type}'.`);
  }

  // Extract slug from Meta section: "- **slug**: value"
  // Required: missing slug → REQUEST_MD_INVALID. Single source of truth for the
  // change identifier across the whole pipeline (executor / agent / change folder).
  let slug: string | null = null;
  const slugPattern = /^\s*-\s+\*\*slug\*\*:\s+(.+)$/;
  for (const line of lines) {
    const m = slugPattern.exec(line);
    if (m?.[1]) {
      slug = m[1].trim();
      break;
    }
  }
  if (slug === null || slug.length === 0) {
    throw requestMdInvalidError(
      `missing 'slug' in Meta section in ${filePath}`,
    );
  }

  // Extract base-branch from Meta section: "- **base-branch**: value"
  // Required: missing base-branch → REQUEST_MD_INVALID.
  let baseBranch: string | null = null;
  const baseBranchPattern = /^\s*-\s+\*\*base-branch\*\*:\s+(.+)$/;
  for (const line of lines) {
    const m = baseBranchPattern.exec(line);
    if (m?.[1]) {
      baseBranch = m[1].trim();
      break;
    }
  }
  if (baseBranch === null || baseBranch.length === 0) {
    throw requestMdInvalidError(
      `missing 'base-branch' in Meta section in ${filePath}`,
    );
  }

  // Extract enabled list from Workflow Options section
  const enabled = extractEnabled(lines);

  // Extract sections: 背景, 目的
  const sections = extractSections(lines);

  return { type, title, slug, baseBranch, content, enabled, sections };
}

/**
 * Extract the enabled list from Workflow Options section.
 * Section header: "## Workflow Options" (case-insensitive match)
 * Items: "- item" lines under "enabled:" key or directly listed.
 */
function extractEnabled(lines: string[]): string[] {
  // Find the Workflow Options section
  let sectionStart = -1;
  const sectionHeaderPattern = /^##\s+Workflow\s+Options/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && sectionHeaderPattern.test(line)) {
      sectionStart = i;
      break;
    }
  }

  if (sectionStart === -1) {
    return [];
  }

  // Find section end (next ## heading)
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /^##\s+/.test(line)) {
      sectionEnd = i;
      break;
    }
  }

  const sectionLines = lines.slice(sectionStart + 1, sectionEnd);

  // Look for "enabled:" line and extract list items below it
  // Format: "- enabled: [item1, item2, ...]" or
  // "- enabled:\n  - item1\n  - item2"
  // Also handle: "- **enabled**: [item1, item2]"
  const enabled: string[] = [];

  // Try to find "enabled:" key (possible formats)
  const enabledKeyPattern = /^\s*-?\s*\*?\*?enabled\*?\*?:?\s*(.*)/i;

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    if (line === undefined) continue;
    const m = enabledKeyPattern.exec(line);
    if (m) {
      const inlineValue = m[1]?.trim() ?? "";
      if (inlineValue.length > 0) {
        // Inline format: "enabled: [item1, item2]" or "enabled: item1, item2"
        const cleaned = inlineValue.replace(/^\[|\]$/g, "");
        const items = cleaned
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        enabled.push(...items);
      } else {
        // Multi-line format: items on subsequent lines
        for (let j = i + 1; j < sectionLines.length; j++) {
          const nextLine = sectionLines[j];
          if (nextLine === undefined) continue;
          if (/^##/.test(nextLine)) break;
          const itemMatch = /^\s*-\s+(.+)$/.exec(nextLine.trimEnd());
          if (itemMatch?.[1]) {
            enabled.push(itemMatch[1].trim());
          } else if (nextLine.trim().length > 0 && !/^\s*-/.test(nextLine)) {
            // Non-list line, stop
            break;
          }
        }
      }
      break;
    }
  }

  return enabled;
}

/**
 * Extract named sections (## 背景, ## 目的) from the document lines.
 * Returns the body text under each heading (until the next ## heading or EOF).
 * Headings not present → corresponding field is undefined.
 */
function extractSections(lines: string[]): ParsedRequestSections {
  const targetHeadings = ["背景", "目的"] as const;
  const result: ParsedRequestSections = {};

  for (const heading of targetHeadings) {
    const headingPattern = new RegExp(`^##\\s+${heading}\\s*$`);
    let sectionStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined && headingPattern.test(line.trimEnd())) {
        sectionStart = i;
        break;
      }
    }

    if (sectionStart === -1) {
      // Heading not present — leave field undefined
      continue;
    }

    // Find end of section (next ## heading or EOF)
    let sectionEnd = lines.length;
    for (let i = sectionStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined && /^##\s+/.test(line)) {
        sectionEnd = i;
        break;
      }
    }

    const bodyLines = lines.slice(sectionStart + 1, sectionEnd);
    // Trim leading/trailing blank lines
    const body = bodyLines.join("\n").trim();
    if (body.length > 0) {
      result[heading] = body;
    }
  }

  return result;
}
