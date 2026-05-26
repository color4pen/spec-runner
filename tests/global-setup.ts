import * as fs from "node:fs/promises";
import * as path from "node:path";

const JOBS_DIR = path.join(process.cwd(), ".specrunner", "jobs");
let snapshotBefore: Set<string>;

export async function setup() {
  try {
    const entries = await fs.readdir(JOBS_DIR);
    snapshotBefore = new Set(entries);
  } catch {
    snapshotBefore = new Set();
  }
}

export async function teardown() {
  try {
    const entries = await fs.readdir(JOBS_DIR);
    const newFiles = entries.filter((e) => !snapshotBefore.has(e));
    if (newFiles.length > 0) {
      throw new Error(
        `Test pollution detected: ${newFiles.length} new file(s) in .specrunner/jobs/:\n` +
        newFiles.map((f) => `  - ${f}`).join("\n") +
        "\n\nTests must use makeStoreFactory(tempDir), not write to the repo's .specrunner/jobs/."
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Test pollution detected")) {
      throw err;
    }
    // ENOENT is fine — jobs dir was removed or never existed
  }
}
