/**
 * Global Vitest setup: enable vi.spyOn on node:fs/promises.
 *
 * Problem: native ESM module namespace objects are sealed (non-configurable),
 * so vi.spyOn fails with "Cannot spy on export". The { spy: true } autospy
 * wraps exports with vi.fn(), but vi.spyOn on an already-mocked function just
 * returns the same mock — causing infinite recursion when tests call the
 * captured "original" from inside a mockImplementation.
 *
 * Solution: register a module mock that returns a plain mutable object
 * containing the REAL (unwrapped) functions. This creates a configurable
 * namespace where vi.spyOn can safely create a NEW spy wrapper around each
 * real function, so the "original" captured before spyOn is the actual
 * Node.js function — no recursion.
 *
 * clearMocks: true in vitest.config.ts resets mock.calls after each test.
 * afterEach(() => vi.restoreAllMocks()) in individual tests restores spies.
 */
import { vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  // Spread into a plain object so vi.spyOn gets a mutable (non-sealed) target
  // with the real functions as values, not vi.fn wrappers.
  return { ...original };
});
