/**
 * Unit tests for matchGlob (T-01).
 */
import { describe, it, expect } from "vitest";
import { matchGlob } from "../glob-match.js";

describe("matchGlob — ** (globstar)", () => {
  it('matches "src/auth/**" against "src/auth/login.ts"', () => {
    expect(matchGlob("src/auth/**", "src/auth/login.ts")).toBe(true);
  });

  it('matches "src/auth/**" against deep nested path', () => {
    expect(matchGlob("src/auth/**", "src/auth/providers/oauth.ts")).toBe(true);
  });

  it('matches "**/*.sql" against "db/migrations/001.sql"', () => {
    expect(matchGlob("**/*.sql", "db/migrations/001.sql")).toBe(true);
  });

  it('matches "**/*.ts" against top-level file', () => {
    expect(matchGlob("**/*.ts", "index.ts")).toBe(true);
  });

  it('does not match "src/auth/**" against "lib/auth/login.ts"', () => {
    expect(matchGlob("src/auth/**", "lib/auth/login.ts")).toBe(false);
  });
});

describe("matchGlob — * (single segment)", () => {
  it('"src/*.ts" matches "src/index.ts"', () => {
    expect(matchGlob("src/*.ts", "src/index.ts")).toBe(true);
  });

  it('"src/*.ts" does NOT match "src/a/b.ts" (* does not cross /)', () => {
    expect(matchGlob("src/*.ts", "src/a/b.ts")).toBe(false);
  });

  it('"*.md" matches "README.md"', () => {
    expect(matchGlob("*.md", "README.md")).toBe(true);
  });

  it('"*.md" does NOT match "docs/README.md"', () => {
    expect(matchGlob("*.md", "docs/README.md")).toBe(false);
  });
});

describe("matchGlob — ? (single char)", () => {
  it('"src/?.ts" matches "src/a.ts"', () => {
    expect(matchGlob("src/?.ts", "src/a.ts")).toBe(true);
  });

  it('"src/?.ts" does NOT match "src/ab.ts"', () => {
    expect(matchGlob("src/?.ts", "src/ab.ts")).toBe(false);
  });

  it('"src/?.ts" does NOT match "src/a/b.ts" (? does not cross /)', () => {
    expect(matchGlob("src/?.ts", "src/a/b.ts")).toBe(false);
  });
});

describe("matchGlob — literal match", () => {
  it("exact path matches", () => {
    expect(matchGlob("src/auth/login.ts", "src/auth/login.ts")).toBe(true);
  });

  it("different path does not match", () => {
    expect(matchGlob("src/auth/login.ts", "src/auth/logout.ts")).toBe(false);
  });

  it("partial path does not match", () => {
    expect(matchGlob("src/auth", "src/auth/login.ts")).toBe(false);
  });
});

describe("matchGlob — injection safety", () => {
  it("regex metacharacters in pattern are escaped", () => {
    // Pattern with literal dot should NOT match any single char
    expect(matchGlob("src/auth.ts", "src/authXts")).toBe(false);
    expect(matchGlob("src/auth.ts", "src/auth.ts")).toBe(true);
  });

  it("regex metacharacters in pattern — parentheses do not cause parse error", () => {
    expect(matchGlob("(invalid)", "(invalid)")).toBe(true);
    expect(matchGlob("(invalid)", "invalid")).toBe(false);
  });
});
