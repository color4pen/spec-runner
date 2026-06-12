import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatConfigEffectiveHuman, runConfigEffective } from "../../../src/cli/config-effective.js";
import type { ConfigEffectiveOutput } from "../../../src/cli/config-effective.js";
import { COMMANDS, USAGE, CONFIG_EFFECTIVE_USAGE } from "../../../src/cli/command-registry.js";

const execFileAsync = promisify(execFile);

let tempDir: string;
let originalXdg: string | undefined;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "specrunner-config-effective-"));
  originalXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = join(tempDir, "xdg");
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = originalXdg;
  await rm(tempDir, { recursive: true, force: true });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf-8");
}

async function makeRepo(): Promise<string> {
  const repoRoot = join(tempDir, "repo");
  await mkdir(repoRoot, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: repoRoot });
  return repoRoot;
}

function stdoutText(): string {
  return stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("");
}

describe("config effective command registry", () => {
  it("registers config effective and top-level help lists config", () => {
    expect("config" in COMMANDS).toBe(true);
    expect(USAGE).toContain("config effective");
    expect(CONFIG_EFFECTIVE_USAGE).toContain("--type <requestType>");
    expect(CONFIG_EFFECTIVE_USAGE).toContain("--json");
    expect(CONFIG_EFFECTIVE_USAGE).toContain("managed runtime ignores configured model");
  });
});

describe("runConfigEffective", () => {
  it("prints JSON with request type and field source records", async () => {
    const repoRoot = await makeRepo();
    await writeJson(join(tempDir, "xdg", "specrunner", "config.json"), {
      version: 1,
      runtime: "local",
      steps: {
        design: {
          byRequestType: {
            "bug-fix": { model: "claude-sonnet-4-6" },
          },
        },
      },
    });
    await writeJson(join(repoRoot, ".specrunner", "config.json"), {
      steps: {
        defaults: { model: "gpt-5.5" },
      },
    });

    const code = await runConfigEffective({ cwd: repoRoot, requestType: "bug-fix", json: true });
    const parsed = JSON.parse(stdoutText()) as ConfigEffectiveOutput;
    const design = parsed.steps.find((step) => step.step === "design");

    expect(code).toBe(0);
    expect(parsed.requestType).toBe("bug-fix");
    expect(design?.fields.model.value).toBe("claude-sonnet-4-6");
    expect(design?.fields.model.source).toMatchObject({
      layer: "user",
      level: "step.byRequestType",
      path: "steps.design.byRequestType.bug-fix.model",
    });
  });

  it("prints human output with requestType none and source labels", async () => {
    const repoRoot = await makeRepo();
    await writeJson(join(repoRoot, ".specrunner", "config.json"), {
      version: 1,
      runtime: "local",
      steps: {
        defaults: { model: "claude-sonnet-4-6" },
      },
    });

    const code = await runConfigEffective({ cwd: repoRoot });
    const output = stdoutText();

    expect(code).toBe(0);
    expect(output).toContain("requestType: none");
    expect(output).toContain("design");
    expect(output).toContain("model: claude-sonnet-4-6");
    expect(output).toContain("project defaults steps.defaults.model");
    expect(output).not.toContain("verification");
    expect(output).not.toContain("pr-create");
  });

  it("returns arg error for invalid request type", async () => {
    const code = await runConfigEffective({ requestType: "not-a-type" });

    expect(code).toBe(2);
    expect(stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("")).toContain("invalid --type value");
  });
});

describe("formatConfigEffectiveHuman", () => {
  it("keeps essential labels independent of spacing", () => {
    const text = formatConfigEffectiveHuman({
      requestType: null,
      configPaths: {
        userGlobal: { path: "/user/config.json", exists: true },
        projectLocal: { path: "/repo/.specrunner/config.json", exists: false },
      },
      note: "managed note",
      steps: [
        {
          step: "design",
          requestType: null,
          fields: {
            model: {
              value: "claude-sonnet-4-6",
              source: { layer: "user", level: "step", path: "steps.design.model", configPath: "/user/config.json" },
            },
            maxTurns: {
              value: 15,
              source: { layer: "stepdef", level: "stepdef", path: null },
            },
            timeoutMs: {
              value: null,
              source: { layer: "sdk", level: "sdk", path: null },
            },
          },
        },
      ],
    });

    expect(text).toContain("requestType: none");
    expect(text).toContain("design");
    expect(text).toContain("claude-sonnet-4-6");
    expect(text).toContain("user step steps.design.model");
    expect(text).toContain("sdk");
  });
});
