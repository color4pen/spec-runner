/**
 * Unit tests for the fact-check attestation feature.
 *
 * TC-FCA-01: hashRequestContent — determinism and uniqueness
 * TC-FCA-02: buildFactCheckAttestation — shape
 * TC-FCA-03: parseFactCheckAttestation — valid JSON, malformed, missing/mistyped fields
 * TC-FCA-04: evaluateFactCheckAttestation — valid / stale / absent cases
 * TC-FCA-05: buildFactCheckDirective — content for valid vs stale/absent
 * TC-FCA-06: buildRequestReviewInitialMessage — with/without hash
 * TC-FCA-07: RequestReviewStep.writes() includes attestation path with verify:false
 * TC-FCA-08: RequestReviewStep.enrichContext computes hash from request.md
 * TC-FCA-09: DesignStep.enrichContext — valid/stale/absent cases
 * TC-FCA-10: buildInitialMessage — skip directive on valid, verify-all on stale/absent
 * TC-FCA-11: factCheckAttestationPath path helper
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import {
  hashRequestContent,
  buildFactCheckAttestation,
  parseFactCheckAttestation,
  evaluateFactCheckAttestation,
  buildFactCheckDirective,
} from "../../../src/core/factcheck-attestation.js";
import { readSourceRevision } from "../../../src/git/source-revision.js";
import { factCheckAttestationPath } from "../../../src/util/paths.js";
import {
  buildRequestReviewInitialMessage,
  REQUEST_REVIEW_SYSTEM_PROMPT,
} from "../../../src/prompts/request-review-system.js";
import { RequestReviewStep } from "../../../src/core/step/request-review.js";
import { DesignStep } from "../../../src/core/step/design.js";
import { buildInitialMessage } from "../../../src/prompts/design-system.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "factcheck-attestation-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "request-review",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(overrides: Partial<StepDeps> = {}): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    },
    request: {
      type: "new-feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "Test request content",
      adr: false,
    },
    slug: "test-slug",
    cwd: tempDir,
    ...overrides,
  };
}

/** Write change folder with request.md and optional attestation.json */
async function setupChangeFolder(
  slug: string,
  requestContent: string,
  attestationJson?: string,
): Promise<string> {
  const folder = path.join(tempDir, "specrunner", "changes", slug);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, "request.md"), requestContent, "utf-8");
  if (attestationJson !== undefined) {
    await fs.writeFile(
      path.join(folder, "request-review-attestation.json"),
      attestationJson,
      "utf-8",
    );
  }
  return folder;
}

/**
 * Set up a temporary git repository with:
 * 1. A source file commit (in a "src" dir, outside the change folder).
 * 2. Optionally a second source commit.
 * 3. A change folder commit (inside specrunner/changes/<slug>/).
 *
 * Returns { gitDir, sourceRevision } where sourceRevision is the SHA of the
 * first source commit (change folder commit must not affect it).
 */
async function setupGitRepoWithSourceCommit(slug: string, requestContent: string): Promise<{
  gitDir: string;
  sourceRevision: string;
  cleanup: () => Promise<void>;
}> {
  const gitDir = await fs.mkdtemp(path.join(os.tmpdir(), "fca-git-test-"));

  const git = (args: string) =>
    execSync(`git ${args}`, {
      cwd: gitDir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
      stdio: "pipe",
    });

  // Init repo
  git("init");
  git("config user.email test@test.com");
  git("config user.name Test");

  // Commit a source file (outside change folder)
  await fs.mkdir(path.join(gitDir, "src"), { recursive: true });
  await fs.writeFile(path.join(gitDir, "src", "index.ts"), "export const x = 1;");
  git("add src/index.ts");
  git('commit -m "add source file"');

  // Get the source revision (should be the commit we just made)
  const sourceRevision = execSync("git rev-list -1 HEAD", { cwd: gitDir }).toString().trim();

  // Now create the change folder with attestation and commit it
  const changeFolder = path.join(gitDir, "specrunner", "changes", slug);
  await fs.mkdir(changeFolder, { recursive: true });
  await fs.writeFile(path.join(changeFolder, "request.md"), requestContent);

  return {
    gitDir,
    sourceRevision,
    cleanup: async () => {
      await fs.rm(gitDir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// TC-FCA-11: factCheckAttestationPath
// ---------------------------------------------------------------------------
describe("TC-FCA-11: factCheckAttestationPath", () => {
  it("returns the expected path for a slug", () => {
    expect(factCheckAttestationPath("foo")).toBe(
      "specrunner/changes/foo/request-review-attestation.json",
    );
  });

  it("uses the slug verbatim in the path", () => {
    expect(factCheckAttestationPath("my-change")).toBe(
      "specrunner/changes/my-change/request-review-attestation.json",
    );
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-01: hashRequestContent
// ---------------------------------------------------------------------------
describe("TC-FCA-01: hashRequestContent — determinism and uniqueness", () => {
  it("returns a sha256:-prefixed hash", () => {
    const hash = hashRequestContent("hello");
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("is deterministic (same input → same hash)", () => {
    const content = "# request\nsome content here";
    expect(hashRequestContent(content)).toBe(hashRequestContent(content));
  });

  it("differs for different inputs", () => {
    const h1 = hashRequestContent("content A");
    const h2 = hashRequestContent("content B");
    expect(h1).not.toBe(h2);
  });

  it("empty string produces a consistent hash", () => {
    const h = hashRequestContent("");
    expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashRequestContent("")).toBe(h);
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-02: buildFactCheckAttestation
// ---------------------------------------------------------------------------
describe("TC-FCA-02: buildFactCheckAttestation — shape", () => {
  it("sets codeAssertionsVerified to true", () => {
    const att = buildFactCheckAttestation("request content", []);
    expect(att.codeAssertionsVerified).toBe(true);
  });

  it("sets requestHash to hashRequestContent of the request", () => {
    const content = "some request content";
    const att = buildFactCheckAttestation(content, []);
    expect(att.requestHash).toBe(hashRequestContent(content));
  });

  it("copies verifiedAssertions as a string array", () => {
    const att = buildFactCheckAttestation("req", ["src/foo.ts:42", "barFn in src/bar.ts"]);
    expect(att.verifiedAssertions).toEqual(["src/foo.ts:42", "barFn in src/bar.ts"]);
  });

  it("produces empty verifiedAssertions when none provided", () => {
    const att = buildFactCheckAttestation("req", []);
    expect(att.verifiedAssertions).toEqual([]);
  });

  it("includes sourceRevision when third argument is provided", () => {
    const att = buildFactCheckAttestation("req", [], "abc123sha");
    expect(att.sourceRevision).toBe("abc123sha");
  });

  it("does not include sourceRevision when third argument is omitted", () => {
    const att = buildFactCheckAttestation("req", []);
    expect(att.sourceRevision).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(att, "sourceRevision")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-03: parseFactCheckAttestation
// ---------------------------------------------------------------------------
describe("TC-FCA-03: parseFactCheckAttestation — valid, malformed, missing fields", () => {
  it("parses a valid attestation", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: true,
      verifiedAssertions: ["src/foo.ts:1"],
    });
    const result = parseFactCheckAttestation(json);
    expect(result).not.toBeNull();
    expect(result!.requestHash).toBe("sha256:abc");
    expect(result!.codeAssertionsVerified).toBe(true);
    expect(result!.verifiedAssertions).toEqual(["src/foo.ts:1"]);
  });

  it("returns null for malformed JSON (syntax error)", () => {
    expect(parseFactCheckAttestation("{not valid json")).toBeNull();
  });

  it("returns null when requestHash is missing", () => {
    const json = JSON.stringify({
      codeAssertionsVerified: true,
      verifiedAssertions: [],
    });
    expect(parseFactCheckAttestation(json)).toBeNull();
  });

  it("returns null when requestHash is not a string", () => {
    const json = JSON.stringify({
      requestHash: 42,
      codeAssertionsVerified: true,
      verifiedAssertions: [],
    });
    expect(parseFactCheckAttestation(json)).toBeNull();
  });

  it("returns null when codeAssertionsVerified is missing", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      verifiedAssertions: [],
    });
    expect(parseFactCheckAttestation(json)).toBeNull();
  });

  it("returns null when codeAssertionsVerified is not a boolean", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: "true",
      verifiedAssertions: [],
    });
    expect(parseFactCheckAttestation(json)).toBeNull();
  });

  it("returns null when verifiedAssertions is missing", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: true,
    });
    expect(parseFactCheckAttestation(json)).toBeNull();
  });

  it("returns null when verifiedAssertions is not an array", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: true,
      verifiedAssertions: "not-an-array",
    });
    expect(parseFactCheckAttestation(json)).toBeNull();
  });

  it("coerces non-string array elements to strings", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: true,
      verifiedAssertions: [42, true, "normal"],
    });
    const result = parseFactCheckAttestation(json);
    expect(result).not.toBeNull();
    expect(result!.verifiedAssertions).toEqual(["42", "true", "normal"]);
  });

  it("returns null for null (primitive)", () => {
    const json = JSON.stringify(null);
    expect(parseFactCheckAttestation(json)).toBeNull();
  });

  it("returns null for a JSON array (not an object)", () => {
    const json = JSON.stringify([1, 2, 3]);
    expect(parseFactCheckAttestation(json)).toBeNull();
  });

  it("parses sourceRevision string when present", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: true,
      verifiedAssertions: [],
      sourceRevision: "deadbeef123",
    });
    const result = parseFactCheckAttestation(json);
    expect(result).not.toBeNull();
    expect(result!.sourceRevision).toBe("deadbeef123");
  });

  it("treats sourceRevision as undefined when absent (backward compat)", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: true,
      verifiedAssertions: [],
    });
    const result = parseFactCheckAttestation(json);
    expect(result).not.toBeNull();
    expect(result!.sourceRevision).toBeUndefined();
  });

  it("treats sourceRevision as undefined when it is a number (non-string)", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: true,
      verifiedAssertions: [],
      sourceRevision: 42,
    });
    const result = parseFactCheckAttestation(json);
    expect(result).not.toBeNull();
    // Non-string sourceRevision is silently ignored — parse succeeds
    expect(result!.sourceRevision).toBeUndefined();
  });

  it("treats sourceRevision as undefined when it is null", () => {
    const json = JSON.stringify({
      requestHash: "sha256:abc",
      codeAssertionsVerified: true,
      verifiedAssertions: [],
      sourceRevision: null,
    });
    const result = parseFactCheckAttestation(json);
    expect(result).not.toBeNull();
    expect(result!.sourceRevision).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-04: evaluateFactCheckAttestation
// ---------------------------------------------------------------------------
describe("TC-FCA-04: evaluateFactCheckAttestation — valid / stale / absent", () => {
  const REQUEST = "# My request\nsome content";
  const HASH = hashRequestContent(REQUEST);
  const REVISION = "abc123deadbeef456";

  function validAttestationJson(
    requestHash = HASH,
    codeAssertionsVerified = true,
    verifiedAssertions = ["src/foo.ts:1"],
    sourceRevision: string | undefined = REVISION,
  ) {
    const obj: Record<string, unknown> = { requestHash, codeAssertionsVerified, verifiedAssertions };
    if (sourceRevision !== undefined) obj["sourceRevision"] = sourceRevision;
    return JSON.stringify(obj);
  }

  // AC-1: requestHash + sourceRevision both match → valid
  it("returns 'valid' when hash matches, codeAssertionsVerified is true, and sourceRevision matches", () => {
    const result = evaluateFactCheckAttestation(validAttestationJson(), REQUEST, REVISION);
    expect(result.status).toBe("valid");
    expect(result.verifiedAssertions).toEqual(["src/foo.ts:1"]);
  });

  it("returns 'absent' when attestationRaw is null", () => {
    const result = evaluateFactCheckAttestation(null, REQUEST, REVISION);
    expect(result.status).toBe("absent");
    expect(result.verifiedAssertions).toEqual([]);
  });

  it("returns 'absent' when attestationRaw is unparseable", () => {
    const result = evaluateFactCheckAttestation("not json {", REQUEST, REVISION);
    expect(result.status).toBe("absent");
    expect(result.verifiedAssertions).toEqual([]);
  });

  // AC-4: requestHash mismatch → stale (existing behaviour preserved)
  it("returns 'stale' when hash does not match current request content", () => {
    const attestation = validAttestationJson(hashRequestContent("old content"));
    const result = evaluateFactCheckAttestation(attestation, REQUEST, REVISION);
    expect(result.status).toBe("stale");
    expect(result.verifiedAssertions).toEqual([]);
  });

  // AC-4: codeAssertionsVerified false → stale (existing behaviour preserved)
  it("returns 'stale' when codeAssertionsVerified is false", () => {
    const attestation = validAttestationJson(HASH, false);
    const result = evaluateFactCheckAttestation(attestation, REQUEST, REVISION);
    expect(result.status).toBe("stale");
    expect(result.verifiedAssertions).toEqual([]);
  });

  it("returns 'stale' with empty verifiedAssertions (not the attestation's list)", () => {
    const attestation = validAttestationJson(hashRequestContent("different"), true, ["x", "y"]);
    const result = evaluateFactCheckAttestation(attestation, REQUEST, REVISION);
    expect(result.status).toBe("stale");
    expect(result.verifiedAssertions).toEqual([]);
  });

  // AC-2: sourceRevision mismatch → stale (core of this change)
  it("returns 'stale' when requestHash matches but sourceRevision differs", () => {
    const attestation = validAttestationJson(HASH, true, ["src/foo.ts:1"], "old-sha-123");
    const result = evaluateFactCheckAttestation(attestation, REQUEST, "new-sha-456");
    expect(result.status).toBe("stale");
    expect(result.verifiedAssertions).toEqual([]);
  });

  // AC-3: attestation without sourceRevision (old attestation) → stale (fail-safe / backward compat)
  it("returns 'stale' when attestation has no sourceRevision (old attestation format)", () => {
    // Build raw JSON without sourceRevision field to simulate old attestation format
    const attestation = JSON.stringify({
      requestHash: HASH,
      codeAssertionsVerified: true,
      verifiedAssertions: ["src/foo.ts:1"],
    });
    const result = evaluateFactCheckAttestation(attestation, REQUEST, REVISION);
    expect(result.status).toBe("stale");
    expect(result.verifiedAssertions).toEqual([]);
  });

  // AC-3: currentSourceRevision null (git unavailable) → stale (fail-safe)
  it("returns 'stale' when currentSourceRevision is null (git unavailable)", () => {
    const attestation = validAttestationJson(HASH, true, ["src/foo.ts:1"], REVISION);
    const result = evaluateFactCheckAttestation(attestation, REQUEST, null);
    expect(result.status).toBe("stale");
    expect(result.verifiedAssertions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-05: buildFactCheckDirective
// ---------------------------------------------------------------------------
describe("TC-FCA-05: buildFactCheckDirective — content for valid vs stale/absent", () => {
  it("valid: contains 'skip' and lists assertions", () => {
    const directive = buildFactCheckDirective({
      status: "valid",
      verifiedAssertions: ["src/foo.ts:1 — assertion A", "barFn exists"],
    });
    expect(directive).toContain("Fact-Check Attestation Directive");
    expect(directive).toContain("skip");
    expect(directive).toContain("src/foo.ts:1 — assertion A");
    expect(directive).toContain("barFn exists");
  });

  it("valid with empty assertions: contains placeholder text", () => {
    const directive = buildFactCheckDirective({
      status: "valid",
      verifiedAssertions: [],
    });
    expect(directive).toContain("(none listed)");
  });

  it("valid: instructs to still verify unlisted assertions", () => {
    const directive = buildFactCheckDirective({
      status: "valid",
      verifiedAssertions: ["src/a.ts:1"],
    });
    expect(directive).toMatch(/NOT in the list|not in the list/i);
    expect(directive).toContain("MUST");
  });

  it("stale: instructs to verify ALL assertions", () => {
    const directive = buildFactCheckDirective({
      status: "stale",
      verifiedAssertions: [],
    });
    expect(directive).toContain("Fact-Check Attestation Directive");
    expect(directive).toContain("ALL");
    expect(directive).toContain("stale");
  });

  it("stale: reason text mentions source revision", () => {
    const directive = buildFactCheckDirective({
      status: "stale",
      verifiedAssertions: [],
    });
    expect(directive).toMatch(/source revision/i);
  });

  it("absent: instructs to verify ALL assertions", () => {
    const directive = buildFactCheckDirective({
      status: "absent",
      verifiedAssertions: [],
    });
    expect(directive).toContain("Fact-Check Attestation Directive");
    expect(directive).toContain("ALL");
    // "absent" status produces "no fact-check attestation is present" reason text
    expect(directive).toMatch(/no fact-check attestation is present|absent/i);
  });

  it("stale and absent produce different reason text", () => {
    const stale = buildFactCheckDirective({ status: "stale", verifiedAssertions: [] });
    const absent = buildFactCheckDirective({ status: "absent", verifiedAssertions: [] });
    // Both contain ALL but differ in reason
    expect(stale).not.toBe(absent);
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-06: buildRequestReviewInitialMessage — with/without hash
// ---------------------------------------------------------------------------
describe("TC-FCA-06: buildRequestReviewInitialMessage — attestation instruction", () => {
  it("without requestContentHash: omits the attestation write instruction", () => {
    const msg = buildRequestReviewInitialMessage({
      slug: "my-change",
      requestType: "new-feature",
      branch: undefined,
      iteration: 1,
      findingsPath: "specrunner/changes/my-change/request-review-result-001.md",
    });
    // Should not contain the attestation path or requestHash copy instruction
    expect(msg).not.toContain("request-review-attestation.json");
    expect(msg).not.toContain("attestation");
  });

  it("with requestContentHash and attestationPath: includes attestation path", () => {
    const hash = "sha256:abc123";
    const attestPath = factCheckAttestationPath("my-change");
    const msg = buildRequestReviewInitialMessage({
      slug: "my-change",
      requestType: "new-feature",
      branch: undefined,
      iteration: 1,
      findingsPath: "specrunner/changes/my-change/request-review-result-001.md",
      requestContentHash: hash,
      attestationPath: attestPath,
    });
    expect(msg).toContain("request-review-attestation.json");
    expect(msg).toContain(hash);
  });

  it("with requestContentHash and attestationPath: includes write instruction", () => {
    const hash = hashRequestContent("some content");
    const msg = buildRequestReviewInitialMessage({
      slug: "my-change",
      requestType: "new-feature",
      branch: undefined,
      iteration: 1,
      findingsPath: "specrunner/changes/my-change/request-review-result-001.md",
      requestContentHash: hash,
      attestationPath: factCheckAttestationPath("my-change"),
    });
    // Should contain the instruction to write the attestation file
    expect(msg).toContain("attestation file");
  });

  it("with requestContentHash only (no attestationPath): no attestation instruction", () => {
    // attestationPath undefined means the instruction should be omitted
    const msg = buildRequestReviewInitialMessage({
      slug: "my-change",
      requestType: "new-feature",
      branch: undefined,
      iteration: 1,
      findingsPath: "specrunner/changes/my-change/request-review-result-001.md",
      requestContentHash: "sha256:abc",
      attestationPath: undefined,
    });
    // No attestation path or instruction
    expect(msg).not.toContain("request-review-attestation.json");
  });

  it("with sourceRevision: includes sourceRevision in attestation JSON template", () => {
    const hash = hashRequestContent("content");
    const revision = "deadbeef123abc";
    const msg = buildRequestReviewInitialMessage({
      slug: "my-change",
      requestType: "new-feature",
      branch: undefined,
      iteration: 1,
      findingsPath: "specrunner/changes/my-change/request-review-result-001.md",
      requestContentHash: hash,
      attestationPath: factCheckAttestationPath("my-change"),
      sourceRevision: revision,
    });
    expect(msg).toContain("sourceRevision");
    expect(msg).toContain(revision);
  });

  it("without sourceRevision: does not include sourceRevision in attestation template", () => {
    const hash = hashRequestContent("content");
    const msg = buildRequestReviewInitialMessage({
      slug: "my-change",
      requestType: "new-feature",
      branch: undefined,
      iteration: 1,
      findingsPath: "specrunner/changes/my-change/request-review-result-001.md",
      requestContentHash: hash,
      attestationPath: factCheckAttestationPath("my-change"),
      // sourceRevision omitted
    });
    // attestation instruction is present but sourceRevision is not
    expect(msg).toContain("attestation file");
    expect(msg).not.toContain("sourceRevision");
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-07: RequestReviewStep.writes() includes attestation path with verify:false
// ---------------------------------------------------------------------------
describe("TC-FCA-07: RequestReviewStep.writes() includes attestation path with verify:false", () => {
  it("writes() includes the attestation path", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps({ slug: "test-slug" });
    const writes = RequestReviewStep.writes!(state, deps);
    const attestPath = factCheckAttestationPath("test-slug");
    const found = writes.find((w) => w.path === attestPath);
    expect(found).toBeDefined();
  });

  it("attestation write has verify: false", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps({ slug: "test-slug" });
    const writes = RequestReviewStep.writes!(state, deps);
    const attestPath = factCheckAttestationPath("test-slug");
    const found = writes.find((w) => w.path === attestPath);
    expect(found?.verify).toBe(false);
  });

  it("result file write is still present", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps({ slug: "test-slug" });
    const writes = RequestReviewStep.writes!(state, deps);
    const hasResultFile = writes.some((w) => w.path.includes("request-review-result"));
    expect(hasResultFile).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-08: RequestReviewStep.enrichContext — computes hash from request.md
// ---------------------------------------------------------------------------
describe("TC-FCA-08: RequestReviewStep.enrichContext — computes hash from request.md", () => {
  it("sets requestContentHash to hashRequestContent of request.md", async () => {
    const slug = "enrich-test";
    const requestContent = "# Request\nThis is test content for hashing.";
    await setupChangeFolder(slug, requestContent);

    const baseContext = {
      gitLog: "",
      diffStat: "",
      changesList: [],
    };

    const enriched = await RequestReviewStep.enrichContext!(baseContext, tempDir, slug);
    expect(enriched.requestContentHash).toBe(hashRequestContent(requestContent));
  });

  it("sets sourceRevision from git when request.md is present in a git repo", async () => {
    const slug = "enrich-git-test";
    const requestContent = "# Request\nGit repo content.";

    const { gitDir, sourceRevision, cleanup } = await setupGitRepoWithSourceCommit(slug, requestContent);
    try {
      const baseContext = { gitLog: "", diffStat: "", changesList: [] };
      const enriched = await RequestReviewStep.enrichContext!(baseContext, gitDir, slug);
      expect(enriched.sourceRevision).toBe(sourceRevision);
      expect(enriched.requestContentHash).toBe(hashRequestContent(requestContent));
    } finally {
      await cleanup();
    }
  });

  it("does not set sourceRevision when in a non-git directory", async () => {
    const slug = "enrich-nogit-test";
    const requestContent = "# Request\nNon-git content.";
    await setupChangeFolder(slug, requestContent);

    const baseContext = { gitLog: "", diffStat: "", changesList: [] };
    const enriched = await RequestReviewStep.enrichContext!(baseContext, tempDir, slug);
    // requestContentHash is set
    expect(enriched.requestContentHash).toBe(hashRequestContent(requestContent));
    // sourceRevision is not set (non-git dir → readSourceRevision returns null)
    expect(enriched.sourceRevision).toBeUndefined();
  });

  it("returns context unchanged on read error (file absent)", async () => {
    const slug = "enrich-missing-test";
    // Do not create request.md
    const baseContext = {
      gitLog: "some log",
      diffStat: "",
      changesList: ["foo"],
    };

    const enriched = await RequestReviewStep.enrichContext!(baseContext, tempDir, slug);
    // Should be unchanged (no requestContentHash added)
    expect(enriched.requestContentHash).toBeUndefined();
    expect(enriched.sourceRevision).toBeUndefined();
    expect(enriched.gitLog).toBe("some log");
    expect(enriched.changesList).toEqual(["foo"]);
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-09: DesignStep.enrichContext — valid/stale/absent
// ---------------------------------------------------------------------------
describe("TC-FCA-09: DesignStep.enrichContext — valid / stale / absent", () => {
  // AC-1: valid requires hash + sourceRevision both matching
  it("returns 'valid' when hash matches, codeAssertionsVerified true, and sourceRevision matches HEAD", async () => {
    const slug = "design-valid-test";
    const requestContent = "# Request\nsome design request content";

    const { gitDir, sourceRevision, cleanup } = await setupGitRepoWithSourceCommit(slug, requestContent);
    try {
      // Build attestation with the actual sourceRevision
      const attestation = buildFactCheckAttestation(requestContent, ["src/foo.ts:1"], sourceRevision);
      const changeFolder = path.join(gitDir, "specrunner", "changes", slug);
      await fs.writeFile(
        path.join(changeFolder, "request-review-attestation.json"),
        JSON.stringify(attestation),
      );

      // Commit the change folder so HEAD includes it (simulates request-review metadata commit)
      const { execSync: ex } = await import("node:child_process");
      ex("git add specrunner/changes", {
        cwd: gitDir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Test",
          GIT_AUTHOR_EMAIL: "test@test.com",
          GIT_COMMITTER_NAME: "Test",
          GIT_COMMITTER_EMAIL: "test@test.com",
        },
        stdio: "pipe",
      });
      ex('git commit -m "request-review: add attestation"', {
        cwd: gitDir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Test",
          GIT_AUTHOR_EMAIL: "test@test.com",
          GIT_COMMITTER_NAME: "Test",
          GIT_COMMITTER_EMAIL: "test@test.com",
        },
        stdio: "pipe",
      });

      // Verify readSourceRevision still returns the source commit (not the metadata commit)
      const currentRevision = await readSourceRevision(gitDir);
      expect(currentRevision).toBe(sourceRevision);

      const baseContext = { gitLog: "", diffStat: "", changesList: [] };
      const enriched = await DesignStep.enrichContext!(baseContext, gitDir, slug);

      expect(enriched.factCheckAttestation?.status).toBe("valid");
      expect(enriched.factCheckAttestation?.verifiedAssertions).toEqual(["src/foo.ts:1"]);
    } finally {
      await cleanup();
    }
  });

  // AC-2: requestHash mismatch → stale (stale before source check; non-git tempDir is fine)
  it("returns 'stale' evaluation when attestation hash does not match request.md", async () => {
    const slug = "design-stale-test";
    const requestContent = "# Request\ncurrent content";
    const attestation = buildFactCheckAttestation("old content", ["src/foo.ts:1"]);
    await setupChangeFolder(slug, requestContent, JSON.stringify(attestation));

    const baseContext = { gitLog: "", diffStat: "", changesList: [] };
    const enriched = await DesignStep.enrichContext!(baseContext, tempDir, slug);

    expect(enriched.factCheckAttestation?.status).toBe("stale");
    expect(enriched.factCheckAttestation?.verifiedAssertions).toEqual([]);
  });

  // AC-2: sourceRevision mismatch → stale (core of this change; needs git repo)
  it("returns 'stale' when sourceRevision in attestation does not match current", async () => {
    const slug = "design-stale-rev-test";
    const requestContent = "# Request\ncurrent content";

    const { gitDir, sourceRevision, cleanup } = await setupGitRepoWithSourceCommit(slug, requestContent);
    try {
      // Build attestation with a WRONG sourceRevision
      const attestation = buildFactCheckAttestation(requestContent, ["src/foo.ts:1"], "old-sha-doesnt-match");
      const changeFolder = path.join(gitDir, "specrunner", "changes", slug);
      await fs.writeFile(
        path.join(changeFolder, "request-review-attestation.json"),
        JSON.stringify(attestation),
      );

      const baseContext = { gitLog: "", diffStat: "", changesList: [] };
      const enriched = await DesignStep.enrichContext!(baseContext, gitDir, slug);

      // The current sourceRevision is 'sourceRevision', but attestation says 'old-sha-doesnt-match'
      void sourceRevision; // referenced for clarity
      expect(enriched.factCheckAttestation?.status).toBe("stale");
      expect(enriched.factCheckAttestation?.verifiedAssertions).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  // AC-3: attestation without sourceRevision (old format) → stale (fail-safe)
  it("returns 'stale' when attestation has no sourceRevision (old attestation, non-git dir)", async () => {
    const slug = "design-stale-nosource-test";
    const requestContent = "# Request\ncontent here";
    // Build raw JSON without sourceRevision to simulate old attestation format
    const oldAttestation = JSON.stringify({
      requestHash: hashRequestContent(requestContent),
      codeAssertionsVerified: true,
      verifiedAssertions: ["src/foo.ts:1"],
    });
    await setupChangeFolder(slug, requestContent, oldAttestation);

    // tempDir is not a git repo → readSourceRevision returns null → also stale (fail-safe)
    const baseContext = { gitLog: "", diffStat: "", changesList: [] };
    const enriched = await DesignStep.enrichContext!(baseContext, tempDir, slug);

    expect(enriched.factCheckAttestation?.status).toBe("stale");
    expect(enriched.factCheckAttestation?.verifiedAssertions).toEqual([]);
  });

  it("returns 'absent' evaluation when attestation file is missing", async () => {
    const slug = "design-absent-test";
    const requestContent = "# Request\ncontent here";
    await setupChangeFolder(slug, requestContent); // no attestation file

    const baseContext = { gitLog: "", diffStat: "", changesList: [] };
    const enriched = await DesignStep.enrichContext!(baseContext, tempDir, slug);

    expect(enriched.factCheckAttestation?.status).toBe("absent");
    expect(enriched.factCheckAttestation?.verifiedAssertions).toEqual([]);
  });

  it("returns context unchanged when request.md is missing (degradation)", async () => {
    const slug = "design-degraded-test";
    // Do not create request.md at all
    const baseContext = {
      gitLog: "log",
      diffStat: "stat",
      changesList: ["x"],
    };

    const enriched = await DesignStep.enrichContext!(baseContext, tempDir, slug);

    // Should be unchanged (degrade to verify-all)
    expect(enriched.factCheckAttestation).toBeUndefined();
    expect(enriched.gitLog).toBe("log");
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-10: buildInitialMessage — skip directive on valid, verify-all on stale/absent
// ---------------------------------------------------------------------------
describe("TC-FCA-10: buildInitialMessage — factCheckDirective injection", () => {
  it("includes skip directive when factCheckDirective (valid) is provided", () => {
    const directive = buildFactCheckDirective({
      status: "valid",
      verifiedAssertions: ["src/foo.ts:1"],
    });
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", undefined, undefined, directive);
    expect(msg).toContain("Fact-Check Attestation Directive");
    expect(msg).toContain("skip");
    expect(msg).toContain("src/foo.ts:1");
  });

  it("includes verify-all directive when factCheckDirective (stale) is provided", () => {
    const directive = buildFactCheckDirective({
      status: "stale",
      verifiedAssertions: [],
    });
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", undefined, undefined, directive);
    expect(msg).toContain("Fact-Check Attestation Directive");
    expect(msg).toContain("ALL");
  });

  it("omits any directive when factCheckDirective is undefined (managed degradation)", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug");
    expect(msg).not.toContain("Fact-Check Attestation Directive");
  });

  it("existing placeholders (slug, branch) are still replaced correctly", () => {
    const directive = buildFactCheckDirective({ status: "absent", verifiedAssertions: [] });
    const msg = buildInitialMessage("req", "test-slug", "feat/test-slug", undefined, undefined, directive);
    expect(msg).toContain("test-slug");
    expect(msg).toContain("feat/test-slug");
    expect(msg).not.toContain("{{SLUG}}");
    expect(msg).not.toContain("{{BRANCH}}");
  });

  it("factCheckDirective placed in message when dynamicContext is also provided", () => {
    const dynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: ["change-a", "change-b"],
    };
    const directive = buildFactCheckDirective({ status: "valid", verifiedAssertions: ["x"] });
    const msg = buildInitialMessage("req", "s", "feat/s", dynamicContext, undefined, directive);
    expect(msg).toContain("Fact-Check Attestation Directive");
    expect(msg).toContain("change-a");
  });
});

// ---------------------------------------------------------------------------
// Invariance: existing substrings still present in prompts
// ---------------------------------------------------------------------------
describe("Invariance: REQUEST_REVIEW_SYSTEM_PROMPT still contains required substrings", () => {
  it("contains Code Assertion Fact-Check", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Code Assertion Fact-Check");
  });

  it("contains attestation output description", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Fact-Check Attestation Output");
  });

  it("contains requestHash field description", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("requestHash");
  });

  it("contains codeAssertionsVerified field", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("codeAssertionsVerified");
  });

  it("still has verdict instructions", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("approve");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("needs-discussion");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("reject");
  });

  it("still has Do NOT modify constraint", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/Do NOT modify|read-only/i);
  });
});

describe("Invariance: DESIGN_SYSTEM_PROMPT still contains required substrings", () => {
  it("contains 現状コード断定の検証 section", async () => {
    const { DESIGN_SYSTEM_PROMPT } = await import("../../../src/prompts/design-system.js");
    expect(DESIGN_SYSTEM_PROMPT).toContain("現状コード断定の検証");
  });

  it("contains ok:false + reason stop path", async () => {
    const { DESIGN_SYSTEM_PROMPT } = await import("../../../src/prompts/design-system.js");
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/ok.*false|ok: false/i);
  });

  it("contains attestation-aware guidance", async () => {
    const { DESIGN_SYSTEM_PROMPT } = await import("../../../src/prompts/design-system.js");
    expect(DESIGN_SYSTEM_PROMPT).toContain("Fact-Check Attestation");
  });
});

// ---------------------------------------------------------------------------
// Verdict invariance: RequestReviewStep verdict still derived from findings
// ---------------------------------------------------------------------------
describe("Verdict invariance: attestation does not affect report tool schema", () => {
  it("RequestReviewStep still has reportTool defined", () => {
    expect(RequestReviewStep.reportTool).toBeDefined();
  });

  it("RequestReviewStep.parseResult returns null verdict (uses toolResult path)", () => {
    const deps = makeMinimalDeps();
    const result = RequestReviewStep.parseResult("some content", deps);
    // R4 contract: prose-verdict parse path is dead
    expect(result.verdict).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Invariance: sourceRevision field is present in REQUEST_REVIEW_SYSTEM_PROMPT
// ---------------------------------------------------------------------------
describe("Invariance: REQUEST_REVIEW_SYSTEM_PROMPT sourceRevision field", () => {
  it("contains sourceRevision in JSON shape", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("sourceRevision");
  });

  it("instructs agent to copy verbatim and omit if not instructed", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/verbatim|do NOT recompute/i);
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/omit|if not instructed/i);
  });
});

// ---------------------------------------------------------------------------
// TC-SRC: readSourceRevision
// ---------------------------------------------------------------------------
describe("TC-SRC: readSourceRevision", () => {
  it("returns null in a non-git directory (no exception thrown)", async () => {
    const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), "fca-nongit-"));
    try {
      const result = await readSourceRevision(nonGitDir);
      expect(result).toBeNull();
    } finally {
      await fs.rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it("returns the SHA of the last source commit, not the change folder commit", async () => {
    const gitDir = await fs.mkdtemp(path.join(os.tmpdir(), "fca-srcrev-"));
    try {
      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      };
      const git = (args: string) =>
        execSync(`git ${args}`, { cwd: gitDir, env: gitEnv, stdio: "pipe" });

      git("init");
      git("config user.email test@test.com");
      git("config user.name Test");

      // Commit a source file
      await fs.mkdir(path.join(gitDir, "src"), { recursive: true });
      await fs.writeFile(path.join(gitDir, "src", "main.ts"), "export const y = 2;");
      git("add src/main.ts");
      git('commit -m "add main source"');
      const sourceSha = execSync("git rev-parse HEAD", { cwd: gitDir }).toString().trim();

      // Now commit a change folder file
      await fs.mkdir(path.join(gitDir, "specrunner", "changes", "test-slug"), { recursive: true });
      await fs.writeFile(
        path.join(gitDir, "specrunner", "changes", "test-slug", "state.json"),
        JSON.stringify({ step: "design" }),
      );
      git("add specrunner/changes");
      git('commit -m "request-review: metadata commit"');

      // readSourceRevision should still return the source commit sha (ignores change folder commit)
      const result = await readSourceRevision(gitDir);
      expect(result).toBe(sourceSha);
      // HEAD is now the metadata commit — different from sourceSha
      const head = execSync("git rev-parse HEAD", { cwd: gitDir }).toString().trim();
      expect(head).not.toBe(sourceSha);
    } finally {
      await fs.rm(gitDir, { recursive: true, force: true });
    }
  });

  it("returns null when there are no commits outside the change folder", async () => {
    const gitDir = await fs.mkdtemp(path.join(os.tmpdir(), "fca-srcrev-onlychanges-"));
    try {
      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      };
      const git = (args: string) =>
        execSync(`git ${args}`, { cwd: gitDir, env: gitEnv, stdio: "pipe" });

      git("init");
      git("config user.email test@test.com");
      git("config user.name Test");

      // Only commit a change folder file (no source files)
      await fs.mkdir(path.join(gitDir, "specrunner", "changes", "only-slug"), { recursive: true });
      await fs.writeFile(
        path.join(gitDir, "specrunner", "changes", "only-slug", "request.md"),
        "# Request\nContent",
      );
      git("add specrunner/changes");
      git('commit -m "changes only"');

      // No source commits → should return null (empty output from git rev-list)
      const result = await readSourceRevision(gitDir);
      expect(result).toBeNull();
    } finally {
      await fs.rm(gitDir, { recursive: true, force: true });
    }
  });

  it("exclude pathspec is derived from changesDirRel() (no string literals duplicating the path)", async () => {
    // This is verified by the implementation relying on changesDirRel() import.
    // We confirm functionally: the returned sha changes when a source file is committed,
    // but does NOT change when only the change folder changes.
    const gitDir = await fs.mkdtemp(path.join(os.tmpdir(), "fca-srcrev-pathspec-"));
    try {
      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      };
      const git = (args: string) =>
        execSync(`git ${args}`, { cwd: gitDir, env: gitEnv, stdio: "pipe" });

      git("init");
      git("config user.email test@test.com");
      git("config user.name Test");

      // Source commit
      await fs.mkdir(path.join(gitDir, "lib"), { recursive: true });
      await fs.writeFile(path.join(gitDir, "lib", "util.ts"), "export const z = 3;");
      git("add lib");
      git('commit -m "source"');
      const rev1 = await readSourceRevision(gitDir);
      expect(rev1).not.toBeNull();

      // Change folder commit only — source revision must be unchanged
      await fs.mkdir(path.join(gitDir, "specrunner", "changes", "slug2"), { recursive: true });
      await fs.writeFile(path.join(gitDir, "specrunner", "changes", "slug2", "x.md"), "# X");
      git("add specrunner/changes");
      git('commit -m "change folder only"');
      const rev2 = await readSourceRevision(gitDir);
      expect(rev2).toBe(rev1);

      // Another source commit — source revision must change
      await fs.writeFile(path.join(gitDir, "lib", "util2.ts"), "export const w = 4;");
      git("add lib");
      git('commit -m "another source"');
      const rev3 = await readSourceRevision(gitDir);
      expect(rev3).not.toBeNull();
      expect(rev3).not.toBe(rev1);
    } finally {
      await fs.rm(gitDir, { recursive: true, force: true });
    }
  });
});
