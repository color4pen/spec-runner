/**
 * Builds a prompt section listing files touched by prior steps.
 *
 * Design decisions (touched-files-propagation):
 * D5: pure function (no I/O), shared by claude-code and codex adapters.
 *     Fail-open: returns "" when records are empty, section exceeds 16KB, or
 *     no prior step records exist.
 * D4/item-3: change-folder exclusion predicate is defined here (single source of truth)
 *     and used by both the recording layer (touched-files-recorder.ts) and this injection layer.
 */
import type { JobState } from "../../state/schema.js";
import { changesDirRel } from "../../util/paths.js";

/** Maximum UTF-8 byte size for the injected section. Fail-open above this. */
const MAX_SECTION_BYTES = 16 * 1024;

/**
 * Returns true when a posix-relative path is under the change folder (specrunner/changes/).
 * Trailing slash required to avoid false matches on "specrunner/changes-archive/".
 *
 * Exported so the recording layer (touched-files-recorder.ts) can share this predicate
 * instead of maintaining a parallel implementation.
 */
export function isChangeFolderPath(posixRelative: string): boolean {
  return posixRelative.startsWith(changesDirRel() + "/");
}

/**
 * Build a prompt section listing files touched by prior steps.
 * Excludes the currentStepName's own records (inject only predecessor steps).
 * Filters change-folder paths from each step's file list (defense in depth).
 *
 * Returns "" when:
 * - state.touchedFiles is absent or empty.
 * - no prior step records exist (all empty, or only currentStepName has records).
 * - the constructed section exceeds 16KB UTF-8 (fail-open, no partial injection).
 */
export function buildTouchedFilesSection(
  state: JobState,
  currentStepName: string,
): string {
  const touchedFiles = state.touchedFiles;
  if (!touchedFiles) return "";

  // Collect prior step entries: exclude currentStepName and filter change-folder paths
  const entries: Array<[string, string[]]> = [];
  for (const [stepName, files] of Object.entries(touchedFiles)) {
    if (stepName === currentStepName) continue;
    const filtered = files.filter((f) => !isChangeFolderPath(f));
    if (filtered.length > 0) entries.push([stepName, filtered]);
  }

  if (entries.length === 0) return "";

  // Build section with required hint wording
  const lines: string[] = [
    "<touched-files>",
    "以下は先行 step が実際に touch したファイルの一覧です。出発点のヒントであり網羅ではない。レビュー・探索の範囲をこの一覧に制限してはならない。",
    "",
  ];

  for (const [stepName, files] of entries) {
    lines.push(`## ${stepName}`);
    for (const file of files) {
      lines.push(`- ${file}`);
    }
  }

  lines.push("</touched-files>");

  const section = lines.join("\n");

  // Size guard: fail-open when section exceeds 16KB (no partial injection)
  if (Buffer.byteLength(section, "utf-8") > MAX_SECTION_BYTES) return "";

  return section;
}
