# Spec Review Result — job-lifecycle-module

- **reviewer**: spec-reviewer
- **iteration**: 1
- **date**: 2026-05-09
- **verdict**: approved

## Summary

仕様は request.md の全 11 要件を網羅しており、設計判断（D1–D8）も妥当。遷移マップ・型定義・テスト計画・既存コード置換の手順が具体的に記述されている。CRITICAL / HIGH の findings はなし。MEDIUM 1 件は `isFullyFinished` 置換時の behavioral change に関する spec 記述の不正確さ。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | design.md (D6) / specs/job-state-store/spec.md | D6 で `isFullyFinished` を `TERMINAL_STATUSES.has()` の「1行ラッパーに過ぎない」と記述しているが、実際の `isFullyFinished` は `state.status === "archived"` のみを判定する。`TERMINAL_STATUSES` には `canceled` も含まれるため、置換は behavioral change を伴う（`canceled` な job への `finish` も早期 return する）。spec scenario は `archived` のみカバーしており、`canceled` ケースが未定義。また orchestrator.ts の出力メッセージ `"Already archived."` は `canceled` job に対して不正確になる | D6 に behavioral change であることを明記する。spec に `canceled` job への `finish` シナリオを追加する。tasks.md 5.1 のメッセージを `"Already finished (${state.status})."` 等に変更するか、status 別分岐を指示する |
| 2 | LOW | consistency | design.md (D1) / tasks.md (4.1) | `transitionJob` を「純粋関数」と定義しているが、実装では `new Date().toISOString()` を内部で呼び出しており、厳密には参照透過でない。実用上は問題ないが、テストで timestamp を固定したい場合に制約となる | テスト容易性を重視するなら `ctx.timestamp?: string` を `TransitionContext` に追加し、省略時のみ `new Date()` を使う設計を検討する。または「I/O なしの意味で純粋」と定義を明確化する |

## Completeness Check

| Request Requirement | Spec Coverage | Status |
|---|---|---|
| 1. `lifecycle.ts` 新設 | proposal.md, design.md, tasks.md 1.x–4.x | ✅ |
| 2. `VALID_TRANSITIONS` 定義 | tasks.md 2.1, spec.md | ✅ |
| 3. `TERMINAL_STATUSES` export | tasks.md 2.2, spec.md | ✅ |
| 4. `ACTIVE_STATUSES` export | tasks.md 2.3, spec.md | ✅ |
| 5. `transitionJob` 純粋関数 | design.md D1/D3/D4/D7/D8, tasks.md 4.1, spec.md | ✅ |
| 6. `canTransition` ガード | tasks.md 3.1, spec.md | ✅ |
| 7. `isTerminal` ヘルパー | tasks.md 3.2, spec.md | ✅ |
| 8. `TransitionContext` 型 | tasks.md 1.1, design.md D5/D8 | ✅ |
| 9. `TransitionResult` 型 | tasks.md 1.2 | ✅ |
| 10. `idempotency.ts` 削除・置換 | design.md D6, tasks.md 5.1–5.2, spec.md | ✅ (MEDIUM #1 参照) |
| 11. `ps.ts` ACTIVE_STATUSES 置換 | tasks.md 5.3, spec.md | ✅ |

## Design Decision Evaluation

| Decision | Assessment |
|---|---|
| D1: 純粋関数 | ✅ 既存コードベースの関数スタイルと一貫。テスト容易性◎ |
| D2: ReadonlyMap + ReadonlySet | ✅ 型レベルの immutability 保証として適切 |
| D3: 同一 status → noop | ✅ 冪等操作パスでの利便性。Phase 2 で guard として機能 |
| D4: terminal → throw | ✅ 不可逆 status の意図しない復活を阻止 |
| D5: trigger で発生元記録 | ✅ forensics / debug に必要。history に残る |
| D6: idempotency.ts 削除 | ⚠️ behavioral change の記述が不正確（Finding #1） |
| D7: appendHistoryEntry 再利用 | ✅ 既存の MAX_HISTORY_SIZE ガードを活用 |
| D8: patch の型制約 | ✅ 不変条件（status, history 等）の保護として適切 |

## Risk Assessment

- **Phase 1 の二重真実源**: spec が明示的にスコープ外として宣言済み。Phase 2 で解消される前提で許容
- **noop の過信**: design.md で認識済み。Phase 2 の移行時に guard として機能する設計

## Verdict Rationale

CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 1。MEDIUM の finding は behavioral change の spec 記述精度に関するもので、実装の正しさ自体には影響しない（`canceled` job への `finish` ブロックは意図通りの改善）。承認閾値を満たす。
