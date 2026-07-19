/**
 * Group 3: `JobJournal` in-process anchor 統合 — `job-journal.ts`
 *
 * TC-009: `JobJournal` の全 mutation 経路で holder が on-disk と byte・digest 一致する
 * TC-010: Resume seed が最初の `persist` で on-disk を1度だけ読み、以後は再読しない
 * TC-011: `JournalAnchorHolder` が注入されていない場合は従来挙動が無変更
 *
 * Source: tasks.md > T-03 / design.md > D2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { JobJournal } from "../job-journal.js";
import { JobLocationResolver } from "../job-location-resolver.js";
import { JournalAnchorHolder, computeJournalDigest } from "../journal-anchor.js";
import type { JobState } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "journal-anchor-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "bug-fix",
      slug: "test-slug",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "change/test-slug-abc12345",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

/** Create a JobJournal that writes to a tmpdir using changeDir mode */
function makeJournal(changeDir: string, holder?: JournalAnchorHolder): JobJournal {
  const resolver = new JobLocationResolver("job-001", "/fake-root", { changeDir });
  return new JobJournal(resolver, holder);
}

// ---------------------------------------------------------------------------
// TC-009: All mutation paths keep holder in sync with on-disk
// ---------------------------------------------------------------------------

describe("TC-009: JobJournal の全 mutation 経路で holder が on-disk と byte・digest 一致する", () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-009-"));
  });

  afterEach(async () => {
    await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("TC-009: fresh write → holder.snapshot().digest == computeJournalDigest(on-disk)", async () => {
    const holder = new JournalAnchorHolder();
    const journal = makeJournal(tmpdir, holder);
    const state = makeJobState();

    await journal.persist(state);

    const snap = holder.snapshot();
    expect(snap).not.toBeNull();

    const onDiskEvents = await fs.readFile(path.join(tmpdir, "events.jsonl"), "utf-8").catch(() => "");
    const onDiskState  = await fs.readFile(path.join(tmpdir, "state.json"),   "utf-8");

    const expected = computeJournalDigest(onDiskEvents, onDiskState);
    expect(snap!.digest).toBe(expected);
  });

  it("TC-009: delta write — append history entry → holder stays in sync", async () => {
    const holder = new JournalAnchorHolder();
    const journal = makeJournal(tmpdir, holder);
    const state = makeJobState();

    // First persist (fresh)
    await journal.persist(state);

    // Second persist (delta: add a history entry)
    const state2: JobState = {
      ...state,
      history: [
        { step: "implementer-started", status: "success", message: "started", ts: "2026-01-01T00:01:00.000Z" },
      ],
    };
    await journal.persist(state2);

    const snap = holder.snapshot();
    expect(snap).not.toBeNull();

    const onDiskEvents = await fs.readFile(path.join(tmpdir, "events.jsonl"), "utf-8").catch(() => "");
    const onDiskState  = await fs.readFile(path.join(tmpdir, "state.json"),   "utf-8");

    expect(snap!.digest).toBe(computeJournalDigest(onDiskEvents, onDiskState));
  });

  it("TC-009: appendInterruption → holder stays in sync with events.jsonl", async () => {
    const holder = new JournalAnchorHolder();
    const journal = makeJournal(tmpdir, holder);
    const state = makeJobState();

    await journal.persist(state);

    await journal.appendInterruption({
      type: "interruption",
      reason: "timeout",
      ts: "2026-01-01T00:02:00.000Z",
    });

    const snap = holder.snapshot();
    expect(snap).not.toBeNull();

    const onDiskEvents = await fs.readFile(path.join(tmpdir, "events.jsonl"), "utf-8").catch(() => "");
    const onDiskState  = await fs.readFile(path.join(tmpdir, "state.json"),   "utf-8");

    expect(snap!.digest).toBe(computeJournalDigest(onDiskEvents, onDiskState));
  });

  it("TC-009: appendLineage → holder stays in sync with events.jsonl", async () => {
    const holder = new JournalAnchorHolder();
    const journal = makeJournal(tmpdir, holder);
    const state = makeJobState();

    await journal.persist(state);

    await journal.appendLineage({
      type: "lineage",
      commitOid: "abc123",
      stepName: "implementer",
      artifacts: [],
      ts: "2026-01-01T00:03:00.000Z",
    });

    const snap = holder.snapshot();
    expect(snap).not.toBeNull();

    const onDiskEvents = await fs.readFile(path.join(tmpdir, "events.jsonl"), "utf-8").catch(() => "");
    const onDiskState  = await fs.readFile(path.join(tmpdir, "state.json"),   "utf-8");

    expect(snap!.digest).toBe(computeJournalDigest(onDiskEvents, onDiskState));
  });
});

// ---------------------------------------------------------------------------
// TC-010: Resume seed — on-disk is read exactly once on first persist
// ---------------------------------------------------------------------------

describe("TC-010: Resume seed が最初の persist で on-disk を1度だけ読み、以後は再読しない", () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-010-"));
  });

  afterEach(async () => {
    await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("TC-010: first persist on existing journal seeds holder once", async () => {
    // Create existing journal as if it was persisted in a prior process
    const priorHolder = new JournalAnchorHolder();
    const priorJournal = makeJournal(tmpdir, priorHolder);
    const state = makeJobState();
    await priorJournal.persist(state);

    // Now simulate a new process: new holder that hasn't been seeded
    const newHolder = new JournalAnchorHolder();
    expect(newHolder.isSeeded()).toBe(false);

    const newJournal = makeJournal(tmpdir, newHolder);

    // Persist a delta (state only change)
    const state2: JobState = { ...state, step: "verification" as const };
    await newJournal.persist(state2);

    // After first persist, holder must be seeded
    expect(newHolder.isSeeded()).toBe(true);

    // Snapshot should now have a valid digest
    const snap = newHolder.snapshot();
    expect(snap).not.toBeNull();

    const onDiskEvents = await fs.readFile(path.join(tmpdir, "events.jsonl"), "utf-8").catch(() => "");
    const onDiskState  = await fs.readFile(path.join(tmpdir, "state.json"),   "utf-8");

    expect(snap!.digest).toBe(computeJournalDigest(onDiskEvents, onDiskState));
  });

  it("TC-010: subsequent persists do not re-seed (holder stays seeded)", async () => {
    // Create existing journal
    const priorJournal = makeJournal(tmpdir, new JournalAnchorHolder());
    await priorJournal.persist(makeJobState());

    const newHolder = new JournalAnchorHolder();
    const newJournal = makeJournal(tmpdir, newHolder);

    // Track seed calls
    const seedSpy = vi.spyOn(newHolder, "seed");

    // First persist seeds
    await newJournal.persist(makeJobState({ step: "verification" as const }));
    expect(seedSpy).toHaveBeenCalledTimes(1);

    // Second persist should NOT re-seed
    await newJournal.persist(makeJobState({ step: "code-review" as const }));
    expect(seedSpy).toHaveBeenCalledTimes(1); // still 1
  });
});

// ---------------------------------------------------------------------------
// TC-011: JournalAnchorHolder 未注入 → 従来挙動が無変更
// ---------------------------------------------------------------------------

describe("TC-011: JournalAnchorHolder が注入されていない場合は従来挙動が無変更", () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-011-"));
  });

  afterEach(async () => {
    await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("TC-011: persist without holder does not throw", async () => {
    const journal = makeJournal(tmpdir); // no holder
    const state = makeJobState();

    await expect(journal.persist(state)).resolves.toBeUndefined();
  });

  it("TC-011: appendInterruption without holder does not throw", async () => {
    const journal = makeJournal(tmpdir);
    const state = makeJobState();
    await journal.persist(state);

    await expect(
      journal.appendInterruption({
        type: "interruption",
        reason: "signal",
        ts: "2026-01-01T00:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
  });

  it("TC-011: state.json and events.jsonl are written as before (no regression)", async () => {
    const journal = makeJournal(tmpdir);
    const state = makeJobState({
      history: [{ step: "design-started", status: "success", message: "ok", ts: "2026-01-01T00:00:00.000Z" }],
    });

    await journal.persist(state);

    const stateJson = await fs.readFile(path.join(tmpdir, "state.json"), "utf-8");
    const parsed = JSON.parse(stateJson);
    expect(parsed.version).toBe(2);
    expect(parsed.status).toBe("running");

    const events = await fs.readFile(path.join(tmpdir, "events.jsonl"), "utf-8").catch(() => "");
    expect(events.length).toBeGreaterThan(0); // at least one event line
  });
});
