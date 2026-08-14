# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base

- `resolveEvidenceBaseRev(state)` — `oids.ts`: `synthesizedCommits[0]^` を返す pure 関数。absent/empty → null。実装確認 ✓
- Gate step 8: `runTestsOnSynthesizedTree(evidenceBaseRev, testFiles, headOid, cwd, config)` — test-materialize commit の checkout でなく Evidence Base を使用 ✓
- `LocalRuntime.runTestsOnSynthesizedTree`: git worktree add --detach at baseRev → per-file overlay via `git show <overlayFromOid>:<path>` → node_modules symlink → scoped cmd → finally cleanup ✓
- `ManagedRuntime.runTestsOnSynthesizedTree`: `{ kind: "unavailable", … }` を返す stub ✓
- `RealRuntimeStrategy` intersection に `runTestsOnSynthesizedTree` が必須として追加 → LocalRuntime / ManagedRuntime 両方 implements → typecheck passed ✓

**Scenario: Re-run shape earns assurance instead of deferring**
- TC-001 in `src/core/runtime/__tests__/evidence-base-e2e.test.ts`: 実 git リポジトリで re-run shape (impl1 < mat2) → verdict `passed`, `baseResult=red`, `candidateResult=green`, `verified=true` ✓
- TC-007 (strip-test-authority) in `gate.test.ts`: unit level で re-run shape → `passed`（旧: `strategy-deferred`）✓

**Scenario: Job base is identical on first run and on resume**
- TC-002 in `src/core/step/bite-evidence/__tests__/evidence-base-oids.test.ts`: 4 sub-case — first-run / resume+extra commits / ref equality / empty ledger → null / absent field → null。全 pass ✓

---

### Requirement: The green candidate SHALL be the effective branch state reaching adopted operator commits

- Gate step 7: `captureHeadSha(cwd)` で HEAD OID を解決。`candidateOid = headOid`。`implementer.commitOid` は使用しない ✓
- `BiteEvidenceRecord.candidateOid` = headOid として記録 ✓

**Scenario: Adopted operator commit is included in the candidate**
- TC-003 in `evidence-base-gate.test.ts`: `headOid = adoptedOperatorOid`（実装者 OID は `testResultsByOid` に存在しないため、旧動作では unavailable → deferred になる）→ gate が HEAD を使用して `passed` を返す ✓

---

### Requirement: The chronology-based contamination machinery SHALL be removed

- `detectBaseImplementationContamination` を `oids.ts` から削除。src/ 配下の grep 結果: `gate.test.ts` のコメント 1 件のみ（import/call site なし）。typecheck passed（TC-016）✓
- Gate step 3.5（汚染 deferral）: `gate.ts` に contamination check なし ✓
- Archive floor P2.5（`baseline unbuildable`）: `achieved-assurance.ts` lines 237–248 が EB reference 解決に置換。旧 P2.5 は撤去。`baseline unbuildable` 文字列は production code に存在しない ✓
- Archive floor base-red: `runTestsOnSynthesizedTree(evidenceBaseRev!, materializedTestFiles, finalHeadOid, …)` at lines 450–456（旧: `runTestsAtCommit(baseOid)`）✓

**Scenario: Archive floor derives base-red on the Evidence Base for a re-run shape**
- TC-004 in `src/core/archive/__tests__/evidence-base-archive-floor.test.ts`: re-run shape state、floor `biteEvidence: required` → `achieved.biteEvidence === "required"`、"baseline unbuildable" diagnostic なし、`synthesizedTreeCalled === true` ✓

**Scenario: Archive floor is fail-closed when the Evidence Base reference is absent**
- TC-005 in `evidence-base-archive-floor.test.ts`: `synthesizedCommits = []`、floor `biteEvidence: required` → `achieved.biteEvidence === undefined`、I/O 呼び出し 0 件（P2.5 で early return）、throw なし ✓

---

### Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts

- `FORWARD_TYPES = new Set(["bug-fix", "new-feature"])` — 変更なし ✓
- Deferral 順序（D6）: non-forward → tamper → absent base OID → absent EB ref → runtime capability → empty selection → HEAD capture — 全て test 実行より前 ✓
- 各 I/O ブロックは try/catch → unexpected error → `strategy-deferred`。throw しない ✓

**Scenario: Non-forward type still defers** — TC-006: `refactoring` → `strategy-deferred`, synthesized-tree 呼び出しなし ✓

**Scenario: Tamper mismatch still fails** — TC-007: `tamperStatus=mismatch` → `failed`, tamper reason ✓

**Scenario: Unavailable runtime still defers** — TC-008: `runTestsOnSynthesizedTree` → `unavailable` → `strategy-deferred` ✓

**Scenario: Absent Evidence Base reference defers** — TC-009: `synthesizedCommits=[]` → null → `strategy-deferred`, I/O なし ✓

**Scenario: Absent HEAD OID defers** — TC-010: `captureHeadSha` → null → `strategy-deferred` ✓

---

### Acceptance Criteria (request.md)

| # | 基準 | 結果 |
|---|------|------|
| AC1 | 再走 shape で EB red 側に実装混入しないことをテストで固定 | TC-001 (e2e integration) + TC-007 (gate unit) ✓ |
| AC2 | 初回走行と resume 再走で EB が同一 tree に解決 (テスト) | TC-002 unit (spec scenario 充足) ✓ |
| AC3 | adopt-commits operator commit が candidate に含まれる (テスト) | TC-003 gate unit ✓ |
| AC4 | detectBaseImplementationContamination / gate 3.5 / P2.5 撤去、design D7 で全列挙 | 撤去確認、typecheck 緑 (TC-016) ✓ |
| AC5 | scopedTestCommand 未設定 / managed / 非 forward の strategy-deferred 不変 (既存テスト緑) | TC-006/007/008 ✓ |
| AC6 | `typecheck && test` green | verification-result.md: 全 phase passed ✓ |

---

## 計画逸脱（design/tasks との差分 — findings ではない）

1. **TC-001 配置**: design D7 は `bite-evidence-e2e-gate.test.ts` への追加を計画。実装は新規 `evidence-base-e2e.test.ts` に分離。テストの種別（実 git / 統合）は同一。spec Scenario は充足。

2. **TC-002 を unit のみ**: design D7 は e2e-gate.test.ts への追加も言及。実装は `evidence-base-oids.test.ts` の pure function unit test のみ。spec Scenario は「When the Evidence Base reference is resolved for each state」であり実 git 実行を要求しない。spec 充足。

## 検証できなかった項目

None

## Findings 詳細

None（typed findings なし）
