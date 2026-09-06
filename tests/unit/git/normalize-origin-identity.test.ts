/**
 * Unit tests for normalizeOriginIdentity.
 *
 * TC-023: HTTPS / SSH / local bare URLs from the same repo produce the same digest
 *         and userinfo is stripped from the output URL.
 * TC-024: file:///tmp/x/bare.git produces a stable non-empty digest.
 */
import { describe, it, expect } from "vitest";
import { normalizeOriginIdentity } from "../../../src/git/remote.js";

// ---------------------------------------------------------------------------
// TC-023: HTTPS / SSH / local bare → same digest, no userinfo in URL
// ---------------------------------------------------------------------------

describe("TC-023: normalizeOriginIdentity — HTTPS / SSH / plain HTTPS produce same digest", () => {
  it("HTTPS with credentials, SSH, and HTTPS without .git all produce the same digest", () => {
    const a = normalizeOriginIdentity("https://user:secret@example.com/team/repo.git");
    const b = normalizeOriginIdentity("git@example.com:team/repo.git");
    const c = normalizeOriginIdentity("https://example.com/team/repo");

    expect(a.digest).toBe(b.digest);
    expect(b.digest).toBe(c.digest);
  });

  it("userinfo (user:secret@) is stripped from the URL field", () => {
    const result = normalizeOriginIdentity("https://user:secret@example.com/team/repo.git");
    expect(result.url).not.toContain("user:");
    expect(result.url).not.toContain("secret");
  });

  it("digest is a non-empty hex string (SHA-256)", () => {
    const result = normalizeOriginIdentity("https://example.com/team/repo.git");
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("host is case-normalized (HTTPS with uppercase host)", () => {
    const lower = normalizeOriginIdentity("https://EXAMPLE.COM/team/repo.git");
    const upper = normalizeOriginIdentity("https://example.com/team/repo.git");
    expect(lower.digest).toBe(upper.digest);
  });

  it("trailing .git is stripped before digest computation", () => {
    const withGit = normalizeOriginIdentity("https://example.com/team/repo.git");
    const withoutGit = normalizeOriginIdentity("https://example.com/team/repo");
    expect(withGit.digest).toBe(withoutGit.digest);
  });
});

// ---------------------------------------------------------------------------
// TC-024: file:// local remote → stable non-empty digest
// ---------------------------------------------------------------------------

describe("TC-024: normalizeOriginIdentity — file:///tmp/x/bare.git → stable non-empty digest", () => {
  it("produces a non-empty digest for a file:// URL", () => {
    const result = normalizeOriginIdentity("file:///tmp/x/bare.git");
    expect(result.digest).toBeTruthy();
    expect(result.digest.length).toBeGreaterThan(0);
  });

  it("produces the same digest when called twice with the same file:// URL", () => {
    const a = normalizeOriginIdentity("file:///tmp/x/bare.git");
    const b = normalizeOriginIdentity("file:///tmp/x/bare.git");
    expect(a.digest).toBe(b.digest);
  });

  it("returns a URL field for file:// remotes", () => {
    const result = normalizeOriginIdentity("file:///tmp/x/bare.git");
    expect(typeof result.url).toBe("string");
  });

  it("different file:// paths produce different digests", () => {
    const a = normalizeOriginIdentity("file:///tmp/x/bare.git");
    const b = normalizeOriginIdentity("file:///tmp/y/bare.git");
    expect(a.digest).not.toBe(b.digest);
  });
});
