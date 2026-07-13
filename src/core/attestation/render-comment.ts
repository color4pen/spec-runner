/**
 * renderAttestationComment — pure function to render an Attestation as a GitHub PR comment body.
 *
 * Output: Markdown string containing:
 *   - Human-readable summary (journal hash, gate table, step models, cost)
 *   - Machine-readable JSON block (full attestation object)
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

  // Journal hash
  lines.push(`**Journal hash**: \`${attestation.journalHash}\``);
  lines.push("");

  // Gate table
  lines.push(`### Gates (${attestation.gates.length})`);
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

  // Step models
  if (attestation.stepModels.length > 0) {
    lines.push("### Step Models");
    lines.push("");
    for (const sm of attestation.stepModels) {
      const modelsStr = sm.models.length > 0 ? sm.models.join(", ") : "—";
      lines.push(`- **${sm.step}**: ${modelsStr}`);
    }
    lines.push("");
  }

  // Cost summary
  lines.push("### Cost");
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

  // Machine-readable block
  lines.push("### Raw Attestation");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(attestation, null, 2));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
