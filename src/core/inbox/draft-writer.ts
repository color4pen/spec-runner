/**
 * Thin wrapper around request/store write for inbox draft creation.
 * Exists as a separate module to allow targeted mocking in tests.
 */
import { write } from "../request/store.js";

/**
 * Write a draft request.md to the repo's specrunner/drafts/<slug>/request.md path.
 */
export async function writeDraft(repoRoot: string, slug: string, content: string): Promise<void> {
  await write(repoRoot, slug, content);
}
