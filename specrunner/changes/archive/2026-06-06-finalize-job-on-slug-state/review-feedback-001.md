# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `src/core/finish/job-state-update.ts` | `markJobArchived` は `state.json` を2回読む（`jobId` 取得用の raw `fs.readFile` + `store.load()` 内の `loadSplitLayout`）。`changeDir` seam では `jobId` はパス解決に使われないため、実害はないが冗長。 | `resolveCanonicalStateDir` の戻り値に `jobId` を添付するか、`loadSplitLayout` 結果から `jobId` を取ってから遷移する形に一本化できる。ただし現行の動作に誤りはなく必須修正ではない。 | no |
| 2 | low | maintainability | `src/store/job-state-store.ts` `loadSplitLayout` | `changeDir` 経由の load 時も `slugInject` により `request.path` が active location（`changes/<slug>/request.md`）に注入される。folder mv 後は存在しないパスになるが、`markJobArchived` はこの値を使わず `persist()` も slug mode で strip するため実害なし。 | `changeDir` が指定されている場合は `slugInject` の `request.path` 注入をスキップする条件を追加できるが、現行の archive フローでは問題を引き起こさないため必須修正ではない。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 8.85

## Summary

全 7 タスク完了、検証 green（279 test files / 3291 tests、typecheck / lint pass）。

**受け入れ基準の充足**

1. `awaiting-archive` の slug 正本を archive すると `archived` になる — `markJobArchived` が D1/D2/D3 を通じて slug 正本を read→transition→persist する実装により充足。`transitionJob` の noop 判定が冪等性を担保。
2. archive 後、`job ls`（default）に表示されない — 既存の `!isTerminal` フィルタと `list()` の dedup（newest `updatedAt` 優先）で充足。TC-D6-DEDUP で regression 固定済み。
3. finishable gate と最終遷移が同じ state を読む — Phase 0 gate（`assertJobFinishable`）と Phase 1 最終遷移（`markJobArchived(slug, cwd)`）がともに slug 正本を参照するため、gate 通過後の遷移失敗が原理的に発生しない構造。
4. 終端 phase 完了後、`state.json`/`events.jsonl` が branch にコミットされる — `pipeline.ts` の終端分岐で `endStore.persist()` 後に `deps.runtimeStrategy?.commitFinalState()` を呼ぶ D5 seam で充足。`commitFinalState` のユニットテスト（TC-CFS-001〜TC-CFS-005）が git 操作の正確性を固定。
5. folder 移動済み・`awaiting-archive` 取り残し job の再実行 — `resolveCanonicalStateDir` が archive-location を解決し、`archiveChangeFolder` が skip して `markJobArchived` が archive dir を遷移する冪等フロー（TC-AO-IDEMPOTENT）で充足。

**設計の正確性**

- D2 resolver の active 優先・archive fallback・null return が TC-RCSD-001〜005 で網羅。
- D3 changeDir seam が slug 規約パスを上書きし、archive-location への `load()`/`persist()` を正しく委譲することを TC-CD-001〜004 で固定。
- D4 Phase 順序（mv → markJobArchived → git add → commitArchive → push）が TC-AO-ORDER で call order assertion により固定。
- D5 LocalRuntime が `commitFinalState` を実装、ManagedRuntime が no-op であることを実装・型で保証。
- D7 冪等性（archived → Phase 0 terminal no-op、folder 移動済み awaiting-archive → archive dir 遷移）が TC-013・TC-AO-IDEMPOTENT でカバー。

**non-blocking 指摘のみ**。`markJobArchived` の二重 `state.json` read と `slugInject` の archive-location での path 注入ずれはいずれも動作上の影響がなく、別 change での改善候補として open question に記録すれば十分。
