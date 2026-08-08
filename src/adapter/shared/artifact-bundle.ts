/**
 * Builds a bundled-change-artifacts block from the change folder's input artifacts.
 *
 * Design decisions (request.md):
 * - Only INPUT_ARTIFACT_NAMES are read; no directory scan is performed.
 * - If the combined size exceeds MAX_ARTIFACT_BUNDLE_BYTES, returns "" (fail-open, no partial bundle).
 * - Per-file read failures (ENOENT, EACCES, etc.) are silently skipped.
 * - Empty result (0 artifacts collected) returns "".
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { changeFolderPath } from "../../util/paths.js";

/** Input artifact filenames eligible for bundling, in traversal order. */
export const INPUT_ARTIFACT_NAMES: readonly string[] = [
  "request.md",
  "design.md",
  "tasks.md",
  "spec.md",
  "test-cases.md",
  "rules.md",
];

/** Maximum combined UTF-8 byte size for all bundled artifacts. Fail-open above this. */
export const MAX_ARTIFACT_BUNDLE_BYTES = 64 * 1024;

/**
 * Reads the input artifacts from the change folder and returns a bundled XML block,
 * or "" when there is nothing to bundle (no artifacts, or combined size over limit).
 */
export async function buildArtifactBundle(cwd: string, slug: string): Promise<string> {
  const folderRel = changeFolderPath(slug);

  // Read all artifacts in parallel so libuv can batch the I/O in one poll
  // phase — keeps the total await count to 1 regardless of how many files exist.
  const results = await Promise.all(
    INPUT_ARTIFACT_NAMES.map(async (name) => {
      const filePath = path.join(cwd, folderRel, name);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        return { name, content };
      } catch {
        return null; // ENOENT or any other error: skip this file
      }
    }),
  );
  const collected = results.filter((r): r is { name: string; content: string } => r !== null);

  if (collected.length === 0) return "";

  // Size guard: total UTF-8 bytes across all collected files
  const totalBytes = collected.reduce(
    (sum, { content }) => sum + Buffer.byteLength(content, "utf-8"),
    0,
  );
  if (totalBytes > MAX_ARTIFACT_BUNDLE_BYTES) return "";

  // Build the bundle block
  const artifactBlocks = collected
    .map(({ name, content }) => `<artifact path="${folderRel}/${name}">\n${content}\n</artifact>`)
    .join("\n");

  return [
    "<bundled-change-artifacts>",
    "The following artifacts are already included in this prompt. You do not need to Read them again (though you may). Your exploration of other files and the repository is unrestricted.",
    artifactBlocks,
    "</bundled-change-artifacts>",
  ].join("\n");
}
