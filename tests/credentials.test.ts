/**
 * Tests for `specrunner credentials set <name>`.
 *
 * TC-009: credentials set claude-code stores Claude Code token
 * TC-010: credentials set anthropic-api-key stores API key
 * TC-011: secret input is not echoed to output stream
 * TC-012: existing credentials preserved after credentials set
 * TC-020: unknown name exits non-zero
 * TC-021: empty input exits non-zero
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-credentials-test-"));
  originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgConfigHome !== undefined) {
    process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
  } else {
    delete process.env["XDG_CONFIG_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Build a non-TTY fake stdin that emits the given secret */
function makeFakeNonTTYInput(secret: string): NodeJS.ReadableStream {
  const readable = new Readable({ read() {} });
  // Push the secret and end the stream
  process.nextTick(() => {
    readable.push(secret + "\n");
    readable.push(null);
  });
  return readable;
}

/** Build a fake writable output stream and capture what's written */
function makeFakeOutput(): { stream: NodeJS.WritableStream; captured: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  return { stream, captured: () => chunks.join("") };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: credentials set claude-code stores Claude Code token
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-009: credentials set claude-code stores token to credentials.json (0600)", () => {
  it("stores the secret to anthropic.claudeCodeOAuthToken", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const fakeInput = makeFakeNonTTYInput("my-claude-token");
    const fakeOutput = makeFakeOutput();

    const code = await runCredentialsSet("claude-code", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    expect(code).toBe(0);

    const credPath = path.join(tempDir, "specrunner", "credentials.json");
    const raw = await fs.readFile(credPath, "utf-8");
    const creds = JSON.parse(raw);
    expect(creds.anthropic?.claudeCodeOAuthToken).toBe("my-claude-token");
  });

  it("credentials.json has 0600 permissions", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const fakeInput = makeFakeNonTTYInput("my-claude-token");
    const fakeOutput = makeFakeOutput();

    await runCredentialsSet("claude-code", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    const credPath = path.join(tempDir, "specrunner", "credentials.json");
    const stat = await fs.stat(credPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-010: credentials set anthropic-api-key stores API key
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-010: credentials set anthropic-api-key stores to credentials.json (0600)", () => {
  it("stores the secret to anthropic.apiKey", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const fakeInput = makeFakeNonTTYInput("sk-ant-abc123");
    const fakeOutput = makeFakeOutput();

    const code = await runCredentialsSet("anthropic-api-key", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    expect(code).toBe(0);

    const credPath = path.join(tempDir, "specrunner", "credentials.json");
    const raw = await fs.readFile(credPath, "utf-8");
    const creds = JSON.parse(raw);
    expect(creds.anthropic?.apiKey).toBe("sk-ant-abc123");
  });

  it("credentials.json has 0600 permissions", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const fakeInput = makeFakeNonTTYInput("sk-ant-abc123");
    const fakeOutput = makeFakeOutput();

    await runCredentialsSet("anthropic-api-key", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    const credPath = path.join(tempDir, "specrunner", "credentials.json");
    const stat = await fs.stat(credPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-011: secret input is not echoed
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-011: secret input is not echoed to output stream", () => {
  it("non-TTY: secret value does not appear in output stream", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const secretValue = "super-secret-token-xyz-12345";
    const fakeInput = makeFakeNonTTYInput(secretValue);
    const fakeOutput = makeFakeOutput();

    await runCredentialsSet("claude-code", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    expect(fakeOutput.captured()).not.toContain(secretValue);
  });

  it("TTY: secret value does not appear in output stream", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const secretValue = "tty-secret-token-abc-67890";

    // Create a fake TTY input that emits the secret followed by Enter
    const fakeInput = new EventEmitter() as NodeJS.ReadableStream & {
      setRawMode: (mode: boolean) => void;
    };
    let rawMode = false;
    fakeInput.setRawMode = (mode: boolean) => { rawMode = mode; };
    (fakeInput as unknown as { resume: () => void }).resume = () => {};

    const fakeOutput = makeFakeOutput();

    // Fire the secret chars + Enter on next tick
    process.nextTick(() => {
      // Each character of the secret
      for (const ch of secretValue) {
        (fakeInput as EventEmitter).emit("data", Buffer.from(ch));
      }
      // Enter key
      (fakeInput as EventEmitter).emit("data", Buffer.from("\r"));
    });

    await runCredentialsSet("claude-code", {
      isTTY: true,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    expect(fakeOutput.captured()).not.toContain(secretValue);
    expect(rawMode).toBe(false); // raw mode restored after confirm
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-012: existing credentials preserved after credentials set
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-012: other credentials preserved when storing a new secret", () => {
  it("existing github token is still present after credentials set claude-code", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    // Pre-write a github token
    const credDir = path.join(tempDir, "specrunner");
    await fs.mkdir(credDir, { recursive: true });
    const credPath = path.join(credDir, "credentials.json");
    await fs.writeFile(
      credPath,
      JSON.stringify({ github: { token: "ghp_existing" } }),
      { mode: 0o600 },
    );

    const fakeInput = makeFakeNonTTYInput("new-claude-token");
    const fakeOutput = makeFakeOutput();

    await runCredentialsSet("claude-code", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    const raw = await fs.readFile(credPath, "utf-8");
    const creds = JSON.parse(raw);
    expect(creds.github?.token).toBe("ghp_existing");
    expect(creds.anthropic?.claudeCodeOAuthToken).toBe("new-claude-token");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-020: unknown name exits non-zero
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-020: unknown credential name exits non-zero", () => {
  it("returns non-0 for unknown name", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const fakeInput = makeFakeNonTTYInput("token");
    const fakeOutput = makeFakeOutput();

    const code = await runCredentialsSet("unknown-name", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    expect(code).not.toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-021: empty input exits non-zero
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-021: empty secret input exits non-zero and does not write to credentials.json", () => {
  it("returns non-0 for empty secret", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const fakeInput = makeFakeNonTTYInput("   "); // whitespace only → trimmed to ""
    const fakeOutput = makeFakeOutput();

    const code = await runCredentialsSet("claude-code", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    expect(code).not.toBe(0);
  });

  it("does not write to credentials.json for empty secret", async () => {
    const { runCredentialsSet } = await import("../src/cli/credentials.js");

    const fakeInput = makeFakeNonTTYInput("");
    const fakeOutput = makeFakeOutput();

    await runCredentialsSet("claude-code", {
      isTTY: false,
      input: fakeInput,
      output: fakeOutput.stream,
    });

    const credPath = path.join(tempDir, "specrunner", "credentials.json");
    // File should not have been created
    const exists = await fs.access(credPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
