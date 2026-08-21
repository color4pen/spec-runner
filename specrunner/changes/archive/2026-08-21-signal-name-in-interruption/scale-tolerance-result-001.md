# Scale-Tolerance Review — signal-name-in-interruption (Iteration 1)

**Reviewer**: scale-tolerance  
**Date**: 2026-08-20  
**Branch**: fix/signal-name-in-interruption-5ff912e4  

---

## Scope

Checked all code paths introduced or touched by this PR for O(n) cost growth relative to monotonically increasing targets (archives, sidecars, issues/PRs, comments, journals).

---

## Evidence Summary

| Area | Change | Scale verdict |
|------|--------|---------------|
| `InterruptionRecord` type | `signal?: "SIGINT"\|"SIGTERM"\|"SIGHUP"` optional field added | O(1) per record — clean |
| `local.ts signalCleanup` | Signal name threaded from Node callback → `appendInterruption` record + `transitionJob` message | O(1) per signal event — clean |
| `managed.ts signalCleanup` | Signal name threaded → `transitionJob` message only | O(1) per signal event — pre-existing `store.load()` call unchanged |
| SIGHUP registration/deregistration | `process.on/off("SIGHUP", ...)` added symmetrically in both runtimes | O(1) per job lifecycle — clean |
| `fold()` in `event-journal.ts` | Pre-existing O(n) scan; the change adds no new scanning — `lastInterruption` assignment already captured the whole record including any added fields | Unchanged O(n) — no regression |
| `composeSplitLayoutFromContent` | Reads `lastInterruption.reason`, `exhaustionPhase`, `iterationsExhausted` — does NOT consume new `signal` field | Unchanged — clean |
| Test `signal-name-in-interruption.test.ts` | `setTimeout(resolve, 50)` for exit-guard settling; all other assertions are direct spy calls | Fixed 50 ms — no size-dependent delay |

---

## Detailed Analysis

### 1. InterruptionRecord field addition

`src/store/event-journal.ts` adds `signal?: "SIGINT" | "SIGTERM" | "SIGHUP"` to `InterruptionRecord`. This is a write-once optional field that travels with a single journal record at most once per signal interruption. No iteration, no accumulation of additional API calls.

### 2. local.ts — signalCleanup

The closure now accepts `(signal: NodeJS.Signals)` and passes it through to:
- `appendInterruption({ …, signal: signal as "SIGINT"|"SIGTERM"|"SIGHUP" })` — one `fs.appendFile` call with ~20 additional bytes. No loop, no scan.
- `transitionJob` `reason` string template — string interpolation is O(signal_name_length), constant ≤ 8 chars.

The existing `store.load()` before `appendInterruption` (line ~1693) was already present; this PR does not add a new load call.

### 3. managed.ts — signalCleanup

Identical analysis. `store.load()` at line ~745 was pre-existing. The only change is the `transitionJob` `reason` string template. No new I/O is introduced.

### 4. SIGHUP handler registration

`process.on("SIGHUP", signalCleanup)` and the symmetric `process.off` in `teardown` are O(1) syscall-level operations per job lifetime. Adding a third signal to the existing two (SIGINT, SIGTERM) does not create a loop over any growing collection.

### 5. fold() — no regression

`fold()` already performed an O(n) pass through events.jsonl on every `load()` that sees new events. The change does not touch the fold loop body for interruption records — the assignment `lastInterruption = obj as unknown as InterruptionRecord` captures the entire object including the new `signal` field without additional branches. The fast-path check in `persist()` (`fastPathEligible`) remains unaffected.

### 6. resumePoint materialization

`composeSplitLayoutFromContent` builds `resumePoint` from `lastInterruption.reason` and `exhaustionPhase` only. The new `signal` field is not read here and does not trigger any additional I/O or loops.

### 7. Test file scale safety

The `setTimeout(resolve, 50)` in TC-004 is a fixed-size microtask settling delay, not proportional to any data volume. All other tests use synchronous spy assertions after a single awaited call.

---

## Findings

No scale-tolerance issues detected. All changed code paths are O(1) with respect to monotonically growing targets. Pre-existing O(n) patterns (`fold()`, `store.load()`) are unchanged by this PR.

---

## Evidence Counts

- **Checked**: 7 (InterruptionRecord type, local.ts signalCleanup, managed.ts signalCleanup, SIGHUP registration, fold() scan, resumePoint materialization, test file)
- **Skipped**: 0
- **Unverified**: 0
