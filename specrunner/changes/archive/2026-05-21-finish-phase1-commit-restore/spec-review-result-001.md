# Spec Review: finish-phase1-commit-restore

- **date**: 2026-05-21
- **verdict**: approved

## Summary

Phase 1 末尾の `git commit` ステップを復元する、スコープが明確な bug-fix。PR #347 が `moveRequestsDir` を削除した際に commit 責務を副次的に失った問題を、新規モジュール `commit-archive.ts` として切り出す設計。request.md / design.md / tasks.md / delta spec は全て一貫しており、9 件の受け入れ基準に対する artifact の対応も完全。

---

## Findings

### ✅ Strengths

- スコープが明示的に閉じている（past-PR 修復・`moveRequestsDir` 復活・L66-76 cleanup は非目標）
- Design D1-D5 が各要件に直接対応。D4 の「`spawnOrEscalate` ではなく raw spawn を使う」は `git diff --cached --quiet` が exit 1 を正常パスとして返すことへの正しい対応
- Task 1 の result type (`{ ok: true; skipped: boolean } | { ok: false; escalation: string; exitCode: 1 }`) が既存 `ArchiveChangeFolderResult` / `SpecMergeResult` パターンと一致
- Task 4 は `makeHappyPathSpawn` が既に `git diff --cached --quiet` exit 1 / `git commit` exit 0 を返すことを確認済みでモック変更不要 → テスト側リスク最小
- Delta spec の新 Requirement は baseline L64-122 の既存記述（L76: `git commit "chore: archive <slug>"`）と矛盾せず、補強として機能
- `slug` は `resolveTarget` で上流バリデート済み、`git commit -m` へは argv 要素として渡されるため shell injection なし

### ⚠️ Issues

- [MINOR] Delta spec 内で `MUST` と `SHALL` が同一文内に混在している箇所が 2 か所。ルール違反ではないが可読性が下がる。実装フェーズで整理可
- [MINOR] Task 1 で commit 失敗時の escalation message 内容（`stderr` の取り込み方）が `formatEscalation` に委ねられており暗黙的。`archiveChangeFolder` の実装パターンを参照するよう 1 行注記があると実装者の迷いが減る。blocking ではない
- [MINOR] Task 4 の integration test は `git diff --cached --quiet` の呼び出しを assert するが、「commit 後に staging が 0 になること」（受け入れ基準の「全 staging が commit に消化される」）の直接検証は mock 構造上困難。unit test (Task 2) でカバーされており許容範囲

---

## 受け入れ基準マッピング

| # | 受け入れ基準 | 対応 artifact | 状態 |
|---|---|---|---|
| 受1 | Phase 1 末尾に commit step（staging を 1 commit） | design D5 + Task 3 (line 267-269) | ✅ covered |
| 受2 | staging なし → skip（idempotent） | delta spec Scenario 2 + Task 2 case 2 | ✅ covered |
| 受3 | commit message `chore: archive <slug>` 形式 | delta spec L7 + Task 1 step 2 | ✅ covered |
| 受4 | commit 失敗 → escalation、Phase 2 不進行 | Task 3 early return + Task 2 case 3 | ✅ covered |
| 受5 | orchestrator で新関数呼び出し | design D5 + Task 3 | ✅ covered |
| 受6 | delta spec に新 Requirement 追加 | specs/cli-finish-command/spec.md (ADDED) | ✅ covered |
| 受7 | unit test 3 ケース green | Task 2 cases 1-3 + Task 6 | ✅ covered |
| 受8 | integration test に commit assert 追加 green | Task 4 + Task 6 | ✅ covered |
| 受9 | `bun run typecheck && bun run test` green | Task 6 | ✅ covered |

---

## Security

追加される shell-equivalent な値は以下のみ:

- `git diff --cached --quiet` — 固定 argv、ユーザー入力なし
- `git commit -m "chore: archive <slug>"` — `slug` は argv 要素として渡され文字列結合されない。仮に slug が `"; rm -rf /` のような値でも commit message の literal 文字列として扱われる

新規 env var・ファイルパス・トークン処理なし。OWASP Top 10 における追加リスクなし。

---

## Verdict Rationale

全受け入れ基準が design / tasks / delta spec の具体的な artifact に 1:1 で対応している。設計の技術的妥当性（raw spawn の使用、結果型パターンの踏襲、orchestrator の挿入位置）も確認済み。MINOR issues はいずれも実装フェーズまたはコードレビューで対処可能であり、仕様レベルで blocking する内容ではない。
