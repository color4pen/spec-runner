/**
 * Candidate workspace materialization for the artifact-output profile.
 * T-06: materialize.ts — copies source to candidate using the baseline snapshot.
 *
 * - Source directory is NEVER written to.
 * - Only entries present in the baseline snapshot are copied (exclusions are respected).
 * - Symlinks are re-created as symlinks (not followed).
 * - File executable bits are preserved.
 * - Empty directories are created.
 * - Candidate root-escaping symlinks are prevented by the collect.ts symlink-escape check
 *   on the baseline snapshot (T-03); any escape in the baseline would have returned
 *   "unavailable" before materialize is called.
 */
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import type { DirectorySnapshot } from "../snapshot/types.js";

/**
 * Materialize the candidate workspace from the source using the baseline snapshot.
 *
 * @param sourceRoot   - The original source directory (read-only).
 * @param candidateRoot - The candidate workspace to populate.
 * @param snapshot     - The baseline snapshot (determines which entries to copy).
 */
export async function materializeCandidate(
  sourceRoot: string,
  candidateRoot: string,
  snapshot: DirectorySnapshot,
): Promise<void> {
  for (const entry of snapshot.entries) {
    const srcPath = nodePath.join(sourceRoot, entry.path);
    const dstPath = nodePath.join(candidateRoot, entry.path);

    if (entry.kind === "dir") {
      await fs.mkdir(dstPath, { recursive: true });
    } else if (entry.kind === "symlink") {
      // Ensure parent directory exists
      await fs.mkdir(nodePath.dirname(dstPath), { recursive: true });
      // Re-create the symlink (not following it)
      const target = entry.symlinkTarget!;
      await fs.symlink(target, dstPath);
    } else {
      // Regular file: copy preserving executable bit
      await fs.mkdir(nodePath.dirname(dstPath), { recursive: true });
      // Read from source and write to candidate
      const bytes = await fs.readFile(srcPath);
      // Determine mode from snapshot entry
      const mode = entry.mode === "100755" ? 0o755 : 0o644;
      await fs.writeFile(dstPath, bytes, { mode });
    }
  }
}
