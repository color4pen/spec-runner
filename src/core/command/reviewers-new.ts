/**
 * Core logic for the `specrunner reviewers new` command.
 *
 * Creates a new reviewer file at specrunner/reviewers/<name>.md.
 */
import { reviewersDirRel } from "../../util/paths.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { logResult, logError, stderrWrite } from "../../logger/stdout.js";

/**
 * Name charset constraint: must match /^[a-z0-9][a-z0-9\-_]*$/
 * Mirrors validateReviewerDefinitions to ensure scaffolded files pass validation.
 */
const NAME_PATTERN = /^[a-z0-9][a-z0-9\-_]*$/;

/**
 * Generate the embedded reviewer template for the given name.
 * D2: held as a source code string const — no runtime file read.
 */
function buildTemplate(name: string): string {
  return `---
name: ${name}
maxIterations: 3
# model: claude-sonnet-4-6   # optional — override per-reviewer model
# Activation conditions (optional — omit to activate on every job):
# paths:
#   - src/auth/**
#   - src/security/**
# requestTypes:
#   - new-feature
#   - spec-change
---

## 目的

このレビューワーの目的をここに記述してください。

## 観点

レビューの観点をここに記述してください。

## 判定基準

approved / needs-fix の判定基準をここに記述してください。
`;
}

/**
 * Execute `reviewers new` subcommand.
 * Creates specrunner/reviewers/<name>.md from a scaffold template.
 * Returns 0 on success, 1 on filename collision, 2 on invalid input.
 */
export async function executeReviewersNew(name: string, cwd: string): Promise<number> {
  // 1. Name charset validation
  if (!NAME_PATTERN.test(name)) {
    logError(`Invalid reviewer name '${name}'. Must match /^[a-z0-9][a-z0-9\\-_]*$/`);
    stderrWrite(
      `Hint: Use lowercase alphanumeric characters, hyphens, or underscores. Must start with a letter or digit.`,
    );
    return 2;
  }

  // 2. Output path
  const dirRel = reviewersDirRel();
  const dirAbs = path.join(cwd, dirRel);
  const fileName = `${name}.md`;
  const fileAbs = path.join(dirAbs, fileName);
  const fileRel = `${dirRel}/${fileName}`;

  // 3. Collision check
  try {
    await fs.access(fileAbs);
    // File exists
    logError(`A reviewer file '${fileRel}' already exists.`);
    stderrWrite(`Hint: Choose a different name or edit the existing file.`);
    return 1;
  } catch {
    // ENOENT — file does not exist, proceed
  }

  // 4. Create directory
  await fs.mkdir(dirAbs, { recursive: true });

  // 5. Write template
  await fs.writeFile(fileAbs, buildTemplate(name), "utf-8");

  // 6. Output created path
  logResult(fileRel);
  return 0;
}
