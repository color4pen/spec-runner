# ADR: Verbose Execution Log

**Date**: 2026-05-19
**Status**: Accepted

## Context

Pipeline execution observability is limited. When a run fails or behaves unexpectedly, there is no structured log to inspect. The only output is stderr messages designed for the operator, not for forensic analysis.

## Decision

Add a `--verbose` flag (and `SPECRUNNER_LOG_LEVEL=verbose` env var) that writes a structured JSON Lines log to `$XDG_STATE_HOME/specrunner/logs/<jobId>.log`.

## ADR Decisions

### 1. Log format: JSON Lines

**Decision**: JSON Lines (one JSON object per line).

**Alternatives considered**:
- Plain text: human-readable but not machine-queryable
- JSON array: requires reading the whole file to parse; incompatible with append mode

**Rationale**: `tail -f <file> | jq .` enables real-time monitoring. `jq 'select(.component == "poll")'` enables component-level filtering. Append mode works naturally — each line is a complete, parseable record. This matches the format used by other structured logging systems (NDJSON).

### 2. Timestamp precision: ISO 8601 milliseconds

**Decision**: `new Date().toISOString()` — same format as existing `startedAt` / `completedAt` fields in job state.

**Rationale**: Consistency with existing codebase. Millisecond precision is sufficient for pipeline-level timing analysis.

### 3. Log destination: XDG_STATE_HOME

**Decision**: `$XDG_STATE_HOME/specrunner/logs/<jobId>.log` (default: `~/.local/state/specrunner/logs/`).

**Rationale**: XDG Base Directory Specification defines `$XDG_STATE_HOME` as the location for "state data that should persist between (application) restarts, but that is not important or portable enough to the user that it should be stored in $XDG_DATA_HOME". Logs match this definition exactly. They are distinct from job state files (stored in `$XDG_DATA_HOME`) — logs are append-only observability data, not canonical state.

### 4. Configuration path: module-level global state + resolveVerboseFlag()

**Decision**: Extend the existing module-level `verbose` flag in `src/logger/stdout.ts` with:
- `logFd: number | null` — file descriptor for the current log file
- `resolveVerboseFlag(cliFlag)` — resolves from CLI flag OR `SPECRUNNER_LOG_LEVEL` env var
- `initVerboseLog(jobId)` / `closeVerboseLog()` — lifecycle management

**DI for tests**: Tests set `XDG_STATE_HOME` to a temp directory and call `setVerbose(true)` + `initVerboseLog()` / `closeVerboseLog()` directly. No dependency injection framework needed.

**Rationale**: Consistent with the existing `verbose` flag pattern. Module-level state is appropriate here because verbose logging is a process-wide concern set once at startup. The alternative (passing a logger object through all call sites) would require invasive API changes across all instrumented files.

## Log Entry Schema

```typescript
interface VerboseLogEntry {
  ts: string;         // ISO 8601 (e.g. "2026-05-19T10:30:00.123Z")
  component: string;  // "sse" | "poll" | "session" | "step"
  message: string;    // human-readable event description
  [key: string]: unknown;  // event-specific data
}
```

## Consequences

- Log files accumulate in `~/.local/state/specrunner/logs/`. Cleanup is the user's responsibility (future: `specrunner gc logs`).
- Sensitive values (API keys, tokens) are masked via `maskSensitive()` before writing.
- Verbose log failure (e.g., disk full) must not block the pipeline — errors are caught and written to stderr only.
- Same `<jobId>.log` file is appended to on retry/resume, providing a single log per job across all attempts.
