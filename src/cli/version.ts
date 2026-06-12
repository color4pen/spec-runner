import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walks up from startDir to find the nearest package.json and returns its version.
 *
 * @throws if no package.json is found in any ancestor directory
 * @throws if the nearest package.json does not have a string "version" field
 */
export function resolveVersionFromDir(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, "package.json");
    let raw: string;
    try {
      raw = readFileSync(candidate, "utf-8");
    } catch {
      // Not found at this level — walk up
      const parent = dirname(dir);
      if (parent === dir) {
        throw new Error(
          `No package.json found in any ancestor directory of: ${startDir}`,
        );
      }
      dir = parent;
      continue;
    }

    let pkg: unknown;
    try {
      pkg = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to parse package.json at: ${candidate}`);
    }

    if (
      pkg === null ||
      typeof pkg !== "object" ||
      !("version" in pkg) ||
      typeof (pkg as { version: unknown }).version !== "string"
    ) {
      throw new Error(
        `package.json at ${candidate} does not have a valid string "version" field`,
      );
    }

    return (pkg as { version: string }).version;
  }
}

/**
 * Returns the version of the package containing this module by locating
 * the nearest package.json relative to this file's directory.
 */
export function getVersion(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolveVersionFromDir(thisDir);
}
