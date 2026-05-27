/**
 * Log retention for specrunner pipeline logs.
 *
 * Implements count-based retention (npm --logs-max style):
 * - Scans *.log files in the logs directory
 * - Sorts by mtime (descending — newest first)
 * - Deletes log files and associated directories beyond maxJobs
 *
 * Both <jobId>.log and <jobId>/ directory are deleted for each pruned job.
 * ENOENT errors during deletion are silently ignored.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Prune old job logs from the logs directory, keeping at most maxJobs jobs.
 *
 * @param logsDir - Absolute path to the logs directory (e.g. <repoRoot>/.specrunner/logs)
 * @param maxJobs - Maximum number of job log files to retain (1-1000)
 */
export async function pruneOldLogs(logsDir: string, maxJobs: number): Promise<void> {
  // Read directory entries — if directory doesn't exist yet, nothing to prune
  let entries: string[];
  try {
    entries = await fs.readdir(logsDir);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") return; // logs dir doesn't exist yet
    throw err;
  }

  // Filter to *.log files only (pipeline log files)
  const logFiles = entries.filter((e) => e.endsWith(".log"));

  if (logFiles.length <= maxJobs) return; // Nothing to prune

  // Stat each log file to get mtime
  const statsResults = await Promise.all(
    logFiles.map(async (file) => {
      const filePath = path.join(logsDir, file);
      try {
        const stat = await fs.stat(filePath);
        return { file, mtime: stat.mtimeMs };
      } catch {
        return null; // File disappeared between readdir and stat — skip
      }
    }),
  );

  // Filter out nulls and sort by mtime descending (newest first)
  const validStats = statsResults
    .filter((r): r is { file: string; mtime: number } => r !== null)
    .sort((a, b) => b.mtime - a.mtime);

  // Everything beyond maxJobs is excess
  const excess = validStats.slice(maxJobs);

  // Delete excess log files and associated directories
  await Promise.all(
    excess.map(async ({ file }) => {
      const jobId = file.slice(0, -4); // strip ".log"
      const logFilePath = path.join(logsDir, file);
      const logDirPath = path.join(logsDir, jobId);

      // Delete the log file
      try {
        await fs.rm(logFilePath, { recursive: false });
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code !== "ENOENT") throw err;
      }

      // Delete the associated directory (agent session logs)
      try {
        await fs.rm(logDirPath, { recursive: true });
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code !== "ENOENT") throw err;
      }
    }),
  );
}
