/**
 * Design-topic emission module.
 *
 * During the archive phase, collects design-level findings (resolution:"decision-needed"
 * or origin:"scope") from all step runs in the job and emits them as individual topic
 * files to design/topics/<slug>.md in the recordDir (worktree).
 *
 * Contract: aozu integration spec §6 (file-only, no CLI call required).
 * - 1 finding = 1 topic file
 * - Idempotent: existing files are not overwritten
 * - Degenerate: no-op when designLayer.enabled or topicEmission is false, or design/ absent
 */
import * as nodePath from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { ResolvedDesignLayer } from "../../config/schema.js";
import type { JobState } from "../../state/schema.js";
import type { Finding } from "../../kernel/report-result.js";
import type { DecisionRecord } from "../../state/schema.js";
import { computeFindingKey } from "../decision/decision-ledger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopicCandidate {
  finding: Finding;
  step: string;
  iteration: number;
  index: number;
}

export type TopicEmissionResult =
  | { status: "skipped" }
  | { status: "emitted"; count: number; dir: string };

export interface EmitDesignTopicsParams {
  /** Slug of the job being archived. */
  slug: string;
  /** Full job state (with steps and decisions). */
  state: JobState;
  /** Resolved design-layer config. */
  designLayer: ResolvedDesignLayer;
  /** Absolute path to the recording directory (worktree or main repo). */
  recordDir: string;
  spawn: SpawnFn;
  fs: {
    exists(path: string): Promise<boolean>;
    mkdir(path: string, opts: { recursive: boolean }): Promise<void>;
    writeFile(path: string, content: string): Promise<void>;
  };
  stdoutWrite: (msg: string) => void;
  stderrWrite: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Pure helpers (T-02)
// ---------------------------------------------------------------------------

/**
 * Collect topic candidates from all step runs in the job state.
 *
 * Walks state.steps in deterministic order:
 *   - step names: lexicographic (Object.keys sorted)
 *   - runs within each step: attempt ascending
 *   - findings within each run: array index ascending
 *
 * Selects findings where resolution === "decision-needed" OR origin === "scope".
 * Deduplicates by (step, file, line, title): first occurrence wins.
 */
export function collectTopicCandidates(state: JobState): TopicCandidate[] {
  const steps = state.steps ?? {};
  const stepNames = Object.keys(steps).sort();

  const seen = new Set<string>();
  const result: TopicCandidate[] = [];

  for (const step of stepNames) {
    const runs = steps[step] ?? [];
    // Sort by attempt ascending (should already be sorted, but be explicit)
    const sorted = [...runs].sort((a, b) => a.attempt - b.attempt);

    for (const run of sorted) {
      const toolResult = run.outcome.toolResult as { findings?: Finding[] } | null | undefined;
      const findings: Finding[] = toolResult?.findings ?? [];

      findings.forEach((finding, index) => {
        const isTopic =
          finding.resolution === "decision-needed" || finding.origin === "scope";
        if (!isTopic) return;

        // Dedupe key: step|file|(line ?? "")|title
        const key = `${step}|${finding.file}|${finding.line ?? ""}|${finding.title}`;
        if (seen.has(key)) return;
        seen.add(key);

        result.push({ finding, step, iteration: run.attempt, index });
      });
    }
  }

  return result;
}

/**
 * Derive a deterministic topic slug from job slug, step, iteration, and index.
 *
 * Raw string: `<jobSlug>-<step>-<iteration>-<index>`
 * Normalization:
 *   1. lowercase
 *   2. replace [^a-z0-9] with hyphen
 *   3. collapse consecutive hyphens to one
 *   4. strip leading/trailing hyphens
 *
 * Output always matches: ^[a-z0-9]+(-[a-z0-9]+)*$
 */
export function deriveTopicSlug(
  jobSlug: string,
  step: string,
  iteration: number,
  index: number,
): string {
  const raw = `${jobSlug}-${step}-${iteration}-${index}`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Render the content of a topic file (flat frontmatter + body).
 *
 * Frontmatter:
 *   id: top-<slug>
 *   source: specrunner:<jobSlug>/<step>-<iteration>#<index>
 *
 * Body:
 *   - Title heading
 *   - Rationale (symptom)
 *   - Context table (severity, step, file)
 *   - Optional provisional decision section
 */
export function renderTopicFile(params: {
  slug: string;
  jobSlug: string;
  step: string;
  iteration: number;
  index: number;
  finding: Finding;
  decisions: DecisionRecord[] | undefined;
}): string {
  const { slug, jobSlug, step, iteration, index, finding, decisions } = params;

  const source = `specrunner:${jobSlug}/${step}-${iteration}#${index}`;
  const fileRef = finding.line !== undefined
    ? `${finding.file}:${finding.line}`
    : finding.file;

  const lines: string[] = [
    "---",
    `id: top-${slug}`,
    `source: ${source}`,
    "---",
    "",
    `## ${finding.title}`,
    "",
    "### 症状",
    "",
    finding.rationale,
    "",
    "### 文脈",
    "",
    `- **severity**: ${finding.severity}`,
    `- **step**: ${step}`,
    `- **file**: ${fileRef}`,
  ];

  // Decision ledger lookup
  const matchedDecision = findMatchingDecision(step, finding, decisions);
  if (matchedDecision) {
    const opt = matchedDecision.selectedOption;
    lines.push(
      "",
      "### 暫定裁定（提案であって決定ではない）",
      "",
      `- **label**: ${opt.label}`,
      `- **consequence**: ${opt.consequence}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Find a matching decision record for a finding.
 * Returns the first DecisionRecord whose key matches (step + finding key).
 */
function findMatchingDecision(
  step: string,
  finding: Finding,
  decisions: DecisionRecord[] | undefined,
): DecisionRecord | undefined {
  if (!decisions || decisions.length === 0) return undefined;
  const key = computeFindingKey(step, finding);
  return decisions.find((d) => d.step === step && d.findingKey === key);
}

// ---------------------------------------------------------------------------
// I/O orchestration (T-03)
// ---------------------------------------------------------------------------

/**
 * Emit design topics from a job's findings during the archive phase.
 *
 * Degradation:
 *   - designLayer.enabled !== true → skipped
 *   - designLayer.topicEmission !== true → skipped
 *   - design/ directory absent in recordDir → skipped
 *
 * Idempotent: existing topic files are not overwritten.
 * Best-effort: internal exceptions are caught and reported as warnings; archive continues.
 */
export async function emitDesignTopics(
  params: EmitDesignTopicsParams,
): Promise<TopicEmissionResult> {
  const { slug, state, designLayer, recordDir, spawn, fs, stdoutWrite, stderrWrite } = params;

  // Degradation checks
  if (designLayer.enabled !== true || designLayer.topicEmission !== true) {
    return { status: "skipped" };
  }

  const designDir = nodePath.join(recordDir, "design");
  const designExists = await fs.exists(designDir);
  if (!designExists) {
    return { status: "skipped" };
  }

  const topicsDir = nodePath.join(designDir, "topics");

  try {
    const topicsDirExists = await fs.exists(topicsDir);
    if (!topicsDirExists) {
      await fs.mkdir(topicsDir, { recursive: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderrWrite(`Warning: design-topic emission: failed to create design/topics/: ${msg}. Continuing.`);
    return { status: "skipped" };
  }

  // Collect candidates
  const candidates = collectTopicCandidates(state);
  if (candidates.length === 0) {
    return { status: "skipped" };
  }

  let emitted = 0;

  for (const candidate of candidates) {
    const topicSlug = deriveTopicSlug(slug, candidate.step, candidate.iteration, candidate.index);
    const filePath = nodePath.join(topicsDir, `${topicSlug}.md`);

    // Check for existing file (idempotent)
    let alreadyExists = false;
    try {
      alreadyExists = await fs.exists(filePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stderrWrite(`Warning: design-topic emission: failed to check ${filePath}: ${msg}. Skipping.`);
      continue;
    }

    if (alreadyExists) {
      continue;
    }

    // Render and write
    try {
      const content = renderTopicFile({
        slug: topicSlug,
        jobSlug: slug,
        step: candidate.step,
        iteration: candidate.iteration,
        index: candidate.index,
        finding: candidate.finding,
        decisions: state.decisions,
      });
      await fs.writeFile(filePath, content);
      emitted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stderrWrite(`Warning: design-topic emission: failed to write ${filePath}: ${msg}. Continuing.`);
    }
  }

  // Stage new files (independent of mark-hook staging)
  if (emitted > 0) {
    try {
      const addResult = await spawn("git", ["add", "--", "design/topics"], { cwd: recordDir });
      if (addResult.exitCode !== 0) {
        stderrWrite(
          `Warning: design-topic emission: git add -- design/topics failed (exit ${addResult.exitCode}): ${addResult.stderr.trim()}. Continuing.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stderrWrite(`Warning: design-topic emission: git add failed: ${msg}. Continuing.`);
    }

    const relativeDir = nodePath.join("design", "topics");
    stdoutWrite(`Emitted ${emitted} design topic(s) to ${relativeDir}/`);
    return { status: "emitted", count: emitted, dir: relativeDir };
  }

  return { status: "skipped" };
}
