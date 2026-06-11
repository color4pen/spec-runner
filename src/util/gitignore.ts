import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Ensure `.specrunner/*` and `!.specrunner/config.json` are present as lines
 * in <repoRoot>/.gitignore. The 2-line format lets git track `.specrunner/config.json`
 * (team-shared project config) while ignoring all other `.specrunner/` contents
 * (machine-generated state: jobs, logs, etc.).
 *
 * Behaviour:
 * - Both lines already present → no-op (idempotent)
 * - Old format (`.specrunner/`) found → migrated to `.specrunner/*` in-place; exception line added
 * - `.specrunner/*` missing → inserted (before `!.specrunner/config.json` if it exists, else appended)
 * - `!.specrunner/config.json` missing → inserted immediately after `.specrunner/*`
 * - Duplicate `.specrunner/*` lines → deduplicated (first kept)
 * - Comment lines are preserved unchanged
 * - Creates `.gitignore` if it does not exist
 */
export async function ensureDotSpecrunnerGitignore(repoRoot: string): Promise<void> {
  const gitignorePath = path.join(repoRoot, ".gitignore");

  let content: string;
  try {
    content = await fs.readFile(gitignorePath, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      content = "";
    } else {
      throw err;
    }
  }

  const GLOB_LINE = ".specrunner/*";
  const EXCEPTION_LINE = "!.specrunner/config.json";
  const OLD_LINE = ".specrunner/";
  const NODE_MODULES_LINE = "node_modules/";

  const isNonComment = (line: string): boolean => !line.trim().startsWith("#");

  let lines = content.split("\n");

  // Step 1: Replace old format (.specrunner/) with new glob format (.specrunner/*)
  lines = lines.map((line) => {
    if (isNonComment(line) && line.trim() === OLD_LINE) {
      return GLOB_LINE;
    }
    return line;
  });

  // Step 2: Deduplicate .specrunner/* and !.specrunner/config.json lines (keep first occurrence)
  let globSeen = false;
  let exceptionSeen = false;
  lines = lines.filter((line) => {
    if (isNonComment(line) && line.trim() === GLOB_LINE) {
      if (globSeen) return false;
      globSeen = true;
    }
    if (line.trim() === EXCEPTION_LINE) {
      if (exceptionSeen) return false;
      exceptionSeen = true;
    }
    return true;
  });

  // Step 3: Ensure both required lines are present
  const globIdx = lines.findIndex((line) => isNonComment(line) && line.trim() === GLOB_LINE);
  const exceptionIdx = lines.findIndex((line) => line.trim() === EXCEPTION_LINE);

  if (globIdx === -1 && exceptionIdx === -1) {
    // Neither present: append both before the trailing empty string (i.e. trailing newline)
    const insertAt = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    lines.splice(insertAt, 0, GLOB_LINE, EXCEPTION_LINE);
    // Ensure the file ends with a newline
    if (lines[lines.length - 1] !== "") lines.push("");
  } else if (globIdx === -1) {
    // Only exception line exists: insert glob immediately before it
    lines.splice(exceptionIdx, 0, GLOB_LINE);
  } else if (exceptionIdx === -1) {
    // Only glob line exists: insert exception immediately after it
    lines.splice(globIdx + 1, 0, EXCEPTION_LINE);
  }
  // Both present: no structural change needed (content may still differ due to step 1/2)

  // Step 4: Ensure node_modules/ is present as a non-comment line
  const nodeModulesIdx = lines.findIndex((line) => isNonComment(line) && line.trim() === NODE_MODULES_LINE);
  if (nodeModulesIdx === -1) {
    const insertAt = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    lines.splice(insertAt, 0, NODE_MODULES_LINE);
    // Ensure the file ends with a newline
    if (lines[lines.length - 1] !== "") lines.push("");
  }

  const newContent = lines.join("\n");
  if (newContent === content) return;

  await fs.writeFile(gitignorePath, newContent, "utf-8");
}
