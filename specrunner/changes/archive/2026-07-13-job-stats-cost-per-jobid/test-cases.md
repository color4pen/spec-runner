# Test Cases: job stats のコスト集計で usage.json を jobId / change-dir から解決する

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 10
- **Manual**: 0
- **Priority**: must: 7, should: 3, could: 0

---

### TC-001: 同一 base-slug・別 jobId の 2 run が各自のコストを計上する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job stats は各 state 行を source change-dir から usage.json を解決しなければならない > Scenario: 同一 base-slug・別 jobId の 2 run が各自のコストを計上する

---

### TC-002: 各行が自行の legacy invocation のみをコストに含める

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: legacy invocation（jobId なし）は自行の usage.json の分のみ加算されなければならない > Scenario: 各行が自行の legacy invocation のみをコストに含める

---

### TC-003: usage.json なしの行が cost = null で出力に現れる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: usage.json が存在しない行は cost = null になり行は drop されない > Scenario: usage.json なしの行が cost = null で出力に現れる

---

### TC-004: `ListedJobEntry` インターフェースが `job-state-store.ts` から export される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/store/job-state-store.ts` が実装済みである

**WHEN** `ListedJobEntry` 型を named import しようとする

**THEN** 型定義が見つかり、`state: JobState` と `sourceChangeDir: string` フィールドを持つ

---

### TC-005: `list()` の返り値が従来と同一の `JobState[]` である

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** active・archive の両 fixture が存在するリポジトリルートで

**WHEN** `JobStateStore.list(repoRoot, { includeArchived: true })` を呼ぶ

**THEN** 返り値の型が `JobState[]` であり、`listWithSourceDirs` を経由しても dedup ロジック（updatedAt 比較）が変わらず同一の状態数・同一の jobId が返る

---

### TC-006: active slug の `sourceChangeDir` が `specrunner/changes/<slug>` と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D2

**GIVEN** `specrunner/changes/foo/state.json` が存在するリポジトリルートで

**WHEN** `JobStateStore.listWithSourceDirs(repoRoot)` を呼ぶ

**THEN** slug=`foo` のエントリの `sourceChangeDir` が `<repoRoot>/specrunner/changes/foo` と一致する

---

### TC-007: archive slug の `sourceChangeDir` が `specrunner/changes/archive/<date>-<slug>` と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D2

**GIVEN** `specrunner/changes/archive/2026-05-01-foo/state.json` が存在するリポジトリルートで

**WHEN** `JobStateStore.listWithSourceDirs(repoRoot, { includeArchived: true })` を呼ぶ

**THEN** 該当エントリの `sourceChangeDir` が `<repoRoot>/specrunner/changes/archive/2026-05-01-foo` と一致する

---

### TC-008: 同一 jobId の active・archive エントリが衝突した場合、`updatedAt` が新しい方の `sourceChangeDir` が採用される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D1（dedup ロジック維持）

**GIVEN** active dir と archive dir に同一 jobId の state.json が存在し、active 側の `updatedAt` が新しい

**WHEN** `JobStateStore.listWithSourceDirs(repoRoot, { includeArchived: true })` を呼ぶ

**THEN** 返り値に該当 jobId のエントリが 1 件のみ存在し、`sourceChangeDir` が active dir を指す

---

### TC-009: `job-stats.ts` から `resolveChangeDir` の import と呼び出しが消えている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D3

**GIVEN** T-01, T-02 の実装が完了している

**WHEN** `src/core/command/job-stats.ts` を静的解析（typecheck）する

**THEN** `resolveChangeDir` の import 宣言および呼び出しが存在せず、`bun run typecheck` が exit 0 で完了する

---

### TC-010: `durationSec` / `convergence` の導出が usage.json 解決の変更によって影響を受けない

**Category**: integration
**Priority**: must
**Source**: request.md > 要件 4 / tasks.md > T-05

**GIVEN** steps を持つ state.json が存在し、usage.json の有無が異なる複数の fixture がある

**WHEN** T-01・T-02 適用後の `runJobStats` を実行する

**THEN** 各行の `durationSec` と `convergence` が変更前と同一の値を返す（既存テスト `job-stats.test.ts`・`job-stats-jobid-filter.test.ts` が無修正で green になる）

---

## Result

```yaml
result: completed
total: 10
automated: 10
manual: 0
must: 7
should: 3
could: 0
blocked_reasons: []
```
