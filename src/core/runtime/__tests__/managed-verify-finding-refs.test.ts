/**
 * Unit tests for isGitHubDirectoryListing and verifyFindingRefs in managed.ts.
 * Covers the fix for misclassifying top-level JSON array files as directories.
 */
import { describe, it, expect } from "vitest";
import { isGitHubDirectoryListing, ManagedRuntime } from "../managed.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";
import type { FindingRef } from "../../port/runtime-strategy.js";

// ---------------------------------------------------------------------------
// isGitHubDirectoryListing unit tests
// ---------------------------------------------------------------------------

describe("isGitHubDirectoryListing", () => {
  it("empty array → false", () => {
    expect(isGitHubDirectoryListing([])).toBe(false);
  });

  it("plain string array → false", () => {
    expect(isGitHubDirectoryListing(["item1", "item2"])).toBe(false);
  });

  it("number array → false", () => {
    expect(isGitHubDirectoryListing([1, 2, 3])).toBe(false);
  });

  it("array of objects with name and type fields → true", () => {
    expect(isGitHubDirectoryListing([{ name: "foo.ts", type: "file" }])).toBe(true);
  });

  it("array of objects with name and type fields (multiple entries) → true", () => {
    expect(
      isGitHubDirectoryListing([
        { name: "src", type: "dir", path: "src", sha: "abc" },
        { name: "index.ts", type: "file", path: "index.ts", sha: "def" },
      ]),
    ).toBe(true);
  });

  it("array of objects missing type field → false", () => {
    expect(isGitHubDirectoryListing([{ name: "foo.ts" }])).toBe(false);
  });

  it("array of objects missing name field → false", () => {
    expect(isGitHubDirectoryListing([{ type: "file" }])).toBe(false);
  });

  it("non-array object → false", () => {
    expect(isGitHubDirectoryListing({ name: "x" })).toBe(false);
  });

  it("null → false", () => {
    expect(isGitHubDirectoryListing(null)).toBe(false);
  });

  it("string → false", () => {
    expect(isGitHubDirectoryListing("not an array")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyFindingRefs integration tests (mock githubClient.getRawFile)
// ---------------------------------------------------------------------------

function makeManagedRuntime(getRawFile: (owner: string, name: string, branch: string, path: string) => Promise<string | null>): ManagedRuntime {
  const mockGithubClient = {
    getRawFile,
  } as unknown as GitHubClient;

  const mockSessionClient = {} as SessionClient;

  const repo: OriginInfo = {
    owner: "testowner",
    name: "testrepo",
  };

  return new ManagedRuntime(
    "/cwd",
    mockSessionClient,
    mockGithubClient,
    repo,
    undefined,
    "fake-token",
  );
}

describe("verifyFindingRefs — plain JSON array file", () => {
  it("file content is a plain JSON string array → finding with line reference NOT in nonExistent", async () => {
    const runtime = makeManagedRuntime(async (_owner, _name, _branch, _path) => {
      return '["item1","item2"]';
    });

    const refs: FindingRef[] = [{ file: "data/items.json", line: 1 }];
    const nonExistent = await runtime.verifyFindingRefs(refs, "/cwd", "main");

    expect(nonExistent).toHaveLength(0);
  });

  it("file content is a plain JSON number array → finding NOT in nonExistent", async () => {
    const runtime = makeManagedRuntime(async () => "[1, 2, 3]");

    const refs: FindingRef[] = [{ file: "data/numbers.json", line: 1 }];
    const nonExistent = await runtime.verifyFindingRefs(refs, "/cwd", "main");

    expect(nonExistent).toHaveLength(0);
  });
});

describe("verifyFindingRefs — actual directory listing", () => {
  it("file content is a GitHub directory listing (array with name+type) → finding with line reference IS in nonExistent", async () => {
    const runtime = makeManagedRuntime(async () => {
      return JSON.stringify([{ name: "a.ts", type: "file", path: "src/a.ts", sha: "abc123" }]);
    });

    const refs: FindingRef[] = [{ file: "src", line: 1 }];
    const nonExistent = await runtime.verifyFindingRefs(refs, "/cwd", "main");

    expect(nonExistent).toHaveLength(1);
    expect(nonExistent[0]!.file).toBe("src");
  });

  it("directory finding WITHOUT line reference → NOT in nonExistent", async () => {
    const runtime = makeManagedRuntime(async () => {
      return JSON.stringify([{ name: "a.ts", type: "file", path: "src/a.ts", sha: "abc123" }]);
    });

    const refs: FindingRef[] = [{ file: "src" }];
    const nonExistent = await runtime.verifyFindingRefs(refs, "/cwd", "main");

    expect(nonExistent).toHaveLength(0);
  });
});

describe("verifyFindingRefs — null content (file not found)", () => {
  it("getRawFile returns null → finding IS in nonExistent", async () => {
    const runtime = makeManagedRuntime(async () => null);

    const refs: FindingRef[] = [{ file: "missing.ts", line: 5 }];
    const nonExistent = await runtime.verifyFindingRefs(refs, "/cwd", "main");

    expect(nonExistent).toHaveLength(1);
    expect(nonExistent[0]!.file).toBe("missing.ts");
  });
});

describe("verifyFindingRefs — line out of range", () => {
  it("line exceeds file line count → finding IS in nonExistent", async () => {
    const runtime = makeManagedRuntime(async () => "line1\nline2\nline3");

    const refs: FindingRef[] = [{ file: "src/short.ts", line: 100 }];
    const nonExistent = await runtime.verifyFindingRefs(refs, "/cwd", "main");

    expect(nonExistent).toHaveLength(1);
  });

  it("line within file line count → finding NOT in nonExistent", async () => {
    const runtime = makeManagedRuntime(async () => "line1\nline2\nline3");

    const refs: FindingRef[] = [{ file: "src/short.ts", line: 2 }];
    const nonExistent = await runtime.verifyFindingRefs(refs, "/cwd", "main");

    expect(nonExistent).toHaveLength(0);
  });
});

describe("verifyFindingRefs — edge cases", () => {
  it("no refs → returns empty array", async () => {
    const runtime = makeManagedRuntime(async () => null);
    const nonExistent = await runtime.verifyFindingRefs([], "/cwd", "main");
    expect(nonExistent).toHaveLength(0);
  });

  it("no branch → returns all refs unchanged", async () => {
    const runtime = makeManagedRuntime(async () => "content");
    const refs: FindingRef[] = [{ file: "a.ts", line: 1 }];
    const nonExistent = await runtime.verifyFindingRefs(refs, "/cwd", null);
    expect(nonExistent).toHaveLength(1);
  });
});
