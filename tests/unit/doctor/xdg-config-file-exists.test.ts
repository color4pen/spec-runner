/**
 * TC-011: XDG 隔離下で config-file-exists が pass する
 * TC-012: パス固定へ戻すと XDG テストが落ちる（破壊確認）
 *
 * Source: spec.md > config-file-exists は getConfigPath と同一の解決規則で config パスを求める
 *
 * Design D4: DoctorContext に configPath: string を追加し、file-exists.ts は ctx.configPath を使う。
 *
 * 実装前は RED:
 *   - DoctorContext に configPath が無い → ctx.configPath が undefined
 *   - file-exists.ts が homeDir 固定パスを使うため XDG パスの config を認識できず fail
 */
import { describe, it, expect, vi } from "vitest";
import { configFileExistsCheck } from "../../../src/core/doctor/checks/config/file-exists.js";
import { buildMockContext, buildMockFs } from "../../core/doctor/mock-context.js";
import type { DoctorContext } from "../../../src/core/doctor/types.js";

// ---------------------------------------------------------------------------
// TC-011: XDG 隔離下で config-file-exists が pass する
//
// 手法: ctx.configPath を XDG 隔離パスに設定し、stat がそのパスで成功するよう mock する。
//       homeDir 下の固定パスには stat が無い（ENOENT）。
//       実装が ctx.configPath を使えば pass、homeDir 固定なら fail。
// ---------------------------------------------------------------------------
describe("TC-011: XDG 隔離下で config-file-exists が pass する", () => {
  const xdgConfigPath = "/xdg-isolated/specrunner/config.json";
  const homeDirFixedPath = "/fake/home/.config/specrunner/config.json";

  it("ctx.configPath を XDG パスに override すると pass になる", async () => {
    const mockStat = vi.fn().mockImplementation(async (p: string) => {
      if (p === xdgConfigPath) {
        return { mode: 0o100600, isDirectory: () => false };
      }
      // Any other path (including homeDir fixed path) → ENOENT
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    const mockFs = buildMockFs({ stat: mockStat });

    // configPath field is not yet in DoctorContext type — added by implementer.
    // Cast to unknown to allow the override field through.
    const ctx = {
      ...buildMockContext({ fs: mockFs }),
      configPath: xdgConfigPath,
    } as unknown as DoctorContext;

    const result = await configFileExistsCheck.check(ctx);
    // With new implementation (ctx.configPath used): pass
    // With old implementation (homeDir fixed): stat(homeDirFixedPath) → ENOENT → fail
    expect(result.status).toBe("pass");
  });

  it("homeDir 固定パスに config が無く XDG パスにのみある場合、ctx.configPath 使用で pass", async () => {
    const mockStat = vi.fn().mockImplementation(async (p: string) => {
      if (p === xdgConfigPath) {
        return { mode: 0o100600, isDirectory: () => false };
      }
      // homeDir fixed path intentionally absent → ENOENT
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    const mockFs = buildMockFs({ stat: mockStat });

    const ctx = {
      ...buildMockContext({ fs: mockFs }),
      configPath: xdgConfigPath,
    } as unknown as DoctorContext;

    const result = await configFileExistsCheck.check(ctx);
    expect(result.status).toBe("pass");

    // Verify that check used the XDG path, not the homeDir fixed path
    const calledPaths = mockStat.mock.calls.map((c: unknown[]) => c[0] as string);
    // At least one call must be to the XDG path
    expect(calledPaths.some((p) => p === xdgConfigPath)).toBe(true);
    // No call to the homeDir fixed path (would indicate reversion to fixed path)
    expect(calledPaths.some((p) => p === homeDirFixedPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-012: パス固定への退行は XDG 条件下で fail になることを示す（破壊確認）
//
// TC-011 の第2テストケース（stat 呼び出し先の検証）が実質的な破壊確認を兼ねる。
// 以下では「旧実装相当の挙動」を直接検証し、旧挙動では fail になることを明示する。
// ---------------------------------------------------------------------------
describe("TC-012: パス固定への退行は XDG 条件下で fail になる（破壊確認）", () => {
  const xdgConfigPath = "/xdg-isolated/specrunner/config.json";

  it("check が stat を XDG パスで呼ばず homeDir 固定パスで呼ぶと ENOENT で fail になる", async () => {
    // Demonstrate: old implementation calls stat(homeDir/.config/specrunner/config.json)
    // which is ENOENT → status "fail"
    const mockStat = vi.fn().mockImplementation(async (p: string) => {
      if (p === xdgConfigPath) {
        // XDG path HAS the config — but old impl never calls this
        return { mode: 0o100600, isDirectory: () => false };
      }
      // Everything else (including homeDir fixed) → ENOENT
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    // Context WITHOUT configPath override — simulates pre-implementation state
    // After implementation, buildMockContext will have default configPath = homeDirFixed
    // which also has ENOENT → fail → same outcome, proving both old and new-without-XDG fail
    const ctx = buildMockContext({
      fs: buildMockFs({ stat: mockStat }),
      homeDir: "/fake/home",
    });

    const result = await configFileExistsCheck.check(ctx);

    // Whether pre-impl (homeDir fixed) or post-impl with default mock configPath (also homeDir),
    // the check should fail because the homeDir path has ENOENT.
    // This confirms: only when ctx.configPath = XDG path does the check pass.
    expect(result.status).toBe("fail");
  });

  it("stat 呼び出しを xdgConfigPath に向けると pass し homeDir 固定に戻すと fail になることを示す", async () => {
    // Scenario A: configPath = xdgConfigPath → pass (new impl)
    const statA = vi.fn().mockImplementation(async (p: string) => {
      if (p === xdgConfigPath) return { mode: 0o100600, isDirectory: () => false };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    const ctxA = {
      ...buildMockContext({ fs: buildMockFs({ stat: statA }) }),
      configPath: xdgConfigPath,
    } as unknown as DoctorContext;
    const resultA = await configFileExistsCheck.check(ctxA);
    expect(resultA.status).toBe("pass"); // new impl: pass

    // Scenario B: no configPath override (pre-impl: homeDir fixed path, which has no config)
    const statB = vi.fn().mockImplementation(async (p: string) => {
      if (p === xdgConfigPath) return { mode: 0o100600, isDirectory: () => false };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    const ctxB = buildMockContext({ fs: buildMockFs({ stat: statB }), homeDir: "/fake/home" });
    const resultB = await configFileExistsCheck.check(ctxB);
    expect(resultB.status).toBe("fail"); // old impl: fail (homeDir path has ENOENT)
  });
});
