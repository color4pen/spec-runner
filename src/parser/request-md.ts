import * as fs from "node:fs/promises";
import { requestMdInvalidError } from "../errors.js";
import { stderrWrite } from "../logger/stdout.js";

export type { ParsedRequest, ParsedRequestSections } from "./types.js";
import type { ParsedRequest, ParsedRequestSections } from "./types.js";

import type { ParsedRequestRaw } from "./rules/types.js";
export type { ParsedRequestRaw } from "./rules/types.js";
import { createRequestMdRegistry } from "./rules/index.js";

/**
 * Parse a request.md file into structured fields.
 * Format: level-1 heading as title, Meta section with type.
 * Unknown sections (e.g. legacy "## Workflow Options") are silently ignored.
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
  const raw = parseRequestMdRaw(content, filePath);

  const registry = createRequestMdRegistry();
  const violations = registry.validate(raw);

  for (const v of violations) {
    if (v.severity === "warning") {
      stderrWrite(v.message);
    }
  }

  const firstError = violations.find((v) => v.severity === "error");
  if (firstError) {
    throw requestMdInvalidError(firstError.message);
  }

  // At this point all required fields are validated present — safe to cast
  const adr = raw.adrRaw === "true";

  return {
    type: raw.type as string,
    title: raw.title as string,
    slug: raw.slug as string,
    baseBranch: raw.baseBranch as string,
    content: raw.content,
    adr,
    sections: raw.sections,
    issue: raw.issue,
  };
}

/**
 * Extract raw fields from request.md content without validation.
 * Exported for testing and rule unit tests.
 */
export function parseRequestMdRaw(
  content: string,
  filePath: string = "<string>",
): ParsedRequestRaw {
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

  // Extract slug from Meta section: "- **slug**: value"
  let slug: string | null = null;
  const slugPattern = /^\s*-\s+\*\*slug\*\*:\s+(.+)$/;
  for (const line of lines) {
    const m = slugPattern.exec(line);
    if (m?.[1]) {
      slug = m[1].trim();
      break;
    }
  }

  // Extract base-branch from Meta section: "- **base-branch**: value"
  let baseBranch: string | null = null;
  const baseBranchPattern = /^\s*-\s+\*\*base-branch\*\*:\s+(.+)$/;
  for (const line of lines) {
    const m = baseBranchPattern.exec(line);
    if (m?.[1]) {
      baseBranch = m[1].trim();
      break;
    }
  }

  // Extract issue from Meta section: "- **issue**: value" (optional)
  let issue: string | undefined = undefined;
  const issuePattern = /^\s*-\s+\*\*issue\*\*:\s+(.+)$/;
  for (const line of lines) {
    const m = issuePattern.exec(line);
    if (m?.[1]) {
      issue = m[1].trim();
      break;
    }
  }

  // Extract adr from Meta section: "- **adr**: true|false" (required)
  let adrRaw: string | null = null;
  const adrPattern = /^\s*-\s+\*\*adr\*\*:\s+(true|false)\s*$/;
  for (const line of lines) {
    const m = adrPattern.exec(line);
    if (m?.[1]) {
      adrRaw = m[1].trim();
      break;
    }
  }

  // Check if there's an adr field with an invalid value
  let adrAnyValue: string | null = null;
  if (adrRaw === null) {
    const adrAnyPattern = /^\s*-\s+\*\*adr\*\*:\s+(.+)$/;
    for (const line of lines) {
      const m = adrAnyPattern.exec(line);
      if (m?.[1]) {
        adrAnyValue = m[1].trim();
        break;
      }
    }
  }

  // Extract sections: 背景, 目的
  const sections = extractSections(lines);

  return {
    title,
    type,
    slug,
    baseBranch,
    adrRaw,
    adrAnyValue,
    issue,
    sections,
    filePath,
    content,
  };
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
