# Test Cases: `.specrunner/jobs/` を完全撤去する

## Summary

- **Total**: 32 cases
- **Automated** (unit/integration): 30
- **Manual**: 2
- **Priority**: must: 24, should: 8, could: 0

---

### TC-001: jobs-dir path helper が src/ で定義も使用も無い

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: コードベースに `.specrunner/jobs/` への読み書き参照が残らない > Scenario: jobs-dir path helper が定義も使用も無い

---

### TC-002: jobs-dir への書き込みが起きない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: コードベースに `.specrunner/jobs/` への読み書き参照が残らない > Scenario: jobs-dir への書き込みが起きない

---

### TC-003: 解決できない jobId はエラーになる（jobs-dir を読まない）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: jobId からの state 読み取りは sidecar → slug 起点のみを経由する > Scenario: 解決できない jobId はエラーになる（jobs-dir を読まない）

---

### TC-004: sidecar を持つ jobId は slug 起点で読める

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: jobId からの state 読み取りは sidecar → slug 起点のみを経由する > Scenario: sidecar を持つ jobId は slug 起点で読める

---

### TC-005: 書き込み先が無い場合は null で skip される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: jobId からの書き込みストア解決は jobs-dir に着地しない > Scenario: 書き込み先が無い場合は null で skip される

---

### TC-006: 旧データ残存下で job ls が壊れない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 旧 `.specrunner/jobs/` データが存在してもコマンドが壊れない > Scenario: 旧データ残存下で job ls が壊れない

---

### TC-007: 旧データ残存下で cancel / resume が壊れない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 旧 `.specrunner/jobs/` データが存在してもコマンドが壊れない > Scenario: 旧データ残存下で cancel / resume が壊れない

---

### TC-008: 一括 purge が新 layout の terminal state を削除する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: cancel の purge は machine-local slug state を削除する > Scenario: 一括 purge が新 layout の terminal state を削除する

---

### TC-009: 旧 jobs-dir が存在すると doctor が warn になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor が旧 `.specrunner/jobs/` を検出し手動削除を促す > Scenario: 旧 jobs-dir が存在すると warn になる

---

### TC-010: 旧 jobs-dir が無ければ doctor が pass になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor が旧 `.specrunner/jobs/` を検出し手動削除を促す > Scenario: 旧 jobs-dir が無ければ pass になる

---

### TC-011: writable チェックが sidecar root を対象にする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor が旧 `.specrunner/jobs/` を検出し手動削除を促す > Scenario: writable チェックが sidecar root を対象にする

---

### TC-012: typecheck と test が green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 検証が green > Scenario: typecheck と test が green

---

### TC-013: JobStateStore.load() が jobId-only モードで SpecRunnerError を throw する

**Category**: unit
**Priority**: must
**Source**: design.md > D1

**GIVEN** slug も changeDir も指定せずに `new JobStateStore(jobId, repoRoot)` でストアを構築する
**WHEN** `.load()` を呼ぶ
**THEN** `SpecRunnerError`（内部不変条件違反）が throw される

---

### TC-014: JobStateStore.getEventsPath() が jobId-only モードで throw する

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** slug も changeDir も指定せずに `new JobStateStore(jobId, repoRoot)` でストアを構築する
**WHEN** `getEventsPath()` を呼ぶ
**THEN** エラーが throw される（jobs-dir path helper の値が返らない）

---

### TC-015: JobStateStore.getStateJsonPath() が jobId-only モードで throw する

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** slug も changeDir も指定せずに `new JobStateStore(jobId, repoRoot)` でストアを構築する
**WHEN** `getStateJsonPath()` を呼ぶ
**THEN** エラーが throw される（jobs-dir path helper の値が返らない）

---

### TC-016: JobStateStore.create() static method が削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** 本変更適用後の `src/store/job-state-store.ts`
**WHEN** `JobStateStore.create` を型レベルで参照する
**THEN** static method が存在せず TypeScript 型チェックがエラーになる（`bun run typecheck` が失敗しない = 参照側が存在しない）

---

### TC-017: JobStateStore.delete() static method が削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** 本変更適用後の `src/store/job-state-store.ts`
**WHEN** `JobStateStore.delete` を型レベルで参照する
**THEN** static method が存在せず TypeScript 型チェックがエラーになる（`bun run typecheck` が失敗しない = 参照側が存在しない）

---

### TC-018: JobStateStore.load() の changeDir 経路 ENOENT が fall-through せず伝播する

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / tasks.md > T-03

**GIVEN** `changeDir` を指定した `JobStateStore` で、指定ディレクトリに state ファイルが存在しない
**WHEN** `.load()` を呼ぶ
**THEN** ENOENT が呼び出し側へそのまま伝播し、jobs-dir の split-layout や legacy flat ファイルへ fall-through しない

---

### TC-019: job show <未知 jobId> が exit 1 で「Job not found」を出す

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** sidecar（liveness / marker）にも slug 正本にも存在しない jobId
**WHEN** `specrunner job show <jobId>` を実行する
**THEN** exit 1 で「Job not found」相当のメッセージが出力される

---

### TC-020: resolveStateStoreByJobId が sidecar なしで null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** sidecar（liveness / marker）に存在しない jobId
**WHEN** `resolveStateStoreByJobId()` を呼ぶ
**THEN** `null` が返り、jobs-dir ストアは構築されない

---

### TC-021: LocalRuntime.buildDeps() の storeFactory が worktreePath 不在時に throw する

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** `worktreePath`（`wtp`）が未設定の状態で `buildDeps()` の `storeFactory` が実行される
**WHEN** `storeFactory` を呼ぶ
**THEN** `SpecRunnerError`（不変条件違反）が throw され、jobs-dir ストアは構築されない

---

### TC-022: LocalRuntime.registerCleanup() の makeStore が slugOpts 不在時に throw する

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** `slugOpts` が未設定の状態で `registerCleanup()` 内の `makeStore()` が実行される
**WHEN** `makeStore()` を呼ぶ
**THEN** throw され、best-effort try/catch に捕捉されて cleanup がスキップされる（jobs-dir ストアは構築されない）

---

### TC-023: cancelSingleJob --purge が .specrunner/local/<slug>/ を削除し .specrunner/jobs/ に触れない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `.specrunner/local/<slug>/` に machine-local state を持つ job と、`.specrunner/jobs/` に旧データが残存する
**WHEN** `cancelSingleJob` を `--purge` オプション付きで実行する
**THEN** `.specrunner/local/<slug>/` が削除され、`.specrunner/jobs/` は変更されない

---

### TC-024: cancelAllTerminated が slug 未解決 job の物理削除をスキップする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** state に slug が空の terminal job が `cancelAllTerminated` の対象に含まれる
**WHEN** `cancelAllTerminated` のループが当該 job を処理する
**THEN** 物理削除がスキップされ、エラーなく処理が続行する

---

### TC-025: local-state-writable チェックが .specrunner/local/ 存在 + writable で pass になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `.specrunner/local/` が存在し書き込み可能
**WHEN** `local-state-writable` doctor チェックを実行する
**THEN** `pass` が返る

---

### TC-026: local-state-writable チェックが .specrunner/local/ 不在 + 祖先 writable で warn になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `.specrunner/local/` が存在せず、`.specrunner/` ディレクトリは書き込み可能
**WHEN** `local-state-writable` doctor チェックを実行する
**THEN** `warn` が返る

---

### TC-027: local-state-writable チェックが .specrunner/local/ 不在 + 祖先 not writable で fail になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `.specrunner/local/` が存在せず、`.specrunner/` も書き込み不可
**WHEN** `local-state-writable` doctor チェックを実行する
**THEN** `fail` が返る

---

### TC-028: RULES_MD_CONTENT に .specrunner/jobs/ 参照が無い

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 本変更適用後の `src/prompts/rules.ts`
**WHEN** `RULES_MD_CONTENT` の文字列を検査する
**THEN** `.specrunner/jobs/` への言及が 1 件も存在しない

---

### TC-029: RULES_MD_CONTENT が新 layout（slug 正本 + sidecar）を記述している

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** 本変更適用後の `src/prompts/rules.ts`
**WHEN** `RULES_MD_CONTENT` の Job state 記述を確認する
**THEN** slug 正本（`specrunner/changes/<slug>/state.json`）と machine-local sidecar（`.specrunner/local/<slug>/`）の両方が言及されている

---

### TC-030: resolve-state-store の no-sidecar ケースが null を返す（移行後）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** 移行後の `resolveStateStoreByJobId` テスト（no-sidecar ケース）
**WHEN** sidecar が存在しない jobId でテストを実行する
**THEN** `null` を期待するアサーションが pass し、jobs-dir ストアを期待するアサーションが残存しない

---

### TC-031: loadStateByJobId の no-sidecar ケースが JOB_NOT_FOUND を throw する（移行後）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** 移行後の `loadStateByJobId` テスト（no-sidecar ケース）
**WHEN** sidecar が存在しない jobId でテストを実行する
**THEN** `JOB_NOT_FOUND` を throw する期待が pass し、jobs-dir を読む期待が残存しない

---

### TC-032: src/（テスト除く）に .specrunner/jobs 参照（コード・コメント）が残らない

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08 / T-10

**GIVEN** 本変更適用後のリポジトリ
**WHEN** `src/`（テストファイルを除く）全体を `\.specrunner/jobs` で grep する
**THEN** コード・コメント・docstring を含め参照が 1 件も見つからない

---

## Result

```yaml
result: completed
total: 32
automated: 30
manual: 2
must: 24
should: 8
could: 0
blocked_reasons: []
```
