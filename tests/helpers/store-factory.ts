import * as path from "node:path";
import { JobStateStore } from "../../src/store/job-state-store.js";
import type { StoreFactory } from "../../src/core/types.js";

/**
 * Creates a test storeFactory backed by the real filesystem at the given repoRoot.
 *
 * Uses changeDir mode: each job gets its own <repoRoot>/.specrunner/test-jobs/<jobId>/
 * directory. This avoids slug-mode requirements and keeps tests isolated.
 *
 * design.md D6: the factory lives in one place so a future change to how a
 * JobStateStore is constructed touches a single call site, not every test.
 */
export function makeStoreFactory(repoRoot: string): StoreFactory {
  return (id: string) =>
    new JobStateStore(id, repoRoot, {
      changeDir: path.join(repoRoot, ".specrunner", "test-jobs", id),
    });
}
