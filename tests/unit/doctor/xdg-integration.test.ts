/**
 * TC-021: XDG_CONFIG_HOME 設定下で doctor.ts 経由の config-file-exists が pass する
 *
 * Source: tasks.md > T-07 統合テスト
 *         DoctorContext.configPath が getConfigPath() で解決され、
 *         XDG_CONFIG_HOME 指定下で config-file-exists check が pass することを end-to-end で検証する。
 *
 * 実装前は RED:
 *   - DoctorContext に configPath が無い → ctx.configPath が undefined
 *   - config-file-exists が homeDir 固定パスを参照するため XDG 下では ENOENT → fail
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";

let tmpDir: string;
let origXDG: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-xdg-"));
  origXDG = process.env["XDG_CONFIG_HOME"];
});

afterEach(async () => {
  // Restore XDG_CONFIG_HOME
  if (origXDG === undefined) {
    delete process.env["XDG_CONFIG_HOME"];
  } else {
    process.env["XDG_CONFIG_HOME"] = origXDG;
  }
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ---------------------------------------------------------------------------
// TC-021: XDG_CONFIG_HOME 設定下で config-file-exists が pass する（統合テスト）
// ---------------------------------------------------------------------------
describe("TC-021: XDG_CONFIG_HOME 設定下で config-file-exists が pass する（統合）", () => {
  it("XDG_CONFIG_HOME を一時ディレクトリに設定し config を作成すると config-file-exists が pass", async () => {
    // 1. Set XDG_CONFIG_HOME to isolated temp dir
    process.env["XDG_CONFIG_HOME"] = tmpDir;

    // 2. Import getConfigPath (uses process.env.XDG_CONFIG_HOME at call time)
    //    Note: module may be cached; the key is that getConfigPath reads process.env at call time
    const { getConfigPath } = await import("../../../src/util/xdg.js");
    const configPath = getConfigPath();

    // Verify getConfigPath returned the XDG-aware path
    expect(configPath).toBe(path.join(tmpDir, "specrunner", "config.json"));
    expect(configPath).not.toContain(os.homedir());

    // 3. Create config file at the XDG path
    const configDir = path.dirname(configPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({ version: 1 }), { mode: 0o600 });

    // 4. Build DoctorContext with ctx.configPath set via getConfigPath()
    //    This simulates what src/cli/doctor.ts will do after T-07 implementation.
    const { configFileExistsCheck } = await import(
      "../../../src/core/doctor/checks/config/file-exists.js"
    );
    const { buildMockContext } = await import("../../core/doctor/mock-context.js");
    const { DoctorContext: _DC } = await import("../../../src/core/doctor/types.js").catch(
      () => ({ DoctorContext: undefined }),
    );

    // Real fs.stat for this integration test
    const realStat = async (p: string) => {
      const stats = await fs.stat(p);
      return { mode: stats.mode, isDirectory: () => stats.isDirectory() };
    };

    // Build context with real fs.stat and configPath from getConfigPath()
    // configPath field doesn't exist in DoctorContext type yet — added by implementer.
    const ctx = {
      ...buildMockContext({
        fs: {
          stat: realStat,
          existsSync: fsSync.existsSync,
          readdirSync: (p: string) => fsSync.readdirSync(p) as string[],
          access: fsSync.promises.access,
          constants: fsSync.constants,
          readFile: (p: string, enc: "utf-8") => fsSync.promises.readFile(p, enc),
        },
        homeDir: os.homedir(),
      }),
      configPath, // injected from getConfigPath() — XDG-aware
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // 5. Run the check
    const result = await configFileExistsCheck.check(ctx);

    // With implementation: uses ctx.configPath → file found at XDG path → pass
    // Without implementation: uses homeDir/.config/specrunner/config.json → ENOENT → fail
    expect(result.status).toBe("pass");
  });

  it("XDG_CONFIG_HOME を設定しても homeDir 固定パスに config が無くても通る", async () => {
    process.env["XDG_CONFIG_HOME"] = tmpDir;

    const { getConfigPath } = await import("../../../src/util/xdg.js");
    const configPath = getConfigPath();

    // Create config only at XDG path
    const configDir = path.dirname(configPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({ version: 1 }), { mode: 0o600 });

    // homeDir fixed path should NOT have a config (or it might exist on the test system)
    const homeDirFixed = path.join(os.homedir(), ".config", "specrunner", "config.json");

    // Only run this assertion if the homeDir fixed path is different from XDG path
    // (which it should be, since tmpDir is different from os.homedir())
    if (homeDirFixed !== configPath) {
      const { configFileExistsCheck } = await import(
        "../../../src/core/doctor/checks/config/file-exists.js"
      );
      const { buildMockContext } = await import("../../core/doctor/mock-context.js");

      // Real stat that only sees the XDG path
      const limitedStat = async (p: string) => {
        if (p === configPath) {
          const stats = await fs.stat(p);
          return { mode: stats.mode, isDirectory: () => stats.isDirectory() };
        }
        // Return ENOENT for homeDir fixed path
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      };

      const ctx = {
        ...buildMockContext({
          fs: {
            stat: limitedStat,
            existsSync: fsSync.existsSync,
            readdirSync: (p: string) => fsSync.readdirSync(p) as string[],
            access: fsSync.promises.access,
            constants: fsSync.constants,
            readFile: (p: string, enc: "utf-8") => fsSync.promises.readFile(p, enc),
          },
          homeDir: os.homedir(),
        }),
        configPath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const result = await configFileExistsCheck.check(ctx);
      expect(result.status).toBe("pass");
    }
  });
});
