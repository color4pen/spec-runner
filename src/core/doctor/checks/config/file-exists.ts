/**
 * TC-009, TC-010, TC-011, TC-071
 * Check that config file exists and has secure permissions (0600).
 * On Windows (win32), permission check returns warn instead of fail.
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const configFileExistsCheck: DoctorCheck = {
  name: "config-file-exists",
  category: "config",
  required: true,

  async check(ctx: DoctorContext) {
    const configPath = path.join(ctx.homeDir, ".config", "specrunner", "config.json");

    // If the config file was found but failed to parse, report before stat
    if (ctx.config.loadError !== undefined) {
      // Determine which file failed: project-local (if error says so) or user-global (fallback).
      const failedPath = ctx.config.loadError.includes("project local config")
        ? path.join(ctx.cwd, ".specrunner", "config.json")
        : configPath;
      return {
        status: "fail" as const,
        message: `Config file is malformed: ${ctx.config.loadError}`,
        hint: `Fix or regenerate ${failedPath} by running 'specrunner init'.`,
      };
    }

    let stat: { mode: number; isDirectory(): boolean };
    try {
      stat = await ctx.fs.stat(configPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return {
          status: "fail",
          message: `Config file not found: ${configPath}`,
          hint: "Run 'specrunner init' first.",
        };
      }
      return {
        status: "fail",
        message: `Cannot access config file: ${(err as Error).message}`,
        hint: "Run 'specrunner init' first.",
      };
    }

    // Check permissions (unix-only)
    const platform = ctx.platform;
    if (platform === "win32") {
      // Windows: skip permission check
      return {
        status: "pass",
        message: `Config file exists (permission check skipped on Windows)`,
      };
    }

    const mode = stat.mode & 0o777;
    if (mode !== 0o600) {
      return {
        status: "warn",
        message: `Config file has permissions ${mode.toString(8)} (expected 0600)`,
        hint: `Run: chmod 600 ${configPath}`,
      };
    }

    return {
      status: "pass",
      message: `Config file exists with correct permissions (0600)`,
    };
  },
};
