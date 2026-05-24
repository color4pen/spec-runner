import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Ensure `.specrunner/` is present as a line in <repoRoot>/.gitignore.
 * Idempotent: does nothing if the entry already exists.
 * Creates .gitignore if it does not exist.
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

  // Check if .specrunner/ is already present as a non-commented line
  const lines = content.split("\n");
  const alreadyPresent = lines.some((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("#") && trimmed === ".specrunner/";
  });

  if (alreadyPresent) return;

  // Append: ensure we start on a new line
  let toAppend = ".specrunner/\n";
  if (content.length > 0 && !content.endsWith("\n")) {
    toAppend = "\n" + toAppend;
  }

  await fs.writeFile(gitignorePath, content + toAppend, "utf-8");
}
