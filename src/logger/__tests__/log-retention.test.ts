/**
 * Unit tests for log retention (pruneOldLogs).
 *
 * T-029: maxJobs exceeded → oldest logs are deleted
 * T-030: associated jobId directory is also deleted
 * T-031: maxJobs not exceeded → nothing is deleted
 * T-032: missing jobId directory is handled gracefully (ENOENT ignored)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as nodeFsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { pruneOldLogs } from "../log-retention.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "log-retention-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * Create a dummy log file with a specific mtime offset.
 * @param logsDir - directory to create the file in
 * @param jobId - job ID (file will be <jobId>.log)
 * @param ageMs - how many ms in the past to set the mtime (older = larger value)
 */
async function createLogFile(logsDir: string, jobId: string, ageMs: number = 0): Promise<void> {
  const filePath = path.join(logsDir, `${jobId}.log`);
  await fs.writeFile(filePath, `{"ts":"2026-01-01","type":"test","jobId":"${jobId}"}\n`);
  const now = Date.now();
  const mtime = new Date(now - ageMs);
  await fs.utimes(filePath, mtime, mtime);
}

async function createLogDir(logsDir: string, jobId: string): Promise<void> {
  const dirPath = path.join(logsDir, jobId);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, "design-1.jsonl"), "{}");
}

// T-029: maxJobs exceeded → oldest logs deleted
describe("T-029: maxJobs exceeded → oldest logs are deleted", () => {
  it("deletes the oldest logs when count exceeds maxJobs", async () => {
    const logsDir = path.join(tempDir, "logs");
    await fs.mkdir(logsDir);

    // Create 5 log files with different ages (newer = smaller ageMs)
    await createLogFile(logsDir, "job-newest", 1000);      // newest
    await createLogFile(logsDir, "job-second", 2000);
    await createLogFile(logsDir, "job-third", 3000);
    await createLogFile(logsDir, "job-fourth", 4000);
    await createLogFile(logsDir, "job-oldest", 5000);      // oldest

    await pruneOldLogs(logsDir, 3);

    // Newest 3 should remain
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-newest.log"))).toBe(true);
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-second.log"))).toBe(true);
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-third.log"))).toBe(true);
    // Oldest 2 should be deleted
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-fourth.log"))).toBe(false);
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-oldest.log"))).toBe(false);
  });
});

// T-030: associated jobId directory is also deleted
describe("T-030: associated jobId directory is also deleted", () => {
  it("deletes <jobId>/ directory along with <jobId>.log", async () => {
    const logsDir = path.join(tempDir, "logs");
    await fs.mkdir(logsDir);

    await createLogFile(logsDir, "job-keep-1", 1000);
    await createLogFile(logsDir, "job-keep-2", 2000);
    await createLogFile(logsDir, "job-keep-3", 3000);
    await createLogFile(logsDir, "job-delete", 5000);
    await createLogDir(logsDir, "job-delete"); // associated directory

    await pruneOldLogs(logsDir, 3);

    // Log file should be deleted
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-delete.log"))).toBe(false);
    // Associated directory should also be deleted
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-delete"))).toBe(false);
    // Kept logs should still have their files
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-keep-1.log"))).toBe(true);
  });
});

// T-031: maxJobs not exceeded → nothing deleted
describe("T-031: maxJobs not exceeded → nothing deleted", () => {
  it("does not delete any files when count is within maxJobs", async () => {
    const logsDir = path.join(tempDir, "logs");
    await fs.mkdir(logsDir);

    await createLogFile(logsDir, "job-a", 1000);
    await createLogFile(logsDir, "job-b", 2000);
    await createLogFile(logsDir, "job-c", 3000);

    await pruneOldLogs(logsDir, 5); // maxJobs=5, only 3 files → no deletion

    expect(nodeFsSync.existsSync(path.join(logsDir, "job-a.log"))).toBe(true);
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-b.log"))).toBe(true);
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-c.log"))).toBe(true);
  });
});

// T-032: missing jobId directory is handled gracefully
describe("T-032: missing jobId directory → ENOENT ignored", () => {
  it("does not throw when associated directory does not exist", async () => {
    const logsDir = path.join(tempDir, "logs");
    await fs.mkdir(logsDir);

    await createLogFile(logsDir, "job-keep", 1000);
    await createLogFile(logsDir, "job-delete", 3000);
    // No directory for "job-delete" — only the .log file exists

    await expect(pruneOldLogs(logsDir, 1)).resolves.not.toThrow();

    expect(nodeFsSync.existsSync(path.join(logsDir, "job-delete.log"))).toBe(false);
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-keep.log"))).toBe(true);
  });
});

// Edge case: logs directory doesn't exist
describe("pruneOldLogs with non-existent directory", () => {
  it("returns without error when logs directory does not exist", async () => {
    const nonExistentDir = path.join(tempDir, "nonexistent");
    await expect(pruneOldLogs(nonExistentDir, 20)).resolves.not.toThrow();
  });
});

// Exact maxJobs boundary
describe("pruneOldLogs boundary conditions", () => {
  it("keeps exactly maxJobs files when count equals maxJobs", async () => {
    const logsDir = path.join(tempDir, "logs");
    await fs.mkdir(logsDir);

    await createLogFile(logsDir, "job-1", 1000);
    await createLogFile(logsDir, "job-2", 2000);
    await createLogFile(logsDir, "job-3", 3000);

    await pruneOldLogs(logsDir, 3); // exactly 3 files, maxJobs=3

    expect(nodeFsSync.existsSync(path.join(logsDir, "job-1.log"))).toBe(true);
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-2.log"))).toBe(true);
    expect(nodeFsSync.existsSync(path.join(logsDir, "job-3.log"))).toBe(true);
  });
});
