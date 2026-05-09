# Code Review — persistence-unification — Iteration 1

## Summary

永続化パスを `JobStateStore` に一元化するリファクタリング。実装は設計書（design.md）に忠実で、6 つの自由関数を `JobStateStore` の static/instance メソッドに委譲化し、`state/store.ts` を re-export ファイルとして整理。レガシー正規化ロジック（`normalizeStepsToStepRuns` + 6 ヘルパー）の削除と `validateJobState` への統一も正しく実行されている。全 1489 テスト PASS、typecheck green。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.70** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/core/command/resume.ts:105,185 | `new JobStateStore(state.jobId)` が同一関数内で 2 回インスタンス化されている。stale detection（L105）と running transition（L185）で別々に生成 | 関数冒頭で `const store = new JobStateStore(state.jobId)` を 1 回生成し、両箇所で共有する。ただし L76 の `resolveId` 時点では `state` 未確定のため、state 確定後（L86-88 以降）に生成 |
| 2 | MEDIUM | maintainability | src/core/finish/orchestrator.ts:273-275 | Phase 4 の `store.load()` → spread → `store.persist()` パターンで、`worktreePath: null` だけを更新するために全 state を再読込している。`store.update()` メソッドが既に存在するが未使用 | `const store = new JobStateStore(target.jobId); const current = await store.load(); await store.update(current as JobState, { worktreePath: null });` に変更。ただし best-effort ブロック内なので影響は軽微 |
| 3 | LOW | maintainability | src/core/command/resume.ts:86, src/core/finish/job-state-update.ts:46,50, src/core/finish/orchestrator.ts:275 | `load()` が `NormalizedJobState` を返すが、呼び出し元が `as JobState` でキャストする箇所が 4 つに増加。design.md Risks に記載済みの "型の嘘" だが、キャスト箇所の拡散は将来の保守負担 | 将来課題として `load()` の overload（`load(): NormalizedJobState` + `loadAsJobState(): JobState`）を検討。本 PR のスコープ外 |
| 4 | LOW | testing | tests/ | test-cases.md に must シナリオが 22 件定義されているが、新規テストファイルは追加されていない。TC-102（既存テスト green 維持）、TC-137（typecheck green）、TC-160/161（全テスト PASS）で間接的にカバーされている。TC-103（ヘルパー削除確認）、TC-136（不要 import 確認）は構造的検証で確認済み | リファクタリングの性質上、既存テストによる回帰検証で十分。新テスト追加は任意 |

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Coverage Method |
|----|----------|--------|-----------------|
| TC-100 | must | covered | TC-001 (pre-PR24 normalization via validateJobState) |
| TC-101 | must | covered | TC-002 (post-PR24 normalization via validateJobState) |
| TC-102 | must | covered | TC-001〜TC-008 all PASS (1489 tests green) |
| TC-103 | must | covered | grep confirms 0 matches for deleted helpers |
| TC-110 | must | covered | Existing createJobState tests via delegation |
| TC-112 | must | covered | Existing deleteJobState tests via delegation |
| TC-113 | must | covered | Existing deleteJobState ENOENT tests |
| TC-114 | must | covered | Existing listJobStates tests via delegation |
| TC-115 | must | covered | Existing listJobStates malformed skip tests |
| TC-117 | must | covered | Existing resolveJobId full UUID tests |
| TC-118 | must | covered | Existing resolveJobId prefix tests |
| TC-119 | must | covered | Existing resolveJobId not found tests |
| TC-120 | must | covered | Existing resolveJobId ambiguous tests |
| TC-130 | must | covered | Delegation verified by code inspection + typecheck |
| TC-131 | must | covered | Delegation verified + TC-001 PASS |
| TC-132 | must | covered | Delegation verified + existing updateJobState tests |
| TC-133 | must | covered | Delegation verified + existing deleteJobState tests |
| TC-134 | must | covered | Delegation verified + existing listJobStates tests |
| TC-135 | must | covered | Delegation verified + existing resolveJobId tests |
| TC-137 | must | covered | `bun run typecheck` green |
| TC-140 | must | covered | grep: no `updateJobState` import in job-state-update.ts |
| TC-141 | must | covered | Existing finish orchestrator tests (TC-123, TC-124) |
| TC-142 | must | covered | grep: no `loadJobState`/`updateJobState` import in orchestrator.ts |
| TC-150 | must | covered | grep: no legacy imports in resume.ts |
| TC-160 | must | covered | `bun run typecheck` = 0 errors |
| TC-161 | must | covered | `bun run test` = 1489 passed, 0 failed |
| TC-170 | must | covered | TC-001〜TC-004 (round-trip tests confirm equivalence) |

## Verdict

- **verdict**: approved
- CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 2
- Total score: 8.70 (threshold: 7.0)
- Trend: N/A (iteration 1)

## Notes

- `state/store.ts` の re-export 戦略は import 互換性を維持しつつ段階的移行を可能にする適切な設計
- `normalizeStepsToStepRuns` と 6 ヘルパーの削除（〜130 行）により `job-state-store.ts` の責務が明確化
- `validateJobState` への統一で正規化パスが 1 本に収束し、バリデーション経路の分岐が解消された
- 残存する `state/store.ts` 経由の呼び出し元（cli/rm, cli/ps, runtime/local, runtime/managed 等）は design.md Non-Goals に記載済みのスコープ外。re-export 経由で正常動作
