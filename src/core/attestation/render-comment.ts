/**
 * renderAttestationComment — pure function to render an Attestation as a GitHub PR comment body.
 *
 * Output: Markdown string containing:
 *   - Always-visible summary line (gate count, total cost, journal hash)
 *   - Collapsed <details> sections: gate history, step models, cost breakdown,
 *     machine-readable JSON block (full attestation object)
 *
 * The <details> folding is display-only (#1073): every value rendered before the
 * folding change is still present, and the ```json fence still parses back to the
 * full Attestation object.
 *
 * Pure: no I/O, no side effects.
 */
import { formatUsd } from "../usage/pricing.js";
import type { Attestation } from "./types.js";

/**
 * Render an Attestation as a GitHub PR comment (Markdown string).
 */
export function renderAttestationComment(attestation: Attestation): string {
  const lines: string[] = [];

  lines.push("## SpecRunner Attestation");
  lines.push("");

  // Always-visible summary. Trailing double-space forces a <br> between the lines.
  // The journal hash is shortened here for width; the full value stays in the JSON block.
  lines.push(`**Gates:** ${attestation.gates.length}  `);
  lines.push(`**Cost:** ${formatUsd(attestation.cost.totalCostUsd)}  `);
  lines.push(`**Journal:** \`${attestation.journalHash.slice(0, 12)}…\``);
  lines.push("");

  // Gate table
  lines.push("<details>");
  lines.push(`<summary>Gate history (${attestation.gates.length})</summary>`);
  lines.push("");
  lines.push("| Step | Attempt | Verdict | Findings |");
  lines.push("|------|---------|---------|----------|");
  for (const gate of attestation.gates) {
    const verdict = gate.verdict ?? "—";
    const findingsCell = gate.findings
      ? `${gate.findings.total} (crit:${gate.findings.bySeverity.critical} high:${gate.findings.bySeverity.high} med:${gate.findings.bySeverity.medium} low:${gate.findings.bySeverity.low})`
      : "—";
    lines.push(`| ${gate.step} | ${gate.attempt} | ${verdict} | ${findingsCell} |`);
  }
  lines.push("");
  lines.push("</details>");
  lines.push("");

  // Step models
  if (attestation.stepModels.length > 0) {
    lines.push("<details>");
    lines.push("<summary>Step models</summary>");
    lines.push("");
    for (const sm of attestation.stepModels) {
      const modelsStr = sm.models.length > 0 ? sm.models.join(", ") : "—";
      lines.push(`- **${sm.step}**: ${modelsStr}`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  // Cost summary
  lines.push("<details>");
  lines.push("<summary>Cost breakdown</summary>");
  lines.push("");
  lines.push(`**Total**: ${formatUsd(attestation.cost.totalCostUsd)}`);
  if (attestation.cost.unpricedModels.length > 0) {
    lines.push(`**Unpriced models**: ${attestation.cost.unpricedModels.join(", ")}`);
  }
  lines.push("");

  if (attestation.cost.perStep.length > 0) {
    lines.push("| Step | Cost | Input | Output | Cache Read | Cache Write |");
    lines.push("|------|------|-------|--------|------------|-------------|");
    for (const ps of attestation.cost.perStep) {
      const costStr = formatUsd(ps.costUsd);
      lines.push(
        `| ${ps.step} | ${costStr} | ${ps.tokens.input} | ${ps.tokens.output} | ${ps.tokens.cacheRead} | ${ps.tokens.cacheWrite} |`,
      );
    }
    lines.push("");
  }
  lines.push("</details>");
  lines.push("");

  // Machine-readable block
  lines.push("<details>");
  lines.push("<summary>Raw attestation JSON</summary>");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(attestation, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("</details>");
  lines.push("");

  return lines.join("\n");
}
