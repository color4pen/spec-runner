/**
 * Group 1: Pure anchor foundation — `journal-anchor.ts` / `atomic-write.ts`
 *
 * TC-001: `computeJournalDigest` は同一 bytes に同一 digest を返す
 * TC-002: `computeJournalDigest` は 1 byte 変化で異なる digest を返す
 * TC-003: `JournalAnchorHolder` が fresh→delta→fast→interruption→lineage 系列で full bytes を保持する
 * TC-004: `evaluateAnchorPresence` が design D7 の全分岐を返す
 * TC-005: `atomicWriteJson` の出力 byte が `atomicWriteString` 経由後も従来と同一
 */

import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  computeJournalDigest,
  JournalAnchorHolder,
  evaluateAnchorPresence,
} from "../journal-anchor.js";
import { atomicWriteJson, atomicWriteString } from "../../util/atomic-write.js";

// ---------------------------------------------------------------------------
// TC-001: computeJournalDigest — 決定性
// ---------------------------------------------------------------------------

describe("TC-001: computeJournalDigest は同一 bytes に同一 digest を返す", () => {
  it("TC-001: same eventsBytes + stateBytes produce identical digest on two calls", () => {
    const events = '{"type":"step-run","step":"implementer"}\n';
    const state = JSON.stringify({ version: 2, status: "running" }, null, 2) + "\n";

    const d1 = computeJournalDigest(events, state);
    const d2 = computeJournalDigest(events, state);

    expect(d1).toBe(d2);
    expect(d1).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("TC-001: empty strings produce a stable digest", () => {
    const d1 = computeJournalDigest("", "");
    const d2 = computeJournalDigest("", "");
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^sha256:/);
  });
});

// ---------------------------------------------------------------------------
// TC-002: computeJournalDigest — 1 byte 変化で異なる digest
// ---------------------------------------------------------------------------

describe("TC-002: computeJournalDigest は 1 byte 変化で異なる digest を返す", () => {
  it("TC-002: changing one character in eventsBytes produces a different digest", () => {
    const baseEvents = '{"type":"step-run","step":"implementer"}\n';
    const modEvents  = '{"type":"step-run","step":"implementer!"}\n'; // 1 char added
    const state = JSON.stringify({ status: "running" }, null, 2) + "\n";

    expect(computeJournalDigest(baseEvents, state)).not.toBe(
      computeJournalDigest(modEvents, state),
    );
  });

  it("TC-002: changing one character in stateBytes produces a different digest", () => {
    const events = '{"type":"step-run"}\n';
    const baseState = JSON.stringify({ status: "running" }, null, 2) + "\n";
    const modState  = JSON.stringify({ status: "Running" }, null, 2) + "\n"; // case change

    expect(computeJournalDigest(events, baseState)).not.toBe(
      computeJournalDigest(events, modState),
    );
  });

  it("TC-002: swapping events and state produces a different digest (field ordering)", () => {
    const a = "events-content\n";
    const b = "state-content\n";
    expect(computeJournalDigest(a, b)).not.toBe(computeJournalDigest(b, a));
  });
});

// ---------------------------------------------------------------------------
// TC-003: JournalAnchorHolder — full bytes tracking
// ---------------------------------------------------------------------------

describe("TC-003: JournalAnchorHolder が fresh→delta→fast→interruption→lineage 系列で full bytes を保持する", () => {
  it("TC-003: snapshot().digest matches computeJournalDigest of accumulated bytes", () => {
    const holder = new JournalAnchorHolder();

    // fresh write: appendEvents lines + setState + markSeeded
    const line1 = '{"type":"history","step":"design-started"}\n';
    const line2 = '{"type":"step-run","step":"design"}\n';
    const state1 = JSON.stringify({ version: 2, step: "implementer", status: "running" }, null, 2) + "\n";

    holder.appendEvents(line1);
    holder.appendEvents(line2);
    holder.setState(state1);
    holder.markSeeded();

    const snap1 = holder.snapshot();
    expect(snap1).not.toBeNull();
    expect(snap1!.digest).toBe(computeJournalDigest(line1 + line2, state1));

    // delta write: append more events + update state
    const line3 = '{"type":"step-run","step":"implementer"}\n';
    const state2 = JSON.stringify({ version: 2, step: "verification", status: "running" }, null, 2) + "\n";

    holder.appendEvents(line3);
    holder.setState(state2);

    const snap2 = holder.snapshot();
    expect(snap2!.digest).toBe(
      computeJournalDigest(line1 + line2 + line3, state2),
    );

    // fast path: state only update
    const state3 = JSON.stringify({ version: 2, step: "code-review", status: "running" }, null, 2) + "\n";
    holder.setState(state3);

    const snap3 = holder.snapshot();
    expect(snap3!.digest).toBe(
      computeJournalDigest(line1 + line2 + line3, state3),
    );

    // interruption / lineage append
    const line4 = '{"type":"interruption","reason":"timeout"}\n';
    holder.appendEvents(line4);

    const snap4 = holder.snapshot();
    expect(snap4!.digest).toBe(
      computeJournalDigest(line1 + line2 + line3 + line4, state3),
    );
  });

  it("TC-003: snapshot returns null before any events or state are set", () => {
    const holder = new JournalAnchorHolder();
    expect(holder.snapshot()).toBeNull();
  });

  it("TC-003: isSeeded() returns false before markSeeded, true after", () => {
    const holder = new JournalAnchorHolder();
    expect(holder.isSeeded()).toBe(false);
    holder.setState("{}");
    expect(holder.isSeeded()).toBe(false);
    holder.markSeeded();
    expect(holder.isSeeded()).toBe(true);
  });

  it("TC-003: seed() pre-populates both events and state for resume scenario", () => {
    const holder = new JournalAnchorHolder();
    const events = '{"type":"history"}\n';
    const state  = '{"version":2,"status":"awaiting-resume"}\n';

    holder.seed(events, state);
    expect(holder.isSeeded()).toBe(true);

    const snap = holder.snapshot();
    expect(snap).not.toBeNull();
    expect(snap!.digest).toBe(computeJournalDigest(events, state));
    expect(snap!.events).toBe(events);
    expect(snap!.state).toBe(state);
  });

  it("TC-003: appendEvents on empty holder still accumulates correctly", () => {
    const holder = new JournalAnchorHolder();
    holder.appendEvents("line1\n");
    holder.appendEvents("line2\n");
    holder.setState("state\n");
    holder.markSeeded();

    const snap = holder.snapshot();
    expect(snap!.digest).toBe(computeJournalDigest("line1\nline2\n", "state\n"));
  });
});

// ---------------------------------------------------------------------------
// TC-004: evaluateAnchorPresence — D7 全分岐
// ---------------------------------------------------------------------------

describe("TC-004: evaluateAnchorPresence が design D7 の全分岐を返す", () => {
  it("TC-004-1: both absent + onDiskDigest null → skip (new job, no journal yet)", () => {
    const result = evaluateAnchorPresence({
      inProcess: null,
      durable: null,
      onDiskDigest: null,
    });
    expect(result).toEqual({ kind: "skip" });
  });

  it("TC-004-2: both absent + onDiskDigest present → tamper (fail-closed)", () => {
    const result = evaluateAnchorPresence({
      inProcess: null,
      durable: null,
      onDiskDigest: "sha256:abc123",
    });
    expect(result).toEqual({ kind: "tamper" });
  });

  it("TC-004-3: inProcess absent + durable present → use(durable)", () => {
    const result = evaluateAnchorPresence({
      inProcess: null,
      durable: "sha256:xyz789",
      onDiskDigest: "sha256:some",
    });
    expect(result).toEqual({ kind: "use", baseline: "sha256:xyz789" });
  });

  it("TC-004-4: inProcess present → use(inProcess) regardless of durable", () => {
    const result = evaluateAnchorPresence({
      inProcess: "sha256:foo111",
      durable: "sha256:bar222",
      onDiskDigest: "sha256:any",
    });
    expect(result).toEqual({ kind: "use", baseline: "sha256:foo111" });
  });

  it("TC-004-4b: inProcess present + durable null → use(inProcess)", () => {
    const result = evaluateAnchorPresence({
      inProcess: "sha256:foo111",
      durable: null,
      onDiskDigest: null,
    });
    expect(result).toEqual({ kind: "use", baseline: "sha256:foo111" });
  });
});

// ---------------------------------------------------------------------------
// TC-005: atomicWriteJson の出力 byte が atomicWriteString 経由後も従来と同一
// ---------------------------------------------------------------------------

describe("TC-005: atomicWriteJson の出力 byte が atomicWriteString 経由後も従来と同一", () => {
  it("TC-005: file written by atomicWriteJson matches JSON.stringify + newline byte-for-byte", async () => {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-005-"));
    const filePath = path.join(tmpdir, "state.json");

    const data = {
      version: 2,
      status: "running",
      step: "implementer",
      nested: { key: "value", arr: [1, 2, 3] },
    };

    await atomicWriteJson(filePath, data);

    const content = await fs.readFile(filePath, "utf-8");
    const expected = JSON.stringify(data, null, 2) + "\n";

    expect(content).toBe(expected);
  });

  it("TC-005: atomicWriteString writes the given string verbatim", async () => {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-005b-"));
    const filePath = path.join(tmpdir, "test.txt");

    const content = "Hello, World!\n";
    await atomicWriteString(filePath, content);

    const read = await fs.readFile(filePath, "utf-8");
    expect(read).toBe(content);
  });

  it("TC-005: atomicWriteJson is a thin wrapper — same bytes as atomicWriteString", async () => {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-005c-"));
    const jsonPath   = path.join(tmpdir, "json.json");
    const strPath    = path.join(tmpdir, "str.json");

    const data = { key: "val", num: 42 };
    const serialized = JSON.stringify(data, null, 2) + "\n";

    await atomicWriteJson(jsonPath, data);
    await atomicWriteString(strPath, serialized);

    const fromJson = await fs.readFile(jsonPath, "utf-8");
    const fromStr  = await fs.readFile(strPath, "utf-8");

    expect(fromJson).toBe(fromStr);
  });
});
