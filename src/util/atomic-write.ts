import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Atomically write JSON data to a file.
 * Writes to a temp file first, then renames to the target path.
 * This ensures partial writes never corrupt the target file.
 *
 * @param filePath - The final target path
 * @param data - The data to serialize as JSON
 * @param options.mode - File permissions (e.g., 0o600)
 */
export async function atomicWriteJson(
  filePath: string,
  data: unknown,
  options?: { mode?: number },
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const suffix = randomBytes(6).toString("hex");
  const tmpPath = `${filePath}.tmp.${suffix}`;

  try {
    const json = JSON.stringify(data, null, 2) + "\n";
    const mode = options?.mode ?? 0o600;
    await fs.writeFile(tmpPath, json, { flag: "wx", mode });
    // Note: fsync would require opening with fs.open but writeFile handles flushing.
    // For POSIX rename atomicity, this is sufficient.
    await fs.rename(tmpPath, filePath);
    // Ensure mode is set on the final file (rename preserves original mode on some systems)
    await fs.chmod(filePath, mode);
  } catch (err) {
    // Best-effort cleanup of temp file
    await fs.unlink(tmpPath).catch(() => undefined);
    throw err;
  }
}
