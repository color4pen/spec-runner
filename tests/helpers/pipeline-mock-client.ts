/**
 * Shared pipeline mock helpers for integration tests.
 *
 * Single source of truth for buildPipelineMockClient and buildMockGithubClient.
 * Tests that use these helpers import from here rather than defining locally.
 */
import { vi } from "vitest";
import type { GitHubClient } from "../../src/core/port/github-client.js";

/**
 * Verdict options for spec-review steps.
 *   "approved"        — no blocking findings
 *   "needs-fix"       — high-severity fixable finding
 *   "escalation"      — ok:false (voluntary failure, distinct from decision-needed)
 *   "decision-needed" — ok:true with resolution="decision-needed" finding → escalation
 */
export type SpecReviewVerdict = "approved" | "needs-fix" | "escalation" | "decision-needed";

export interface BuildPipelineMockClientOpts {
  designBranch?: string;
  /** Terminate the design step session (SSE terminated). Legacy option. */
  designFailure?: boolean;
  specReviewVerdicts?: SpecReviewVerdict[];
  codeReviewVerdicts?: ("approved" | "needs-fix")[];
  sessionIds?: string[];
  /**
   * Terminate any polling-style step whose agentId matches this value.
   * When the matched step's pollUntilComplete is called, it returns {status: "terminated"}.
   * Use for non-design steps (spec-review, implementer, etc.).
   *
   * For design step termination, use designFailure instead.
   */
  terminateAgentId?: string;
}

/**
 * Build a mock SessionClient that supports multiple spec-review and code-review iterations.
 *
 * listEvents returns typed toolResult based on agentId:
 *   - spec-review (judge): based on specReviewVerdicts array
 *   - code-review (judge): based on codeReviewVerdicts array
 *   - conformance: always approved
 *   - request-review: always approve
 *   - producer steps: { ok: true, status: "success" }
 *
 * pollUntilComplete returns "terminated" for terminateAgentId (if set).
 */
export function buildPipelineMockClient(opts: BuildPipelineMockClientOpts = {}) {
  const {
    designBranch: _designBranch = "feat/test-branch",
    designFailure = false,
    specReviewVerdicts = ["approved"],
    codeReviewVerdicts = ["approved"],
    sessionIds = [
      "sess_propose_001",
      "sess_spec_fixer_001",
      "sess_spec_review_001",
      "sess_spec_fixer_002",
      "sess_spec_review_002",
    ],
    terminateAgentId,
  } = opts;

  let createCallCount = 0;
  // Track agentId → sessionId mapping for verdict-aware listEvents
  const sessionIdToAgentId = new Map<string, string>();
  // Per-step-type call counters for verdict arrays
  let specReviewCount = 0;
  let codeReviewCount = 0;

  const client = {
    createSession: vi.fn().mockImplementation((params: { agentId?: string }) => {
      const sessionId = sessionIds[createCallCount] ?? `sess_unknown_${createCallCount}`;
      createCallCount++;
      if (params?.agentId) {
        sessionIdToAgentId.set(sessionId, params.agentId);
      }
      return Promise.resolve({ sessionId });
    }),

    sendUserMessage: vi.fn().mockResolvedValue(undefined),

    pollUntilComplete: vi.fn().mockImplementation((sessionId: string) => {
      if (terminateAgentId) {
        const agentId = sessionIdToAgentId.get(sessionId) ?? "";
        if (agentId === terminateAgentId) {
          return Promise.resolve({ status: "terminated" as const });
        }
      }
      return Promise.resolve({ status: "idle" as const });
    }),

    streamEvents: vi.fn().mockImplementation((sessionId: string) => {
      if (designFailure) {
        return Promise.resolve({
          sseDisconnected: false,
          idleEndTurnDetected: false,
          terminated: true,
          terminationReason: "terminated" as const,
        });
      }
      // Also support terminateAgentId for SSE-based steps (design)
      if (terminateAgentId) {
        const agentId = sessionIdToAgentId.get(sessionId) ?? "";
        if (agentId === terminateAgentId) {
          return Promise.resolve({
            sseDisconnected: false,
            idleEndTurnDetected: false,
            terminated: true,
            terminationReason: "terminated" as const,
          });
        }
      }
      return Promise.resolve({
        sseDisconnected: false,
        idleEndTurnDetected: true,
        terminated: false,
        terminationReason: "end_turn" as const,
      });
    }),

    getSessionUsage: vi.fn().mockResolvedValue(undefined),

    listEvents: vi.fn().mockImplementation((sessionId: string) => {
      const agentId = sessionIdToAgentId.get(sessionId) ?? "";

      // spec-review judge step
      if (agentId === "agent_spec_review") {
        const rawVerdict =
          specReviewVerdicts[specReviewCount] ??
          specReviewVerdicts[specReviewVerdicts.length - 1]!;
        specReviewCount++;

        if (rawVerdict === "approved") {
          return Promise.resolve([
            {
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-report-id",
              input: { ok: true, approved: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } },
            },
          ]);
        } else if (rawVerdict === "decision-needed") {
          // T-01(a): decision-needed escalation — ok:true with resolution="decision-needed" finding
          return Promise.resolve([
            {
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-report-id",
              input: {
                ok: true,
                approved: false,
                evidence: { checked: 1, skipped: 0, unverified: 0 },
                findings: [
                  {
                    severity: "low",
                    resolution: "decision-needed",
                    file: "src/design.ts",
                    title: "Human decision required",
                    rationale: "This change requires product owner sign-off",
                    options: [
                      { label: "Option A: proceed as-is", consequence: "No sign-off required, risk remains" },
                      { label: "Option B: await sign-off", consequence: "Blocked until product owner reviews" },
                    ],
                  },
                ],
              },
            },
          ]);
        } else if (rawVerdict === "escalation") {
          // Voluntary failure (ok:false) — distinct from decision-needed
          return Promise.resolve([
            {
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-report-id",
              input: { ok: false, reason: "escalation" },
            },
          ]);
        } else {
          // needs-fix: supply a high-severity fixable finding
          return Promise.resolve([
            {
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-report-id",
              input: {
                ok: true,
                approved: false,
                evidence: { checked: 1, skipped: 0, unverified: 0 },
                findings: [
                  {
                    severity: "high",
                    resolution: "fixable",
                    file: "src/test.ts",
                    title: "Test issue",
                    rationale: "Fix required",
                  },
                ],
              },
            },
          ]);
        }
      }

      // code-review judge step
      if (agentId === "code-review-agent-id") {
        const rawVerdict =
          codeReviewVerdicts[codeReviewCount] ??
          codeReviewVerdicts[codeReviewVerdicts.length - 1]!;
        codeReviewCount++;
        if (rawVerdict === "approved") {
          return Promise.resolve([
            {
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-report-id",
              input: { ok: true, approved: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } },
            },
          ]);
        } else {
          // needs-fix
          return Promise.resolve([
            {
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-report-id",
              input: {
                ok: true,
                approved: false,
                evidence: { checked: 1, skipped: 0, unverified: 0 },
                findings: [
                  {
                    severity: "high",
                    resolution: "fixable",
                    file: "src/test.ts",
                    title: "Code issue",
                    rationale: "Fix required",
                  },
                ],
              },
            },
          ]);
        }
      }

      // conformance judge step — always approved by default in integration tests
      if (agentId === "conformance-agent-id") {
        return Promise.resolve([
          {
            type: "agent.custom_tool_use",
            name: "report_result",
            id: "mock-report-id",
            input: { ok: true, approved: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } },
          },
        ]);
      }

      // request-review gate step — always approves by default in integration tests
      // TC-024: evidence added (checked > 0) so parseRequestReviewReportInput succeeds
      // after the evidence requirement is enforced (request-review-evidence-counts change)
      if (agentId === "request-review-agent-id") {
        return Promise.resolve([
          {
            type: "agent.custom_tool_use",
            name: "report_result",
            id: "mock-report-id",
            input: { ok: true, verdict: "approve", findings: [], evidence: { checked: 5, skipped: 0, unverified: 0 } },
          },
        ]);
      }

      // Producer steps: design, spec-fixer, test-case-gen, implementer, build-fixer, code-fixer, adr-gen
      return Promise.resolve([
        {
          type: "agent.custom_tool_use",
          name: "report_result",
          id: "mock-report-id",
          input: { ok: true, status: "success" },
        },
      ]);
    }),

    sendEvents: vi.fn().mockResolvedValue(undefined),
  };

  // Suppress unused variable warning
  void _designBranch;

  return {
    client,
    sessionIds,
    specReviewVerdicts,
    codeReviewVerdicts,
  };
}

/**
 * Build a mock GitHubClient (port interface) for pipeline integration tests.
 *
 * - verifyBranch: returns branchFound (default true)
 * - verifyPath: returns folderFound (default true)
 * - getRawFile:
 *   - {changeFolderPath(slug)}/spec-review-result-NNN.md → verdict per specReviewVerdicts
 *   - {changeFolderPath(slug)}/review-feedback-NNN.md → verdict per codeReviewVerdicts
 *   - conformance-result-NNN.md → always approved
 */
export function buildMockGithubClient(
  opts: {
    branchFound?: boolean;
    folderFound?: boolean;
    specReviewVerdicts?: ("approved" | "needs-fix" | "escalation" | "decision-needed")[];
    codeReviewVerdicts?: ("approved" | "needs-fix" | "escalation")[];
    /** @deprecated use codeReviewVerdicts */
    codeReviewVerdict?: "approved" | "needs-fix" | "escalation";
  } = {},
): GitHubClient {
  const {
    branchFound = true,
    folderFound = true,
    specReviewVerdicts = ["approved"],
    codeReviewVerdict = "approved",
  } = opts;
  const codeReviewVerdicts = opts.codeReviewVerdicts ?? [codeReviewVerdict];

  let specReviewCallCount = 0;
  let codeReviewCallCount = 0;

  return {
    verifyBranch: vi.fn().mockResolvedValue(branchFound),
    verifyPath: vi.fn().mockResolvedValue(folderFound),
    getRawFile: vi
      .fn()
      .mockImplementation(
        async (_owner: string, _repo: string, _branch: string, filePath: string) => {
          // Spec-review result file
          if (/spec-review-result-\d{3}\.md$/.test(filePath)) {
            const verdict =
              specReviewVerdicts[specReviewCallCount] ??
              specReviewVerdicts[specReviewVerdicts.length - 1]!;
            specReviewCallCount++;
            // Evidence report format — verdict is derived by CLI from typed findings, not file content.
            // Include a note about the verdict in the evidence report for human readability.
            return `# Spec Review Result\n\n## 検証した項目\n\nReviewed spec.md, design.md, tasks.md. Verdict signal: ${verdict}.\n\n## 検証できなかった項目\n\nNone\n\n## Findings 詳細\n\nNone\n`;
          }
          // Code-review feedback file
          if (/review-feedback-\d{3}\.md$/.test(filePath)) {
            const verdict =
              codeReviewVerdicts[codeReviewCallCount] ??
              codeReviewVerdicts[codeReviewVerdicts.length - 1]!;
            codeReviewCallCount++;
            return `# Review Feedback\n\n## 検証した項目\n\nReviewed changed files. Verdict signal: ${verdict}.\n\n## 検証できなかった項目\n\nNone\n\n## Findings 詳細\n\nNone\n`;
          }
          // Conformance result file
          if (/conformance-result-\d{3}\.md$/.test(filePath)) {
            return `# Conformance Result\n\n## 検証した項目\n\nVerified tasks.md, design.md, spec.md, request.md.\n\n## 検証できなかった項目\n\nNone\n\n## Findings 詳細\n\nNone\n`;
          }
          return null;
        },
      ),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      headRefName: "",
      mergeable: "MERGEABLE",
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({
      state: "success",
      total: 0,
      failing: [],
      pending: [],
    }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi
      .fn()
      .mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
  };
}
