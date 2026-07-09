/**
 * Unit tests for design-topic emission module.
 *
 * T-05: Unit tests — collection, slug derivation, file format, decision併記
 * T-06: Idempotency, degradation, best-effort tests
 * T-07: Integration (emitDesignTopics orchestration)
 */
import { describe, it, expect, vi } from "vitest";
import type { JobState, StepRun, DecisionRecord } from "../../../state/schema.js";
import type { Finding } from "../../../kernel/report-result.js";
import type { ResolvedDesignLayer } from "../../../config/schema.js";
import {
  collectTopicCandidates,
  deriveTopicSlug,
  renderTopicFile,
  emitDesignTopics,
} from "../topic-emission.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function makeEnabledDesignLayer(overrides: Partial<ResolvedDesignLayer> = {}): ResolvedDesignLayer {
  return {
    enabled: true,
    command: "aozu",
    requireCitationTypes: [],
    topicEmission: true,
    ...overrides,
  };
}

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job-id-001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "/specrunner/changes/my-job/request.md",
      title: "Test",
      type: "new-feature",
      slug: "my-job",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "feat/my-job-abc",
    history: [],
    error: null,
    ...overrides,
  } as JobState;
}

function makeStepRun(
  attempt: number,
  findings: Finding[],
): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: {
      verdict: findings.some((f) => f.resolution === "decision-needed") ? "escalated" : "approved",
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
  };
}

function makeDecisionNeedFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "decision-needed",
    file: "src/foo.ts",
    title: "Architecture decision required",
    rationale: "The current design has a structural conflict.",
    options: [
      { label: "Option A", consequence: "Use approach A" },
      { label: "Option B", consequence: "Use approach B" },
    ],
    ...overrides,
  };
}

function makeScopeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "medium",
    resolution: "fixable",
    file: "src/bar.ts",
    title: "Out of scope change",
    rationale: "This finding is out of scope for this request.",
    origin: "scope",
    ...overrides,
  };
}

function makeFixableFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "low",
    resolution: "fixable",
    file: "src/baz.ts",
    title: "Minor fixable issue",
    rationale: "This can be fixed easily.",
    ...overrides,
  };
}

function makeFs(opts: {
  topicsExists?: boolean;
  designExists?: boolean;
  fileExists?: boolean;
} = {}) {
  const { topicsExists = false, designExists = true, fileExists = false } = opts;
  return {
    exists: vi.fn().mockImplementation(async (p: string) => {
      // .md files: fileExists takes priority over directory checks
      if (p.endsWith(".md")) return fileExists;
      // design/topics directory (not a file)
      if (p.endsWith("design/topics")) return topicsExists;
      // design directory
      if (p.endsWith("/design")) return designExists;
      return true;
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSpawn(exitCode = 0) {
  return vi.fn().mockResolvedValue({ exitCode, stdout: "", stderr: "" });
}

// ---------------------------------------------------------------------------
// T-05: collectTopicCandidates
// ---------------------------------------------------------------------------

describe("collectTopicCandidates", () => {
  it("returns decision-needed findings as candidates", () => {
    const finding = makeDecisionNeedFinding();
    const state = makeJobState({
      steps: {
        "spec-review": [makeStepRun(1, [finding])],
      },
    });
    const candidates = collectTopicCandidates(state);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.finding).toEqual(finding);
    expect(candidates[0]!.step).toBe("spec-review");
    expect(candidates[0]!.iteration).toBe(1);
    expect(candidates[0]!.index).toBe(0);
  });

  it("returns origin:scope findings as candidates", () => {
    const finding = makeScopeFinding();
    const state = makeJobState({
      steps: {
        "code-review": [makeStepRun(1, [finding])],
      },
    });
    const candidates = collectTopicCandidates(state);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.finding).toEqual(finding);
  });

  it("excludes fixable findings without scope origin", () => {
    const fixable = makeFixableFinding();
    const state = makeJobState({
      steps: {
        "spec-review": [makeStepRun(1, [fixable])],
      },
    });
    const candidates = collectTopicCandidates(state);
    expect(candidates).toHaveLength(0);
  });

  it("collects both decision-needed and scope findings, excludes fixable", () => {
    const dn = makeDecisionNeedFinding({ title: "DN finding" });
    const scope = makeScopeFinding({ title: "Scope finding" });
    const fixable = makeFixableFinding({ title: "Fixable finding" });
    const state = makeJobState({
      steps: {
        "code-review": [makeStepRun(1, [dn, scope, fixable])],
      },
    });
    const candidates = collectTopicCandidates(state);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.finding.title)).toEqual(["DN finding", "Scope finding"]);
    expect(candidates[0]!.index).toBe(0);
    expect(candidates[1]!.index).toBe(1);
  });

  it("deduplicates by (step, file, line, title): keeps first occurrence", () => {
    const f1 = makeDecisionNeedFinding({ title: "Same issue", file: "src/foo.ts" });
    const f2 = makeDecisionNeedFinding({ title: "Same issue", file: "src/foo.ts" });
    // Same finding in two iterations
    const state = makeJobState({
      steps: {
        "spec-review": [
          makeStepRun(1, [f1]),
          makeStepRun(2, [f2]),
        ],
      },
    });
    const candidates = collectTopicCandidates(state);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.iteration).toBe(1); // First occurrence
  });

  it("uses step name lexicographic ordering", () => {
    const f1 = makeDecisionNeedFinding({ title: "Spec finding", file: "src/spec.ts" });
    const f2 = makeDecisionNeedFinding({ title: "Code finding", file: "src/code.ts" });
    const state = makeJobState({
      steps: {
        "spec-review": [makeStepRun(1, [f1])],
        "code-review": [makeStepRun(1, [f2])],
      },
    });
    const candidates = collectTopicCandidates(state);
    // "code-review" < "spec-review" alphabetically
    expect(candidates[0]!.step).toBe("code-review");
    expect(candidates[1]!.step).toBe("spec-review");
  });

  it("returns empty array when steps is undefined", () => {
    const state = makeJobState({ steps: undefined });
    const candidates = collectTopicCandidates(state);
    expect(candidates).toHaveLength(0);
  });

  it("returns empty array when all findings are fixable", () => {
    const state = makeJobState({
      steps: {
        "spec-review": [makeStepRun(1, [makeFixableFinding(), makeFixableFinding({ file: "src/other.ts", title: "Another" })])],
      },
    });
    const candidates = collectTopicCandidates(state);
    expect(candidates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-05: deriveTopicSlug
// ---------------------------------------------------------------------------

describe("deriveTopicSlug", () => {
  it("returns slug matching the required pattern", () => {
    const slug = deriveTopicSlug("design-topic-emission", "spec-review", 1, 0);
    expect(slug).toMatch(SLUG_REGEX);
  });

  it("produces expected slug for representative input", () => {
    const slug = deriveTopicSlug("design-topic-emission", "spec-review", 1, 0);
    expect(slug).toBe("design-topic-emission-spec-review-1-0");
  });

  it("normalizes step names with special chars", () => {
    // Steps could have underscores or other non-standard chars
    const slug = deriveTopicSlug("my-job", "custom_reviewer", 2, 3);
    expect(slug).toMatch(SLUG_REGEX);
    expect(slug).toBe("my-job-custom-reviewer-2-3");
  });

  it("is deterministic: same input → same output", () => {
    const a = deriveTopicSlug("job-abc", "code-review", 1, 0);
    const b = deriveTopicSlug("job-abc", "code-review", 1, 0);
    expect(a).toBe(b);
  });

  it("different inputs produce different slugs", () => {
    const a = deriveTopicSlug("job-abc", "spec-review", 1, 0);
    const b = deriveTopicSlug("job-abc", "spec-review", 1, 1);
    expect(a).not.toBe(b);
  });

  it("strips consecutive hyphens", () => {
    // slug with dashes + step starting with dash
    const slug = deriveTopicSlug("a", "b", 1, 0);
    expect(slug).not.toContain("--");
  });

  it("does not start or end with a hyphen", () => {
    const slug = deriveTopicSlug("job", "step", 1, 0);
    expect(slug).not.toMatch(/^-|-$/);
  });
});

// ---------------------------------------------------------------------------
// T-05: renderTopicFile
// ---------------------------------------------------------------------------

describe("renderTopicFile", () => {
  it("produces flat frontmatter with id and source", () => {
    const finding = makeDecisionNeedFinding();
    const output = renderTopicFile({
      slug: "my-job-spec-review-1-0",
      jobSlug: "my-job",
      step: "spec-review",
      iteration: 1,
      index: 0,
      finding,
      decisions: undefined,
    });
    expect(output).toContain("---\n");
    expect(output).toContain("id: top-my-job-spec-review-1-0");
    expect(output).toContain("source: specrunner:my-job/spec-review-1#0");
    // Flat frontmatter: no nested objects, no multiline values
    const frontmatterMatch = output.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).toBeTruthy();
    const frontmatter = frontmatterMatch![1]!;
    expect(frontmatter).not.toContain("{");
    expect(frontmatter).not.toContain("[");
  });

  it("includes title and rationale in body", () => {
    const finding = makeDecisionNeedFinding({
      title: "My special decision",
      rationale: "This is the rationale text.",
    });
    const output = renderTopicFile({
      slug: "slug-1",
      jobSlug: "job-1",
      step: "spec-review",
      iteration: 1,
      index: 0,
      finding,
      decisions: undefined,
    });
    expect(output).toContain("## My special decision");
    expect(output).toContain("This is the rationale text.");
  });

  it("includes severity, step, file in context section", () => {
    const finding = makeDecisionNeedFinding({
      severity: "critical",
      file: "src/core/foo.ts",
    });
    const output = renderTopicFile({
      slug: "slug-1",
      jobSlug: "job-1",
      step: "spec-review",
      iteration: 1,
      index: 0,
      finding,
      decisions: undefined,
    });
    expect(output).toContain("**severity**: critical");
    expect(output).toContain("**step**: spec-review");
    expect(output).toContain("**file**: src/core/foo.ts");
  });

  it("includes line number in file reference when present", () => {
    const finding = makeDecisionNeedFinding({ file: "src/foo.ts", line: 42 });
    const output = renderTopicFile({
      slug: "slug-1",
      jobSlug: "job-1",
      step: "spec-review",
      iteration: 1,
      index: 0,
      finding,
      decisions: undefined,
    });
    expect(output).toContain("**file**: src/foo.ts:42");
  });

  it("does NOT include decision section when no decisions", () => {
    const finding = makeDecisionNeedFinding();
    const output = renderTopicFile({
      slug: "slug-1",
      jobSlug: "job-1",
      step: "spec-review",
      iteration: 1,
      index: 0,
      finding,
      decisions: undefined,
    });
    expect(output).not.toContain("暫定裁定");
  });

  it("does NOT include decision section when no matching decision", () => {
    const finding = makeDecisionNeedFinding({ title: "No match" });
    const decisions: DecisionRecord[] = [
      {
        id: "decision-001",
        step: "spec-review",
        findingKey: "spec-review|src/other.ts||different title|different rationale",
        finding: {
          title: "Different title",
          file: "src/other.ts",
          rationale: "different rationale",
          severity: "high",
        },
        selectedOption: { number: 1, label: "Option A", consequence: "Do this" },
        decidedAt: "2026-01-01T00:00:00.000Z",
        source: "issue-comment",
      },
    ];
    const output = renderTopicFile({
      slug: "slug-1",
      jobSlug: "job-1",
      step: "spec-review",
      iteration: 1,
      index: 0,
      finding,
      decisions,
    });
    expect(output).not.toContain("暫定裁定");
  });

  it("includes decision section with label and consequence when match found", () => {
    const finding: Finding = {
      severity: "high",
      resolution: "decision-needed",
      file: "src/foo.ts",
      title: "Architecture decision required",
      rationale: "The current design has a structural conflict.",
    };
    // computeFindingKey: `step|file|line|normalized-title|normalized-rationale`
    const step = "spec-review";
    const file = "src/foo.ts";
    const line = "";
    const title = "architecture decision required";
    const rationale = "the current design has a structural conflict.";
    const findingKey = `${step}|${file}|${line}|${title}|${rationale}`;

    const decisions: DecisionRecord[] = [
      {
        id: "decision-001",
        step,
        findingKey,
        finding: {
          title: "Architecture decision required",
          file: "src/foo.ts",
          rationale: "The current design has a structural conflict.",
          severity: "high",
        },
        selectedOption: { number: 1, label: "Option A: keep it", consequence: "The system stays stable." },
        decidedAt: "2026-01-01T00:00:00.000Z",
        source: "issue-comment",
      },
    ];
    const output = renderTopicFile({
      slug: "slug-1",
      jobSlug: "job-1",
      step,
      iteration: 1,
      index: 0,
      finding,
      decisions,
    });
    expect(output).toContain("暫定裁定（提案であって決定ではない）");
    expect(output).toContain("**label**: Option A: keep it");
    expect(output).toContain("**consequence**: The system stays stable.");
  });
});

// ---------------------------------------------------------------------------
// T-06: emitDesignTopics — degradation tests
// ---------------------------------------------------------------------------

describe("emitDesignTopics — degradation", () => {
  it("returns skipped when designLayer.enabled is false", async () => {
    const fs = makeFs();
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const result = await emitDesignTopics({
      slug: "my-job",
      state: makeJobState({ steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] } }),
      designLayer: makeEnabledDesignLayer({ enabled: false }),
      recordDir: "/repo",
      spawn,
      fs,
      stdoutWrite,
      stderrWrite,
    });

    expect(result.status).toBe("skipped");
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it("returns skipped when topicEmission is false", async () => {
    const fs = makeFs();
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const result = await emitDesignTopics({
      slug: "my-job",
      state: makeJobState({ steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] } }),
      designLayer: makeEnabledDesignLayer({ topicEmission: false }),
      recordDir: "/repo",
      spawn,
      fs,
      stdoutWrite,
      stderrWrite,
    });

    expect(result.status).toBe("skipped");
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it("returns skipped when design/ directory does not exist", async () => {
    const fs = makeFs({ designExists: false });
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const result = await emitDesignTopics({
      slug: "my-job",
      state: makeJobState({ steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] } }),
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs,
      stdoutWrite,
      stderrWrite,
    });

    expect(result.status).toBe("skipped");
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it("returns skipped when there are no topic candidates", async () => {
    const fs = makeFs({ designExists: true, topicsExists: true });
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const result = await emitDesignTopics({
      slug: "my-job",
      state: makeJobState({ steps: { "spec-review": [makeStepRun(1, [makeFixableFinding()])] } }),
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs,
      stdoutWrite,
      stderrWrite,
    });

    expect(result.status).toBe("skipped");
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-06: emitDesignTopics — topics/ directory creation
// ---------------------------------------------------------------------------

describe("emitDesignTopics — directory creation", () => {
  it("creates design/topics/ when it does not exist", async () => {
    const fs = makeFs({ designExists: true, topicsExists: false, fileExists: false });
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const state = makeJobState({
      steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] },
    });

    const result = await emitDesignTopics({
      slug: "my-job",
      state,
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs,
      stdoutWrite,
      stderrWrite,
    });

    expect(result.status).toBe("emitted");
    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("design/topics"),
      { recursive: true },
    );
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it("does not call mkdir when design/topics/ already exists", async () => {
    const fs = makeFs({ designExists: true, topicsExists: true, fileExists: false });
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const state = makeJobState({
      steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] },
    });

    await emitDesignTopics({
      slug: "my-job",
      state,
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs,
      stdoutWrite,
      stderrWrite,
    });

    expect(fs.mkdir).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-06: emitDesignTopics — idempotency
// ---------------------------------------------------------------------------

describe("emitDesignTopics — idempotency", () => {
  it("does not overwrite existing topic file", async () => {
    // fileExists = true → all .md files already exist
    const fs = makeFs({ designExists: true, topicsExists: true, fileExists: true });
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const state = makeJobState({
      steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] },
    });

    const result = await emitDesignTopics({
      slug: "my-job",
      state,
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs,
      stdoutWrite,
      stderrWrite,
    });

    // All files exist → 0 new files written → skipped
    expect(result.status).toBe("skipped");
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-06: emitDesignTopics — best-effort (no throw on error)
// ---------------------------------------------------------------------------

describe("emitDesignTopics — best-effort error handling", () => {
  it("does not throw when writeFile fails; emits warning", async () => {
    const customFs = {
      exists: vi.fn().mockImplementation(async (p: string) => {
        if (p.endsWith(".md")) return false;
        return true; // design/ and design/topics/ exist
      }),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockRejectedValue(new Error("EACCES")),
    };
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const state = makeJobState({
      steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] },
    });

    // Should not throw
    await expect(
      emitDesignTopics({
        slug: "my-job",
        state,
        designLayer: makeEnabledDesignLayer(),
        recordDir: "/repo",
        spawn,
        fs: customFs,
        stdoutWrite,
        stderrWrite,
      }),
    ).resolves.toBeDefined();

    // Warning should have been emitted
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("Warning"),
    );
  });

  it("does not throw when git add fails; emits warning", async () => {
    const customFs = makeFs({ designExists: true, topicsExists: true, fileExists: false });
    const spawn = vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "fatal: not a git repo" });
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const state = makeJobState({
      steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] },
    });

    await expect(
      emitDesignTopics({
        slug: "my-job",
        state,
        designLayer: makeEnabledDesignLayer(),
        recordDir: "/repo",
        spawn,
        fs: customFs,
        stdoutWrite,
        stderrWrite,
      }),
    ).resolves.toBeDefined();

    // Should have emitted warning about git add failure
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("git add"),
    );
  });
});

// ---------------------------------------------------------------------------
// T-07: emitDesignTopics — integration
// ---------------------------------------------------------------------------

describe("emitDesignTopics — integration", () => {
  it("writes topic file and calls git add for decision-needed finding", async () => {
    const customFs = makeFs({ designExists: true, topicsExists: false, fileExists: false });
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const finding = makeDecisionNeedFinding();
    const state = makeJobState({
      steps: { "spec-review": [makeStepRun(1, [finding])] },
    });

    const result = await emitDesignTopics({
      slug: "my-job",
      state,
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs: customFs,
      stdoutWrite,
      stderrWrite,
    });

    expect(result.status).toBe("emitted");
    if (result.status === "emitted") {
      expect(result.count).toBe(1);
      expect(result.dir).toContain("design/topics");
    }

    // writeFile was called with a path containing design/topics/
    expect(customFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("design/topics/"),
      expect.stringContaining("id: top-"),
    );

    // git add was called
    expect(spawn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["add", "--", "design/topics"]),
      expect.any(Object),
    );

    // Summary was emitted
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("design topic"),
    );
  });

  it("writes topic file and calls git add for scope finding", async () => {
    const customFs = makeFs({ designExists: true, topicsExists: true, fileExists: false });
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const finding = makeScopeFinding();
    const state = makeJobState({
      steps: { "code-review": [makeStepRun(1, [finding])] },
    });

    const result = await emitDesignTopics({
      slug: "my-job",
      state,
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs: customFs,
      stdoutWrite,
      stderrWrite,
    });

    expect(result.status).toBe("emitted");
    expect(customFs.writeFile).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["add", "--", "design/topics"]),
      expect.any(Object),
    );
  });

  it("does not call git add when no new files are written", async () => {
    // All existing
    const customFs = makeFs({ designExists: true, topicsExists: true, fileExists: true });
    const spawn = makeSpawn();
    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    const state = makeJobState({
      steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] },
    });

    await emitDesignTopics({
      slug: "my-job",
      state,
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs: customFs,
      stdoutWrite,
      stderrWrite,
    });

    expect(spawn).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it("generates correct slug regex for written file path", async () => {
    const writtenPaths: string[] = [];
    const customFs = {
      exists: vi.fn().mockImplementation(async (p: string) => {
        if (p.endsWith(".md")) return false;
        return true;
      }),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockImplementation(async (p: string) => {
        writtenPaths.push(p);
      }),
    };
    const spawn = makeSpawn();

    const state = makeJobState({
      steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] },
    });

    await emitDesignTopics({
      slug: "my-job",
      state,
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn,
      fs: customFs,
      stdoutWrite: vi.fn(),
      stderrWrite: vi.fn(),
    });

    expect(writtenPaths).toHaveLength(1);
    const filename = writtenPaths[0]!.split("/").pop()!.replace(/\.md$/, "");
    expect(filename).toMatch(SLUG_REGEX);
  });

  it("emits summary only when at least 1 file is written", async () => {
    const stdoutWrite = vi.fn();

    // Case 1: nothing written (no candidates)
    const fs1 = makeFs({ designExists: true, topicsExists: true, fileExists: false });
    await emitDesignTopics({
      slug: "my-job",
      state: makeJobState({ steps: { "spec-review": [makeStepRun(1, [makeFixableFinding()])] } }),
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn: makeSpawn(),
      fs: fs1,
      stdoutWrite,
      stderrWrite: vi.fn(),
    });
    expect(stdoutWrite).not.toHaveBeenCalled();

    // Case 2: one file written
    const fs2 = makeFs({ designExists: true, topicsExists: true, fileExists: false });
    await emitDesignTopics({
      slug: "my-job",
      state: makeJobState({ steps: { "spec-review": [makeStepRun(1, [makeDecisionNeedFinding()])] } }),
      designLayer: makeEnabledDesignLayer(),
      recordDir: "/repo",
      spawn: makeSpawn(),
      fs: fs2,
      stdoutWrite,
      stderrWrite: vi.fn(),
    });
    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining("1"));
  });
});
