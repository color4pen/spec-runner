/**
 * Unit test for src/core/inbox/draft-writer.ts
 *
 * GIVEN writeDraft is called with (repoRoot, slug, content)
 * WHEN the underlying write from request/store is invoked
 * THEN it is called with the same arguments
 */
import { describe, it, expect, vi } from "vitest";

const { mockWrite } = vi.hoisted(() => ({
  mockWrite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/core/request/store.js", () => ({
  write: mockWrite,
}));

import { writeDraft } from "../../../src/core/inbox/draft-writer.js";

describe("writeDraft", () => {
  it("delegates to write from request/store with the given arguments", async () => {
    mockWrite.mockClear();

    await writeDraft("/repo/root", "my-slug", "# content");

    expect(mockWrite).toHaveBeenCalledOnce();
    expect(mockWrite).toHaveBeenCalledWith("/repo/root", "my-slug", "# content");
  });
});
