import { describe, expect, it } from "vitest";
import { isRemoteRefNotFound } from "../git-push.js";

describe("isRemoteRefNotFound", () => {
  it("returns false for empty stderr", () => {
    expect(isRemoteRefNotFound("")).toBe(false);
  });

  it("returns true when stderr contains remote ref does not exist", () => {
    expect(isRemoteRefNotFound("error: unable to delete 'refs/heads/fix/test': remote ref does not exist")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isRemoteRefNotFound("error: Remote Ref Does Not Exist")).toBe(true);
  });

  it("returns false for authentication errors", () => {
    expect(isRemoteRefNotFound("Authentication failed")).toBe(false);
    expect(isRemoteRefNotFound("remote: Repository not found.")).toBe(false);
  });
});
