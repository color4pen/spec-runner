# Tasks: doctor-reads-project-config

## T-01: Replace `loadConfig()` with `loadConfigWithOverlay()` in doctor.ts

- [ ] In `src/cli/doctor.ts`, add import for `loadConfigWithOverlay` from `"../cli/load-config-with-overlay.js"`.
- [ ] Remove (or keep unused, but prefer removal of) the import of `loadConfig` from `"../config/store.js"` if it is no longer used after the substitution.
- [ ] At line ~99 (inside the `try` block in `runDoctor`), replace:
  ```ts
  rawConfig = await loadConfig();
  ```
  with:
  ```ts
  rawConfig = await loadConfigWithOverlay();
  ```
- [ ] Verify no other references to `loadConfig` remain in `doctor.ts` (use grep to confirm).

**Acceptance Criteria**:
- `src/cli/doctor.ts` no longer imports or calls `loadConfig()` directly (unless it still imports it for another reason — check carefully).
- `src/cli/doctor.ts` imports and calls `loadConfigWithOverlay()` in the config-load try block.
- `bun run typecheck` passes with no new errors.

---

## T-02: Unit tests for `aozu-cli` check — project-local designLayer overlay paths

Create `src/core/doctor/checks/runtime/__tests__/aozu-cli.test.ts`.

- [ ] Add a `makeCtx` helper that builds a minimal `DoctorContext` with injectable `config.get` and `execFile`.
- [ ] Write test: **designLayer disabled (default)** — `config.get("designLayer.enabled")` returns `undefined`/`false` → check returns `status: "pass"` with "disabled" in the message, `execFile` is NOT called.
- [ ] Write test: **designLayer enabled, aozu absent** — `config.get("designLayer.enabled")` returns `true`, `execFile` throws an error → check returns `status: "fail"` with message indicating aozu is not installed or not in PATH.
- [ ] Write test: **designLayer enabled, aozu present** — `config.get("designLayer.enabled")` returns `true`, `execFile` resolves → check returns `status: "pass"` with message confirming aozu is available.
- [ ] Write test: **custom designLayer.command** — `config.get("designLayer.enabled")` returns `true`, `config.get("designLayer.command")` returns `"my-aozu"`, `execFile` resolves → check message references `"my-aozu"`.

**Acceptance Criteria**:
- All four test cases pass with `bun run test`.
- Tests use `vi.fn()` for `execFile` — no real process spawning.
- Test file follows the pattern in `src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts`.

---

## T-03: Integration-style tests for doctor config overlay wiring

Create `src/cli/__tests__/doctor-config-overlay.test.ts`.

- [ ] Mock `loadConfigWithOverlay` from `"../../cli/load-config-with-overlay.js"` using `vi.mock`.
- [ ] Write test: **project-local runtime overlay reaches ctx.config** — mock `loadConfigWithOverlay` to return a config with `runtime: "managed"` and `designLayer.enabled: false`. Call `runDoctor({ json: true })` (with all checks mocked to return `pass` to avoid side-effects). Assert the resolved runtime determines the managed check set is used (verify via spy on `managedChecks` inclusion or by inspecting the returned JSON output for a managed-only check name).
  
  _Alternative simpler approach_: Rather than testing `runDoctor` end-to-end (which pulls in many deps), test the wiring at a lower level: verify that when `loadConfigWithOverlay` is called inside `runDoctor`, the resulting `ctx.config.get("runtime")` returns the mocked value. Use `vi.spyOn` or a stub `runChecks` to capture `ctx`.

- [ ] Write test: **outside git repo — user-global only (no crash)** — mock `loadConfigWithOverlay` to resolve with a minimal valid user-global config (no designLayer overlay). Assert `runDoctor` exits cleanly (returns 0 when all checks pass).

- [ ] Write test: **configLoadError propagates** — mock `loadConfigWithOverlay` to throw a `SpecRunnerError` with `CONFIG_MISSING`. Assert `configLoadError` is set and the return value from `runDoctor` is 1 (fail) — because `config-file-exists` check will fail when `ctx.config.loaded === false`.

**Acceptance Criteria**:
- All three test cases pass with `bun run test`.
- Tests do not spawn real git processes or read real config files from disk.
- `vi.mock` is used at module level following vitest conventions.

---

## T-04: Build and quality gate

- [ ] Run `bun run build` — confirm zero TypeScript compile errors.
- [ ] Run `bun run typecheck` — confirm zero type errors.
- [ ] Run `bun run test` — confirm all existing tests still pass and new tests pass.
- [ ] Run `bun run lint` — confirm no lint violations.

**Acceptance Criteria**:
- `bun run build && bun run typecheck && bun run test && bun run lint` exits 0 with no failures.
