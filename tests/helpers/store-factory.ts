import { JobStateStore } from "../../src/store/job-state-store.js";
import type { StoreFactory } from "../../src/core/types.js";

/**
 * Default test storeFactory: a real JobStateStore backed by the filesystem.
 *
 * Centralizes the `(id) => new JobStateStore(id)` literal that the pipeline /
 * executor DI seam requires. Tests that don't care about observing persistence
 * pass this; tests that need to observe or suppress file I/O pass their own
 * fake factory instead.
 *
 * design.md D6: the default factory lives in one place so a future change to
 * how a JobStateStore is constructed touches a single call site, not every test.
 */
export const defaultStoreFactory: StoreFactory = (id: string) => new JobStateStore(id);
