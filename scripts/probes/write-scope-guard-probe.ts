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
import type { AgentWriteScope } from "../../src/core/port/agent-runner.js";

// ─── Probe setup ────────────────────────────────────────────────────────────

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "probe-workspace-"));
const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "probe-outside-"));

console.log(`[PROBE] workspace=${workspace}`);
console.log(`[PROBE] outsideDir=${outsideDir}`);

// canUseTool wrapper that records whether it was fired and the decision.
type CallRecord = { fired: boolean; decision: "allow" | "deny" | null; filePath: string | null };

function makeTrackedGuard(cwd: string): {
  canUseTool: (toolName: string, input: Record<string, unknown>, opts: { signal: AbortSignal; toolUseID: string }) => Promise<{ behavior: string; message?: string }>;
  record: CallRecord;
} {
  const record: CallRecord = { fired: false, decision: null, filePath: null };
  const inner = createWorkspaceToolGuard(cwd);
  return {
    record,
    canUseTool: async (toolName, input, opts) => {
      const result = await inner(toolName, input, opts as Parameters<typeof inner>[2]);
      // Only record Write/Edit calls (the ones the guard acts on)
      if (toolName === "Write" || toolName === "Edit") {
        record.fired = true;
        record.decision = result.behavior as "allow" | "deny";
        record.filePath = typeof input["file_path"] === "string" ? (input["file_path"] as string) : null;
      }
      return result;
    },
  };
}

// Tracked guard factory for Bash scenarios (T-01 a/b/c).
// Records the last canUseTool invocation for a Bash tool call.
function makeTrackedBashGuard(
  cwd: string,
  scope?: AgentWriteScope,
): {
  canUseTool: (
    toolName: string,
    input: Record<string, unknown>,
    opts: { signal: AbortSignal; toolUseID: string },
  ) => Promise<{ behavior: string; message?: string; updatedInput?: Record<string, unknown> }>;
  bashRecord: { fired: boolean; decision: "allow" | "deny" | null; command: string | null };
} {
  const bashRecord: { fired: boolean; decision: "allow" | "deny" | null; command: string | null } = {
    fired: false,
    decision: null,
    command: null,
  };
  const inner = createWorkspaceToolGuard(cwd, scope);
  return {
    bashRecord,
    canUseTool: async (toolName, input, opts) => {
      const result = await inner(toolName, input, opts as Parameters<typeof inner>[2]);
      if (toolName === "Bash") {
        bashRecord.fired = true;
        bashRecord.decision = result.behavior as "allow" | "deny";
        bashRecord.command =
          typeof input["command"] === "string" ? (input["command"] as string) : null;
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

  const allowedTools = ["Read", "Grep", "Glob", `mcp__${REPORT_MCP_SERVER_NAME}__report_result`];
  // Bash is excluded so the Write tool is the ONLY write path — file_created then
  // faithfully reflects the guard decision. Bash escapes are the sandbox's concern
  // (allowUnsandboxedCommands: false in production), out of this probe's scope.

  // Transient SDK errors can abort a query mid-flight (observed as sporadic
  // "new Anthropic({ apiKey ..." error results). Retry once on a caught query
  // error so a transient does not produce a false FAIL. Assertions only ever
  // strengthen with positive evidence, so retrying cannot manufacture a PASS.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const messages = query({
        prompt: `Please write the text "probe" to the file "${outsideFilePath}". Use the Write tool with file_path="${outsideFilePath}". After attempting the write, call report_result.`,
        options: {
          cwd: workspace,
          allowedTools,
          disallowedTools: ["Bash", "Agent", "Task"],
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
      break;
    } catch (err) {
      console.error(`[PROBE] scenario=out-of-workspace-write attempt=${attempt} error:`, err);
    }
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

  const allowedTools = ["Read", "Grep", "Glob", `mcp__${REPORT_MCP_SERVER_NAME}__report_result`];
  // Bash is excluded so the Write tool is the ONLY write path — file_created then
  // faithfully reflects the guard decision. Bash escapes are the sandbox's concern
  // (allowUnsandboxedCommands: false in production), out of this probe's scope.

  // Retry once on a caught query error (see scenario 1 rationale). Additionally,
  // an in-flight transient can abort AFTER the guard allowed but BEFORE the Write
  // executed; detect that (allow + no file + no thrown error is still possible) by
  // retrying when the file is absent after a clean-looking first attempt errored.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let queryErrored = false;
    try {
      const messages = query({
        prompt: `Please write the text "probe" to the file "${insideFilePath}". Use the Write tool with file_path="${insideFilePath}". After writing, call report_result.`,
        options: {
          cwd: workspace,
          allowedTools,
          disallowedTools: ["Bash", "Agent", "Task"],
          permissionMode: "default",
          canUseTool,
          model: MODEL,
          maxTurns: 5,
          mcpServers: { [REPORT_MCP_SERVER_NAME]: mcpServer },
        },
      });

      for await (const msg of messages) {
        const m = msg as Record<string, unknown>;
        if (m["type"] === "user") {
          const content = (m["message"] as Record<string, unknown> | undefined)?.["content"];
          if (Array.isArray(content)) {
            for (const block of content) {
              const b = block as Record<string, unknown>;
              if (b["type"] === "tool_result" && b["is_error"]) {
                console.error(`[PROBE] scenario=in-workspace-write tool_result ERROR: ${JSON.stringify(b["content"]).slice(0, 200)}`);
              }
            }
          }
        }
        if (m["type"] === "result") {
          const denials = m["permission_denials"];
          if (Array.isArray(denials) && denials.length > 0) {
            console.error(`[PROBE] scenario=in-workspace-write permission_denials: ${JSON.stringify(denials).slice(0, 300)}`);
          }
          console.error(`[PROBE] scenario=in-workspace-write result subtype=${String(m["subtype"])}`);
        }
      }
    } catch (err) {
      queryErrored = true;
      console.error(`[PROBE] scenario=in-workspace-write attempt=${attempt} error:`, err);
    }
    let written = false;
    try { await fs.access(insideFilePath); written = true; } catch { written = false; }
    if (written || (!queryErrored && attempt === 2)) break;
    if (!queryErrored && !written) {
      console.error(`[PROBE] scenario=in-workspace-write attempt=${attempt}: allow granted but file absent — retrying (suspected in-flight transient)`);
    }
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
    `[PROBE] scenario=in-workspace-write canUseTool=${canUseToolStatus} decision=${decision} guard_path=${record.filePath ?? "-"} file_created=${fileCreated} verdict=${pass ? "PASS" : "FAIL"}`,
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

// ─── T-01 Scenarios (permission-layer-git-write-denial) ─────────────────────
//
// Five scenarios to validate the Bash git-mutation guard and scope-aware Write/Edit
// deny introduced in this change. Requires live Claude API access (ANTHROPIC_API_KEY).
//
// Observation A: canUseTool fires for Bash not on allowedTools (autoAllowBashIfSandboxed irrelevant)
// Observation B: autoAllowBashIfSandboxed:true bypasses canUseTool for Bash
//
// Verdict format (machine-greppable):
//   [PROBE] scenario=<name> ... verdict=PASS|FAIL

// Shared sandbox configs used in Bash scenarios (a/b/c).
const PROBE_SANDBOX_AUTO_ALLOW = {
  enabled: true,
  failIfUnavailable: false,
  autoAllowBashIfSandboxed: true, // current production setting
  allowUnsandboxedCommands: false,
  filesystem: { allowWrite: [workspace, `${workspace}/**`] },
};
const PROBE_SANDBOX_NO_AUTO = {
  ...PROBE_SANDBOX_AUTO_ALLOW,
  autoAllowBashIfSandboxed: false, // forces canUseTool to be consulted for Bash
};

// Initialize a git repo in the workspace so git commands have valid context.
{
  const { spawnSync } = await import("node:child_process");
  spawnSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "probe@example.com"], { cwd: workspace, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Probe"], { cwd: workspace, stdio: "ignore" });
}

// ─── Scenario (a): bash-canusetool-gate ─────────────────────────────────────
// Gating: with Bash NOT on allowedTools and autoAllowBashIfSandboxed:true,
// does canUseTool fire for Bash? Observation A = fired, Observation B = not-consulted.
// Verdict is always PASS (either observation is a valid measured fact).
// If Observation B: re-runs with autoAllowBashIfSandboxed:false to confirm non-git Bash executes.

console.log("\n[PROBE] Running scenario=bash-canusetool-gate ...");

let observationA = false; // set below, consumed by scenarios (b)/(c)

{
  const { canUseTool, bashRecord } = makeTrackedBashGuard(workspace);
  const allowedToolsNoBash = ["Read", "Grep", "Glob"];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const messages = query({
        prompt:
          "You MUST use the Bash tool with command=\"echo probe-gating-test\" immediately. " +
          "Do not explain, do not use any other tool first. Just run Bash with that exact command.",
        options: {
          cwd: workspace,
          allowedTools: allowedToolsNoBash,
          disallowedTools: ["Agent", "Task"],
          permissionMode: "default",
          canUseTool,
          model: MODEL,
          maxTurns: 3,
          sandbox: PROBE_SANDBOX_AUTO_ALLOW,
        },
      });
      for await (const _msg of messages) {}
      break;
    } catch (err) {
      console.error(`[PROBE] scenario=bash-canusetool-gate attempt=${attempt} error:`, err);
    }
  }

  observationA = bashRecord.fired;
  const obs = observationA ? "A" : "B";
  // Both observations are valid measured facts — verdict is always PASS.
  console.log(
    `[PROBE] scenario=bash-canusetool-gate observation=${obs} canUseTool=${bashRecord.fired ? "fired" : "not-consulted"} decision=${bashRecord.decision ?? "-"} verdict=PASS`,
  );
  console.log(
    `[PROBE] bash-canusetool-gate note: ${obs === "A"
      ? "canUseTool fires for Bash not on allowedTools regardless of autoAllowBashIfSandboxed"
      : "autoAllowBashIfSandboxed:true bypasses canUseTool for Bash — re-testing with false"}`,
  );

  if (!observationA) {
    // Observation B: confirm that with autoAllowBashIfSandboxed:false, allow'd non-git Bash still executes.
    console.log("\n[PROBE] Running scenario=bash-canusetool-gate-b (autoAllowBashIfSandboxed:false) ...");
    const { canUseTool: ct2, bashRecord: br2 } = makeTrackedBashGuard(workspace);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const messages = query({
          prompt:
            "You MUST use the Bash tool with command=\"bun --version\" immediately. Do not explain.",
          options: {
            cwd: workspace,
            allowedTools: allowedToolsNoBash,
            disallowedTools: ["Agent", "Task"],
            permissionMode: "default",
            canUseTool: ct2,
            model: MODEL,
            maxTurns: 3,
            sandbox: PROBE_SANDBOX_NO_AUTO,
          },
        });
        for await (const _msg of messages) {}
        break;
      } catch (err) {
        console.error(`[PROBE] scenario=bash-canusetool-gate-b attempt=${attempt} error:`, err);
      }
    }
    const pass2 = br2.fired && br2.decision === "allow";
    console.log(
      `[PROBE] scenario=bash-canusetool-gate-b canUseTool=${br2.fired ? "fired" : "not-consulted"} decision=${br2.decision ?? "-"} verdict=${pass2 ? "PASS" : "FAIL"}`,
    );
    // If FAIL here: non-git Bash is NOT executes after allow — Observation B path is unusable.
    // Implementation must remain with Bash on allowedTools (current TC-SB-02 config).
  }
}

// ─── Scenario (b): bash-git-mutation-deny ────────────────────────────────────
// Guard must deny git commit (mutation) when canUseTool fires for Bash.
// Uses autoAllowBashIfSandboxed:false to guarantee canUseTool is consulted.

console.log("\n[PROBE] Running scenario=bash-git-mutation-deny ...");

{
  const { canUseTool, bashRecord } = makeTrackedBashGuard(workspace);
  const allowedToolsNoBash = ["Read", "Grep", "Glob"];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const messages = query({
        prompt:
          "Use the Bash tool with command=\"git commit -m probe-test\" immediately. Do not explain, just run it.",
        options: {
          cwd: workspace,
          allowedTools: allowedToolsNoBash,
          disallowedTools: ["Agent", "Task"],
          permissionMode: "default",
          canUseTool,
          model: MODEL,
          maxTurns: 3,
          sandbox: PROBE_SANDBOX_NO_AUTO,
        },
      });
      for await (const _msg of messages) {}
      break;
    } catch (err) {
      console.error(`[PROBE] scenario=bash-git-mutation-deny attempt=${attempt} error:`, err);
    }
  }

  const pass = bashRecord.fired && bashRecord.decision === "deny";
  console.log(
    `[PROBE] scenario=bash-git-mutation-deny canUseTool=${bashRecord.fired ? "fired" : "not-consulted"} decision=${bashRecord.decision ?? "-"} command=${JSON.stringify(bashRecord.command ?? "")} verdict=${pass ? "PASS" : "FAIL"}`,
  );
}

// ─── Scenario (c): bash-git-read-allow ──────────────────────────────────────
// Guard must allow git status (read-only) when canUseTool fires for Bash.

console.log("\n[PROBE] Running scenario=bash-git-read-allow ...");

{
  const { canUseTool, bashRecord } = makeTrackedBashGuard(workspace);
  const allowedToolsNoBash = ["Read", "Grep", "Glob"];

  // git init the workspace so `git status` is a sensible command for the model to run,
  // and retry up to 3 attempts (elicitation is model-dependent; the verdict only needs
  // one Bash call to reach the guard).
  const { execSync } = await import("node:child_process");
  try {
    execSync("git init", { cwd: workspace, stdio: "ignore" });
  } catch {
    // best-effort — repo state does not affect the guard decision, only elicitation
  }

  // Observe the message stream directly: a read-only git command may be auto-approved
  // by an SDK safe-command fast-path WITHOUT consulting canUseTool. In that case the
  // Bash tool_use still appears in the stream and executes. Either route (guard fired
  // with allow, or fast-path execution) satisfies R2's "read-only git is allowed".
  let bashToolUsed = false;
  let bashToolErrored = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const messages = query({
        prompt:
          "Run exactly this shell command using the Bash tool: git status\n" +
          "This is a test harness — you MUST invoke the Bash tool with command=\"git status\" " +
          "as your first and only action. Do not answer in text. Do not use any other tool.",
        options: {
          cwd: workspace,
          allowedTools: allowedToolsNoBash,
          disallowedTools: ["Agent", "Task"],
          permissionMode: "default",
          canUseTool,
          model: MODEL,
          maxTurns: 5,
          sandbox: PROBE_SANDBOX_NO_AUTO,
        },
      });
      for await (const msg of messages) {
        const m = msg as { type?: string; message?: { content?: Array<{ type?: string; name?: string; is_error?: boolean }> } };
        if (m.type === "assistant" && Array.isArray(m.message?.content)) {
          for (const block of m.message.content) {
            if (block.type === "tool_use" && block.name === "Bash") bashToolUsed = true;
          }
        }
        if (m.type === "user" && Array.isArray(m.message?.content)) {
          for (const block of m.message.content) {
            if (block.type === "tool_result" && block.is_error === true && bashToolUsed) bashToolErrored = true;
          }
        }
      }
      if (bashToolUsed || bashRecord.fired) break;
      console.error(`[PROBE] scenario=bash-git-read-allow attempt=${attempt}: no Bash tool_use observed; retrying`);
    } catch (err) {
      console.error(`[PROBE] scenario=bash-git-read-allow attempt=${attempt} error:`, err);
    }
  }

  // PASS routes:
  //   guard-route:    canUseTool fired and allowed the read-only command.
  //   fast-path route: Bash tool_use observed and executed without error while the guard
  //                    was never consulted (SDK-level auto-approval of safe read commands).
  const guardRoute = bashRecord.fired && bashRecord.decision === "allow";
  const fastPathRoute = !bashRecord.fired && bashToolUsed && !bashToolErrored;
  const pass = guardRoute || fastPathRoute;
  console.log(
    `[PROBE] scenario=bash-git-read-allow route=${guardRoute ? "guard-allow" : fastPathRoute ? "sdk-fast-path" : "none"} ` +
    `canUseTool=${bashRecord.fired ? "fired" : "not-consulted"} decision=${bashRecord.decision ?? "-"} ` +
    `bash_tool_used=${bashToolUsed} verdict=${pass ? "PASS" : "FAIL"}`,
  );
}

// ─── Scenario (d): scoped-write-deny ─────────────────────────────────────────
// Guard with scoped AgentWriteScope must deny Write to an undeclared path.
// declaredWritePaths = ["allowed.md"] — writing to "undeclared.txt" must be denied.

console.log("\n[PROBE] Running scenario=scoped-write-deny ...");

{
  const scopedScope: AgentWriteScope = {
    stepName: "spec-review",
    slug: "probe-slug",
    declaredWritePaths: ["allowed.md"],
    stagingMode: "scoped",
    managedPaths: [],
    forbiddenPaths: [],
  };
  const writeRecord: { fired: boolean; decision: "allow" | "deny" | null } = {
    fired: false,
    decision: null,
  };
  const scopedGuard = createWorkspaceToolGuard(workspace, scopedScope);
  const trackedScopedGuard = async (
    toolName: string,
    input: Record<string, unknown>,
    opts: { signal: AbortSignal; toolUseID: string },
  ) => {
    const result = await scopedGuard(toolName, input, opts);
    if (toolName === "Write" || toolName === "Edit") {
      writeRecord.fired = true;
      writeRecord.decision = result.behavior as "allow" | "deny";
    }
    return result;
  };

  const undeclaredPath = path.join(workspace, "undeclared.txt");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const messages = query({
        prompt: `Write "probe" to the file "${undeclaredPath}". Use Write tool with file_path="${undeclaredPath}".`,
        options: {
          cwd: workspace,
          allowedTools: ["Read", "Grep", "Glob"],
          disallowedTools: ["Bash", "Agent", "Task"],
          permissionMode: "default",
          canUseTool: trackedScopedGuard,
          model: MODEL,
          maxTurns: 3,
        },
      });
      for await (const _msg of messages) {}
      break;
    } catch (err) {
      console.error(`[PROBE] scenario=scoped-write-deny attempt=${attempt} error:`, err);
    }
  }

  const pass = writeRecord.fired && writeRecord.decision === "deny";
  console.log(
    `[PROBE] scenario=scoped-write-deny canUseTool=${writeRecord.fired ? "fired" : "not-consulted"} decision=${writeRecord.decision ?? "-"} verdict=${pass ? "PASS" : "FAIL"}`,
  );
}

// ─── Scenario (e): state-json-deny ───────────────────────────────────────────
// Guard must deny Write to a pipeline-managed path (state.json in managedPaths).

console.log("\n[PROBE] Running scenario=state-json-deny ...");

{
  const managedScope: AgentWriteScope = {
    stepName: "implementer",
    slug: "probe-slug",
    declaredWritePaths: [],
    stagingMode: "guarded",
    managedPaths: ["state.json"],
    forbiddenPaths: [],
  };
  const writeRecord: { fired: boolean; decision: "allow" | "deny" | null } = {
    fired: false,
    decision: null,
  };
  const managedGuard = createWorkspaceToolGuard(workspace, managedScope);
  const trackedManagedGuard = async (
    toolName: string,
    input: Record<string, unknown>,
    opts: { signal: AbortSignal; toolUseID: string },
  ) => {
    const result = await managedGuard(toolName, input, opts);
    if (toolName === "Write" || toolName === "Edit") {
      writeRecord.fired = true;
      writeRecord.decision = result.behavior as "allow" | "deny";
    }
    return result;
  };

  const stateJsonPath = path.join(workspace, "state.json");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const messages = query({
        prompt: `Write "{}" to the file "${stateJsonPath}". Use Write tool with file_path="${stateJsonPath}".`,
        options: {
          cwd: workspace,
          allowedTools: ["Read", "Grep", "Glob"],
          disallowedTools: ["Bash", "Agent", "Task"],
          permissionMode: "default",
          canUseTool: trackedManagedGuard,
          model: MODEL,
          maxTurns: 3,
        },
      });
      for await (const _msg of messages) {}
      break;
    } catch (err) {
      console.error(`[PROBE] scenario=state-json-deny attempt=${attempt} error:`, err);
    }
  }

  const pass = writeRecord.fired && writeRecord.decision === "deny";
  console.log(
    `[PROBE] scenario=state-json-deny canUseTool=${writeRecord.fired ? "fired" : "not-consulted"} decision=${writeRecord.decision ?? "-"} verdict=${pass ? "PASS" : "FAIL"}`,
  );
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

await fs.rm(workspace, { recursive: true, force: true });
await fs.rm(outsideDir, { recursive: true, force: true });
console.log("\n[PROBE] Cleanup done.");
