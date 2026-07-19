/**
 * Group 8: Resume authenticity 検証
 *
 * TC-030: crash→resume で journal 改竄が resume load 時に検出→復元→halt される（T4）
 * TC-031: 意図的 `awaiting-resume` 停止からの resume が halt しない（T6 resume 面）
 * TC-032: Resume 時 `branch = null` のとき検証をスキップする（pre-branch）
 * TC-033: Resume 時 origin anchor が absent のとき検証をスキップする（pre-feature / ref 不在）
 * TC-034: Resume 時 anchor fetch が unavailable のとき fail-closed で halt する
 *
 * Source: spec.md > Requirement: resume shall verify on-disk authenticity against the durable origin anchor
 *         tasks.md > T-07 / design.md > D5
 */

import { describe, it, expect, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  verifyResumeJournalAuthenticity,
} from "../verify-journal-authenticity.js";
import { computeJournalDigest } from "../../../store/journal-anchor.js";
import type { SpawnFn } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "my-feature";
const BRANCH = "change/my-feature-abc12345";

function makeSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: Array<[string, string[]]> } {
  const calls: Array<[string, string[]]> = [];
  let idx = 0;
  const fn = vi.fn(async (cmd: string, args: string[]) => {
    calls.push([cmd, args]);
    const r = responses[idx++] ?? { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: r.exitCode, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  }) as unknown as SpawnFn;
  return { fn, calls };
}

/** Create on-disk journal files in sourceChangeDir */
async function writeOnDiskJournal(
  dir: string,
  events: string,
  state: string,
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "events.jsonl"), events);
  await fs.writeFile(path.join(dir, "state.json"), state);
}

// ---------------------------------------------------------------------------
// TC-032: branch=null → skip (pre-branch state)
// ---------------------------------------------------------------------------

describe("TC-032: Resume 時 branch = null のとき検証をスキップする（pre-branch）", () => {
  it("TC-032: branch=null → returns {kind:'skip'} without calling readEvidenceAnchor", async () => {
    const { fn, calls } = makeSpawnFn([]);

    const result = await verifyResumeJournalAuthenticity({
      cwd: "/tmp/fake-repo",
      branch: null,
      sourceChangeDir: "/tmp/fake-change",
      spawnFn: fn,
    });

    expect(result).toEqual({ kind: "skip" });
    // Must not have made any git calls (no fetch)
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-033: origin anchor absent → skip (pre-feature / ref not present)
// ---------------------------------------------------------------------------

describe("TC-033: Resume 時 origin anchor が absent のとき検証をスキップする（pre-feature / ref 不在）", () => {
  it("TC-033: readEvidenceAnchor returns absent → {kind:'skip'}", async () => {
    const { fn } = makeSpawnFn([
      // fetch returns ref not found
      { exitCode: 128, stderr: "fatal: couldn't find remote ref refs/specrunner/evidence/change/my-feature" },
    ]);

    const result = await verifyResumeJournalAuthenticity({
      cwd: "/tmp/fake-repo",
      branch: BRANCH,
      sourceChangeDir: "/tmp/fake-change",
      spawnFn: fn,
    });

    expect(result).toEqual({ kind: "skip" });
  });
});

// ---------------------------------------------------------------------------
// TC-034: anchor fetch unavailable → fail-closed
// ---------------------------------------------------------------------------

describe("TC-034: Resume 時 anchor fetch が unavailable のとき fail-closed で halt する", () => {
  it("TC-034: readEvidenceAnchor returns unavailable → {kind:'unavailable', reason}", async () => {
    const { fn } = makeSpawnFn([
      // fetch fails with network error
      { exitCode: 128, stderr: "fatal: unable to connect to github.com" },
    ]);

    const result = await verifyResumeJournalAuthenticity({
      cwd: "/tmp/fake-repo",
      branch: BRANCH,
      sourceChangeDir: "/tmp/fake-change",
      spawnFn: fn,
    });

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-031: Intentional awaiting-resume checkpoint resumes without false halt (T6)
// ---------------------------------------------------------------------------

describe("TC-031: 意図的 awaiting-resume 停止からの resume が halt しない（T6 resume 面）", () => {
  it("TC-031: on-disk matches origin anchor → {kind:'ok'} (no halt)", async () => {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-031-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);

      const events = '{"type":"history","step":"implementer-started"}\n{"type":"step-run","step":"implementer"}\n';
      const state  = JSON.stringify({ version: 2, status: "awaiting-resume" }, null, 2) + "\n";

      await writeOnDiskJournal(changeDir, events, state);

      const digest = computeJournalDigest(events, state);

      // Simulate: origin anchor == on-disk digest (published by commitFinalState)
      const { fn } = makeSpawnFn([
        // fetch evidence anchor: success
        { exitCode: 0 },
        // cat-file: returns the digest that matches on-disk
        { exitCode: 0, stdout: digest + "\n" },
      ]);

      const result = await verifyResumeJournalAuthenticity({
        cwd: tmpdir,
        branch: BRANCH,
        sourceChangeDir: changeDir,
        spawnFn: fn,
      });

      expect(result).toEqual({ kind: "ok" });
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-030: crash→resume: tampered journal caught at resume load (T4)
// ---------------------------------------------------------------------------

describe("TC-030: crash→resume で journal 改竄が resume load 時に検出→復元→halt される（T4）", () => {
  it("TC-030: on-disk digest != origin anchor → {kind:'tamper'}", async () => {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-030-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);

      // Write TAMPERED on-disk journal
      const tamperedEvents = '{"type":"history"}\n{"type":"FORGED","verdict":"approved"}\n';
      const tamperedState  = JSON.stringify({ version: 2, status: "awaiting-resume", _forged: true }, null, 2) + "\n";

      await writeOnDiskJournal(changeDir, tamperedEvents, tamperedState);

      // The origin anchor holds the AUTHENTIC digest
      const authEvents = '{"type":"history"}\n';
      const authState  = JSON.stringify({ version: 2, status: "awaiting-resume" }, null, 2) + "\n";
      const authDigest = computeJournalDigest(authEvents, authState);

      const { fn } = makeSpawnFn([
        // fetch evidence anchor: success
        { exitCode: 0 },
        // cat-file: returns authentic digest (different from tampered on-disk)
        { exitCode: 0, stdout: authDigest + "\n" },
      ]);

      const result = await verifyResumeJournalAuthenticity({
        cwd: tmpdir,
        branch: BRANCH,
        sourceChangeDir: changeDir,
        spawnFn: fn,
      });

      // Tamper detected: on-disk != anchor
      expect(result.kind).toBe("tamper");
      if (result.kind === "tamper") {
        expect(result.detail).toBeTruthy();
      }
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("TC-030: restoreResumeJournal restores from origin checkpoint after tamper detection", async () => {
    // Verifies that the restore function writes origin checkpoint journal to sourceChangeDir
    const { restoreResumeJournal } = await import("../verify-journal-authenticity.js");

    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-030r-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      // On-disk: tampered
      await fs.writeFile(path.join(changeDir, "events.jsonl"), "TAMPERED\n");
      await fs.writeFile(path.join(changeDir, "state.json"), '{"forged":true}\n');

      // Origin checkpoint: authentic journal
      const originEvents = '{"type":"history"}\n{"type":"step-run","step":"implementer"}\n';
      const originState  = JSON.stringify({ version: 2, status: "awaiting-resume" }, null, 2) + "\n";
      const originDigest = computeJournalDigest(originEvents, originState);

      const { fn } = makeSpawnFn([
        // git show origin/<branch>:events.jsonl
        { exitCode: 0, stdout: originEvents },
        // git show origin/<branch>:state.json
        { exitCode: 0, stdout: originState },
        // Fetch evidence anchor to verify restoration is authentic
        { exitCode: 0 },
        { exitCode: 0, stdout: originDigest + "\n" },
      ]);

      await restoreResumeJournal({
        cwd: tmpdir,
        branch: BRANCH,
        sourceChangeDir: changeDir,
        spawnFn: fn,
        originAnchorDigest: originDigest,
      });

      // After restore, on-disk should match origin
      const restoredEvents = await fs.readFile(path.join(changeDir, "events.jsonl"), "utf-8");
      const restoredState  = await fs.readFile(path.join(changeDir, "state.json"),   "utf-8");

      expect(restoredEvents).toBe(originEvents);
      expect(restoredState).toBe(originState);
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
