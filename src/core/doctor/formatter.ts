/**
 * Doctor formatters: human-readable and JSON output.
 * Design D4: formatHuman / formatJson both exported from this module.
 */
import type { DoctorResult, DoctorCategory } from "./types.js";

const CATEGORY_ORDER: DoctorCategory[] = [
  "runtime",
  "config",
  "env",
  "auth",
  "repo",
  "agents",
  "storage",
];

const STATUS_SYMBOL: Record<string, string> = {
  pass: "[✓]",
  warn: "[!]",
  fail: "[✗]",
};

/**
 * Format results for human display.
 * Groups by category, with status symbols and hints.
 * Ends with a summary line.
 */
export function formatHuman(results: DoctorResult[]): string {
  const lines: string[] = [];

  // Group by category (preserve order)
  const grouped = new Map<DoctorCategory, DoctorResult[]>();
  for (const r of results) {
    const group = grouped.get(r.category) ?? [];
    group.push(r);
    grouped.set(r.category, group);
  }

  // Sort by canonical category order
  const sortedCategories = CATEGORY_ORDER.filter((cat) => grouped.has(cat));
  // Add any unexpected categories at the end
  for (const [cat] of grouped) {
    if (!sortedCategories.includes(cat)) {
      sortedCategories.push(cat);
    }
  }

  for (const category of sortedCategories) {
    const categoryResults = grouped.get(category);
    if (!categoryResults || categoryResults.length === 0) continue;

    lines.push(`\n[${category.toUpperCase()}]`);

    for (const r of categoryResults) {
      const symbol = STATUS_SYMBOL[r.status] ?? "[?]";
      lines.push(`  ${symbol} ${r.name}: ${r.message}`);
      if (r.hint) {
        lines.push(`      Hint: ${r.hint}`);
      }
      if (r.details && r.details.length > 0) {
        for (const detail of r.details) {
          lines.push(`      - ${detail}`);
        }
      }
    }
  }

  // Summary
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const r of results) {
    if (r.status === "pass") pass++;
    else if (r.status === "warn") warn++;
    else if (r.status === "fail") fail++;
  }

  lines.push(`\nSummary: ${pass} pass, ${warn} warn, ${fail} fail`);

  return lines.join("\n");
}

/**
 * JSON result entry — only include hint/details if present.
 */
interface JsonResultEntry {
  name: string;
  category: DoctorCategory;
  required: boolean;
  status: "pass" | "warn" | "fail";
  message: string;
  hint?: string;
  details?: string[];
}

/**
 * Format results as machine-readable JSON.
 * Omits hint/details when undefined (spec requirement).
 * Results are in execution order.
 */
export function formatJson(results: DoctorResult[]): string {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const r of results) {
    if (r.status === "pass") pass++;
    else if (r.status === "warn") warn++;
    else if (r.status === "fail") fail++;
  }

  const entries: JsonResultEntry[] = results.map((r) => {
    const entry: JsonResultEntry = {
      name: r.name,
      category: r.category,
      required: r.required,
      status: r.status,
      message: r.message,
    };
    if (r.hint !== undefined) {
      entry.hint = r.hint;
    }
    if (r.details !== undefined) {
      entry.details = r.details;
    }
    return entry;
  });

  return JSON.stringify(
    {
      summary: { pass, warn, fail },
      results: entries,
    },
    null,
    2,
  );
}
