# Spec Review Result — specrunner-rm-command

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-07

## Summary

request.md の 14 要件すべてが proposal / design / tasks で網羅されている。SDK の `client.beta.sessions.delete()` は installed SDK に存在し実装可能。D2 で request の要件 10-12（SessionClient port に deleteSession 追加）を意図的に却下し runner が直接 SDK を呼ぶ設計に変更しているが、rationale と代替案が明示されており port 責務の肥大化を防ぐ妥当な判断。tasks は既存の `finish` コマンドパターンに準拠し、exit code 規約・flag parsing・DI パターンとも整合している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | design.md:42-46 | D2 で request 要件 10-12（port + adapter + local no-op）を却下し runner 直接呼出しに変更。rationale は妥当だが request との差分が暗黙的 | D2 冒頭に「request 要件 10-12 からの設計変更」と明記し、request 作成者が差分を認識しやすくする |
| 2 | LOW | completeness | design.md:62 | session 削除失敗時の stderr warning フォーマットが未定義。「warning として出力」のみ | `Warning: Failed to delete session {sessionId}: {error.message}` のような出力例を追記する |
| 3 | LOW | consistency | proposal.md:8 / tasks.md:16 | `--all-terminated` は `failed` / `terminated` / `archived` の 3 status を対象とするが、flag 名が terminated のみを示唆。request 由来のため spec 側で変更する必要はないが、実装時の help text で対象 status を列挙すべき | tasks 5.2 の USAGE 説明を `--all-terminated   Remove all failed/terminated/archived jobs` のように対象を明示する |

## Completeness Check

| 要件 | proposal | design | tasks | 判定 |
|------|----------|--------|-------|------|
| 1. jobId 指定で state file 削除 | ✓ L7 | ✓ D1, D3 | ✓ 3.1-3.2 | OK |
| 2. status gate (running / awaiting-merge 拒否) | ✓ L7 | ✓ D1 | ✓ 3.2 | OK |
| 3. --force で全 status 許可 | ✓ L7 | ✓ D1 | ✓ 3.2 | OK |
| 4. managed mode で deleteSession best-effort | ✓ L9 | ✓ D2, D6 | ✓ 2.1, 3.3 | OK |
| 5. local mode は state file 削除のみ | ✓ L21 | ✓ D2 | ✓ 3.3 (skip 条件) | OK |
| 6. --all-terminated 一括削除 | ✓ L8 | ✓ D4 | ✓ 3.4 | OK |
| 7. 確認プロンプト + --yes | ✓ L8 | ✓ D4 | ✓ 3.4, 4.1 | OK |
| 8. 一括 deleteSession best-effort | ✓ L9 | ✓ D2, D6 | ✓ 3.4 | OK |
| 9. deleteJobState in store.ts | ✓ L20 | ✓ D3 | ✓ 1.1 | OK |
| 10-12. deleteSession (port/adapter/local) | ✓ L21 | **D2 で設計変更** → SDK 直接 | ✓ 2.1, 3.3 | OK (設計改善) |
| 13. bin/specrunner.ts に rm case 追加 | ✓ L31 | — | ✓ 5.3 | OK |
| 14. flag parsing (--force/--all-terminated/--yes) | ✓ L7-8 | — | ✓ 4.1, 5.3 | OK |
| typecheck + test green | — | — | ✓ 6.2-6.3 | OK |

## Feasibility

- `client.beta.sessions.delete(sessionId)` は installed SDK (`@anthropic-ai/sdk`) に型定義・実装ともに存在。`BetaManagedAgentsDeletedSession` 応答型も定義済み
- `listJobStates()` は既存の `ps` コマンドで使用中。`--all-terminated` のフィルタ基盤は揃っている
- `deleteJobState` は `fs.unlink` + ENOENT 無視の標準パターン。`getJobStatePath` ヘルパーは `src/util/xdg.ts` に存在
- CLI flag parsing は `finish` の手動パース（`args.includes()` + 位置引数）と同一パターン。フレームワーク依存なし
- exit code 規約（0/1/2）は `finish` と統一。既存パターンの流用で実装リスク低
