/**
 * rules-resolve.ts — project rules ファイルの列挙と内容読み込み。
 *
 * Design D6: free function + injectable fsAdapter (testability / boundary 保護)。
 * core → node:fs の直接依存を防ぐため、fs 操作は呼び出し元 (executor.ts) が inject する。
 */
import * as path from "node:path";
import { stepRulesDirRel } from "../../util/paths.js";

/**
 * Injectable fs interface for rules resolution.
 * Allows unit tests to mock file system operations without touching disk.
 */
export interface RulesResolveFs {
  /** List files in a directory. Returns string[] (entry names, no paths). */
  readdir(dir: string): Promise<string[]>;
  /** Read file contents as string. */
  readFile(filePath: string, encoding: string): Promise<string>;
}

/**
 * Resolve step-specific project rules from `specrunner/rules/<stepName>/`.
 *
 * Returns rule file contents in numeric-prefix ascending order.
 * Files without numeric prefix are placed at the end.
 * Only .md files are included; other extensions are silently ignored.
 * Returns empty array when the directory does not exist (ENOENT).
 */
export async function resolveStepRules(
  stepName: string,
  cwd: string,
  fs: RulesResolveFs,
): Promise<string[]> {
  const dir = path.join(cwd, stepRulesDirRel(stepName));

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  // Filter to .md files only (directory entries with .md extension)
  const mdFiles = entries.filter((entry) => entry.endsWith(".md"));

  // Sort by numeric prefix (parseInt) ascending; NaN (no numeric prefix) → tail
  mdFiles.sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    const aIsNaN = isNaN(na);
    const bIsNaN = isNaN(nb);
    if (aIsNaN && bIsNaN) return a.localeCompare(b);
    if (aIsNaN) return 1;
    if (bIsNaN) return -1;
    return na - nb;
  });

  // Read each file in sorted order
  const contents: string[] = [];
  for (const file of mdFiles) {
    const filePath = path.join(dir, file);
    const content = await fs.readFile(filePath, "utf-8");
    contents.push(content);
  }

  return contents;
}
