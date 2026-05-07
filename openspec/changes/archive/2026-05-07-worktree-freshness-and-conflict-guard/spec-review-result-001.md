# Spec Review Result — worktree-freshness-and-conflict-guard

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-08
- **type**: bug-fix

## Summary

Spec is accurate, complete, and well-structured. All claims verified against the actual codebase. Design decisions (D1-D5) are sound with clear rationale and rejected alternatives. Task list maps 1:1 to the request requirements with correct file paths and line numbers. No CRITICAL or HIGH findings.

## Verification Against Source

| Spec Claim | File:Line | Verified |
|---|---|---|
| `git worktree add --detach <path> HEAD` | `manager.ts:66-70` | Yes |
| `create()` takes 3 args (repoRoot, slug, jobId) | `manager.ts:62` | Yes |
| `WorktreeManager` interface exists | `manager.ts:19-38` | Yes |
| No `git fetch` in local.ts | `local.ts` (full file) | Yes |
| Run path `manager.create()` at line 121-122 | `local.ts:121-122` | Yes |
| Resume path 1 (recreate) at line 98 | `local.ts:98` | Yes |
| Resume path 2 (null) at line 111 | `local.ts:111` | Yes |
| `pollMergeStateAfterPush()` exists, no DIRTY handling | `preflight.ts:345-396` | Yes |
| Phase 3 merge at line 208-221 | `orchestrator.ts:208-221` | Yes |
| `"main"` literal at line 250 | `orchestrator.ts:250` | Yes |
| Test files exist for all 3 modules | `tests/` | Yes |

## Requirements Coverage

| Req# | Requirement | Tasks | Covered |
|---|---|---|---|
| 1 | fetch in run path | 2.1 | Yes |
| 2 | baseRef arg on create() | 1.1, 1.2 | Yes |
| 3 | behind warning | 2.2 | Yes |
| 4 | resume baseRef | 2.5, 2.6 | Yes |
| 5 | DIRTY early return | 3.1 | Yes |
| 6 | DIRTY escalation | 4.1 | Yes |
| 7 | BEHIND not escalation | (no code change needed) | Yes |
| 8 | TODO comments | 1.3, 2.4, 4.2 | Yes |
| 9 | no impl of base branch config | (scope boundary) | Yes |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | completeness | design.md (D5) | resume パスで fetch しない判断は、crash 後に新 session で resume した場合に origin/main が stale になるリスクがある。ただし spec は明示的にこれを設計判断として記述しており、run パスで fetch 済みの前提は通常フローでは成立する | 将来の改善として resume パスでも conditional fetch を検討する旨を Risks に追記してもよい（任意） |
| 2 | LOW | consistency | orchestrator.ts:248 | `if (isOnMain)` で `git checkout main` を実行するコードに TODO コメントを追加する task 4.2 があるが、このコードは `isOnMain=true` 時に checkout main を実行しており、本来 `!isOnMain` であるべきに見える（既存の問題）。TODO コメント追加自体は問題ない | 本 request のスコープ外。別途調査が必要であれば separate issue |

## Security Assessment

セキュリティ上の懸念なし。

- `git fetch origin`: ネットワーク IO だが認証変更なし。既存の git credential で動作
- `baseRef` パラメータ: ハードコード `"origin/main"` のみ。ユーザー入力由来ではなくインジェクションリスクなし
- `mergeStateStatus` 判定: `gh pr view` の JSON 出力を parse。信頼できるソースからの読み取り
- DIRTY escalation メッセージ: 固定文字列テンプレート。動的挿入は `<slug>` のみ（既存パターンと同一）

## Design Decision Assessment

| Decision | Assessment |
|---|---|
| D1: fetch in LocalRuntime (not preflight) | Correct. preflight は runtime-neutral。ネットワーク IO は runtime 固有の責務 |
| D2: baseRef arg with HEAD default | Clean. 後方互換を維持しつつ拡張可能 |
| D3: behind = warning only | Sound. origin/main base なのでローカル behind は情報提供のみで十分 |
| D4: DIRTY = escalation, BEHIND = attempt | Correct. DIRTY は確定状態、BEHIND は GitHub squash merge で解決されることが多い |
| D5: no fetch in resume | Acceptable with noted caveat (Finding #1) |
