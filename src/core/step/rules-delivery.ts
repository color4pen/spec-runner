/**
 * rules-delivery.ts — frontmatter-based delivery classification for project rules.
 *
 * Design D1/D2 (rules-delivery): rule files may declare `delivery: followup | prompt`
 * in YAML frontmatter. CLI reads only the `delivery` key; rule body content is not
 * interpreted. Files without frontmatter default to followup (full backward compat).
 *
 * Pure functions — no I/O, no node:fs import.
 */

/** Valid delivery values. */
type Delivery = "followup" | "prompt";

/**
 * Split markdown content into frontmatter block and body.
 * Follows the same convention as src/core/reviewers/definition.ts splitFrontmatter.
 * NOTE: the same frontmatter convention is also implemented in src/core/reviewers/definition.ts.
 * If the `---` delimiter convention changes, update both files.
 *
 * - First line must be exactly `---` (trimmed) to trigger frontmatter parsing.
 * - Closing `---` ends the frontmatter block; body is everything after it.
 * - Unclosed frontmatter (opening `---` but no closing `---`): everything after
 *   the opening line is treated as frontmatter, body is "".
 * - No frontmatter: frontmatter="" / body=full content.
 */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: "", body: content };
  }

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) {
    // Unclosed frontmatter
    return { frontmatter: lines.slice(1).join("\n"), body: "" };
  }

  const frontmatter = lines.slice(1, closeIdx).join("\n");
  const body = lines.slice(closeIdx + 1).join("\n");
  return { frontmatter, body };
}

/**
 * Extract the `delivery` scalar value from a raw frontmatter string.
 * Returns undefined when the key is absent.
 */
function extractDelivery(frontmatter: string): string | undefined {
  if (!frontmatter.trim()) return undefined;
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (key === "delivery") {
      return line.slice(colonIdx + 1).trim() || undefined;
    }
  }
  return undefined;
}

/**
 * Classify each rule file content by delivery method.
 *
 * For each content string:
 *   - Strips frontmatter (if present) → produces the body to deliver.
 *   - Reads `delivery` key from frontmatter:
 *       absent / "followup" → followup bucket (backward compat)
 *       "prompt"            → prompt bucket
 *       anything else       → throws (D6: no silent fallback)
 *
 * @param contents - Raw file contents from resolveStepRules (order preserved).
 * @returns { followup: string[]; prompt: string[] } — frontmatter-stripped bodies.
 * @throws Error when an unknown delivery value is encountered.
 */
export function splitRulesByDelivery(contents: string[]): { followup: string[]; prompt: string[] } {
  const followup: string[] = [];
  const prompt: string[] = [];

  for (const raw of contents) {
    const { frontmatter, body } = splitFrontmatter(raw);
    const rawDelivery = extractDelivery(frontmatter);
    const delivery: Delivery = rawDelivery === undefined ? "followup" : validateDelivery(rawDelivery, body);

    if (delivery === "prompt") {
      prompt.push(body);
    } else {
      followup.push(body);
    }
  }

  return { followup, prompt };
}

function validateDelivery(value: string, body: string): Delivery {
  if (value === "followup" || value === "prompt") {
    return value;
  }
  const firstLine = body.split("\n").find((l) => l.trim() !== "") ?? "";
  throw new Error(
    `Unknown delivery value "${value}" (allowed: followup, prompt). Rule starts with: ${firstLine}`,
  );
}

/**
 * Build the main-work-prompt section for `delivery: prompt` rules.
 *
 * Design D5 (rules-delivery):
 *   - Wraps all bodies in a <project-rules> block with a compliance preamble.
 *   - Each body is wrapped in a <rule> tag; preamble appears exactly once.
 *   - Does NOT include follow-up 3-element wrap (修正範囲/stop条件/意図解釈).
 *
 * @param bodies - Frontmatter-stripped bodies of `delivery: prompt` rules (ascending order).
 * @returns Formatted string, or undefined when bodies is empty.
 */
export function buildRulesPromptSection(bodies: string[]): string | undefined {
  if (bodies.length === 0) return undefined;

  const rules = bodies.map((b) => `<rule>\n${b}\n</rule>`).join("\n");
  return [
    "<project-rules>",
    "以下はこの step の作業全体で遵守すべき project 規約です。",
    "作業を開始する前に読み、作業中ずっとこの制約に従ってください。",
    "",
    rules,
    "</project-rules>",
  ].join("\n");
}
