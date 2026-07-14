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
import {
  hashRequestContent,
  buildFactCheckAttestation,
  parseFactCheckAttestation,
  evaluateFactCheckAttestation,
  buildFactCheckDirective,
} from "../../../src/core/factcheck-attestation.js";
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
});

// ---------------------------------------------------------------------------
// TC-FCA-04: evaluateFactCheckAttestation
// ---------------------------------------------------------------------------
describe("TC-FCA-04: evaluateFactCheckAttestation — valid / stale / absent", () => {
  const REQUEST = "# My request\nsome content";
  const HASH = hashRequestContent(REQUEST);

  function validAttestationJson(
    requestHash = HASH,
    codeAssertionsVerified = true,
    verifiedAssertions = ["src/foo.ts:1"],
  ) {
    return JSON.stringify({ requestHash, codeAssertionsVerified, verifiedAssertions });
  }

  it("returns 'valid' when attestation parses, codeAssertionsVerified is true, and hash matches", () => {
    const result = evaluateFactCheckAttestation(validAttestationJson(), REQUEST);
    expect(result.status).toBe("valid");
    expect(result.verifiedAssertions).toEqual(["src/foo.ts:1"]);
  });

  it("returns 'absent' when attestationRaw is null", () => {
    const result = evaluateFactCheckAttestation(null, REQUEST);
    expect(result.status).toBe("absent");
    expect(result.verifiedAssertions).toEqual([]);
  });

  it("returns 'absent' when attestationRaw is unparseable", () => {
    const result = evaluateFactCheckAttestation("not json {", REQUEST);
    expect(result.status).toBe("absent");
    expect(result.verifiedAssertions).toEqual([]);
  });

  it("returns 'stale' when hash does not match current request content", () => {
    const attestation = validAttestationJson(hashRequestContent("old content"));
    const result = evaluateFactCheckAttestation(attestation, REQUEST);
    expect(result.status).toBe("stale");
    expect(result.verifiedAssertions).toEqual([]);
  });

  it("returns 'stale' when codeAssertionsVerified is false", () => {
    const attestation = validAttestationJson(HASH, false);
    const result = evaluateFactCheckAttestation(attestation, REQUEST);
    expect(result.status).toBe("stale");
    expect(result.verifiedAssertions).toEqual([]);
  });

  it("returns 'stale' with empty verifiedAssertions (not the attestation's list)", () => {
    const attestation = validAttestationJson(hashRequestContent("different"), true, ["x", "y"]);
    const result = evaluateFactCheckAttestation(attestation, REQUEST);
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
    expect(enriched.gitLog).toBe("some log");
    expect(enriched.changesList).toEqual(["foo"]);
  });
});

// ---------------------------------------------------------------------------
// TC-FCA-09: DesignStep.enrichContext — valid/stale/absent
// ---------------------------------------------------------------------------
describe("TC-FCA-09: DesignStep.enrichContext — valid / stale / absent", () => {
  it("returns 'valid' evaluation when attestation hash matches request.md", async () => {
    const slug = "design-valid-test";
    const requestContent = "# Request\nsome design request content";
    const attestation = buildFactCheckAttestation(requestContent, ["src/foo.ts:1"]);
    await setupChangeFolder(slug, requestContent, JSON.stringify(attestation));

    const baseContext = { gitLog: "", diffStat: "", changesList: [] };
    const enriched = await DesignStep.enrichContext!(baseContext, tempDir, slug);

    expect(enriched.factCheckAttestation?.status).toBe("valid");
    expect(enriched.factCheckAttestation?.verifiedAssertions).toEqual(["src/foo.ts:1"]);
  });

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
