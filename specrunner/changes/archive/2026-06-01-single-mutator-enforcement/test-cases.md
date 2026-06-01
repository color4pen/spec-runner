# Test Cases: single-mutator-enforcement

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 16, should: 3, could: 0

---

### TC-001: allowlist に B-9 エントリが全件存在する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 AC / request.md 受け入れ基準 §3

**GIVEN** `arch-allowlist.ts` に B-9 エントリが追加されている  
**WHEN** `ARCH_ALLOWLIST.filter(e => e.invariant === "B-9")` を評価する  
**THEN** エントリが 3 件（store/fail・exit-guard・local.ts signal-handler）以上存在し、実際の grep scan で検出される bypass 件数と一致する

---

### TC-002: B-9 allowlist エントリが必須フィールドを全て持つ

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 AC / design.md D1

**GIVEN** `arch-allowlist.ts` に B-9 エントリが追加されている  
**WHEN** TypeScript コンパイラが `arch-allowlist.ts` をコンパイルする  
**THEN** 全 B-9 エントリが `AllowlistEntry` 型（file / pattern / invariant / tracking / comment）を満たしコンパイルエラーが発生しない

---

### TC-003: B-9 エントリの invariant フィールドが "B-9" である

**Category**: unit  
**Priority**: must  
**Source**: design.md D1 / tasks.md T-01

**GIVEN** `arch-allowlist.ts` に B-9 エントリが追加されている  
**WHEN** 各エントリの `invariant` フィールドを参照する  
**THEN** 全エントリで `invariant === "B-9"` であり、既存 B-1〜B-8 の命名規約と整合している

---

### TC-004: `store.fail()` の bypass が allowlist に存在する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 / request.md 背景

**GIVEN** `src/store/job-state-store.ts` の `fail()` メソッドが `status: "failed" as JobStatus` を直書きしている  
**WHEN** `isAllowlisted` が `file="src/store/job-state-store.ts"` と該当 pattern を含む match を評価する  
**THEN** `true` が返り、B-9 テストで violation としてカウントされない

---

### TC-005: `exit-guard.ts` の bypass が allowlist に存在する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 / request.md 背景

**GIVEN** `src/core/lifecycle/exit-guard.ts` が `status: "awaiting-resume"` を直書きしている  
**WHEN** `isAllowlisted` が当該 match を評価する  
**THEN** `true` が返り、B-9 テストで violation としてカウントされない

---

### TC-006: `local.ts` signal-handler の bypass が allowlist に存在する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 / request.md 背景

**GIVEN** `src/core/runtime/local.ts` の signal-handler が `status: "awaiting-resume" as const` を直書きしている  
**WHEN** `isAllowlisted` が当該 match を評価する  
**THEN** `true` が返り、B-9 テストで violation としてカウントされない

---

### TC-007: `core-invariants.test.ts` に B-9 describe ブロックが存在する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02 AC

**GIVEN** `core-invariants.test.ts` に B-9 テストブロックが追加されている  
**WHEN** テストスイートを実行する  
**THEN** `describe("B-9: ...")` ブロックが存在し、テスト名に `B-9` と status 直書き禁止の意図が含まれる

---

### TC-008: B-9 grep パターンが 3 つの bypass を全件検出する（allowlist 適用前）

**Category**: unit  
**Priority**: must  
**Source**: design.md D2 / tasks.md T-02

**GIVEN** grep パターン `status:\s*"(running|failed|awaiting-resume|awaiting-merge|terminated|archived|canceled)"` を使用する  
**WHEN** `src/store/` と `src/core/` に対して grepE を実行する（フィルタ・allowlist 適用前）  
**THEN** store.fail（`"failed" as JobStatus`）・exit-guard（`"awaiting-resume"`）・local.ts signal-handler（`"awaiting-resume" as const`）の 3 行が全件マッチする

---

### TC-009: `create()` の `status: "running"` が violation 扱いされない

**Category**: unit  
**Priority**: must  
**Source**: design.md D4 / request.md 要件 §1 注釈

**GIVEN** `src/store/job-state-store.ts` の `create()` メソッドが `status: "running"` を初期設定として持つ  
**WHEN** B-9 テストが `store/job-state-store.ts` 内の `"running"` リテラル行をフィルタして violations を評価する  
**THEN** `create()` の行は violation リストに含まれず、テストが green のまま維持される

---

### TC-010: `src/core/verification/` の行が violation 扱いされない

**Category**: unit  
**Priority**: must  
**Source**: design.md D3 / tasks.md T-02

**GIVEN** `src/core/verification/` に `PhaseResult.status: "failed"` 等の JobStatus 文字列と重複するリテラルが存在しうる  
**WHEN** B-9 テストが `core/verification/` を含む行をフィルタして violations を評価する  
**THEN** `core/verification/` パスを含む行は violation リストに含まれず、false positive が発生しない

---

### TC-011: テストファイルの行が violation 扱いされない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02

**GIVEN** `__tests__/` または `.test.ts` ファイルに JobStatus リテラルを含む行が存在しうる  
**WHEN** B-9 テストがテストファイルをフィルタして violations を評価する  
**THEN** テストファイルの行は violation リストに含まれない

---

### TC-012: allowlist 込みで B-9 テストが green になる

**Category**: unit  
**Priority**: must  
**Source**: request.md 受け入れ基準 §1

**GIVEN** 3 件の bypass が `arch-allowlist.ts` に B-9 エントリとして登録されている  
**WHEN** B-9 テストが `filterViolations(matches, b9Entries)` を実行する  
**THEN** violations 配列が空 `[]` であり `expect(violationLines(violations)).toEqual([])` が成功する

---

### TC-013: allowlist に無い新規 status 直書きが検出される（regression guard）

**Category**: unit  
**Priority**: must  
**Source**: request.md 受け入れ基準 §2 / tasks.md T-03

**GIVEN** 仮想ファイル `src/core/command/new-feature.ts:7` に `status: "failed"` を含む GrepMatch を inject する  
**WHEN** `filterViolations(injectedMatches, b9Entries)` を実行する  
**THEN** violations が 1 件検出され、ファイルパスが `src/core/command/new-feature.ts` である

---

### TC-014: allowlist に含まれる bypass は suppression される（regression guard）

**Category**: unit  
**Priority**: must  
**Source**: request.md 受け入れ基準 §2 / tasks.md T-03

**GIVEN** `store/job-state-store.ts` の B-9 allowlist エントリと同一の file + pattern を持つ仮想 GrepMatch を inject する  
**WHEN** `filterViolations(allowlistedMatch, b9Entries)` を実行する  
**THEN** violations が 0 件であり、既存 bypass が正しく suppression されることが実証される

---

### TC-015: 既存 B-1〜B-8 テストが引き続き green である

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02 AC

**GIVEN** `core-invariants.test.ts` に B-9 テストブロックが追加されている  
**WHEN** `bun run test` でテストスイート全体を実行する  
**THEN** 既存 B-1〜B-8 の全テストが引き続き green であり、B-9 追加による regression が発生しない

---

### TC-016: プロジェクト標準 verification 4 コマンドが全て green である

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-04 AC / request.md 受け入れ基準 §4

**GIVEN** T-01〜T-03 の実装（allowlist 追加・B-9 テスト追加・regression guard 追加）が完了している  
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を順に実行する  
**THEN** 全コマンドが exit 0 で完了する

---

### TC-017: allowlist の ratchet 規約（削除のみ）が継承されている

**Category**: unit  
**Priority**: should  
**Source**: design.md D5 / arch-allowlist.ts governance コメント

**GIVEN** `arch-allowlist.ts` の B-9 エントリに tracking フィールドが記載されている  
**WHEN** B-9 エントリの tracking 値を参照する  
**THEN** 各エントリに `"B9-store-fail"` / `"B9-exit-guard"` / `"B9-signal-handler"` 等の burn-down 追跡 ID が記載されており、削除時に対応する burn-down request と紐付けられる

---

### TC-018: B-9 grep パターンが `transitionJob` 定義行に hit しない

**Category**: unit  
**Priority**: should  
**Source**: design.md D2

**GIVEN** `src/state/lifecycle.ts` に `status: to` のように変数代入で status を扱う `transitionJob` 定義が存在する  
**WHEN** B-9 grep パターン（JobStatus リテラル一致）を `src/state/lifecycle.ts` に適用した場合を想定する  
**THEN** `transitionJob` 定義行はパターンに hit せず（`"to"` はリテラルではない）、canonical mutator が false positive として検出されない  
　　　　また `src/state/lifecycle.ts` は `src/store/` と `src/core/` のスキャン対象外であり自然に除外される

---

### TC-019: コメント行が violation 扱いされない

**Category**: unit  
**Priority**: should  
**Source**: tasks.md T-02 / core-invariants.test.ts `isCommentLine` 仕様

**GIVEN** ソースファイルに JobStatus リテラルを含むコメント行（`// status: "failed"` 等）が存在する  
**WHEN** B-9 テストが `isCommentLine()` フィルタを通じて match を評価する  
**THEN** コメント行は violation リストから除外される

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 16
should: 3
could: 0
blocked_reasons: []
```
