/**
 * Parser for custom reviewer definition files (`specrunner/reviewers/<name>.md`).
 *
 * Design: pure function, no node:fs import. The caller injects file content as a string.
 * Follows the same boundary convention as rules-resolve.ts.
 */
import type { ReviewerDefinition } from "./types.js";

/** Required section headers in the reviewer markdown body. */
const REQUIRED_SECTIONS = ["目的", "観点", "判定基準"] as const;

/**
 * Parse a reviewer markdown file into a ReviewerDefinition.
 *
 * Frontmatter format (YAML-style, between `---` delimiters):
 *   name: <string>
 *   maxIterations: <integer>
 *   model: <string>  # optional
 *
 * Required body sections (## heading):
 *   ## 目的
 *   ## 観点
 *   ## 判定基準
 *
 * Any content not in the required sections is collected as `freeText`.
 *
 * Missing fields are represented as empty strings / sentinel values so that
 * validateReviewerDefinitions can produce comprehensive error lists.
 *
 * @param filename - The source filename (e.g. "security.md"), used for error reporting.
 * @param content  - The full file content as a string.
 */
export function parseReviewerDefinition(filename: string, content: string): ReviewerDefinition {
  const { frontmatter, body } = splitFrontmatter(content);
  const fm = parseFrontmatter(frontmatter);
  const sections = parseSections(body);

  return {
    name: fm.name ?? "",
    maxIterations: fm.maxIterations ?? NaN,
    model: fm.model,
    purpose: sections["目的"] ?? "",
    criteria: sections["観点"] ?? "",
    judgment: sections["判定基準"] ?? "",
    freeText: sections["__free__"] ?? "",
    filename,
  };
}

// ---------------------------------------------------------------------------
// Internal parsers
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  name?: string;
  maxIterations?: number;
  model?: string;
}

/**
 * Split markdown content into frontmatter block and body.
 * Frontmatter is delimited by `---` at the start of the file.
 * If no frontmatter is present, frontmatter is "" and body is the full content.
 */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: "", body: content };
  }

  // Find closing ---
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) {
    // Unclosed frontmatter — treat everything after opening --- as frontmatter
    return { frontmatter: lines.slice(1).join("\n"), body: "" };
  }

  const frontmatter = lines.slice(1, closeIdx).join("\n");
  const body = lines.slice(closeIdx + 1).join("\n");
  return { frontmatter, body };
}

/**
 * Parse a YAML-style frontmatter block into key/value pairs.
 * Only supports simple `key: value` lines (no nested objects or arrays).
 */
function parseFrontmatter(fm: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};
  if (!fm.trim()) return result;

  for (const line of fm.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "name") {
      result.name = value;
    } else if (key === "maxIterations") {
      const n = parseInt(value, 10);
      result.maxIterations = isNaN(n) ? NaN : n;
    } else if (key === "model") {
      result.model = value || undefined;
    }
  }

  return result;
}

/**
 * Parse the markdown body into named sections.
 * Sections start at `## <SectionName>` and end at the next `##` heading.
 * Content before the first section is prepended to `__free__`.
 * Content after all required sections is also in `__free__`.
 */
function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split("\n");

  let currentSection: string | null = null;
  let buffer: string[] = [];

  function flushBuffer() {
    if (currentSection !== null) {
      const existing = sections[currentSection] ?? "";
      sections[currentSection] = (existing + buffer.join("\n")).trim();
    } else {
      // Pre-section content → append to __free__
      const text = buffer.join("\n").trim();
      if (text) {
        sections["__free__"] = ((sections["__free__"] ?? "") + "\n" + text).trim();
      }
    }
    buffer = [];
  }

  for (const line of lines) {
    const sectionMatch = /^##\s+(.+)$/.exec(line);
    if (sectionMatch) {
      flushBuffer();
      const heading = sectionMatch[1]?.trim() ?? "";
      // Check if this is a required section or a sub-heading / free section
      if ((REQUIRED_SECTIONS as readonly string[]).includes(heading)) {
        currentSection = heading;
      } else {
        // Non-required heading → collect into free text
        currentSection = "__free__";
        buffer.push(line);
      }
    } else {
      buffer.push(line);
    }
  }
  flushBuffer();

  // Map required sections to empty string if absent (so validation can detect them)
  for (const sec of REQUIRED_SECTIONS) {
    if (!(sec in sections)) {
      sections[sec] = "";
    }
  }

  return sections;
}
