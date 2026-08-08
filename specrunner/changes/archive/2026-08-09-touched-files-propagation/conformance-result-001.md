# Conformance Result 001: touched-files-propagation

## Iteration: 1

## Evidence Summary

| Area | Checked | Result |
|------|---------|--------|
| Spec Requirements (MUST/SHALL) → Implementation | 7 requirements × scenarios | ✅ All satisfied |
| Acceptance Criteria (request.md) → Tests | 5 criteria groups | ✅ All satisfied |
| Design Decisions (D1–D6) → Implementation | 6 decisions | ✅ All satisfied |
| Regression gate (typecheck && test) | 731 test files, 10873 tests | ✅ Green (1 pre-existing skip) |

---

## Judgment 1: Spec Requirements → Implementation

### R1: 完全 input を持つ message 種別から touched files を記録する (MUST)

**Impl**: `src/adapter/claude-code/touched-files-recorder.ts`

- `extractTouchedFilesFromMessages` iterates over messages and skips any where `msg["type"] !== "assistant"` (line 65). Only `type: "assistant"` SDK messages carry fully-completed `tool_use` blocks in `message.content`.
- `content_block_start` stream events (`type: "stream_event"`) are structurally excluded — the type check on line 65 is sufficient.
- In `agent-runner.ts` the accumulator (`touchedFileMessages`) is populated only inside the main `runQuery` for-await loop (lines 640–642), not in follow-up / postWork / output-repair turns.

Scenarios TC-001 (Read/Edit/Write extraction), TC-002 (content_block_start ignored), TC-003 (Grep/Glob/Bash excluded) are covered in `src/adapter/claude-code/__tests__/touched-files-recorder.test.ts`.

### R2: 記録パスの正規化・除外・dedup・cap (MUST × 4)

**Impl**: `normalizeTouchedFilePath` in `touched-files-recorder.ts`

1. `path.resolve(cwd, filePath)` → `path.relative(cwd, resolved)` — worktree-relative.
2. Worktree-external exclusion: `relative.startsWith("..")` or `path.isAbsolute(relative)`.
3. Change-folder exclusion: delegates to `isChangeFolderPath(posixRelative)` (in `touched-files-bundle.ts`), which checks `posixRelative.startsWith(changesDirRel() + "/")`. The trailing slash (`"specrunner/changes/"`) prevents false matches on `specrunner/changes-archive/` (TC-008).
4. Dedup: `seen: Set<string>`, insertion-order preserved via `result` array.
5. Cap: `if (result.length >= MAX_TOUCHED_FILES) continue` where `MAX_TOUCHED_FILES = 100`.

Scenarios TC-004 to TC-008 covered in the recorder test.

### R3: state store への一元化永続化・再実行置換 (MUST × 3)

**Impl**: `CommitOrchestrator.commitSuccess` in `src/core/step/commit-orchestrator.ts` (lines 444–458)

```typescript
if (result.touchedFiles !== undefined) {
  const existing = s.touchedFiles ?? {};
  s = { ...s, touchedFiles: { ...existing, [step.name]: result.touchedFiles } };
}
await store.persist(s);
```

- `undefined` semantics (codex/managed) → `state.touchedFiles` not touched.
- `[]` semantics (claude-code, no eligible files) → empty entry written (TC-012).
- Replacement: object-spread with `[step.name]: ...` overwrites the existing key (TC-010).
- No disk direct-write outside the state store path.
- A crash between `appendHistory` (write 1) and `store.persist` (write 2) leaves `touchedFiles` absent for that step — explicitly documented as acceptable fail-open.

Scenarios TC-009 to TC-012 covered in `src/core/step/__tests__/commit-orchestrator-touched-files.test.ts`.

### R4: 後続 step prompt への注入 (MUST × 4)

**Impl**: `buildTouchedFilesSection` in `src/adapter/shared/touched-files-bundle.ts`

- Excludes `currentStepName` entry — prior steps only (TC-015).
- Required wording present: `"出発点のヒントであり網羅ではない。レビュー・探索の範囲をこの一覧に制限してはならない。"` (line 58).
- Returns `""` when no prior step records exist — fail-open (TC-014).
- Both adapters call `buildTouchedFilesSection(state, step.name)` (claude-code `agent-runner.ts` line 468, codex `agent-runner.ts` line 338).

Scenarios TC-013 to TC-015 (bundle unit tests) and TC-017 to TC-018 (claude-code integration), TC-024 to TC-025 (codex integration) covered.

### R5: 注入セクションのサイズ上限 16KB (MUST × 2)

**Impl**: `touched-files-bundle.ts` lines 73–74

```typescript
if (Buffer.byteLength(section, "utf-8") > MAX_SECTION_BYTES) return "";
```

`MAX_SECTION_BYTES = 16 * 1024`. Same method as `artifact-bundle.ts`. Returns `""` (no partial injection) when exceeded (TC-016).

### R6: resume 経路での記録保持 (MUST NOT / MUST)

**Impl**: `JobState.touchedFiles` as a top-level field in `src/state/schema/types.ts` (line 548)

`stateToStateJson` strips only `history`, `steps`, and machine-local sidecar fields — `touchedFiles` passes through. `validateJobState` validates the field only when present (backward compat). Round-trip confirmed via `stateToStateJson` + `validateJobState` (TC-022) and via `composeSplitLayoutFromContent` — the real resume read path (TC-022).

TC-022 and TC-023 covered in `src/store/__tests__/touched-files-resume.test.ts`.

### R7: codex は記録しない、注入は共有層経由 (MUST NOT / MUST × 2)

- Codex adapter does not assign `touchedFiles` in `AgentRunResult` → `undefined` → `CommitOrchestrator` skips state update.
- Both adapters import `buildTouchedFilesSection` from the same `src/adapter/shared/touched-files-bundle.ts` (TC-025 verifies the import).
- TC-024 confirms codex job produces no injection (empty state, `buildTouchedFilesSection` returns `""`).

---

## Judgment 2: Acceptance Criteria (request.md) → Tests

| Criterion | Test Location | Status |
|-----------|--------------|--------|
| 記録 unit test (a) Read/Edit/Write 抽出 | `touched-files-recorder.test.ts` TC-001 | ✅ |
| 記録 unit test (b) worktree 外・change folder 除外 | TC-004, TC-005, TC-008 | ✅ |
| 記録 unit test (c) 重複排除 | TC-006 | ✅ |
| 記録 unit test (d) 100 件打ち切り | TC-007 | ✅ |
| 注入 unit test (a) 先行 step 記録あり → セクション + 制限禁止文言 | TC-013 | ✅ |
| 注入 unit test (b) 記録なし → 従来 prompt 同一 | TC-014 | ✅ |
| 注入 unit test (c) 16KB 超過 → 注入なし | TC-016 | ✅ |
| resume 経路 test: 保存 → 読み出しで記録保持 | TC-022 | ✅ |
| resume 経路 test: resume 後 step prompt に注入 | TC-023 | ✅ |
| src/core/step/ 既存 buildMessage テスト無改変 | TC-026 (全テスト実行) | ✅ (buildMessage 未変更) |
| typecheck && test green | TC-027 | ✅ |

---

## Judgment 3: Design Decisions (D1–D6) → Implementation

| Decision | Status | Evidence |
|----------|--------|---------|
| D1: type:"assistant" message からのみ抽出 | ✅ | `extractTouchedFilesFromMessages` line 65: `if (msg["type"] !== "assistant") continue` |
| D2: JobState top-level `touchedFiles?: Record<string, string[]>` | ✅ | `types.ts` line 548; `validateJobState` lines 326–341 with lightweight check |
| D3: adapter → AgentRunResult → StepExecutionResult → commitSuccess の単一経路 | ✅ | `executor.ts` line 522; `commit-orchestrator.ts` lines 452–455 |
| D4: 正規化・trailing slash 境界・dedup・cap 100 | ✅ | `normalizeTouchedFilePath`; `isChangeFolderPath` uses `changesDirRel() + "/"` |
| D5: 共有層純関数 `buildTouchedFilesSection`、両 adapter で配線 | ✅ | `touched-files-bundle.ts`; claude-code line 468; codex line 338 |
| D6: main work turn の for-await ループのみ記録、sequential commitSuccess のみ書き込み | ✅ | accumulator declared at `run()` scope; populated only inside `runQuery` for-await; `commitRound` path has no touchedFiles wiring |

---

## Judgment 4: Regression

```
$ bun run typecheck
# exits cleanly (exit 0, no output)

$ bun run test
Test Files  731 passed (731)
      Tests  10873 passed | 1 skipped (10874)
   Duration  50.38s
```

The 1 skipped test is pre-existing (unrelated to this change). `src/core/step/` existing `buildMessage` tests pass without modification — `buildMessage` was not touched; injection happens downstream in adapter prompt composition.

---

## 検証できなかった項目

None — all 4 judgment areas and all 27 test cases (TC-001 to TC-027) were verified.

## Findings 詳細

None — no conformance findings. The implementation satisfies all requirements, design decisions, acceptance criteria, and regression gates.
