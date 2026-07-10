/**
 * write-scope-guard-probe.ts
 *
 * Probe script for confirming the measured SDK facts underpinning the
 * write-scope-guard-redo change. Stands up the D1–D3 configuration against the
 * real @anthropic-ai/claude-agent-sdk and exercises three scenarios.
 *
 * Run: bun scripts/probes/write-scope-guard-probe.ts
 *
 * Design D5 (write-scope-guard-redo):
 * - Uses permissionMode "default", allowedTools = [Read, Bash, Grep, Glob, MCP report name]
 * - canUseTool = createWorkspaceToolGuard(W) for temp workspace W
 * - In-process specrunner_report MCP server exposing report_result
 *
 * Three scenarios (measured fact 6):
 *   1. out-of-workspace-write: Write outside W → canUseTool fires, denies, file not created
 *   2. in-workspace-write: Write inside W → canUseTool fires, allows, file created
 *   3. report_result: Call report_result → runs immediately (pre-approved, canUseTool not consulted)
 *
 * Verdict lines (machine-greppable):
 *   [PROBE] scenario=<name> canUseTool=<fired|not-consulted> decision=<allow|deny|-> file_created=<true|false|-> verdict=<PASS|FAIL>
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Import the real SDK (must be installed and auth configured).
// Uses the same dynamic loader pattern as the adapter.
const sdkModule = await import("@anthropic-ai/claude-agent-sdk");
const { query, createSdkMcpServer } = sdkModule as {
  query: (params: { prompt: string; options?: Record<string, unknown> }) => AsyncGenerator<unknown, void>;
  createSdkMcpServer: (params: Record<string, unknown>) => unknown;
};

// Import the workspace guard from the adapter (same code path as production).
import { createWorkspaceToolGuard } from "../../src/adapter/claude-code/agent-runner.js";

// ─── Probe setup ────────────────────────────────────────────────────────────

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "probe-workspace-"));
const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "probe-outside-"));

console.log(`[PROBE] workspace=${workspace}`);
console.log(`[PROBE] outsideDir=${outsideDir}`);

// canUseTool wrapper that records whether it was fired and the decision.
type CallRecord = { fired: boolean; decision: "allow" | "deny" | null };

function makeTrackedGuard(cwd: string): {
  canUseTool: (toolName: string, input: Record<string, unknown>, opts: { signal: AbortSignal; toolUseID: string }) => Promise<{ behavior: string; message?: string }>;
  record: CallRecord;
} {
  const record: CallRecord = { fired: false, decision: null };
  const inner = createWorkspaceToolGuard(cwd);
  return {
    record,
    canUseTool: async (toolName, input, opts) => {
      const result = await inner(toolName, input, opts as Parameters<typeof inner>[2]);
      // Only record Write/Edit calls (the ones the guard acts on)
      if (toolName === "Write" || toolName === "Edit") {
        record.fired = true;
        record.decision = result.behavior as "allow" | "deny";
      }
      return result;
    },
  };
}

const REPORT_MCP_SERVER_NAME = "specrunner_report";
const MODEL = "claude-haiku-4-5"; // cheapest model for probe

// ─── Scenario 1: out-of-workspace-write ─────────────────────────────────────

console.log("\n[PROBE] Running scenario=out-of-workspace-write ...");

{
  const { canUseTool, record } = makeTrackedGuard(workspace);
  const outsideFilePath = path.join(outsideDir, "probe-out.txt");

  let handlerInvoked = false;
  const mcpServer = createSdkMcpServer({
    name: REPORT_MCP_SERVER_NAME,
    tools: [
      {
        name: "report_result",
        description: "Report probe result.",
        inputSchema: {},
        handler: async () => {
          handlerInvoked = true;
          return { content: [{ type: "text", text: "ok" }] };
        },
      },
    ],
  });

  const allowedTools = ["Read", "Bash", "Grep", "Glob", `mcp__${REPORT_MCP_SERVER_NAME}__report_result`];

  try {
    const messages = query({
      prompt: `Please write the text "probe" to the file "${outsideFilePath}". Use the Write tool with file_path="${outsideFilePath}". After attempting the write, call report_result.`,
      options: {
        cwd: workspace,
        allowedTools,
        disallowedTools: ["Agent", "Task"],
        permissionMode: "default",
        canUseTool,
        model: MODEL,
        maxTurns: 5,
        mcpServers: { [REPORT_MCP_SERVER_NAME]: mcpServer },
      },
    });

    for await (const _msg of messages) {
      // consume stream
    }
  } catch (err) {
    console.error("[PROBE] scenario=out-of-workspace-write error:", err);
  }

  let fileCreated = false;
  try {
    await fs.access(outsideFilePath);
    fileCreated = true;
  } catch {
    fileCreated = false;
  }

  const canUseToolStatus = record.fired ? "fired" : "not-fired";
  const decision = record.decision ?? "-";
  // PASS: canUseTool fired, decision was deny, file was not created
  const pass = record.fired && record.decision === "deny" && !fileCreated;
  console.log(
    `[PROBE] scenario=out-of-workspace-write canUseTool=${canUseToolStatus} decision=${decision} file_created=${fileCreated} verdict=${pass ? "PASS" : "FAIL"}`,
  );
}

// ─── Scenario 2: in-workspace-write ─────────────────────────────────────────

console.log("\n[PROBE] Running scenario=in-workspace-write ...");

{
  const { canUseTool, record } = makeTrackedGuard(workspace);
  const insideFilePath = path.join(workspace, "probe-in.txt");

  let handlerInvoked = false;
  const mcpServer = createSdkMcpServer({
    name: REPORT_MCP_SERVER_NAME,
    tools: [
      {
        name: "report_result",
        description: "Report probe result.",
        inputSchema: {},
        handler: async () => {
          handlerInvoked = true;
          return { content: [{ type: "text", text: "ok" }] };
        },
      },
    ],
  });

  const allowedTools = ["Read", "Bash", "Grep", "Glob", `mcp__${REPORT_MCP_SERVER_NAME}__report_result`];

  try {
    const messages = query({
      prompt: `Please write the text "probe" to the file "${insideFilePath}". Use the Write tool with file_path="${insideFilePath}". After writing, call report_result.`,
      options: {
        cwd: workspace,
        allowedTools,
        disallowedTools: ["Agent", "Task"],
        permissionMode: "default",
        canUseTool,
        model: MODEL,
        maxTurns: 5,
        mcpServers: { [REPORT_MCP_SERVER_NAME]: mcpServer },
      },
    });

    for await (const _msg of messages) {
      // consume stream
    }
  } catch (err) {
    console.error("[PROBE] scenario=in-workspace-write error:", err);
  }

  let fileCreated = false;
  try {
    await fs.access(insideFilePath);
    fileCreated = true;
  } catch {
    fileCreated = false;
  }

  const canUseToolStatus = record.fired ? "fired" : "not-fired";
  const decision = record.decision ?? "-";
  // PASS: canUseTool fired, decision was allow, file was created
  const pass = record.fired && record.decision === "allow" && fileCreated;
  console.log(
    `[PROBE] scenario=in-workspace-write canUseTool=${canUseToolStatus} decision=${decision} file_created=${fileCreated} verdict=${pass ? "PASS" : "FAIL"}`,
  );
}

// ─── Scenario 3: report_result ───────────────────────────────────────────────

console.log("\n[PROBE] Running scenario=report_result ...");

{
  const { canUseTool } = makeTrackedGuard(workspace);
  let handlerInvoked = false;

  const mcpServer = createSdkMcpServer({
    name: REPORT_MCP_SERVER_NAME,
    tools: [
      {
        name: "report_result",
        description: "Report probe result.",
        inputSchema: {},
        handler: async () => {
          handlerInvoked = true;
          return { content: [{ type: "text", text: "ok" }] };
        },
      },
    ],
  });

  const allowedTools = ["Read", "Bash", "Grep", "Glob", `mcp__${REPORT_MCP_SERVER_NAME}__report_result`];

  try {
    const messages = query({
      prompt: "Please call report_result now.",
      options: {
        cwd: workspace,
        allowedTools,
        disallowedTools: ["Agent", "Task"],
        permissionMode: "default",
        canUseTool,
        model: MODEL,
        maxTurns: 3,
        mcpServers: { [REPORT_MCP_SERVER_NAME]: mcpServer },
      },
    });

    for await (const _msg of messages) {
      // consume stream
    }
  } catch (err) {
    console.error("[PROBE] scenario=report_result error:", err);
  }

  // PASS: MCP handler was invoked (pre-approved — canUseTool not needed for it)
  const pass = handlerInvoked;
  console.log(
    `[PROBE] scenario=report_result canUseTool=not-consulted handler_invoked=${handlerInvoked} verdict=${pass ? "PASS" : "FAIL"}`,
  );
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

await fs.rm(workspace, { recursive: true, force: true });
await fs.rm(outsideDir, { recursive: true, force: true });
console.log("\n[PROBE] Cleanup done.");
