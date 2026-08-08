/**
 * Touched files recorder for the claude-code adapter.
 *
 * Extracts Read/Edit/Write tool file paths from completed assistant messages
 * (SDK `type: "assistant"` messages with `message.content` tool_use blocks).
 * Ignores `type: "stream_event"` content_block_start messages where `input` may
 * be partial (empty `{}`).
 *
 * Design decisions (touched-files-propagation):
 * D1: uses `type: "assistant"` messages only (complete tool_use input).
 * D4: normalizes to worktree-relative, excludes out-of-cwd and change-folder paths,
 *     deduplicates in insertion order, caps at 100.
 */
import * as path from "node:path";
import { isChangeFolderPath } from "../shared/touched-files-bundle.js";

const FILE_TOOLS = new Set(["Read", "Edit", "Write"]);
const MAX_TOUCHED_FILES = 100;

/**
 * Normalize a file path to worktree-relative, returning null if excluded.
 *
 * Exclusion rules (D4):
 * 1. Paths that resolve outside the worktree (relative path starts with ".." or is absolute).
 * 2. Paths under the change folder (specrunner/changes/) — already bundled as artifacts.
 *    Trailing slash required: "specrunner/changes/" to avoid "specrunner/changes-archive/".
 */
export function normalizeTouchedFilePath(filePath: string, cwd: string): string | null {
  const resolved = path.resolve(cwd, filePath);
  const relative = path.relative(cwd, resolved);

  // Exclude paths outside worktree (starts with ".." or still absolute after resolution)
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

  // Normalize separators to forward slashes (POSIX-style)
  const posixRelative = relative.split(path.sep).join("/");

  // Exclude change folder paths — predicate shared with injection layer (touched-files-bundle.ts)
  if (isChangeFolderPath(posixRelative)) return null;

  return posixRelative;
}

/**
 * Extract touched file paths from a list of SDK messages.
 *
 * Only processes messages with `type === "assistant"` (completed tool_use blocks).
 * Ignores `type === "stream_event"` content_block_start (partial input).
 * Only records Read / Edit / Write tool calls (not Grep / Glob / Bash).
 *
 * Returns a deduplicated list of worktree-relative paths, capped at 100.
 */
export function extractTouchedFilesFromMessages(
  messages: unknown[],
  cwd: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const msg = message as Record<string, unknown>;

    // Only process `type: "assistant"` messages (complete tool_use blocks)
    if (msg["type"] !== "assistant") continue;
    const inner = msg["message"] as Record<string, unknown> | undefined;
    if (!inner) continue;
    const content = inner["content"];
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;

      if (b["type"] !== "tool_use") continue;
      if (typeof b["name"] !== "string") continue;
      if (!FILE_TOOLS.has(b["name"])) continue;

      const input = b["input"] as Record<string, unknown> | undefined;
      if (!input) continue;
      const filePath = input["file_path"];
      if (typeof filePath !== "string") continue;

      const normalized = normalizeTouchedFilePath(filePath, cwd);
      if (normalized === null) continue;

      if (seen.has(normalized)) continue;
      seen.add(normalized);
      if (result.length >= MAX_TOUCHED_FILES) continue;

      result.push(normalized);
    }
  }

  return result;
}
