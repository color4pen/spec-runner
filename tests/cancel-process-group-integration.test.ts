/**
 * TC-021: Integration — detach-started job cancel leaves no process-group survivors.
 *
 * Spawns a real leader process with detached: true (POSIX group leader),
 * that itself spawns a longer-lived child in the same group.
 * Runs the cancel graceful-kill path with the production isGroupLeader probe
 * and a short escalation timeout so SIGKILL fires.
 * After the kill, asserts no process in the group survives.
 *
 * 破壊確認: stubbing isGroupLeader to () => false leaves the child alive → test fails.
 * POSIX only — skipped on win32.
 */
import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { gracefulKill } from "../src/core/cancel/pid-kill.js";
import type { KillDeps } from "../src/core/cancel/pid-kill.js";

// Skip the entire suite on Windows
const itPosix = process.platform === "win32" ? it.skip : it;

// Track spawned pids for afterEach cleanup
const spawnedLeaderPids: number[] = [];

afterEach(() => {
  // Best-effort cleanup: kill any surviving process groups
  for (const pid of spawnedLeaderPids.splice(0)) {
    try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
  }
});

/**
 * Production isGroupLeader probe: succeeds iff the process group `pid` exists.
 * A detached child is its own group leader (pgid == pid) → success.
 * A foreground child is in the shell's group → no group for pid → ESRCH.
 */
function productionIsGroupLeader(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll until `kill(-leaderPid, 0)` throws ESRCH (group fully gone) or deadline elapses.
 * Returns true when the group is gone within the deadline.
 */
async function waitForGroupGone(leaderPid: number, deadlineMs: number): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      process.kill(-leaderPid, 0);
      // Group still exists — wait a bit
      await new Promise<void>((r) => setTimeout(r, 50));
    } catch {
      // ESRCH or EPERM: group is gone
      return true;
    }
  }
  return false;
}

describe("TC-021: cancel leaves no process-group survivors (POSIX integration)", () => {
  itPosix("TC-021: leader and child both gone after cancel with group kill", async () => {
    // Spawn a leader process (detached: true) that itself spawns a long-lived child.
    // The leader is a node script that: spawns sleep, prints pids, then sleeps forever.
    const leaderScript = `
      const { spawn } = require('child_process');
      // Spawn a long-lived child in the same process group
      const child = spawn('sleep', ['60'], { detached: false, stdio: 'ignore' });
      child.unref();
      // Print leader pid + child pid so the test can read them
      process.stdout.write(JSON.stringify({ leader: process.pid, child: child.pid }) + '\\n');
      // Keep the leader alive indefinitely
      setInterval(() => {}, 10000);
    `;

    const leader = spawn(process.execPath, ["-e", leaderScript], {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    leader.unref();

    const leaderPid = leader.pid!;
    spawnedLeaderPids.push(leaderPid);

    // Read pids from leader stdout
    const pids: { leader: number; child: number } = await new Promise((resolve, reject) => {
      let buf = "";
      const timeout = setTimeout(() => reject(new Error("timed out waiting for leader to start")), 5000);
      leader.stdout!.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        const nl = buf.indexOf("\n");
        if (nl !== -1) {
          clearTimeout(timeout);
          resolve(JSON.parse(buf.slice(0, nl)));
        }
      });
    });

    expect(pids.leader).toBe(leaderPid);

    // Verify both processes are alive before the kill
    expect(() => process.kill(pids.leader, 0)).not.toThrow();
    expect(() => process.kill(pids.child, 0)).not.toThrow();

    // Verify leader is a group leader (pgid == pid — POSIX invariant for detached spawn)
    expect(productionIsGroupLeader(leaderPid)).toBe(true);

    // Run gracefulKill with a short timeout so SIGKILL fires quickly
    const deps: KillDeps = {
      kill: (pid: number, signal: string) => { process.kill(pid, signal as NodeJS.Signals); },
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
      isAlive: (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } },
      isGroupLeader: productionIsGroupLeader,
    };

    // Use a short timeout (200ms) so the test doesn't take too long
    const result = await gracefulKill(leaderPid, 200, deps);

    // TC-021: kill must succeed
    expect(result.killed).toBe(true);
    // TC-021: group must have been reaped
    expect((result as { groupKilled?: boolean }).groupKilled).toBe(true);

    // TC-021: wait for the group to fully disappear (bounded)
    const groupGone = await waitForGroupGone(leaderPid, 3000);
    expect(groupGone).toBe(true);
  });

  itPosix("TC-021 (破壊確認): child survives when isGroupLeader returns false", async () => {
    // Spawn leader + child as above
    const leaderScript = `
      const { spawn } = require('child_process');
      const child = spawn('sleep', ['60'], { detached: false, stdio: 'ignore' });
      child.unref();
      process.stdout.write(JSON.stringify({ leader: process.pid, child: child.pid }) + '\\n');
      setInterval(() => {}, 10000);
    `;

    const leader = spawn(process.execPath, ["-e", leaderScript], {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    leader.unref();

    const leaderPid = leader.pid!;
    spawnedLeaderPids.push(leaderPid);

    const pids: { leader: number; child: number } = await new Promise((resolve, reject) => {
      let buf = "";
      const timeout = setTimeout(() => reject(new Error("timed out")), 5000);
      leader.stdout!.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        const nl = buf.indexOf("\n");
        if (nl !== -1) {
          clearTimeout(timeout);
          resolve(JSON.parse(buf.slice(0, nl)));
        }
      });
    });

    // 破壊確認: stub isGroupLeader → false to simulate the pre-fix state
    const deps: KillDeps = {
      kill: (pid: number, signal: string) => { process.kill(pid, signal as NodeJS.Signals); },
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
      isAlive: (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } },
      isGroupLeader: () => false, // 破壊確認: stub to false — no group kill
    };

    await gracefulKill(leaderPid, 200, deps);

    // Brief wait for OS to settle
    await new Promise<void>((r) => setTimeout(r, 200));

    // 破壊確認: WITHOUT group kill, the child (sleep) must still be alive
    // This assertion fails when group kill is disabled → confirms group kill is needed
    let childAlive = false;
    try {
      process.kill(pids.child, 0);
      childAlive = true;
    } catch {
      childAlive = false;
    }
    // The test asserts the child IS still alive (failure = group kill unexpectedly ran)
    expect(childAlive).toBe(true);
  });
});
