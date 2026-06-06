# Test Cases: `.specrunner/jobs/` への読み取り依存を slug/sidecar 起点に移行する

## Summary

- **Total**: 44 cases
- **Automated** (unit/integration): 44
- **Manual**: 0
- **Priority**: must: 34, should: 8, could: 2

---

## Category: `JobStateStore.list()` — local jobs-dir readdir を行わない

### TC-001: list() が local jobs-dir を readdir しない

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: list() / resolveId() は local jobs-dir を readdir しない > Scenario: list() が local jobs-dir を readdir しない

### TC-002: list() が active local job（別ブランチ worktree）を返す

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: cross-branch 可視性と managed 可視性を維持する > Scenario: 別ブランチの local active job が見える

### TC-003: list() が archived local job（changes/archive/）を返す

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `specrunner/changes/archive/<dated>-<slug>/state.json` に archived local job が存在する  
**WHEN** `JobStateStore.list(repoRoot)` を実行する  
**THEN** archived job が一覧に含まれ、`fs.readdir(getJobsDir(repoRoot))` は呼ばれない

### TC-004: list() が sidecar index 由来の active local job を merge する

**Category**: integration  
**Priority**: should  
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `liveness.json` に `worktreePath` を持つ local job が存在し、worktree 内 slug dir に `state.json` がある  
**WHEN** `JobStateStore.list(repoRoot)` を実行する  
**THEN** その job が一覧に含まれる（active worktree 経路と sidecar 補完で dedup される）

### TC-005: list() が worktree 削除済み・未 archive の local job を full state として出さない

**Category**: integration  
**Priority**: should  
**Source**: design.md > D2

**GIVEN** worktree が削除済みかつ archive にも存在しない local job の `liveness.json` のみが残る  
**WHEN** `JobStateStore.list(repoRoot)` を実行する  
**THEN** その job は一覧に現れないが、エラーは発生しない

### TC-006: list() が壊れた slug state.json を skip して正常 job を返す

**Category**: integration  
**Priority**: should  
**Source**: tasks.md > T-07（TC-047 移行）

**GIVEN** worktree または archive slug dir 内の `state.json` が JSON として壊れている  
**WHEN** `JobStateStore.list(repoRoot)` を実行する  
**THEN** 壊れた entry を skip し、正常な job は一覧に含まれる

---

## Category: `JobStateStore.resolveId()` — sidecar index 起点

### TC-007: resolveId() が local jobs-dir を readdir しない

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: list() / resolveId() は local jobs-dir を readdir しない > Scenario: resolveId() が local jobs-dir を readdir しない

### TC-008: 短縮 prefix が sidecar 経由で解決する

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: jobId / cross-branch 解決は sidecar index を起点にする > Scenario: 短縮 prefix が sidecar 経由で解決する

### TC-009: worktree 削除済み・未 archive の local job でも jobId を失わない

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: jobId / cross-branch 解決は sidecar index を起点にする > Scenario: degrade した local job でも jobId を失わない

### TC-010: full UUID（36 文字）は素通しで解決する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** sidecar index または slug dir に存在する local job の full UUID  
**WHEN** `JobStateStore.resolveId(repoRoot, fullUuid)` を実行する  
**THEN** そのまま full UUID が返り、`fs.readdir(getJobsDir(repoRoot))` は呼ばれない

### TC-011: prefix が 0 件のとき JOB_NOT_FOUND を返す

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** sidecar にも slug 状態にも存在しない jobId prefix  
**WHEN** `JobStateStore.resolveId(repoRoot, unknownPrefix)` を実行する  
**THEN** エラーコード `JOB_NOT_FOUND` が返る

### TC-012: prefix が 2 件以上のとき AMBIGUOUS_JOB_ID を返す

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** 同じ prefix を持つ複数の jobId が sidecar と slug 状態に存在する  
**WHEN** `JobStateStore.resolveId(repoRoot, ambiguousPrefix)` を実行する  
**THEN** エラーコード `AMBIGUOUS_JOB_ID` が候補 jobId hint とともに返る

### TC-013: archived local job の prefix が list() 由来候補から解決できる

**Category**: integration  
**Priority**: should  
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `changes/archive/` に存在する archived local job（sidecar なし）  
**WHEN** その jobId 短縮 prefix で `resolveId` を実行する  
**THEN** `list()` の jobId 群から full jobId が解決される

---

## Category: sidecar index helper（`local-job-index.ts`）

### TC-014: listLocalSidecars が local liveness.json から entry を返す

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `.specrunner/local/<slug>/liveness.json` に `{ jobId, worktreePath }` が存在する  
**WHEN** `listLocalSidecars(repoRoot)` を実行する  
**THEN** `{ slug, jobId, worktreePath, kind: "local" }` の entry が返る

### TC-015: listLocalSidecars が managed marker.json から entry を返す

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `.specrunner/local/<slug>/marker.json` に `{ slug, jobId }` が存在し、`liveness.json` は不在  
**WHEN** `listLocalSidecars(repoRoot)` を実行する  
**THEN** `{ slug, jobId, worktreePath: null, kind: "managed" }` の entry が返る

### TC-016: listLocalSidecars が jobId を持たない / 壊れた sidecar を skip する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `liveness.json` が `jobId` フィールドを持たない、または JSON 破損している slug dir が存在する  
**WHEN** `listLocalSidecars(repoRoot)` を実行する  
**THEN** その slug dir は結果に含まれず、他の正常 entry は返る（例外は throw しない）

### TC-017: listLocalSidecars が `.specrunner/local` 不在でも空配列を返す

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `.specrunner/local` ディレクトリが存在しない  
**WHEN** `listLocalSidecars(repoRoot)` を実行する  
**THEN** 例外なく空配列を返す

### TC-018: resolveJobIdToSlug が一致 jobId の entry を返す

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** sidecar に特定 jobId を持つ local job  
**WHEN** `resolveJobIdToSlug(repoRoot, jobId)` を実行する  
**THEN** `{ slug, jobId, worktreePath, kind }` の entry が返る

### TC-019: resolveJobIdToSlug が不在 jobId で null を返す（throw しない）

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** sidecar に存在しない jobId  
**WHEN** `resolveJobIdToSlug(repoRoot, unknownJobId)` を実行する  
**THEN** `null` が返り、例外は throw されない

### TC-020: local-job-index.ts が src/core/ を import しない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/store/local-job-index.ts` のソースコード  
**WHEN** import 依存を静的解析する  
**THEN** `src/core/` への import が存在しない（`fs` と `src/util/paths.ts` のみ）

---

## Category: `loadStateByJobId` helper

### TC-021: active local job の jobId を渡すと worktree slug dir から state を返す

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** active local job（worktree 内 `specrunner/changes/<slug>/state.json` が存在）の jobId  
**WHEN** `loadStateByJobId(repoRoot, jobId)` を実行する  
**THEN** worktree slug dir の `NormalizedJobState` が返る

### TC-022: archived local job の jobId を渡すと changes/archive/ slug dir から state を返す

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** archived local job（`changes/archive/<dated>-<slug>/state.json`）の jobId、sidecar あり  
**WHEN** `loadStateByJobId(repoRoot, jobId)` を実行する  
**THEN** archive slug dir の `NormalizedJobState` が返る

### TC-023: managed job の jobId を渡すと jobs-dir から state を返す（温存）

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `kind="managed"` の sidecar entry を持つ managed job の jobId  
**WHEN** `loadStateByJobId(repoRoot, jobId)` を実行する  
**THEN** jobs-dir（`.specrunner/jobs/<jobId>/`）から `NormalizedJobState` が返る

### TC-024: sidecar 不在の旧 job は fallback readFile で load できる

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** sidecar が存在しないが jobs-dir に state が存在する旧 job の jobId  
**WHEN** `loadStateByJobId(repoRoot, jobId)` を実行する  
**THEN** jobs-dir fallback readFile から `NormalizedJobState` が返る

### TC-025: loadStateByJobId は persist を一切行わない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** active local job の jobId  
**WHEN** `loadStateByJobId(repoRoot, jobId)` を実行する  
**THEN** `fs.writeFile` / `persist()` が呼ばれない

---

## Category: caller migration（job show / cancel / resume / resolve-target）

### TC-026: job show \<jobId\> が sidecar 経由で解決する

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: local runtime state-read caller は slug 経由で読む > Scenario: job show \<jobId\> が sidecar 経由で解決する

### TC-027: job cancel \<jobId\> が sidecar 経由で load する

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: local runtime state-read caller は slug 経由で読む > Scenario: job cancel \<jobId\> が sidecar 経由で load する

### TC-028: resume \<jobId\> が sidecar 経由で load する

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: local runtime state-read caller は slug 経由で読む > Scenario: resume \<jobId\> が sidecar 経由で load する

### TC-029: archive の resolve-target が slug 経由で load する

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: local runtime state-read caller は slug 経由で読む > Scenario: archive の resolve-target が slug 経由で load する

### TC-030: job cancel の cleanup / persist（jobId ストア書き込み）が不変

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** active local job の jobId  
**WHEN** `specrunner job cancel <jobId>` を実行する  
**THEN** load が sidecar 経由に変わっても、cleanup・`transitionJob`・jobId ストアへの persist 挙動は変わらない

### TC-031: job show で存在しない jobId のエラー表示が不変

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** sidecar にも jobs-dir にも存在しない jobId  
**WHEN** `specrunner job show <unknownJobId>` を実行する  
**THEN** ENOENT / not-found のエラーが従来どおり表示される

---

## Category: archive Phase 2 — sidecar worktreePath クリア

### TC-032: Phase 2 が sidecar の worktreePath をクリアする

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: archive Phase 2 の worktreePath クリアは sidecar を更新する > Scenario: Phase 2 が sidecar の worktreePath をクリアする

### TC-033: sidecar 不在でも Phase 2 が失敗しない

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: archive Phase 2 の worktreePath クリアは sidecar を更新する > Scenario: sidecar 不在でも Phase 2 が失敗しない

### TC-034: archive Phase 2 が jobId ストアの read/write を行わない

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** archive 対象の local job（sidecar あり）  
**WHEN** archive Phase 2 の worktree teardown が実行される  
**THEN** `.specrunner/jobs/<jobId>/` に対する `readFile` / `writeFile` が Phase 2 内で発生しない

### TC-035: archive の正常系 exit code と最終 status（archived）が不変

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** 正常な archive 対象の local job  
**WHEN** archive を実行する  
**THEN** exit code 0、最終 status `archived` が従来どおりになる

### TC-036: archive の冪等再実行で sidecar worktreePath クリアが no-op になる

**Category**: integration  
**Priority**: should  
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** 既に worktreePath が `null` になっている sidecar を持つ archived job  
**WHEN** archive Phase 2 を再実行する  
**THEN** エラーなく no-op で完了し、exit code と status が不変

---

## Category: cross-branch / managed 可視性

### TC-037: 別ブランチの local active job が job ls に表示される

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: cross-branch 可視性と managed 可視性を維持する > Scenario: 別ブランチの local active job が見える

### TC-038: active managed job が job ls に表示される

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: cross-branch 可視性と managed 可視性を維持する > Scenario: active managed job が見える

### TC-039: managed の section 4（marker → jobs-dir）経路が温存される

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `marker.json` を持つ managed job が存在し jobs-dir に state がある  
**WHEN** `JobStateStore.list(repoRoot)` を実行する  
**THEN** managed job が section 4 経由で一覧に現れ、managed 向けの jobs-dir readdir は発生しない（readFile のみ）

### TC-040: terminal managed job（marker clear 済み）は --all でも表示されないことを固定する

**Category**: integration  
**Priority**: could  
**Source**: design.md > Risks / Trade-offs（terminal managed job の --all 可視性）

**GIVEN** marker が clear 済みの terminal managed job（jobs-dir に state は存在）  
**WHEN** `specrunner job ls --all` を実行する  
**THEN** 一覧に現れない（section 3 撤去による暫定変化として確認し、managed slug 化の後続 request で恒久対処する）

---

## Category: dual-write 温存

### TC-041: dual-write が温存される

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: dual-write と managed 読み取り経路を温存し検証が green > Scenario: dual-write が温存される

### TC-042: cancel 後の jobId ストアへの書き込みが発生する

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-07（dual-write 不変回帰）

**GIVEN** active local job の jobId  
**WHEN** `specrunner job cancel <jobId>` を実行する  
**THEN** `.specrunner/jobs/<jobId>/` への persist（writeFile）が従来どおり発生する

### TC-043: resume 後の jobId ストアへの書き込みが発生する

**Category**: integration  
**Priority**: could  
**Source**: tasks.md > T-07（dual-write 不変回帰）

**GIVEN** paused な local job の jobId  
**WHEN** `specrunner resume <jobId>` を実行する  
**THEN** `.specrunner/jobs/<jobId>/` への persist が従来どおり発生する

---

## Category: build / typecheck

### TC-044: typecheck と test が green

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: dual-write と managed 読み取り経路を温存し検証が green > Scenario: 検証が green

---

## Result

```yaml
result: completed
total: 44
automated: 44
manual: 0
must: 34
should: 8
could: 2
blocked_reasons: []
```
