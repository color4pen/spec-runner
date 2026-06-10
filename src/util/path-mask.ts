/**
 * Absolute path normalization utility.
 *
 * Removes machine-specific absolute paths from text before writing to committed artifacts.
 * - Paths under cwd are relativized (e.g. `<cwd>/src/a.ts` → `src/a.ts`)
 * - Paths under homeDir (but not cwd) are replaced with `~` prefix
 *
 * Uses literal string replacement (split/join) to avoid regex metacharacter issues.
 */
import * as os from "node:os";

export interface MaskAbsolutePathsOptions {
  /** Working directory (worktree root). Paths under this prefix are made repo-relative. */
  cwd: string;
  /**
   * Home directory. Paths under this prefix (that are not under cwd) are replaced with `~`.
   * Defaults to `os.homedir()` when omitted.
   */
  homeDir?: string;
}

/**
 * Normalize absolute paths in `text`:
 * 1. `<cwd>/` → `` (remove prefix, leaving repo-relative path)
 * 2. `<cwd>` (standalone) → `.`
 * 3. `<homeDir>/` → `~/`
 * 4. `<homeDir>` (standalone) → `~`
 *
 * Replacements are applied in this order so that cwd (which is typically inside homeDir)
 * is handled first, preventing `~/…/worktree/src/a.ts` style partial substitution.
 *
 * @param text     - Input text to normalize.
 * @param opts     - Options providing `cwd` and optional `homeDir`.
 * @returns The text with absolute paths normalized.
 */
export function maskAbsolutePaths(text: string, opts: MaskAbsolutePathsOptions): string {
  const homeDir = opts.homeDir ?? os.homedir();
  let result = text;

  // 1. cwd + "/" → remove (repo-relative)
  if (opts.cwd) {
    result = result.split(opts.cwd + "/").join("");
  }

  // 2. cwd standalone → "."
  if (opts.cwd) {
    result = result.split(opts.cwd).join(".");
  }

  // 3. homeDir + "/" → "~/"
  if (homeDir) {
    result = result.split(homeDir + "/").join("~/");
  }

  // 4. homeDir standalone → "~"
  if (homeDir) {
    result = result.split(homeDir).join("~");
  }

  return result;
}
