# Tasks: multi-layer-defense-integration-test

## [x] T-01: テストファイル scaffolding

**新規ファイル**: `tests/multi-layer-defense.test.ts`

既存 `tests/pipeline-integration.test.ts` から以下を複製して scaffolding する:

### 1-a: import + vi.mock 宣言

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { GitHubClient } from "../src/core/port/github-client.js";
import { createManagedAgentRunner } from "../src/adapter/managed-agent/agent-runner.js";
import { verificationResultPath, prCreateResultPath } from "../src/util/paths.js";
import type { SpawnFn } from "../src/util/spawn.js";
```

vi.mock 3 件を pipeline-integration.test.ts L20-66 からそのまま複製:
- `../src/core/spec/delta-spec-validator.js` (mockDeltaSpecValidator)
- `../src/core/verification/runner.js` (runVerification mock)
- `../src/core/pr-create/runner.js` (runPrCreate mock)

### 1-b: beforeEach / afterEach

pipeline-integration.test.ts L68-89 をそのまま複製:
- tempDir 作成 + XDG_DATA_HOME 設定
- stdout/stderr mock
- mockDeltaSpecValidator.mockResolvedValue({ ok: true }) リセット

### 1-c: helper 関数群

pipeline-integration.test.ts から以下を複製:
- `noopSpawn` (L16)
- `makeJobState()` (L91-97)
- `buildConfig()` (L99-119)
- `buildRepo()` (L121-123)
- `buildRequest()` (L125-127) — **ただし** `type` のデフォルトを `"spec-change"` に変更 (D5)
- `buildPipelineMockClient()` (L147-202)
- `buildMockGithubClient()` (L215-255)
- `buildRunner()` (L133-138)

**受け入れ基準**: ファイルが作成され、`bun run typecheck` が通る (テストケースは空でよい)

---

## [x] T-02: TC-MLD-01 — Happy path (3 層全正常)

**ファイル**: `tests/multi-layer-defense.test.ts`

```typescript
// TC-MLD-01: 3 層全正常 — design creates specs, dsv approved, spec-review approved → pipeline completes
describe("TC-MLD-01: happy path — all 3 layers pass, pipeline completes", () => {
  it("design → dsv(approved) → spec-review(approved) → awaiting-merge", async () => {
```

**mock 構成**:
- `mockDeltaSpecValidator`: デフォルト (`{ ok: true }`) — dsv approved
- `buildPipelineMockClient({ specReviewVerdicts: ["approved"] })`
- `buildMockGithubClient({ specReviewVerdicts: ["approved"] })`

**assert**:
- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` length=1, verdict="approved"
- `result.steps["spec-review"]` length=1, verdict="approved"
- `result.steps["delta-spec-fixer"]` undefined (not invoked)
- `result.steps["spec-fixer"]` undefined (not invoked)
- pipeline が後段まで完走: `result.steps["implementer"]`, `result.steps["verification"]` が defined

---

## [x] T-03: TC-MLD-02 — Sub-B catch (spec-review が不十分な delta spec を検出)

**ファイル**: `tests/multi-layer-defense.test.ts`

```typescript
// TC-MLD-02: Sub-B catch — dsv passes but spec-review catches insufficient delta spec content
// State: dsv(approved) → spec-review(needs-fix) → spec-fixer → dsv(approved) → spec-review(approved)
describe("TC-MLD-02: spec-review catches insufficient delta spec → spec-fixer → re-dsv → re-spec-review approved", () => {
```

**mock 構成**:
- `mockDeltaSpecValidator`: デフォルト (`{ ok: true }`) — dsv は両方の呼び出しで approved
- `buildPipelineMockClient({ specReviewVerdicts: ["needs-fix", "approved"] })`
- `buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] })`

**assert**:
- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` length=2, 両方 verdict="approved"
  - 1 回目: design 後の初回検証
  - 2 回目: spec-fixer 後の再検証 (transition: spec-fixer → dsv)
- `result.steps["spec-review"]` length=2, verdict=["needs-fix", "approved"]
- `result.steps["spec-fixer"]` length=1
- `result.steps["delta-spec-fixer"]` undefined (dsv は approved のため未起動)
- pipeline 完走: `result.steps["implementer"]` defined

---

## [x] T-04: TC-MLD-03 — Sub-A catch (dsv が specs/ 構造違反を検出)

**ファイル**: `tests/multi-layer-defense.test.ts`

```typescript
// TC-MLD-03: Sub-A catch — design creates legacy structure, dsv catches violation
// State: dsv(needs-fix) → delta-spec-fixer → dsv(approved) → spec-review(approved)
describe("TC-MLD-03: dsv catches legacy-flat-file → delta-spec-fixer → re-dsv approved → spec-review approved", () => {
```

**mock 構成**:
- `mockDeltaSpecValidator`:
  ```typescript
  mockDeltaSpecValidator
    .mockResolvedValueOnce({
      ok: false,
      violations: [{
        path: "/tmp/changes/test-slug/delta-spec.md",
        reason: "legacy-flat-file",
        suggested: "Move to specs/<capability>/spec.md",
      }],
    })
    .mockResolvedValueOnce({ ok: true });
  ```
- `buildPipelineMockClient({ specReviewVerdicts: ["approved"] })`
- `buildMockGithubClient({ specReviewVerdicts: ["approved"] })`

**assert**:
- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` length=2, verdict=["needs-fix", "approved"]
- `result.steps["delta-spec-fixer"]` length=1
- `result.steps["spec-review"]` length=1, verdict="approved"
- `result.steps["spec-fixer"]` undefined (spec-review は approved のため未起動)
- pipeline 完走: `result.steps["implementer"]` defined

---

## [x] T-05: TC-MLD-04 — 2 層同時 failure 5-a (design + spec-review fail, dsv catches)

**ファイル**: `tests/multi-layer-defense.test.ts`

```typescript
// TC-MLD-04: 2-layer failure 5-a — design missed checklist + spec-review bugged
// Only dsv remains as defense → catches no-specs-for-required-type (PR #282 reproduction)
// State: dsv(needs-fix) → delta-spec-fixer → dsv(approved) → spec-review(approved)
describe("TC-MLD-04: design + spec-review both fail — dsv catches no-specs-for-required-type as sole defense", () => {
```

**mock 構成**:
- `mockDeltaSpecValidator`:
  ```typescript
  mockDeltaSpecValidator
    .mockResolvedValueOnce({
      ok: false,
      violations: [{
        path: "specrunner/changes/test-slug/specs/",
        reason: "no-specs-for-required-type",
        suggested: "Add at least one delta spec under specs/<capability>/spec.md",
      }],
    })
    .mockResolvedValueOnce({ ok: true });
  ```
  `no-specs-for-required-type` は PR #282 (4 層全突破) と同型の violation。
- `buildPipelineMockClient({ specReviewVerdicts: ["approved"] })`
  spec-review は "bugged" = 何でも approved を返す。
- `buildMockGithubClient({ specReviewVerdicts: ["approved"] })`

**assert**:
- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` length=2, verdict=["needs-fix", "approved"]
- `result.steps["delta-spec-fixer"]` length=1
- `result.steps["spec-review"]` length=1, verdict="approved"
  (spec-review は dsv 修復後に走るため、bugged であっても正常パスに見える)
- `result.steps["spec-fixer"]` undefined
- pipeline 完走: `result.steps["implementer"]` defined

---

## [x] T-06: TC-MLD-05 — 2 層同時 failure 5-b (design + dsv fail, spec-review catches)

**ファイル**: `tests/multi-layer-defense.test.ts`

```typescript
// TC-MLD-05: 2-layer failure 5-b — design missed checklist + dsv rule bugged (always approves)
// Only spec-review remains as defense → catches missing delta spec content
// State: dsv(approved) → spec-review(needs-fix) → spec-fixer → dsv(approved) → spec-review(approved)
describe("TC-MLD-05: design + dsv both fail — spec-review catches as sole defense", () => {
```

**mock 構成**:
- `mockDeltaSpecValidator`: デフォルト (`{ ok: true }`)
  dsv は "bugged" = `no-specs-for-required-type` を検出できない。常に ok を返す。
- `buildPipelineMockClient({ specReviewVerdicts: ["needs-fix", "approved"] })`
- `buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] })`

**assert**:
- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` length=2, 両方 verdict="approved"
  (dsv は bugged のため両方 approved)
- `result.steps["spec-review"]` length=2, verdict=["needs-fix", "approved"]
  (1 回目で catch、spec-fixer 修復後の 2 回目で approved)
- `result.steps["spec-fixer"]` length=1
- `result.steps["delta-spec-fixer"]` undefined (dsv は approved のため未起動)
- pipeline 完走: `result.steps["implementer"]` defined

---

## [x] T-07: typecheck + test green

```bash
bun run typecheck && bun run test
```

全 TC が pass し、既存テストに regression がないことを確認する。

---

## 受け入れ基準

- [x] `tests/multi-layer-defense.test.ts` が新規作成されている
- [x] TC-MLD-01 ~ TC-MLD-05 の 5 テストケースが実装されている
- [x] TC-MLD-02: spec-fixer 経由 (delta-spec-fixer ではない) の遷移が assert されている
- [x] TC-MLD-03: delta-spec-fixer 経由の遷移が assert されている
- [x] TC-MLD-04: `no-specs-for-required-type` violation で PR #282 reproduction が表現されている
- [x] TC-MLD-05: dsv bugged + spec-review catch のセマンティクスがコメントで記録されている
- [x] `bun run typecheck && bun run test` が green
