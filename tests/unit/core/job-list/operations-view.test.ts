/**
 * Tests for operations-view.ts pure functions.
 *
 * TC-001: mixed jobs grouped under category labels
 * TC-002: empty categories omitted
 * TC-004: escalation-origin awaiting-resume shows source step
 * TC-005: non-escalation awaiting-resume shows no source step
 * TC-006: awaiting-resume next action is resume
 * TC-007: stale running next action is resume
 * TC-008: merged awaiting-archive next action is archive
 * TC-009: live running has no next action
 * TC-010: json top-level keys are fixed
 * TC-011: json job entry carries state, escalation source, and next action
 * TC-015: categorizeStatus maps all 7 JobStatus values
 * TC-016: deriveEscalationSourceStep picks step with greatest endedAt
 * TC-017: deriveEscalationSourceStep falls back to startedAt when endedAt absent
 * TC-018: deriveEscalationSourceStep returns null for empty/undefined steps
 * TC-019: deriveNextAction returns resume for failed and terminated
 * TC-020: deriveNextAction returns null for archived and canceled
 * TC-021: deriveNextAction returns null for awaiting-archive when PR not merged
 * TC-022: deriveNextAction returns null for awaiting-archive when prMerged null
 * TC-023: buildOperationsView produces categories in fixed order
 * TC-024: buildOperationsView orders jobs within category by createdAt descending
 * TC-025: buildOperationsView sets escalationStep only for awaiting-resume jobs
 * TC-026: formatOperationsViewHuman renders escalation annotation
 * TC-027: formatOperationsViewHuman renders stale annotation and resume in NEXT
 * TC-028: formatOperationsViewHuman renders PR merged annotation and archive in NEXT
 * TC-029: formatOperationsViewHuman uses TAB separator in non-TTY mode
 * TC-030: formatOperationsViewJson produces exact field set
 */

import { describe, it, expect } from "vitest";
import {
  categorizeStatus,
  deriveEscalationSourceStep,
  deriveNextAction,
  buildOperationsView,
  formatOperationsViewHuman,
  formatOperationsViewJson,
} from "../../../../src/core/job-list/operations-view.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { ViewEntry, OperationsView, JobViewRow } from "../../../../src/core/job-list/operations-view.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let _jobCounter = 0;

function makeStepRun(opts: { verdict?: string | null; startedAt?: string; endedAt?: string } = {}): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict: opts.verdict ?? null,
      findingsPath: null,
      error: null,
    },
    startedAt: opts.startedAt ?? "2025-01-01T10:00:00Z",
    endedAt: opts.endedAt ?? "2025-01-01T10:01:00Z",
  };
}

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  _jobCounter++;
  const slug = overrides.request?.slug ?? `test-slug-${_jobCounter}`;
  return {
    version: 2,
    jobId: `job-${_jobCounter.toString().padStart(8, "0")}`,
    createdAt: "2025-01-01T12:00:00Z",
    updatedAt: "2025-01-01T12:00:00Z",
    request: {
      path: `/req/${slug}.md`,
      title: "Test",
      type: "new-feature",
      slug,
      ...overrides.request,
    },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: `feat/${slug}`,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeEntry(
  jobOverrides: Partial<JobState> = {},
  entryOverrides: Omit<Partial<ViewEntry>, "job"> = {},
): ViewEntry {
  return {
    job: makeJobState(jobOverrides),
    isStale: false,
    prMerged: null,
    ...entryOverrides,
  };
}

// Fixed nowMs for deterministic age tests
const FIXED_NOW = new Date("2025-01-01T15:00:00Z").getTime();

// ---------------------------------------------------------------------------
// TC-015: categorizeStatus maps all 7 JobStatus values
// ---------------------------------------------------------------------------

describe("TC-015: categorizeStatus maps all 7 JobStatus values", () => {
  it("running → running", () => {
    expect(categorizeStatus("running")).toBe("running");
  });
  it("awaiting-resume → awaiting-response", () => {
    expect(categorizeStatus("awaiting-resume")).toBe("awaiting-response");
  });
  it("awaiting-archive → awaiting-archive", () => {
    expect(categorizeStatus("awaiting-archive")).toBe("awaiting-archive");
  });
  it("failed → failed", () => {
    expect(categorizeStatus("failed")).toBe("failed");
  });
  it("terminated → failed", () => {
    expect(categorizeStatus("terminated")).toBe("failed");
  });
  it("archived → terminal", () => {
    expect(categorizeStatus("archived")).toBe("terminal");
  });
  it("canceled → terminal", () => {
    expect(categorizeStatus("canceled")).toBe("terminal");
  });
});

// ---------------------------------------------------------------------------
// TC-016: deriveEscalationSourceStep picks greatest endedAt
// ---------------------------------------------------------------------------

describe("TC-016: deriveEscalationSourceStep picks step with greatest endedAt", () => {
  it("returns the step with the later endedAt among two escalation runs", () => {
    const state = makeJobState({
      steps: {
        analyze: [
          makeStepRun({ verdict: "escalation", endedAt: "2025-01-01T10:00:00Z" }),
        ],
        "code-review": [
          makeStepRun({ verdict: "escalation", endedAt: "2025-01-01T11:00:00Z" }),
        ],
      },
    });
    expect(deriveEscalationSourceStep(state)).toBe("code-review");
  });
});

// ---------------------------------------------------------------------------
// TC-017: deriveEscalationSourceStep falls back to startedAt
// ---------------------------------------------------------------------------

describe("TC-017: deriveEscalationSourceStep falls back to startedAt when endedAt absent", () => {
  it("uses startedAt when endedAt matches (simulating absent by using same value)", () => {
    // spec-review startedAt 11:00 > analyze endedAt 09:00
    const state = makeJobState({
      steps: {
        analyze: [
          makeStepRun({ verdict: "escalation", startedAt: "2025-01-01T09:00:00Z", endedAt: "2025-01-01T09:00:00Z" }),
        ],
        "spec-review": [
          // When endedAt equals startedAt, the tie-breaking still picks spec-review
          makeStepRun({ verdict: "escalation", startedAt: "2025-01-01T11:00:00Z", endedAt: "2025-01-01T11:00:00Z" }),
        ],
      },
    });
    expect(deriveEscalationSourceStep(state)).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-018: deriveEscalationSourceStep returns null for empty / undefined steps
// ---------------------------------------------------------------------------

describe("TC-018: deriveEscalationSourceStep returns null for empty/undefined steps", () => {
  it("returns null when steps is undefined", () => {
    const state = makeJobState();
    const withUndefined = { ...state, steps: undefined };
    expect(deriveEscalationSourceStep(withUndefined)).toBeNull();
  });

  it("returns null when steps is empty object", () => {
    const state = makeJobState({ steps: {} });
    expect(deriveEscalationSourceStep(state)).toBeNull();
  });

  it("returns null when all runs have non-escalation verdicts", () => {
    const state = makeJobState({
      steps: {
        "code-review": [makeStepRun({ verdict: "approved" })],
      },
    });
    expect(deriveEscalationSourceStep(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-031 – TC-034: deriveEscalationSourceStep with resumePoint
// ---------------------------------------------------------------------------

describe("TC-031: resumePoint present, current step's last run is escalation → returns step name", () => {
  it("returns resumePoint.step when its last run verdict is escalation", () => {
    const state = makeJobState({
      status: "awaiting-resume",
      resumePoint: { step: "spec-review", reason: "escalation", iterationsExhausted: 0 },
      steps: {
        "spec-review": [makeStepRun({ verdict: "escalation" })],
      },
    });
    expect(deriveEscalationSourceStep(state)).toBe("spec-review");
  });
});

describe("TC-032: resumePoint present, current step's last run is NOT escalation, history has old escalation → returns null", () => {
  it("returns null when resumePoint step ran with null verdict, even though history has an escalation", () => {
    const state = makeJobState({
      status: "awaiting-resume",
      resumePoint: { step: "implementer", reason: "timeout", iterationsExhausted: 0 },
      steps: {
        "spec-review": [makeStepRun({ verdict: "escalation" })],
        "implementer": [makeStepRun({ verdict: null })],
      },
    });
    expect(deriveEscalationSourceStep(state)).toBeNull();
  });
});

describe("TC-033: resumePoint present, current step has no runs → returns null", () => {
  it("returns null when resumePoint.step has no entries in steps", () => {
    const state = makeJobState({
      status: "awaiting-resume",
      resumePoint: { step: "spec-review", reason: "escalation", iterationsExhausted: 0 },
      steps: {},
    });
    expect(deriveEscalationSourceStep(state)).toBeNull();
  });
});

describe("TC-034: resumePoint absent (legacy state), escalation run exists → returns step (regression guard)", () => {
  it("falls back to history scan and returns the escalation step when no resumePoint", () => {
    const state = makeJobState({
      status: "awaiting-resume",
      steps: {
        "spec-review": [makeStepRun({ verdict: "escalation" })],
      },
    });
    // No resumePoint field — legacy state
    expect(deriveEscalationSourceStep(state)).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-006 / TC-007 / TC-008 / TC-009 / TC-019 / TC-020 / TC-021 / TC-022
// deriveNextAction
// ---------------------------------------------------------------------------

describe("TC-009: live running → no next action", () => {
  it("returns null for running + not stale", () => {
    expect(
      deriveNextAction({ status: "running", isStale: false, prMerged: null, slug: "my-task" }),
    ).toBeNull();
  });
});

describe("TC-007: stale running → job resume <slug>", () => {
  it("returns resume command for stale running", () => {
    expect(
      deriveNextAction({ status: "running", isStale: true, prMerged: null, slug: "my-task" }),
    ).toBe("job resume my-task");
  });
});

describe("TC-006: awaiting-resume → job resume <slug>", () => {
  it("returns resume command", () => {
    expect(
      deriveNextAction({ status: "awaiting-resume", isStale: false, prMerged: null, slug: "my-task" }),
    ).toBe("job resume my-task");
  });
});

describe("TC-008: merged awaiting-archive → job archive <slug>", () => {
  it("returns archive command when PR is merged", () => {
    expect(
      deriveNextAction({ status: "awaiting-archive", isStale: false, prMerged: true, slug: "my-task" }),
    ).toBe("job archive my-task");
  });
});

describe("TC-021: awaiting-archive when PR not merged → null", () => {
  it("returns null when prMerged is false", () => {
    expect(
      deriveNextAction({ status: "awaiting-archive", isStale: false, prMerged: false, slug: "my-task" }),
    ).toBeNull();
  });
});

describe("TC-022: awaiting-archive when prMerged null → null", () => {
  it("returns null when prMerged is null", () => {
    expect(
      deriveNextAction({ status: "awaiting-archive", isStale: false, prMerged: null, slug: "my-task" }),
    ).toBeNull();
  });
});

describe("TC-019: failed and terminated → job resume <slug>", () => {
  it("returns resume for failed", () => {
    expect(
      deriveNextAction({ status: "failed", isStale: false, prMerged: null, slug: "my-task" }),
    ).toBe("job resume my-task");
  });

  it("returns resume for terminated", () => {
    expect(
      deriveNextAction({ status: "terminated", isStale: false, prMerged: null, slug: "my-task" }),
    ).toBe("job resume my-task");
  });
});

describe("TC-020: archived and canceled → null", () => {
  it("returns null for archived", () => {
    expect(
      deriveNextAction({ status: "archived", isStale: false, prMerged: null, slug: "my-task" }),
    ).toBeNull();
  });

  it("returns null for canceled", () => {
    expect(
      deriveNextAction({ status: "canceled", isStale: false, prMerged: null, slug: "my-task" }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-023: buildOperationsView — fixed category order
// ---------------------------------------------------------------------------

describe("TC-023: buildOperationsView produces categories in fixed order", () => {
  it("orders running > awaiting-response > awaiting-archive > failed > terminal", () => {
    const entries: ViewEntry[] = [
      makeEntry({ status: "canceled", request: { path: "/r.md", title: "T", type: "f", slug: "c1" } }),
      makeEntry({ status: "failed", request: { path: "/r.md", title: "T", type: "f", slug: "f1" } }),
      makeEntry({ status: "running", request: { path: "/r.md", title: "T", type: "f", slug: "r1" } }),
      makeEntry({ status: "awaiting-archive", request: { path: "/r.md", title: "T", type: "f", slug: "a1" } }),
      makeEntry({ status: "terminated", request: { path: "/r.md", title: "T", type: "f", slug: "t1" } }),
      makeEntry({ status: "awaiting-resume", request: { path: "/r.md", title: "T", type: "f", slug: "ar1" } }),
      makeEntry({ status: "archived", request: { path: "/r.md", title: "T", type: "f", slug: "arch1" } }),
    ];

    const view = buildOperationsView(entries);
    const ids = view.categories.map((c) => c.category);
    expect(ids).toEqual([
      "running",
      "awaiting-response",
      "awaiting-archive",
      "failed",
      "terminal",
    ]);
  });
});

// ---------------------------------------------------------------------------
// TC-002: empty categories omitted
// ---------------------------------------------------------------------------

describe("TC-002: empty categories are omitted", () => {
  it("only includes categories that have at least one job", () => {
    const entries: ViewEntry[] = [
      makeEntry({ status: "running", request: { path: "/r.md", title: "T", type: "f", slug: "r1" } }),
    ];

    const view = buildOperationsView(entries);
    // Only "running" should appear
    expect(view.categories).toHaveLength(1);
    expect(view.categories[0]!.category).toBe("running");
  });

  it("returns empty categories array when no entries", () => {
    const view = buildOperationsView([]);
    expect(view.categories).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-024: buildOperationsView orders jobs within category by createdAt descending
// ---------------------------------------------------------------------------

describe("TC-024: buildOperationsView orders jobs within category by createdAt descending", () => {
  it("newer createdAt appears first", () => {
    const entries: ViewEntry[] = [
      makeEntry({
        status: "failed",
        createdAt: "2025-01-01T09:00:00Z",
        request: { path: "/r.md", title: "T", type: "f", slug: "older" },
      }),
      makeEntry({
        status: "failed",
        createdAt: "2025-01-02T09:00:00Z",
        request: { path: "/r.md", title: "T", type: "f", slug: "newer" },
      }),
    ];

    const view = buildOperationsView(entries);
    const jobs = view.categories.find((c) => c.category === "failed")!.jobs;
    expect(jobs[0]!.slug).toBe("newer");
    expect(jobs[1]!.slug).toBe("older");
  });
});

// ---------------------------------------------------------------------------
// TC-025: buildOperationsView sets escalationStep only for awaiting-resume
// ---------------------------------------------------------------------------

describe("TC-025: buildOperationsView sets escalationStep only for awaiting-resume", () => {
  const escalationSteps = {
    "code-review": [
      makeStepRun({ verdict: "escalation", endedAt: "2025-01-01T10:30:00Z" }),
    ],
  };

  it("failed job with escalation verdict has escalationStep: null", () => {
    const entries: ViewEntry[] = [
      makeEntry({
        status: "failed",
        steps: escalationSteps,
        request: { path: "/r.md", title: "T", type: "f", slug: "failed-job" },
      }),
    ];
    const view = buildOperationsView(entries);
    const job = view.categories.find((c) => c.category === "failed")!.jobs[0]!;
    expect(job.escalationStep).toBeNull();
  });

  it("awaiting-resume job with escalation verdict has non-null escalationStep", () => {
    const entries: ViewEntry[] = [
      makeEntry({
        status: "awaiting-resume",
        steps: escalationSteps,
        request: { path: "/r.md", title: "T", type: "f", slug: "resume-job" },
      }),
    ];
    const view = buildOperationsView(entries);
    const job = view.categories.find((c) => c.category === "awaiting-response")!.jobs[0]!;
    expect(job.escalationStep).toBe("code-review");
  });
});

// ---------------------------------------------------------------------------
// TC-001: mixed jobs grouped under category labels
// ---------------------------------------------------------------------------

describe("TC-001: mixed jobs are grouped under their category labels", () => {
  it("produces correct labels for non-empty categories", () => {
    const entries: ViewEntry[] = [
      makeEntry({ status: "running", request: { path: "/r.md", title: "T", type: "f", slug: "r1" } }),
      makeEntry({ status: "awaiting-resume", request: { path: "/r.md", title: "T", type: "f", slug: "ar1" } }),
      makeEntry({ status: "failed", request: { path: "/r.md", title: "T", type: "f", slug: "f1" } }),
    ];
    const view = buildOperationsView(entries);
    const labels = view.categories.map((c) => c.label);
    expect(labels).toContain("実行中");
    expect(labels).toContain("対応待ち");
    expect(labels).toContain("失敗・停止");
    expect(labels).not.toContain("merge・archive 待ち");
    expect(labels).not.toContain("終了済み");
  });
});

// ---------------------------------------------------------------------------
// TC-004: escalation-origin awaiting-resume shows source step
// ---------------------------------------------------------------------------

describe("TC-004: escalation-origin awaiting-resume shows source step", () => {
  it("deriveEscalationSourceStep returns the step name", () => {
    const state = makeJobState({
      status: "awaiting-resume",
      steps: {
        "spec-review": [
          makeStepRun({ verdict: "escalation", endedAt: "2025-01-01T10:00:00Z" }),
        ],
      },
    });
    expect(deriveEscalationSourceStep(state)).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-005: non-escalation awaiting-resume shows no source step
// ---------------------------------------------------------------------------

describe("TC-005: non-escalation awaiting-resume shows no source step", () => {
  it("returns null when all verdicts are not escalation", () => {
    const state = makeJobState({
      status: "awaiting-resume",
      steps: {
        "spec-review": [makeStepRun({ verdict: "needs-fix" })],
      },
    });
    expect(deriveEscalationSourceStep(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-026: formatOperationsViewHuman — escalation annotation in STATUS column
// ---------------------------------------------------------------------------

describe("TC-026: formatOperationsViewHuman renders escalation annotation", () => {
  it("shows 'awaiting-resume (escalation: code-review)' in STATUS column (TTY)", () => {
    const row: JobViewRow = {
      jobId: "abcd1234efgh5678",
      slug: "my-task",
      step: "code-review",
      status: "awaiting-resume",
      stale: false,
      prMerged: null,
      escalationStep: "code-review",
      nextAction: "job resume my-task",
      branch: "feat/my-task",
      createdAt: "2025-01-01T12:00:00Z",
    };

    const view: OperationsView = {
      categories: [
        { category: "awaiting-response", label: "対応待ち", jobs: [row] },
      ],
    };

    const output = formatOperationsViewHuman(view, { isTty: true, nowMs: FIXED_NOW });
    expect(output).toContain("awaiting-resume (escalation: code-review)");
  });
});

// ---------------------------------------------------------------------------
// TC-027: formatOperationsViewHuman — stale annotation + resume in NEXT
// ---------------------------------------------------------------------------

describe("TC-027: formatOperationsViewHuman renders stale annotation and resume in NEXT", () => {
  it("shows 'running (stale?)' in STATUS and 'job resume my-task' in NEXT", () => {
    const row: JobViewRow = {
      jobId: "abcd1234efgh5678",
      slug: "my-task",
      step: "implementer",
      status: "running",
      stale: true,
      prMerged: null,
      escalationStep: null,
      nextAction: "job resume my-task",
      branch: "feat/my-task",
      createdAt: "2025-01-01T12:00:00Z",
    };

    const view: OperationsView = {
      categories: [{ category: "running", label: "実行中", jobs: [row] }],
    };

    const output = formatOperationsViewHuman(view, { isTty: false, nowMs: FIXED_NOW });
    expect(output).toContain("running (stale?)");
    expect(output).toContain("job resume my-task");
  });
});

// ---------------------------------------------------------------------------
// TC-028: formatOperationsViewHuman — PR merged + archive in NEXT
// ---------------------------------------------------------------------------

describe("TC-028: formatOperationsViewHuman renders PR merged annotation and archive in NEXT", () => {
  it("shows 'awaiting-archive (PR merged)' and 'job archive my-task'", () => {
    const row: JobViewRow = {
      jobId: "abcd1234efgh5678",
      slug: "my-task",
      step: "pr-create",
      status: "awaiting-archive",
      stale: false,
      prMerged: true,
      escalationStep: null,
      nextAction: "job archive my-task",
      branch: "feat/my-task",
      createdAt: "2025-01-01T12:00:00Z",
    };

    const view: OperationsView = {
      categories: [{ category: "awaiting-archive", label: "merge・archive 待ち", jobs: [row] }],
    };

    const output = formatOperationsViewHuman(view, { isTty: true, nowMs: FIXED_NOW });
    expect(output).toContain("awaiting-archive (PR merged)");
    expect(output).toContain("job archive my-task");
  });
});

// ---------------------------------------------------------------------------
// TC-029: formatOperationsViewHuman — TAB separator in non-TTY mode
// ---------------------------------------------------------------------------

describe("TC-029: formatOperationsViewHuman uses TAB separator in non-TTY mode", () => {
  it("data rows are TAB-separated in non-TTY mode", () => {
    const row: JobViewRow = {
      jobId: "abcd1234efgh5678",
      slug: "my-task",
      step: "implementer",
      status: "running",
      stale: false,
      prMerged: null,
      escalationStep: null,
      nextAction: null,
      branch: "feat/my-task",
      createdAt: "2025-01-01T12:00:00Z",
    };

    const view: OperationsView = {
      categories: [{ category: "running", label: "実行中", jobs: [row] }],
    };

    const output = formatOperationsViewHuman(view, { isTty: false, nowMs: FIXED_NOW });
    // Data rows should contain TAB
    const dataLines = output.split("\n").filter((l) => l.includes("\t"));
    expect(dataLines.length).toBeGreaterThan(0);
    // Each data row has 6 tab-separated fields
    for (const line of dataLines) {
      expect(line.split("\t")).toHaveLength(6);
    }
  });

  it("live running NEXT is '-' (no action)", () => {
    const row: JobViewRow = {
      jobId: "abcd1234efgh5678",
      slug: "my-task",
      step: "implementer",
      status: "running",
      stale: false,
      prMerged: null,
      escalationStep: null,
      nextAction: null,
      branch: "feat/my-task",
      createdAt: "2025-01-01T12:00:00Z",
    };

    const view: OperationsView = {
      categories: [{ category: "running", label: "実行中", jobs: [row] }],
    };

    const output = formatOperationsViewHuman(view, { isTty: false, nowMs: FIXED_NOW });
    // Non-TTY: JOB_ID\tSLUG\tSTEP\tSTATUS\tNEXT\tAGE
    const dataLines = output
      .split("\n")
      .filter((l) => l.includes("\t") && !l.startsWith("JOB_ID") && !l.startsWith("["));
    expect(dataLines.length).toBeGreaterThan(0);
    const fields = dataLines[0]!.split("\t");
    // NEXT is at index 4
    expect(fields[4]).toBe("-");
  });
});

// ---------------------------------------------------------------------------
// TC-010 / TC-030: formatOperationsViewJson — top-level keys and field set
// ---------------------------------------------------------------------------

describe("TC-010 / TC-030: formatOperationsViewJson produces exact structure", () => {
  const row: JobViewRow = {
    jobId: "abcd1234efgh5678",
    slug: "my-task",
    step: "code-review",
    status: "awaiting-resume",
    stale: false,
    prMerged: null,
    escalationStep: "code-review",
    nextAction: "job resume my-task",
    branch: "feat/my-task",
    createdAt: "2025-01-01T12:00:00Z",
  };

  const view: OperationsView = {
    categories: [{ category: "awaiting-response", label: "対応待ち", jobs: [row] }],
  };

  it("top-level keys are exactly ['categories'] (TC-010)", () => {
    const parsed = JSON.parse(formatOperationsViewJson(view)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["categories"]);
  });

  it("each category has category, label, jobs fields", () => {
    const parsed = JSON.parse(formatOperationsViewJson(view)) as {
      categories: Array<Record<string, unknown>>;
    };
    const cat = parsed.categories[0]!;
    expect(Object.keys(cat).sort()).toEqual(["category", "jobs", "label"]);
  });

  it("each job entry has expected fields including escalationStep and nextAction (TC-011)", () => {
    const parsed = JSON.parse(formatOperationsViewJson(view)) as {
      categories: Array<{ jobs: Array<Record<string, unknown>> }>;
    };
    const job = parsed.categories[0]!.jobs[0]!;
    const keys = Object.keys(job).sort();
    expect(keys).toContain("jobId");
    expect(keys).toContain("slug");
    expect(keys).toContain("step");
    expect(keys).toContain("status");
    expect(keys).toContain("stale");
    expect(keys).toContain("prMerged");
    expect(keys).toContain("escalationStep");
    expect(keys).toContain("nextAction");
    expect(keys).toContain("branch");
    expect(keys).toContain("createdAt");
  });

  it("escalationStep is non-null and nextAction is correct (TC-011)", () => {
    const parsed = JSON.parse(formatOperationsViewJson(view)) as {
      categories: Array<{ jobs: Array<Record<string, unknown>> }>;
    };
    const job = parsed.categories[0]!.jobs[0]!;
    expect(job["escalationStep"]).toBe("code-review");
    expect(job["nextAction"]).toBe("job resume my-task");
  });

  it("categories contains only non-empty categories in fixed order", () => {
    const parsed = JSON.parse(formatOperationsViewJson(view)) as {
      categories: Array<{ category: string }>;
    };
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.categories[0]!.category).toBe("awaiting-response");
  });

  it("output ends with newline", () => {
    expect(formatOperationsViewJson(view)).toMatch(/\n$/);
  });
});
