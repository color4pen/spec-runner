/**
 * Delta spec → baseline spec merge logic for finish command.
 *
 * Implements the merge of change folder delta specs into the canonical
 * baseline specs in specrunner/specs/<capability>/spec.md.
 *
 * Delta spec format:
 *   ## ADDED Requirements
 *   ### Requirement: <name>
 *   ...
 *   ## MODIFIED Requirements
 *   ### Requirement: <name>
 *   ...
 *   ## REMOVED Requirements
 *   ### Requirement: <name>
 *   ...
 *
 * Baseline spec format:
 *   ## Purpose
 *   ...
 *   ## Requirements
 *   ### Requirement: <name>
 *   ...
 */
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "./types.js";
import { formatEscalation } from "./escalation.js";
import { changeFolderPath, specsDirRel, baselineSpecPath } from "../../util/paths.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { TYPE_CONFIG } from "../../config/type-config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequirementBlock {
  name: string;
  content: string; // header line included in block content
}

export interface DeltaSpec {
  added: RequirementBlock[];
  modified: RequirementBlock[];
  removed: RequirementBlock[];
}

export interface BaselineSpec {
  preamble: string;
  requirements: RequirementBlock[];
  postamble: string;
}

export type MergeResult =
  | { ok: true; merged: string }
  | { ok: false; errors: string[] };

export type SpecMergeResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

const DELTA_SECTION_RE = /^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/m;
const REQ_HEADER_RE = /^### Requirement:\s*(.+?)\s*$/;

/**
 * Split text into blocks delimited by `### Requirement:` headers.
 * Returns an array of RequirementBlock where content includes the header line.
 */
function splitRequirementBlocks(text: string): RequirementBlock[] {
  const lines = text.split("\n");
  const blocks: RequirementBlock[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const m = REQ_HEADER_RE.exec(line);
    if (m) {
      // Save previous block
      if (currentName !== null) {
        blocks.push({ name: currentName, content: currentLines.join("\n") });
      }
      currentName = m[1]!;
      currentLines = [line];
    } else if (currentName !== null) {
      currentLines.push(line);
    }
  }

  // Save last block
  if (currentName !== null) {
    blocks.push({ name: currentName, content: currentLines.join("\n") });
  }

  return blocks;
}

/**
 * Parse a delta spec into ADDED / MODIFIED / REMOVED sections.
 */
export function parseDeltaSpec(content: string): DeltaSpec {
  const result: DeltaSpec = { added: [], modified: [], removed: [] };

  if (!content.trim()) return result;

  // Find all section positions
  const lines = content.split("\n");
  const sectionStarts: Array<{ type: "ADDED" | "MODIFIED" | "REMOVED"; lineIdx: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const m = DELTA_SECTION_RE.exec(lines[i]!);
    if (m) {
      sectionStarts.push({ type: m[1] as "ADDED" | "MODIFIED" | "REMOVED", lineIdx: i });
    }
  }

  // Extract content for each section
  for (let s = 0; s < sectionStarts.length; s++) {
    const section = sectionStarts[s]!;
    const startLine = section.lineIdx + 1;
    const endLine = s + 1 < sectionStarts.length ? sectionStarts[s + 1]!.lineIdx : lines.length;
    const sectionText = lines.slice(startLine, endLine).join("\n");
    const blocks = splitRequirementBlocks(sectionText);

    if (section.type === "ADDED") result.added = blocks;
    else if (section.type === "MODIFIED") result.modified = blocks;
    else result.removed = blocks;
  }

  return result;
}

/**
 * Parse a baseline spec into preamble / requirements / postamble.
 */
export function parseBaselineSpec(content: string): BaselineSpec {
  if (!content.trim()) return { preamble: "", requirements: [], postamble: "" };

  const lines = content.split("\n");
  let reqSectionStart = -1;
  let postambleStart = -1;

  // Find ## Requirements section
  for (let i = 0; i < lines.length; i++) {
    if (/^## Requirements\s*$/.test(lines[i]!)) {
      reqSectionStart = i;
      break;
    }
  }

  if (reqSectionStart === -1) {
    // No Requirements section — everything is preamble
    return { preamble: content, requirements: [], postamble: "" };
  }

  // Find the next ## (same level or higher) section after Requirements
  for (let i = reqSectionStart + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]!)) {
      postambleStart = i;
      break;
    }
  }

  const preamble = lines.slice(0, reqSectionStart).join("\n");
  const reqEnd = postambleStart === -1 ? lines.length : postambleStart;
  const reqSectionText = lines.slice(reqSectionStart + 1, reqEnd).join("\n");
  const postamble = postambleStart === -1 ? "" : lines.slice(postambleStart).join("\n");

  const requirements = splitRequirementBlocks(reqSectionText);

  return { preamble, requirements, postamble };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a delta spec for duplicate names within sections and cross-section conflicts.
 * Returns an array of error messages (empty = valid).
 */
export function validateDeltaSpec(delta: DeltaSpec): string[] {
  const errors: string[] = [];

  // Check for duplicates within each section
  const checkDuplicates = (blocks: RequirementBlock[], sectionName: string): void => {
    const seen = new Set<string>();
    for (const block of blocks) {
      if (seen.has(block.name)) {
        errors.push(`Duplicate Requirement "${block.name}" in ${sectionName} section`);
      }
      seen.add(block.name);
    }
  };

  checkDuplicates(delta.added, "ADDED");
  checkDuplicates(delta.modified, "MODIFIED");
  checkDuplicates(delta.removed, "REMOVED");

  // Check cross-section conflicts
  const addedNames = new Set(delta.added.map((b) => b.name));
  const modifiedNames = new Set(delta.modified.map((b) => b.name));
  const removedNames = new Set(delta.removed.map((b) => b.name));

  for (const name of addedNames) {
    if (modifiedNames.has(name)) {
      errors.push(`Cross-section conflict: Requirement "${name}" appears in both ADDED and MODIFIED sections`);
    }
    if (removedNames.has(name)) {
      errors.push(`Cross-section conflict: Requirement "${name}" appears in both ADDED and REMOVED sections`);
    }
  }

  for (const name of modifiedNames) {
    if (removedNames.has(name)) {
      errors.push(`Cross-section conflict: Requirement "${name}" appears in both MODIFIED and REMOVED sections`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

/**
 * Apply a delta spec to a baseline spec.
 * Order: REMOVED → MODIFIED → ADDED.
 */
export function applyMerge(baseline: BaselineSpec, delta: DeltaSpec): MergeResult {
  const errors: string[] = [];
  let reqs = [...baseline.requirements];

  // REMOVED
  for (const block of delta.removed) {
    const idx = reqs.findIndex((r) => r.name === block.name);
    if (idx === -1) {
      errors.push(`REMOVED: Requirement "${block.name}" not found in baseline`);
    } else {
      reqs.splice(idx, 1);
    }
  }

  // MODIFIED
  for (const block of delta.modified) {
    const idx = reqs.findIndex((r) => r.name === block.name);
    if (idx === -1) {
      errors.push(`MODIFIED: Requirement "${block.name}" not found in baseline`);
    } else {
      reqs[idx] = block;
    }
  }

  // ADDED
  for (const block of delta.added) {
    const exists = reqs.some((r) => r.name === block.name);
    if (exists) {
      errors.push(`ADDED: Requirement "${block.name}" already exists in baseline`);
    } else {
      reqs.push(block);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const merged = renderBaselineSpec({ ...baseline, requirements: reqs });
  return { ok: true, merged };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render a baseline spec back to text.
 * Format: preamble + "## Requirements\n\n" + requirement blocks + postamble
 * Guarantees trailing newline.
 */
export function renderBaselineSpec(spec: BaselineSpec): string {
  const reqBlocks = spec.requirements.map((r) => {
    // Ensure each block ends with exactly one newline (normalize)
    return r.content.replace(/\n+$/, "") + "\n";
  });

  const reqSection = reqBlocks.join("\n");

  // Build preamble — ensure it ends with newline if non-empty
  let preamble = spec.preamble;
  if (preamble && !preamble.endsWith("\n")) {
    preamble += "\n";
  }

  // Postamble
  let postamble = spec.postamble;
  if (postamble && !postamble.startsWith("\n")) {
    postamble = "\n" + postamble;
  }

  let result = `${preamble}## Requirements\n\n${reqSection}${postamble}`;

  // Guarantee trailing newline
  if (!result.endsWith("\n")) {
    result += "\n";
  }

  return result;
}

/**
 * Create a new baseline spec file for a capability that doesn't exist yet.
 * Uses ADDED blocks as initial requirements.
 */
export function createNewBaselineSpec(added: RequirementBlock[]): string {
  const spec: BaselineSpec = {
    preamble: "## Purpose\n\nTBD\n\n",
    requirements: added,
    postamble: "",
  };
  return renderBaselineSpec(spec);
}

// ---------------------------------------------------------------------------
// Orchestrator-facing function
// ---------------------------------------------------------------------------

// Types that require a delta spec to be present (specs/ must exist and have capability dirs)
const SPEC_REQUIRED_TYPES = new Set(["spec-change", "new-feature"]);
// Types that allow skip when specs/ is absent
const SPEC_OPTIONAL_TYPES = new Set(["bug-fix", "refactoring", "chore"]);

/** Intermediate data for 2-pass write */
interface WriteEntry {
  absPath: string;
  content: string;
  mkdirPath?: string; // abs path to create if this is a new capability
}

/**
 * Merge all delta specs in the change folder's specs/ directory into baseline specs.
 *
 * Uses 2-pass approach:
 * - Pass 1: parse + validate + compute merged content (no writes)
 * - Pass 2: write all files + git add (only if all pass 1 succeeded)
 */
export async function mergeSpecsForChange(params: {
  slug: string;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
}): Promise<SpecMergeResult> {
  const { slug, cwd, spawn, fs } = params;

  // Read and parse request.md to determine type
  const requestMdAbsPath = path.join(cwd, changeFolderPath(slug), "request.md");
  let requestType: string;
  try {
    const requestMdContent = await fs.readFile(requestMdAbsPath);
    const parsedRequest = parseRequestMdContent(requestMdContent, requestMdAbsPath);
    requestType = parsedRequest.type;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "spec-merge (request.md)",
        detectedState: `Failed to read or parse request.md: ${errMsg}`,
        recommendedAction: `Ensure request.md exists and is valid, then re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  // Validate type against TYPE_CONFIG (parseRequestMdContent warns but does not throw for unknown types)
  if (!(requestType in TYPE_CONFIG)) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "spec-merge (request type)",
        detectedState: `Unknown request type '${requestType}'. Known types: ${Object.keys(TYPE_CONFIG).join(", ")}`,
        recommendedAction: `Fix the type field in request.md to a known type, then re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  // Validate that type is in either SPEC_REQUIRED_TYPES or SPEC_OPTIONAL_TYPES (defense-in-depth)
  if (!SPEC_REQUIRED_TYPES.has(requestType) && !SPEC_OPTIONAL_TYPES.has(requestType)) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "spec-merge (request type)",
        detectedState: `Request type '${requestType}' is not mapped to a spec policy. Known types: ${[...SPEC_REQUIRED_TYPES, ...SPEC_OPTIONAL_TYPES].join(", ")}`,
        recommendedAction: `Fix the type field in request.md, then re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  const specsDir = path.join(cwd, changeFolderPath(slug), "specs");
  const specsDirExists = await fs.exists(specsDir);

  if (!specsDirExists) {
    if (SPEC_REQUIRED_TYPES.has(requestType)) {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "spec-merge (specs/ absent)",
          detectedState: `Request type is '${requestType}' which requires a delta spec, but specs/ directory does not exist in the change folder.`,
          recommendedAction: `Add delta specs under specs/<capability>/spec.md in the change folder, then re-run: specrunner finish ${slug}`,
          resumeCommand: `specrunner finish ${slug}`,
        }),
        exitCode: 1,
      };
    }
    // SPEC_OPTIONAL_TYPES: normal skip
    return { ok: true, skipped: true, message: "" };
  }

  // Enumerate capability directories in specs/
  const entries = await fs.readdir(specsDir);
  const capabilities: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(specsDir, entry);
    const stat = await fs.stat(entryPath);
    if (stat.isDirectory()) {
      capabilities.push(entry);
    }
  }

  if (capabilities.length === 0) {
    if (SPEC_REQUIRED_TYPES.has(requestType)) {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "spec-merge (specs/ empty)",
          detectedState: `Request type is '${requestType}' which requires a delta spec, but specs/ directory has no capability subdirectories.`,
          recommendedAction: `Add delta specs under specs/<capability>/spec.md in the change folder, then re-run: specrunner finish ${slug}`,
          resumeCommand: `specrunner finish ${slug}`,
        }),
        exitCode: 1,
      };
    }
    // SPEC_OPTIONAL_TYPES: normal skip
    return { ok: true, skipped: true, message: "" };
  }

  // Pass 1: Parse, validate, and compute merged content for all capabilities
  const writeEntries: WriteEntry[] = [];
  const allErrors: string[] = [];

  for (const capability of capabilities) {
    const deltaSpecPath = path.join(specsDir, capability, "spec.md");
    let deltaContent: string;
    try {
      deltaContent = await fs.readFile(deltaSpecPath);
    } catch {
      allErrors.push(`Failed to read delta spec for capability "${capability}": ${deltaSpecPath}`);
      continue;
    }

    const delta = parseDeltaSpec(deltaContent);

    // Semantic check: empty delta (no entries) is always an error
    if (delta.added.length + delta.modified.length + delta.removed.length === 0) {
      allErrors.push(`[${capability}] Delta spec is empty (no ADDED/MODIFIED/REMOVED requirements)`);
      continue;
    }

    const validationErrors = validateDeltaSpec(delta);
    if (validationErrors.length > 0) {
      allErrors.push(...validationErrors.map((e) => `[${capability}] ${e}`));
      continue;
    }

    const baselinePath = path.join(cwd, baselineSpecPath(capability));
    const baselineExists = await fs.exists(baselinePath);

    if (!baselineExists) {
      // New capability: only ADDED is allowed
      if (delta.modified.length > 0 || delta.removed.length > 0) {
        const ops = [
          ...(delta.modified.length > 0 ? ["MODIFIED"] : []),
          ...(delta.removed.length > 0 ? ["REMOVED"] : []),
        ].join(", ");
        allErrors.push(
          `[${capability}] Capability has no baseline spec but delta contains ${ops} operations. ` +
            `Cannot apply ${ops} to non-existent baseline.`,
        );
        continue;
      }

      // ADDED-only for new capability → create new baseline
      const newContent = createNewBaselineSpec(delta.added);
      const capabilityDir = path.join(cwd, specsDirRel(), capability);
      writeEntries.push({ absPath: baselinePath, content: newContent, mkdirPath: capabilityDir });
    } else {
      // Existing capability → apply merge
      let baselineContent: string;
      try {
        baselineContent = await fs.readFile(baselinePath);
      } catch {
        allErrors.push(`Failed to read baseline spec for capability "${capability}": ${baselinePath}`);
        continue;
      }

      const baseline = parseBaselineSpec(baselineContent);
      const mergeResult = applyMerge(baseline, delta);

      if (!mergeResult.ok) {
        allErrors.push(...mergeResult.errors.map((e) => `[${capability}] ${e}`));
        continue;
      }

      writeEntries.push({ absPath: baselinePath, content: mergeResult.merged });
    }
  }

  if (allErrors.length > 0) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "spec-merge",
        detectedState: allErrors.join("; "),
        recommendedAction: `Fix the delta spec errors listed above and re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  // Pass 2: Write all files
  for (const entry of writeEntries) {
    if (entry.mkdirPath) {
      await fs.mkdir(entry.mkdirPath, { recursive: true });
    }
    await fs.writeFile(entry.absPath, entry.content);
  }

  // Stage the specs tree
  const gitAddResult = await spawn("git", ["add", `${specsDirRel()}/`], { cwd });
  if (gitAddResult.exitCode !== 0) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "spec-merge (git add)",
        detectedState: `git add ${specsDirRel()}/ failed (exit ${gitAddResult.exitCode}): ${gitAddResult.stderr.trim()}`,
        recommendedAction: `Check git error and re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  const capList = capabilities.join(", ");
  return {
    ok: true,
    skipped: false,
    message: `Merged delta specs into baseline: ${capList}`,
  };
}
