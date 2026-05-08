/**
 * draft-store: lightweight persistence for interactive create dialog drafts.
 *
 * Separate from JobState — draft lifecycle is scoped to the create dialog,
 * not a full pipeline run. Uses a 2-file layout:
 *   specrunner/requests/draft/<slug>/request.md     — latest draft content
 *   specrunner/requests/draft/<slug>/draft-state.json — metadata (DraftState)
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface DraftState {
  sessionId: string;
  slug: string;
  type: string;
  description: string;
  createdAt: string;  // ISO8601
  updatedAt: string;  // ISO8601
}

/**
 * Compute the draft directory for a given cwd + slug.
 */
function getDraftDir(cwd: string, slug: string): string {
  return path.join(cwd, "specrunner", "requests", "draft", slug);
}

/**
 * Persist a draft to disk.
 * Creates the directory if it does not exist.
 *
 * @param cwd     - Repository root (same cwd used throughout the CLI)
 * @param slug    - Request slug
 * @param content - Latest request.md content
 * @param state   - DraftState metadata
 */
export async function saveDraft(
  cwd: string,
  slug: string,
  content: string,
  state: DraftState,
): Promise<void> {
  const draftDir = getDraftDir(cwd, slug);
  await fs.mkdir(draftDir, { recursive: true });
  await fs.writeFile(path.join(draftDir, "request.md"), content, "utf-8");
  await fs.writeFile(
    path.join(draftDir, "draft-state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

/**
 * Load a draft from disk.
 * Returns null if the draft does not exist or cannot be parsed.
 *
 * @param cwd  - Repository root
 * @param slug - Request slug
 */
export async function loadDraft(
  cwd: string,
  slug: string,
): Promise<{ content: string; state: DraftState } | null> {
  const draftDir = getDraftDir(cwd, slug);
  try {
    const [content, stateJson] = await Promise.all([
      fs.readFile(path.join(draftDir, "request.md"), "utf-8"),
      fs.readFile(path.join(draftDir, "draft-state.json"), "utf-8"),
    ]);
    const state: DraftState = JSON.parse(stateJson) as DraftState;
    return { content, state };
  } catch {
    return null;
  }
}

/**
 * Delete a draft directory.
 * Idempotent — does not throw if the directory does not exist.
 *
 * @param cwd  - Repository root
 * @param slug - Request slug
 */
export async function deleteDraft(cwd: string, slug: string): Promise<void> {
  const draftDir = getDraftDir(cwd, slug);
  try {
    await fs.rm(draftDir, { recursive: true, force: true });
  } catch {
    // Idempotent: ignore errors (e.g., already deleted)
  }
}
